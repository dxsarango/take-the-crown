-- Known emails need verification (decision 3 in docs/PROGRESS.md). A signed-out buyer can only take
-- the crown as a new guest; an email that already has a profile, claimed or not, must sign in with a
-- magic link first. Same bodies as 0008 otherwise.

-- Signed-in buyers keep their current name and avatar; p_name and p_avatar_seed only apply to new guests.
create or replace function create_price_lock(
  p_email text,
  p_ip_hash text,
  p_profile_id uuid,
  p_name text,
  p_country_code text,
  p_message text,
  p_link text,
  p_local_hour smallint,
  p_locale text,
  p_avatar_seed text default null
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
  v_name text;
  v_seed text;
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

  -- Only emails without a profile buy as guests. A known email must sign in (magic link) first, so
  -- nobody can take the crown under someone else's profile by typing their email.
  if p_profile_id is null and exists (select 1 from profile_private where lower(email) = lower(p_email)) then
    raise exception 'email_verification_required';
  end if;
  v_buyer := p_profile_id;

  if v_buyer is not null and exists (select 1 from profiles where id = v_buyer and is_banned) then
    raise exception 'banned';
  end if;

  select profile_id into v_king from reigns where id = v_state.current_reign_id;
  if v_buyer is not null and v_buyer = v_king then
    raise exception 'already_king';
  end if;

  if v_buyer is not null then
    select name into v_name from profiles where id = v_buyer;
  else
    if not is_valid_profile_name(p_name) then
      raise exception 'name_invalid';
    end if;
    if not is_profile_name_available(p_name) then
      raise exception 'name_taken';
    end if;
    if p_avatar_seed is not null and p_avatar_seed !~ '^[0-9a-f]{32}$' then
      raise exception 'avatar_seed_invalid';
    end if;
    v_name := p_name;
    v_seed := p_avatar_seed;
  end if;

  update price_locks set status = 'expired' where id = v_state.active_lock_id and status = 'active';

  insert into price_locks (
    profile_id, email, ip_hash, season_id, expected_reign_id, price_cents,
    name, country_code, message, link, local_hour, locale, avatar_seed, expires_at
  )
  values (
    p_profile_id, lower(p_email), p_ip_hash, v_state.season_id, v_state.current_reign_id, current_price_cents(),
    v_name, p_country_code, p_message, p_link, p_local_hour, coalesce(p_locale, 'en'), v_seed,
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
     -- A guest lock whose email gained a profile before payment: the payer never proved that email.
     or (v_lock.profile_id is null and v_buyer is not null)
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

  -- The reign keeps the buyer's public name at the moment of the takeover.
  insert into reigns (
    season_id, profile_id, payment_id, price_paid_cents,
    name, country_code, message, link, local_hour
  )
  values (
    v_state.season_id, v_buyer, v_pay.id, v_lock.price_cents,
    (select name from profiles where id = v_buyer), v_lock.country_code, v_lock.message, v_lock.link, v_lock.local_hour
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
    where pp.profile_id = v_prev.profile_id and pp.alerts_dethroned;
  end if;

  perform award_takeover_achievements(v_reign, v_prev, v_lock);

  return 'applied';
end $$;
