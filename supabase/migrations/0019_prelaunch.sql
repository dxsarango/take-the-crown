-- Prelaunch (M10a): the production site is public while the payment provider reviews it, but only
-- admins can take the crown, with the test provider, to try the whole flow. A new database starts
-- in prelaunch; local development turns it off in seed.sql. launch_game() ends it.

alter table app_config add column prelaunch boolean not null default true;

-- create_price_lock from 0010, plus: in prelaunch only admins can lock the crown.
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

  if v_cfg.prelaunch and not exists (select 1 from profile_private where profile_id = p_profile_id and is_admin) then
    raise exception 'prelaunch';
  end if;
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

-- Launch: clears everything the admins' prelaunch tests left (reigns, payments, locks, events,
-- achievements, rank-ups, reports, emails), moves the season schedule so season 0 starts at
-- p_starts_at (each season keeps its length), resets the crown to the floor price and ends
-- prelaunch. Profiles and the admin log stay.
create or replace function launch_game(p_starts_at timestamptz)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_cfg app_config;
  v_shift interval;
begin
  select * into v_cfg from app_config for update;
  if not v_cfg.prelaunch then
    raise exception 'not_prelaunch';
  end if;
  if p_starts_at < now() - interval '1 minute' then
    raise exception 'starts_in_past';
  end if;
  perform 1 from crown_state where id for update;

  update crown_state set current_reign_id = null, active_lock_id = null, active_lock_expires_at = null where id;
  delete from reports;
  delete from events;
  delete from profile_achievements;
  delete from rank_ups;
  delete from notifications;
  delete from reigns;
  delete from payments;
  delete from webhook_events;
  delete from price_locks;
  delete from rate_limit_hits;

  select p_starts_at - starts_at into v_shift from seasons where id = 0;
  update seasons set starts_at = starts_at + v_shift, ends_at = ends_at + v_shift, closed_at = null, king_profile_id = null;
  update crown_state
  set season_id = 0, base_price_cents = v_cfg.floor_cents, base_set_at = p_starts_at, updated_at = now()
  where id;

  update app_config set prelaunch = false, updated_at = now();
end $$;

revoke execute on function launch_game(timestamptz) from public, anon, authenticated;
