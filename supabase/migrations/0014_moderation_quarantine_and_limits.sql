-- Moderation outages, abuse limits and report alerts (decisions 29 and 31).
--
-- If the moderator cannot give a verdict when a lock is created, the takeover still goes ahead but
-- the message and link are quarantined: the reign stores them with moderation_status 'pending' and
-- the public view hides them until a retry (Vercel cron, every minute) approves or rejects them.

create type moderation_status as enum ('approved', 'pending', 'rejected');

alter table price_locks add column moderation_status moderation_status not null default 'approved';

alter table reigns
  add column moderation_status moderation_status not null default 'approved',
  add column moderation_reason text,
  add column moderation_attempts int not null default 0;

create index reigns_moderation_pending_idx on reigns (id) where moderation_status = 'pending';

-- A reign inherits the moderation status of the lock it was paid through.
create or replace function reigns_inherit_moderation()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.payment_id is not null and (new.message is not null or new.link is not null) then
    select l.moderation_status into new.moderation_status
    from payments p join price_locks l on l.id = p.lock_id
    where p.id = new.payment_id;
    new.moderation_status := coalesce(new.moderation_status, 'approved');
  end if;
  return new;
end $$;

revoke execute on function reigns_inherit_moderation() from public, anon, authenticated;

create trigger reigns_moderation
before insert on reigns
for each row execute function reigns_inherit_moderation();

-- Same columns as 0008: message and link show only once approved and while not hidden by an admin.
create or replace view public_reigns as
select
  id, season_id, profile_id, price_paid_cents, name, country_code,
  case when message_hidden or moderation_status <> 'approved' then null else message end as message,
  case when message_hidden or moderation_status <> 'approved' then null else link end as link,
  started_at, ended_at, end_reason, dethroned_by, duration_seconds
from reigns;

-- Records a delayed verdict for a quarantined reign. Returns false if it was no longer pending.
create or replace function settle_reign_moderation(p_reign_id bigint, p_approved boolean, p_reason text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  update reigns
  set moderation_status = case when p_approved then 'approved' else 'rejected' end::moderation_status,
      moderation_reason = case when p_approved then null else p_reason end,
      moderation_attempts = moderation_attempts + 1
  where id = p_reign_id and moderation_status = 'pending';
  return found;
end $$;

-- A retry that still got no verdict.
create or replace function note_moderation_attempt(p_reign_id bigint)
returns void
language sql security definer set search_path = public
as $$
  update reigns set moderation_attempts = moderation_attempts + 1 where id = p_reign_id and moderation_status = 'pending';
$$;

-- ---------------------------------------------------------------------------
-- Abuse limits: checked before any model call
-- ---------------------------------------------------------------------------

alter table app_config
  add column max_moderations_per_ip_per_hour int not null default 20 check (max_moderations_per_ip_per_hour > 0),
  add column max_profile_saves_per_hour int not null default 20 check (max_profile_saves_per_hour > 0);

create table rate_limit_hits (
  key text not null,
  hit_at timestamptz not null default now()
);

create index rate_limit_hits_key_idx on rate_limit_hits (key, hit_at desc);
alter table rate_limit_hits enable row level security;

-- Counts one hit for `p_key` and says whether it is within `p_limit` per `p_window_seconds`.
-- Old hits are trimmed as they go.
create or replace function take_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_count int;
begin
  perform pg_advisory_xact_lock(hashtext(p_key));
  delete from rate_limit_hits where key = p_key and hit_at < now() - make_interval(secs => p_window_seconds);
  select count(*) into v_count from rate_limit_hits where key = p_key;
  if v_count >= p_limit then
    return false;
  end if;
  insert into rate_limit_hits (key) values (p_key);
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Reports: alert admins at the third report (never hide automatically)
-- ---------------------------------------------------------------------------

create or replace function report_reign(p_reign_id bigint, p_ip_hash text, p_reason text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_count int;
begin
  if not exists (
    select 1 from reigns where id = p_reign_id and message is not null and not message_hidden
  ) then
    return 'not_found';
  end if;

  insert into reports (reign_id, reporter_ip_hash, reason)
  values (p_reign_id, p_ip_hash, p_reason)
  on conflict (reign_id, reporter_ip_hash) do nothing;
  if not found then
    return 'duplicate';
  end if;

  select count(*) into v_count from reports where reign_id = p_reign_id;
  if v_count = 3 then
    insert into notifications (kind, profile_id, payload)
    select 'reports_threshold', pp.profile_id, jsonb_build_object('reign_id', p_reign_id, 'reports', v_count)
    from profile_private pp
    where pp.is_admin;
  end if;
  return 'created';
end $$;

revoke execute on function
  settle_reign_moderation(bigint, boolean, text),
  note_moderation_attempt(bigint),
  take_rate_limit(text, int, int),
  report_reign(bigint, text, text)
from public, anon, authenticated;
