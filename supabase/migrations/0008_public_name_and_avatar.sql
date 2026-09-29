-- One public name per profile replaces username + display_name. It is unique case-insensitively,
-- is the profile URL (/u/[name], lowercased), can change once every `name_change_days`, and old
-- names stay reserved in profile_name_history so they redirect to the current profile. Reigns and
-- locks keep the name snapshot they were created with.
--
-- Avatars: every profile gets a random avatar_seed (the generator input) and optional per-layer
-- overrides in avatar_traits. Guests send the seed from the payment modal with their lock.

alter table app_config add column name_change_days int not null default 30 check (name_change_days >= 0);

-- ---------------------------------------------------------------------------
-- Validation helpers
-- ---------------------------------------------------------------------------

create or replace function is_valid_profile_name(p_name text)
returns boolean
language sql immutable
set search_path = public
as $$
  select coalesce(p_name ~ '^[A-Za-z0-9._-]{3,24}$', false)
$$;

-- Trait ranges mirror PARTS in design/lib/avatar-lib.js (tests keep them in sync).
-- acc = -1 means no accessory.
create or replace function is_valid_avatar_traits(p_traits jsonb)
returns boolean
language sql immutable
set search_path = public
as $$
  select jsonb_typeof(p_traits) = 'object' and not exists (
    select 1
    from jsonb_each(p_traits) t
    left join (values
      ('skin', 0, 5), ('hair', 0, 9), ('hc', 0, 7), ('fh', 0, 4), ('ex', 0, 5),
      ('cr', 0, 2), ('cape', 0, 4), ('cc', 0, 4), ('acc', -1, 5), ('bg', 0, 4)
    ) as o (trait, min_value, max_value) on o.trait = t.key
    where case
      when o.trait is null then true
      when jsonb_typeof(t.value) <> 'number' then true
      else t.value::numeric <> trunc(t.value::numeric) or t.value::numeric not between o.min_value and o.max_value
    end
  )
$$;

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

drop view public_reigns;

alter table profiles
  drop constraint profiles_username_key,
  drop constraint profiles_username_check,
  drop constraint profiles_display_name_check;
alter table profiles rename column username to name;
alter table profiles drop column display_name;
alter table profiles
  add constraint profiles_name_format check (is_valid_profile_name(name)),
  add column name_changed_at timestamptz,
  add column avatar_seed text not null default replace(gen_random_uuid()::text, '-', '')
    check (avatar_seed ~ '^[0-9a-f]{32}$'),
  add column avatar_traits jsonb check (is_valid_avatar_traits(avatar_traits));
create unique index profiles_name_lower_idx on profiles (lower(name));

create table profile_name_history (
  name text not null check (is_valid_profile_name(name)),
  profile_id uuid not null references profiles (id) on delete cascade,
  replaced_at timestamptz not null default now()
);
create unique index profile_name_history_name_idx on profile_name_history (lower(name));
create index profile_name_history_profile_idx on profile_name_history (profile_id);

alter table profile_name_history enable row level security;
create policy public_read on profile_name_history for select using (true);
grant select on profile_name_history to anon, authenticated;

alter table price_locks drop constraint price_locks_display_name_check;
alter table price_locks rename column display_name to name;
alter table price_locks
  add constraint price_locks_name_format check (is_valid_profile_name(name)),
  add column avatar_seed text check (avatar_seed ~ '^[0-9a-f]{32}$');

alter table reigns rename column display_name to name;

-- The dethroned alert now sits next to the price-drop and season-start alerts.
alter table profile_private rename column alerts_email to alerts_dethroned;

create view public_reigns as
select
  id, season_id, profile_id, price_paid_cents, name, country_code,
  case when message_hidden then null else message end as message,
  case when message_hidden then null else link end as link,
  started_at, ended_at, end_reason, dethroned_by, duration_seconds
from reigns;

grant select on public_reigns to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Names
-- ---------------------------------------------------------------------------

drop function generate_username();

create or replace function generate_profile_name()
returns text
language plpgsql
set search_path = public
as $$
declare
  v_name text;
begin
  loop
    v_name := 'king_' || left(replace(gen_random_uuid()::text, '-', ''), 8);
    exit when not exists (select 1 from profiles where lower(name) = v_name)
      and not exists (select 1 from profile_name_history where lower(name) = v_name);
  end loop;
  return v_name;
end $$;

-- True when `p_name` is valid and neither in use nor reserved by another profile.
create or replace function is_profile_name_available(p_name text, p_profile_id uuid default null)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select is_valid_profile_name(p_name)
    and not exists (select 1 from profiles where lower(name) = lower(p_name) and id is distinct from p_profile_id)
    and not exists (
      select 1 from profile_name_history where lower(name) = lower(p_name) and profile_id is distinct from p_profile_id
    )
$$;

-- Resolves a current or former name to its profile, for /u/[name] and its redirects.
create or replace function profile_id_for_name(p_name text)
returns uuid
language sql stable
set search_path = public
as $$
  select coalesce(
    (select id from profiles where lower(name) = lower(p_name)),
    (select profile_id from profile_name_history where lower(name) = lower(p_name))
  )
$$;

grant execute on function profile_id_for_name(text) to anon, authenticated;

create or replace function change_profile_name(p_profile_id uuid, p_name text)
returns profiles
language plpgsql security definer
set search_path = public
as $$
declare
  v_cfg app_config;
  v_profile profiles;
begin
  select * into v_cfg from app_config;
  select * into v_profile from profiles where id = p_profile_id for update;

  if v_profile.id is null then
    raise exception 'profile_not_found';
  end if;
  if v_profile.name = p_name then
    return v_profile;
  end if;
  if not is_valid_profile_name(p_name) then
    raise exception 'name_invalid';
  end if;
  if v_profile.name_changed_at > now() - make_interval(days => v_cfg.name_change_days) then
    raise exception 'name_change_too_soon';
  end if;
  if not is_profile_name_available(p_name, p_profile_id) then
    raise exception 'name_taken';
  end if;

  -- Taking back one of your own old names frees it from the history.
  delete from profile_name_history where profile_id = p_profile_id and lower(name) = lower(p_name);
  if lower(v_profile.name) <> lower(p_name) then
    insert into profile_name_history (name, profile_id) values (v_profile.name, p_profile_id);
  end if;

  begin
    update profiles set name = p_name, name_changed_at = now(), updated_at = now()
    where id = p_profile_id
    returning * into v_profile;
  exception when unique_violation then
    raise exception 'name_taken';
  end;

  return v_profile;
end $$;

-- ---------------------------------------------------------------------------
-- Buyers and accounts
-- ---------------------------------------------------------------------------

create or replace function resolve_buyer_profile(p_lock price_locks)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_lock.profile_id is not null then
    return p_lock.profile_id;
  end if;

  select profile_id into v_id from profile_private where lower(email) = lower(p_lock.email);
  if v_id is not null then
    return v_id;
  end if;

  -- The name was available when the lock was created; if someone took it since, fall back.
  insert into profiles (name, country_code, avatar_seed)
  values (
    case when is_profile_name_available(p_lock.name) then p_lock.name else generate_profile_name() end,
    p_lock.country_code,
    coalesce(p_lock.avatar_seed, replace(gen_random_uuid()::text, '-', ''))
  )
  returning id into v_id;

  insert into profile_private (profile_id, email, locale)
  values (v_id, lower(p_lock.email), p_lock.locale);

  return v_id;
end $$;

drop function ensure_profile_for_user(uuid, text, text);

-- Called after sign-in. Claims a guest profile bought with the same email, or creates one named
-- after the provider's display name when it is a valid, free public name.
create or replace function ensure_profile_for_user(p_user_id uuid, p_email text, p_name_hint text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_hint text;
begin
  select id into v_id from profiles where user_id = p_user_id;
  if v_id is not null then
    return v_id;
  end if;

  update profiles p set user_id = p_user_id, updated_at = now()
  from profile_private pp
  where pp.profile_id = p.id and lower(pp.email) = lower(p_email) and p.user_id is null
  returning p.id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  v_hint := left(regexp_replace(coalesce(p_name_hint, ''), '[^A-Za-z0-9._-]', '', 'g'), 24);

  insert into profiles (user_id, name)
  values (p_user_id, case when is_profile_name_available(v_hint) then v_hint else generate_profile_name() end)
  returning id into v_id;

  insert into profile_private (profile_id, email) values (v_id, lower(p_email));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Takeover flow (same rules as 0005; name and avatar seed handling are new)
-- ---------------------------------------------------------------------------

drop function create_price_lock(text, text, uuid, text, text, text, text, smallint, text);

-- Known buyers (signed in, or a guest email with a profile) keep their current name and avatar;
-- `p_name` and `p_avatar_seed` only apply to new guests.
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

  v_buyer := coalesce(p_profile_id, (select profile_id from profile_private where lower(email) = lower(p_email)));

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

revoke execute on function
  is_profile_name_available(text, uuid),
  change_profile_name(uuid, text),
  resolve_buyer_profile(price_locks),
  ensure_profile_for_user(uuid, text, text),
  create_price_lock(text, text, uuid, text, text, text, text, smallint, text, text),
  apply_payment(uuid),
  generate_profile_name()
from public, anon, authenticated;
