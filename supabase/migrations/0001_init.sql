-- Take the Crown: initial schema
-- Money is stored in integer USD cents. All game writes go through security definer functions.

create extension if not exists pgcrypto;

create type rarity as enum ('common', 'rare', 'epic', 'legendary', 'seasonal');
create type lock_status as enum ('active', 'consumed', 'expired');
create type payment_status as enum ('paid', 'applied', 'refund_pending', 'refunded', 'failed');
create type reign_end_reason as enum ('dethroned', 'season_end', 'admin');
create type event_kind as enum ('crown_taken', 'achievement_unlocked', 'season_started', 'season_ended');

-- ---------------------------------------------------------------------------
-- Config
-- ---------------------------------------------------------------------------

create table app_config (
  id boolean primary key default true check (id),
  floor_cents int not null default 500 check (floor_cents > 0),
  step_bps int not null default 2000 check (step_bps > 0),
  decay_bps_per_hour int not null default 200 check (decay_bps_per_hour between 0 and 9999),
  lock_seconds int not null default 300 check (lock_seconds > 0),
  late_payment_grace_seconds int not null default 600,
  max_message_length int not null default 80,
  max_locks_per_ip_per_hour int not null default 5,
  updated_at timestamptz not null default now()
);

insert into app_config default values;

-- ---------------------------------------------------------------------------
-- Seasons
-- ---------------------------------------------------------------------------

create table seasons (
  id int primary key,
  slug text not null unique,
  name_en text not null,
  name_es text not null,
  skin text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  exclusive_achievement text,
  exclusive_frame text,
  king_profile_id uuid,
  closed_at timestamptz,
  check (ends_at > starts_at)
);

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 32),
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  avatar_mode text not null default 'generated' check (avatar_mode in ('generated', 'upload')),
  avatar_path text,
  avatar_pixelated boolean not null default true,
  main_link text,
  link_website text,
  link_x text,
  link_youtube text,
  link_tiktok text,
  link_instagram text,
  showcase text[] not null default '{}' check (cardinality(showcase) <= 3),
  show_total_spent boolean not null default false,
  is_banned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table profile_private (
  profile_id uuid primary key references profiles (id) on delete cascade,
  email text not null,
  alerts_email boolean not null default true,
  locale text not null default 'en' check (locale in ('en', 'es')),
  is_admin boolean not null default false
);

create unique index profile_private_email_idx on profile_private (lower(email));

-- ---------------------------------------------------------------------------
-- Locks, payments, reigns, crown state
-- ---------------------------------------------------------------------------

create table price_locks (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles (id),
  email text not null,
  ip_hash text not null,
  season_id int not null references seasons (id),
  expected_reign_id bigint,
  price_cents int not null check (price_cents > 0),
  display_name text not null check (char_length(display_name) between 1 and 32),
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  message text,
  link text,
  local_hour smallint check (local_hour between 0 and 23),
  locale text not null default 'en',
  status lock_status not null default 'active',
  checkout_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index price_locks_ip_idx on price_locks (ip_hash, created_at desc);

create table payments (
  id uuid primary key default gen_random_uuid(),
  lock_id uuid not null references price_locks (id),
  provider text not null,
  provider_payment_id text not null,
  amount_cents int not null,
  currency text not null,
  email text not null,
  status payment_status not null default 'paid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);

create table webhook_events (
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

create table reigns (
  id bigint generated always as identity primary key,
  season_id int not null references seasons (id),
  profile_id uuid not null references profiles (id),
  payment_id uuid unique references payments (id),
  price_paid_cents int not null check (price_paid_cents > 0),
  display_name text not null,
  country_code text,
  message text,
  link text,
  message_hidden boolean not null default false,
  local_hour smallint,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason reign_end_reason,
  dethroned_by uuid references profiles (id),
  duration_seconds int generated always as (
    case when ended_at is null then null
    else floor(extract(epoch from (ended_at - started_at)))::int end
  ) stored
);

create unique index reigns_single_open_idx on reigns ((true)) where ended_at is null;
create index reigns_profile_idx on reigns (profile_id, started_at desc);
create index reigns_season_idx on reigns (season_id, started_at desc);
create index reigns_country_idx on reigns (country_code);

create table crown_state (
  id boolean primary key default true check (id),
  season_id int not null references seasons (id),
  current_reign_id bigint references reigns (id),
  base_price_cents int not null,
  base_set_at timestamptz not null default now(),
  active_lock_id uuid references price_locks (id),
  active_lock_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Achievements, events, reports, notifications
-- ---------------------------------------------------------------------------

create table achievements (
  code text primary key,
  rarity rarity not null,
  season_id int references seasons (id),
  sort_order int not null default 0,
  active boolean not null default true
);

create table profile_achievements (
  profile_id uuid not null references profiles (id) on delete cascade,
  achievement_code text not null references achievements (code),
  season_id int not null references seasons (id),
  reign_id bigint references reigns (id),
  earned_at timestamptz not null default now(),
  primary key (profile_id, achievement_code)
);

create table events (
  id bigint generated always as identity primary key,
  kind event_kind not null,
  season_id int references seasons (id),
  profile_id uuid references profiles (id),
  reign_id bigint references reigns (id),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index events_created_idx on events (created_at desc);

create table reports (
  id bigint generated always as identity primary key,
  reign_id bigint not null references reigns (id),
  reporter_ip_hash text not null,
  reason text,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (reign_id, reporter_ip_hash)
);

create table notifications (
  id bigint generated always as identity primary key,
  kind text not null,
  profile_id uuid not null references profiles (id),
  payload jsonb not null default '{}',
  sent_at timestamptz,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

create index notifications_pending_idx on notifications (created_at) where sent_at is null;

-- ---------------------------------------------------------------------------
-- Pricing
-- ---------------------------------------------------------------------------

create or replace function price_at(p_base int, p_set_at timestamptz, p_at timestamptz default now())
returns int
language sql stable
as $$
  select greatest(
    c.floor_cents,
    ceil(p_base * power(1 - c.decay_bps_per_hour / 10000.0,
      greatest(extract(epoch from (p_at - p_set_at)), 0) / 3600.0))::int
  )
  from app_config c
$$;

create or replace function current_price_cents()
returns int
language sql stable
as $$
  select price_at(s.base_price_cents, s.base_set_at) from crown_state s
$$;

create or replace function rank_for_seconds(p_seconds bigint)
returns text
language sql immutable
as $$
  select case
    when p_seconds >= 604800 then 'emperor'
    when p_seconds >= 259200 then 'duke'
    when p_seconds >= 86400 then 'count'
    when p_seconds >= 21600 then 'baron'
    when p_seconds >= 3600 then 'knight'
    else 'peasant'
  end
$$;

-- ---------------------------------------------------------------------------
-- Profiles: buyer resolution and account claiming
-- ---------------------------------------------------------------------------

create or replace function generate_username()
returns text
language plpgsql
as $$
declare
  v_name text;
begin
  loop
    v_name := 'king_' || encode(gen_random_bytes(4), 'hex');
    exit when not exists (select 1 from profiles where username = v_name);
  end loop;
  return v_name;
end $$;

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

  insert into profiles (username, display_name, country_code)
  values (generate_username(), p_lock.display_name, p_lock.country_code)
  returning id into v_id;

  insert into profile_private (profile_id, email, locale)
  values (v_id, lower(p_lock.email), p_lock.locale);

  return v_id;
end $$;

-- Called after sign-in. Claims a guest profile bought with the same email, or creates one.
create or replace function ensure_profile_for_user(p_user_id uuid, p_email text, p_display_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
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

  insert into profiles (user_id, username, display_name)
  values (p_user_id, generate_username(), left(coalesce(nullif(trim(p_display_name), ''), 'King'), 32))
  returning id into v_id;

  insert into profile_private (profile_id, email) values (v_id, lower(p_email));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Achievements
-- ---------------------------------------------------------------------------

create or replace function award(p_profile_id uuid, p_code text, p_reign_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_season int;
begin
  select season_id into v_season from crown_state;

  insert into profile_achievements (profile_id, achievement_code, season_id, reign_id)
  select p_profile_id, p_code, v_season, p_reign_id
  where exists (select 1 from achievements where code = p_code and active)
  on conflict do nothing;

  if found then
    insert into events (kind, season_id, profile_id, reign_id, payload)
    values ('achievement_unlocked', v_season, p_profile_id, p_reign_id, jsonb_build_object('code', p_code));
  end if;
end $$;

create or replace function award_guardian(p_profile_id uuid, p_seconds bigint, p_reign_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_seconds >= 43200 then perform award(p_profile_id, 'guardian_1', p_reign_id); end if;
  if p_seconds >= 86400 then perform award(p_profile_id, 'guardian_2', p_reign_id); end if;
  if p_seconds >= 259200 then perform award(p_profile_id, 'guardian_3', p_reign_id); end if;
end $$;

create or replace function award_takeover_achievements(p_reign reigns, p_prev reigns, p_lock price_locks)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_cfg app_config;
  v_season seasons;
begin
  select * into v_cfg from app_config;
  select * into v_season from seasons where id = p_reign.season_id;

  if not exists (select 1 from reigns where season_id = p_reign.season_id and id <> p_reign.id) then
    perform award(p_reign.profile_id, 'first_blood', p_reign.id);
  end if;

  if v_season.exclusive_achievement is not null then
    perform award(p_reign.profile_id, v_season.exclusive_achievement, p_reign.id);
  end if;

  if p_lock.price_cents <= v_cfg.floor_cents then
    perform award(p_reign.profile_id, 'bargain_hunter', p_reign.id);
  end if;

  if p_reign.local_hour between 3 and 4 then
    perform award(p_reign.profile_id, 'night_owl', p_reign.id);
  end if;

  if (select count(*) from reigns where profile_id = p_reign.profile_id) >= 10 then
    perform award(p_reign.profile_id, 'collector', p_reign.id);
  end if;

  if p_reign.country_code is not null
     and not exists (select 1 from reigns where country_code = p_reign.country_code and id <> p_reign.id) then
    perform award(p_reign.profile_id, 'patriot', p_reign.id);
  end if;

  if p_prev.id is null then
    return;
  end if;

  if p_prev.duration_seconds >= 86400 then
    perform award(p_reign.profile_id, 'regicide', p_reign.id);
  end if;

  if p_prev.duration_seconds < 60 then
    perform award(p_prev.profile_id, 'one_minute_king', p_prev.id);
  end if;

  perform award_guardian(p_prev.profile_id, p_prev.duration_seconds, p_prev.id);

  if exists (
    select 1 from (
      select dethroned_by from reigns
      where profile_id = p_reign.profile_id and id <> p_reign.id and ended_at is not null
      order by started_at desc
      limit 1
    ) last_reign
    where last_reign.dethroned_by = p_prev.profile_id
  ) then
    perform award(p_reign.profile_id, 'revenge', p_reign.id);
  end if;

  if (
    select count(*) from reigns r
    where (r.profile_id = p_prev.profile_id and r.dethroned_by = p_reign.profile_id)
       or (r.profile_id = p_reign.profile_id and r.dethroned_by = p_prev.profile_id)
  ) >= 5 then
    perform award(p_reign.profile_id, 'rivalry', p_reign.id);
    perform award(p_prev.profile_id, 'rivalry', p_prev.id);
  end if;
end $$;

-- Runs every minute: awards Guardian tiers while the current king is still reigning.
create or replace function check_live_achievements()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_reign reigns;
begin
  select r.* into v_reign from reigns r join crown_state s on s.current_reign_id = r.id;
  if v_reign.id is not null then
    perform award_guardian(v_reign.profile_id, extract(epoch from (now() - v_reign.started_at))::bigint, v_reign.id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Takeover flow
-- ---------------------------------------------------------------------------

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

  if now() >= v_season.ends_at then
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

create or replace function release_price_lock(p_lock_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform 1 from crown_state where id for update;
  update price_locks set status = 'expired' where id = p_lock_id and status = 'active';
  update crown_state set active_lock_id = null, active_lock_expires_at = null, updated_at = now()
  where id and active_lock_id = p_lock_id;
end $$;

create or replace function set_lock_checkout(p_lock_id uuid, p_checkout_id text)
returns void
language sql security definer set search_path = public
as $$
  update price_locks set checkout_id = p_checkout_id where id = p_lock_id;
$$;

-- Applies a verified, paid payment. Returns 'applied', 'refund_pending' or the existing status.
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

-- Entry point for verified webhooks. Idempotent per provider event and per provider payment.
create or replace function record_paid_payment(
  p_provider text,
  p_event_id text,
  p_provider_payment_id text,
  p_lock_id uuid,
  p_amount_cents int,
  p_currency text,
  p_email text
)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_payment_id uuid;
begin
  insert into webhook_events (provider, event_id) values (p_provider, p_event_id)
  on conflict do nothing;
  if not found then
    return 'duplicate';
  end if;

  insert into payments (lock_id, provider, provider_payment_id, amount_cents, currency, email)
  values (p_lock_id, p_provider, p_provider_payment_id, p_amount_cents, p_currency, lower(p_email))
  on conflict (provider, provider_payment_id) do nothing
  returning id into v_payment_id;

  if v_payment_id is null then
    return 'duplicate';
  end if;

  return apply_payment(v_payment_id);
end $$;

create or replace function mark_payment_refunded(p_provider text, p_provider_payment_id text)
returns void
language sql security definer set search_path = public
as $$
  update payments set status = 'refunded', updated_at = now()
  where provider = p_provider and provider_payment_id = p_provider_payment_id;
$$;

-- ---------------------------------------------------------------------------
-- Seasons rollover (runs every minute)
-- ---------------------------------------------------------------------------

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
  where id = v_state.current_reign_id;

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

-- ---------------------------------------------------------------------------
-- Public views
-- ---------------------------------------------------------------------------

create view public_reigns as
select
  id, season_id, profile_id, price_paid_cents, display_name, country_code,
  case when message_hidden then null else message end as message,
  case when message_hidden then null else link end as link,
  started_at, ended_at, end_reason, dethroned_by, duration_seconds
from reigns;

create view profile_stats as
select s.*, rank_for_seconds(s.total_reign_seconds) as rank
from (
  select
    p.id as profile_id,
    count(r.id)::int as crowns_taken,
    coalesce(sum(coalesce(r.duration_seconds, extract(epoch from (now() - r.started_at))::int)), 0)::bigint as total_reign_seconds,
    coalesce(max(coalesce(r.duration_seconds, extract(epoch from (now() - r.started_at))::int)), 0)::int as longest_reign_seconds,
    (count(r.id) filter (where r.end_reason = 'dethroned'))::int as times_dethroned,
    (case when p.show_total_spent then coalesce(sum(r.price_paid_cents), 0) end)::bigint as total_spent_cents
  from profiles p
  left join reigns r on r.profile_id = p.id
  group by p.id
) s;

create view achievement_stats as
select
  a.code,
  a.rarity,
  count(pa.profile_id)::int as holders,
  round(100.0 * count(pa.profile_id) / greatest((select count(*) from profiles), 1), 1) as holder_pct
from achievements a
left join profile_achievements pa on pa.achievement_code = a.code
group by a.code, a.rarity;

create view season_leaderboard as
select
  season_id,
  profile_id,
  count(*)::int as crowns,
  sum(coalesce(duration_seconds, extract(epoch from (now() - started_at))::int))::bigint as reign_seconds,
  max(coalesce(duration_seconds, extract(epoch from (now() - started_at))::int))::int as longest_seconds,
  min(duration_seconds)::int as shortest_seconds
from reigns
group by season_id, profile_id;

create view country_leaderboard as
select
  season_id,
  country_code,
  count(*)::int as crowns,
  sum(coalesce(duration_seconds, extract(epoch from (now() - started_at))::int))::bigint as reign_seconds
from reigns
where country_code is not null
group by season_id, country_code;

create view public_crown_state as
select
  s.season_id,
  s.current_reign_id,
  s.base_price_cents,
  s.base_set_at,
  (s.active_lock_id is not null and s.active_lock_expires_at > now()) as is_locked,
  case when s.active_lock_expires_at > now() then s.active_lock_expires_at end as lock_expires_at,
  current_price_cents() as price_cents,
  c.floor_cents,
  c.step_bps,
  c.decay_bps_per_hour
from crown_state s cross join app_config c;

-- ---------------------------------------------------------------------------
-- Row level security: public read where safe, all writes through the service role
-- ---------------------------------------------------------------------------

alter table app_config enable row level security;
alter table seasons enable row level security;
alter table profiles enable row level security;
alter table profile_private enable row level security;
alter table price_locks enable row level security;
alter table payments enable row level security;
alter table webhook_events enable row level security;
alter table reigns enable row level security;
alter table crown_state enable row level security;
alter table achievements enable row level security;
alter table profile_achievements enable row level security;
alter table events enable row level security;
alter table reports enable row level security;
alter table notifications enable row level security;

create policy public_read on app_config for select using (true);
create policy public_read on seasons for select using (true);
create policy public_read on profiles for select using (true);
create policy public_read on crown_state for select using (true);
create policy public_read on achievements for select using (true);
create policy public_read on profile_achievements for select using (true);
create policy public_read on events for select using (true);

create policy own_read on profile_private for select
  using (exists (select 1 from profiles p where p.id = profile_id and p.user_id = auth.uid()));

grant select on public_reigns, profile_stats, achievement_stats, season_leaderboard,
  country_leaderboard, public_crown_state to anon, authenticated;

revoke execute on function
  resolve_buyer_profile(price_locks),
  ensure_profile_for_user(uuid, text, text),
  award(uuid, text, bigint),
  award_guardian(uuid, bigint, bigint),
  award_takeover_achievements(reigns, reigns, price_locks),
  check_live_achievements(),
  create_price_lock(text, text, uuid, text, text, text, text, smallint, text),
  release_price_lock(uuid),
  set_lock_checkout(uuid, text),
  apply_payment(uuid),
  record_paid_payment(text, text, text, uuid, int, text, text),
  mark_payment_refunded(text, text),
  rollover_season(),
  generate_username()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------

insert into seasons (id, slug, name_en, name_es, skin, starts_at, ends_at, exclusive_achievement, exclusive_frame) values
  (0, 'genesis', 'Genesis', 'Génesis', 'genesis', '2026-10-01 00:00+00', '2026-11-01 00:00+00', 'founder', 'genesis'),
  (1, 'day-of-the-dead', 'Day of the Dead', 'Día de Muertos', 'day-of-the-dead', '2026-11-01 00:00+00', '2026-12-01 00:00+00', 'remembered', 'day-of-the-dead'),
  (2, 'frost', 'Frost', 'Escarcha', 'frost', '2026-12-01 00:00+00', '2027-01-01 00:00+00', null, null);

insert into achievements (code, rarity, season_id, sort_order) values
  ('first_blood', 'epic', null, 10),
  ('regicide', 'rare', null, 20),
  ('one_minute_king', 'common', null, 30),
  ('night_owl', 'common', null, 40),
  ('revenge', 'rare', null, 50),
  ('guardian_1', 'rare', null, 60),
  ('guardian_2', 'epic', null, 61),
  ('guardian_3', 'legendary', null, 62),
  ('bargain_hunter', 'common', null, 70),
  ('collector', 'epic', null, 80),
  ('rivalry', 'epic', null, 90),
  ('patriot', 'rare', null, 100),
  ('founder', 'seasonal', 0, 200),
  ('remembered', 'seasonal', 1, 201);

insert into crown_state (season_id, base_price_cents) values (0, 500);
