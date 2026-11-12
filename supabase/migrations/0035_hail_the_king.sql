-- Hail the king: a free reaction for the current king, open to visitors without an account.

-- ---------------------------------------------------------------------------
-- Limits
-- ---------------------------------------------------------------------------

alter table app_config
  add column max_hails_per_ip_per_hour int not null default 30 check (max_hails_per_ip_per_hour between 1 and 10000),
  -- Several people can share one address (a mobile carrier, a school), so an address may hail a few times per reign.
  add column max_anonymous_hails_per_ip_per_reign int not null default 3 check (max_anonymous_hails_per_ip_per_reign between 1 and 1000);

-- ---------------------------------------------------------------------------
-- Who hailed (private) and the counter (public)
-- ---------------------------------------------------------------------------

-- `hailer_key` is `p:<profile id>` for a signed-in visitor and `d:<hash of the device cookie>` for
-- anyone else, so each person or device hails a reign once. Nothing in this table is readable by clients.
create table reign_hails (
  id bigint generated always as identity primary key,
  reign_id bigint not null references reigns (id) on delete cascade,
  hailer_key text not null,
  profile_id uuid references profiles (id),
  ip_hash text,
  created_at timestamptz not null default now(),
  unique (reign_id, hailer_key)
);

create index reign_hails_profile_idx on reign_hails (profile_id) where profile_id is not null;
create index reign_hails_anonymous_ip_idx on reign_hails (reign_id, ip_hash) where profile_id is null;

-- Only the number leaves the database: the browser reads it and listens for changes to it.
create table reign_hail_counts (
  reign_id bigint primary key references reigns (id) on delete cascade,
  hails int not null default 0
);

alter table reign_hails enable row level security;
alter table reign_hail_counts enable row level security;
create policy public_read on reign_hail_counts for select using (true);
grant select on reign_hail_counts to anon, authenticated;

alter publication supabase_realtime add table reign_hail_counts;

-- ---------------------------------------------------------------------------
-- Hailing
-- ---------------------------------------------------------------------------

-- Answers {status, hails}: `created`, `duplicate` (this person or device already hailed this reign),
-- `own_reign` (a king cannot hail themselves), `ip_limit` (too many visitors without an account from
-- one address) or `not_current` (the reign is over, or never existed).
create or replace function hail_reign(p_reign_id bigint, p_hailer_key text, p_ip_hash text, p_profile_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_hails int;
  v_cap int;
begin
  if not exists (select 1 from crown_state where current_reign_id = p_reign_id) then
    return jsonb_build_object('status', 'not_current', 'hails', 0);
  end if;

  select coalesce(hails, 0) into v_hails from reign_hail_counts where reign_id = p_reign_id;
  v_hails := coalesce(v_hails, 0);

  if p_profile_id is not null and exists (select 1 from reigns where id = p_reign_id and profile_id = p_profile_id) then
    return jsonb_build_object('status', 'own_reign', 'hails', v_hails);
  end if;

  if exists (select 1 from reign_hails where reign_id = p_reign_id and hailer_key = p_hailer_key) then
    return jsonb_build_object('status', 'duplicate', 'hails', v_hails);
  end if;

  if p_profile_id is null and p_ip_hash is not null then
    select max_anonymous_hails_per_ip_per_reign into v_cap from app_config;
    if (select count(*) from reign_hails where reign_id = p_reign_id and profile_id is null and ip_hash = p_ip_hash) >= v_cap then
      return jsonb_build_object('status', 'ip_limit', 'hails', v_hails);
    end if;
  end if;

  insert into reign_hails (reign_id, hailer_key, profile_id, ip_hash)
  values (p_reign_id, p_hailer_key, p_profile_id, p_ip_hash)
  on conflict (reign_id, hailer_key) do nothing;
  if not found then
    return jsonb_build_object('status', 'duplicate', 'hails', v_hails);
  end if;

  insert into reign_hail_counts (reign_id, hails) values (p_reign_id, 1)
  on conflict (reign_id) do update set hails = reign_hail_counts.hails + 1
  returning hails into v_hails;

  return jsonb_build_object('status', 'created', 'hails', v_hails);
end $$;

revoke execute on function hail_reign(bigint, text, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Retention: the address hash of a hail goes after 90 days, like the ones on locks and reports
-- ---------------------------------------------------------------------------

create or replace function purge_expired_records()
returns void
language sql security definer set search_path = public
as $$
  -- Limits look back one hour at most.
  delete from rate_limit_hits where hit_at < now() - interval '1 day';
  update price_locks set ip_hash = null where ip_hash is not null and created_at < now() - interval '90 days';
  update reports set reporter_ip_hash = null where reporter_ip_hash is not null and created_at < now() - interval '90 days';
  update reign_hails set ip_hash = null where ip_hash is not null and created_at < now() - interval '90 days';
  delete from notifications
  where created_at < now() - interval '90 days' and (sent_at is not null or failed_at is not null);
$$;
