-- A season is open only between starts_at and ends_at. Locks and payments only checked ends_at,
-- so the crown could be bought before a season (including T0) had started.
create or replace function create_price_lock(
  p_email text,
  p_ip_hash text,
  p_profile_id uuid,
  p_display_name text,
  p_country_code text,
  p_message text,
  p_link text,
  p_local_hour smallint,
  p_locale text
)
returns price_locks
language plpgsql security definer set search_path = public
as $$
declare
  v_cfg app_config;
  v_state crown_state;
  v_season seasons;
  v_king uuid;
  v_buyer uuid;
  v_lock price_locks;
begin
  select * into v_cfg from app_config;
  select * into v_state from crown_state where id for update;
  select * into v_season from seasons where id = v_state.season_id;

  if now() < v_season.starts_at or now() >= v_season.ends_at then
    raise exception 'season_closed';
  end if;

  if v_state.active_lock_id is not null and v_state.active_lock_expires_at > now() then
    raise exception 'crown_locked';
  end if;

  if (select count(*) from price_locks
      where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= v_cfg.max_locks_per_ip_per_hour then
    raise exception 'rate_limited';
  end if;

  if p_message is not null and char_length(p_message) > v_cfg.max_message_length then
    raise exception 'message_too_long';
  end if;

  v_buyer := coalesce(p_profile_id, (select profile_id from profile_private where lower(email) = lower(p_email)));

  if v_buyer is not null and exists (select 1 from profiles where id = v_buyer and is_banned) then
    raise exception 'banned';
  end if;

  select profile_id into v_king from reigns where id = v_state.current_reign_id;
  if v_buyer is not null and v_buyer = v_king then
    raise exception 'already_king';
  end if;

  update price_locks set status = 'expired' where id = v_state.active_lock_id and status = 'active';

  insert into price_locks (
    profile_id, email, ip_hash, season_id, expected_reign_id, price_cents,
    display_name, country_code, message, link, local_hour, locale, expires_at
  )
  values (
    p_profile_id, lower(p_email), p_ip_hash, v_state.season_id, v_state.current_reign_id, current_price_cents(),
    p_display_name, p_country_code, p_message, p_link, p_local_hour, coalesce(p_locale, 'en'),
    now() + make_interval(secs => v_cfg.lock_seconds)
  )
  returning * into v_lock;

  update crown_state
  set active_lock_id = v_lock.id, active_lock_expires_at = v_lock.expires_at, updated_at = now()
  where id;

  return v_lock;
end $$;

create or replace function apply_payment(p_payment_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_cfg app_config;
  v_state crown_state;
  v_season seasons;
  v_pay payments;
  v_lock price_locks;
  v_prev reigns;
  v_reign reigns;
  v_buyer uuid;
  v_king uuid;
begin
  select * into v_cfg from app_config;
  select * into v_state from crown_state where id for update;
  select * into v_pay from payments where id = p_payment_id for update;

  if v_pay.id is null then
    raise exception 'payment_not_found';
  end if;
  if v_pay.status <> 'paid' then
    return v_pay.status::text;
  end if;

  select * into v_lock from price_locks where id = v_pay.lock_id for update;
  select * into v_season from seasons where id = v_state.season_id;
  select profile_id into v_king from reigns where id = v_state.current_reign_id;
  v_buyer := coalesce(v_lock.profile_id, (select profile_id from profile_private where lower(email) = lower(v_lock.email)));

  if v_lock.status = 'consumed'
     or v_lock.season_id <> v_state.season_id
     or v_lock.expected_reign_id is distinct from v_state.current_reign_id
     or (v_state.active_lock_id is not null and v_state.active_lock_id <> v_lock.id and v_state.active_lock_expires_at > now())
     or now() > v_lock.expires_at + make_interval(secs => v_cfg.late_payment_grace_seconds)
     or upper(v_pay.currency) <> 'USD'
     or v_pay.amount_cents < v_lock.price_cents
     or now() < v_season.starts_at
     or now() >= v_season.ends_at
     or (v_buyer is not null and v_buyer = v_king)
  then
    update payments set status = 'refund_pending', updated_at = now() where id = v_pay.id;
    update price_locks set status = 'expired' where id = v_lock.id and status = 'active';
    update crown_state set active_lock_id = null, active_lock_expires_at = null, updated_at = now()
    where id and active_lock_id = v_lock.id;
    return 'refund_pending';
  end if;

  v_buyer := resolve_buyer_profile(v_lock);

  if v_state.current_reign_id is not null then
    update reigns
    set ended_at = now(), end_reason = 'dethroned', dethroned_by = v_buyer
    where id = v_state.current_reign_id
    returning * into v_prev;
  end if;

  insert into reigns (
    season_id, profile_id, payment_id, price_paid_cents,
    display_name, country_code, message, link, local_hour
  )
  values (
    v_state.season_id, v_buyer, v_pay.id, v_lock.price_cents,
    v_lock.display_name, v_lock.country_code, v_lock.message, v_lock.link, v_lock.local_hour
  )
  returning * into v_reign;

  update crown_state
  set current_reign_id = v_reign.id,
      base_price_cents = ceil(v_lock.price_cents * (1 + v_cfg.step_bps / 10000.0))::int,
      base_set_at = now(),
      active_lock_id = null,
      active_lock_expires_at = null,
      updated_at = now()
  where id;

  update price_locks set status = 'consumed' where id = v_lock.id;
  update payments set status = 'applied', updated_at = now() where id = v_pay.id;

  insert into events (kind, season_id, profile_id, reign_id, payload)
  values ('crown_taken', v_state.season_id, v_buyer, v_reign.id, jsonb_build_object(
    'price_cents', v_lock.price_cents,
    'previous_profile_id', v_prev.profile_id,
    'previous_duration_seconds', v_prev.duration_seconds
  ));

  if v_prev.id is not null then
    insert into notifications (kind, profile_id, payload)
    select 'dethroned', v_prev.profile_id, jsonb_build_object(
      'reign_id', v_prev.id,
      'duration_seconds', v_prev.duration_seconds,
      'by_profile_id', v_buyer
    )
    from profile_private pp
    where pp.profile_id = v_prev.profile_id and pp.alerts_email;
  end if;

  perform award_takeover_achievements(v_reign, v_prev, v_lock);

  return 'applied';
end $$;

-- The live check runs once a minute, so a reign that crossed a Guardian threshold in its last
-- minute lost the award when the season closed it. Award it when closing.
create or replace function rollover_season()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_cfg app_config;
  v_state crown_state;
  v_season seasons;
  v_next seasons;
  v_king uuid;
  v_closed reigns;
begin
  select * into v_cfg from app_config;
  select * into v_state from crown_state where id for update;
  select * into v_season from seasons where id = v_state.season_id;

  if now() < v_season.ends_at then
    return;
  end if;

  select * into v_next from seasons where id > v_season.id order by id limit 1;
  if v_next.id is null then
    raise exception 'no_next_season_configured';
  end if;

  update reigns set ended_at = v_season.ends_at, end_reason = 'season_end'
  where id = v_state.current_reign_id
  returning * into v_closed;

  if v_closed.id is not null then
    perform award_guardian(v_closed.profile_id, v_closed.duration_seconds, v_closed.id);
  end if;

  update price_locks set status = 'expired' where id = v_state.active_lock_id and status = 'active';

  select profile_id into v_king
  from reigns
  where season_id = v_season.id
  group by profile_id
  order by sum(duration_seconds) desc
  limit 1;

  update seasons set king_profile_id = v_king, closed_at = now() where id = v_season.id;

  update crown_state
  set season_id = v_next.id,
      current_reign_id = null,
      base_price_cents = v_cfg.floor_cents,
      base_set_at = now(),
      active_lock_id = null,
      active_lock_expires_at = null,
      updated_at = now()
  where id;

  insert into events (kind, season_id, profile_id, payload)
  values ('season_ended', v_season.id, v_king, jsonb_build_object('slug', v_season.slug));

  insert into events (kind, season_id, payload)
  values ('season_started', v_next.id, jsonb_build_object('slug', v_next.slug));
end $$;
