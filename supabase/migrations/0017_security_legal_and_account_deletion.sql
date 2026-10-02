-- Security hardening and legal (M9): more per-hour limits, the legal pages' details, the
-- withdrawal acknowledgment at checkout, account deletion, and the retention the privacy policy
-- promises.

-- ---------------------------------------------------------------------------
-- Limits and legal details (editable in admin)
-- ---------------------------------------------------------------------------

alter table app_config
  add column max_magic_links_per_hour int not null default 5 check (max_magic_links_per_hour between 1 and 100),
  add column max_avatar_uploads_per_hour int not null default 10 check (max_avatar_uploads_per_hour between 1 and 100),
  add column max_reports_per_ip_per_hour int not null default 20 check (max_reports_per_ip_per_hour between 1 and 1000),
  add column legal_contact_email text check (legal_contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(legal_contact_email) <= 254),
  add column legal_city text check (char_length(legal_city) between 1 and 80),
  add column legal_payment_provider text check (char_length(legal_payment_provider) between 1 and 80),
  add column legal_effective_date date;

-- The buyer ticked "the crown is delivered at once and I lose the right of withdrawal" (terms §5).
alter table price_locks add column withdrawal_ack_at timestamptz;

-- ---------------------------------------------------------------------------
-- Account deletion
-- ---------------------------------------------------------------------------

-- A deleted profile keeps its id, so reigns, achievements and statistics stay in the public record.
-- Its name becomes "former~<12 hex>": unique, and impossible to type as a public name, so the UI
-- can always show it as "Former king".
alter table profiles add column deleted_at timestamptz;
alter table profiles drop constraint profiles_name_format;
alter table profiles add constraint profiles_name_format check (
  is_valid_profile_name(name) or (deleted_at is not null and name ~ '^former~[0-9a-f]{12}$')
);
-- Locks keep the anonymous name too (they stay with the payment records).
alter table price_locks drop constraint price_locks_name_format;
alter table price_locks add constraint price_locks_name_format check (
  is_valid_profile_name(name) or name ~ '^former~[0-9a-f]{12}$'
);

-- Anonymizes a profile and deletes its private data. Payment records (payments, and the locks they
-- point at, with the buyer's email) stay for tax law. The caller deletes the auth user and the
-- uploaded avatar files. Returns the auth user id that owned the profile, or null.
create or replace function delete_profile(p_profile_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_profile profiles;
  v_locks uuid[];
  v_name text;
begin
  perform 1 from crown_state where id for update;
  select * into v_profile from profiles where id = p_profile_id for update;
  if v_profile.id is null or v_profile.deleted_at is not null then
    raise exception 'profile_not_found';
  end if;

  loop
    v_name := 'former~' || substr(md5(gen_random_uuid()::text), 1, 12);
    exit when not exists (select 1 from profiles where lower(name) = v_name);
  end loop;

  -- The player's locks: bought signed in, or as a guest with their email.
  v_locks := array(
    select id from price_locks
    where profile_id = p_profile_id
       or lower(email) = (select lower(email) from profile_private where profile_id = p_profile_id)
  );

  -- A checkout in progress must not crown a deleted profile; a late payment for it is refunded.
  update crown_state set active_lock_id = null, active_lock_expires_at = null, updated_at = now()
  where id and active_lock_id = any(v_locks);
  update price_locks set status = 'expired' where id = any(v_locks) and status = 'active';

  update price_locks set name = v_name, message = null, link = null, country_code = null, avatar_seed = null
  where id = any(v_locks);

  update reigns set name = v_name, message = null, link = null, country_code = null
  where profile_id = p_profile_id;

  update profiles set
    deleted_at = now(),
    user_id = null,
    name = v_name,
    name_changed_at = null,
    country_code = null,
    avatar_mode = 'generated',
    avatar_path = null,
    avatar_pixelated = true,
    avatar_seed = '00000000000000000000000000000000',
    avatar_traits = null,
    main_link = null,
    link_website = null,
    link_x = null,
    link_youtube = null,
    link_tiktok = null,
    link_instagram = null,
    link_github = null,
    link_linkedin = null,
    showcase = '{}',
    show_total_spent = false,
    show_rival = false,
    show_chronicle = false,
    updated_at = now()
  where id = p_profile_id;

  delete from profile_name_history where profile_id = p_profile_id;
  delete from notifications where profile_id = p_profile_id;
  delete from rate_limit_hits where key like '%:' || p_profile_id::text;
  delete from profile_private where profile_id = p_profile_id;

  return v_profile.user_id;
end $$;

revoke execute on function delete_profile(uuid) from public, anon, authenticated;

-- apply_payment from 0010, plus: a lock whose profile was deleted since is refunded.
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
     or exists (select 1 from profiles where id = v_lock.profile_id and deleted_at is not null)
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

-- ---------------------------------------------------------------------------
-- Retention (privacy policy §8): IP hashes and sent emails for at most 90 days
-- ---------------------------------------------------------------------------

alter table price_locks alter column ip_hash drop not null;
alter table reports alter column reporter_ip_hash drop not null;

create or replace function purge_expired_records()
returns void
language sql security definer set search_path = public
as $$
  -- Limits look back one hour at most.
  delete from rate_limit_hits where hit_at < now() - interval '1 day';
  update price_locks set ip_hash = null where ip_hash is not null and created_at < now() - interval '90 days';
  update reports set reporter_ip_hash = null where reporter_ip_hash is not null and created_at < now() - interval '90 days';
  delete from notifications
  where created_at < now() - interval '90 days' and (sent_at is not null or failed_at is not null);
$$;

revoke execute on function purge_expired_records() from public, anon, authenticated;

select cron.schedule('purge-expired-records', '17 3 * * *', 'select public.purge_expired_records()');
