-- Email outbox sender (SPEC §4 Alerts, §9). The sender claims a batch, sends each email and marks
-- it sent or failed. A claim counts as an attempt, so a crash mid-send is retried like an error;
-- after `max_email_attempts` a notification is given up.

alter table app_config
  add column max_email_attempts int not null default 5 check (max_email_attempts between 1 and 20);

alter table notifications
  add column claimed_until timestamptz,
  add column failed_at timestamptz,
  add column last_error text;

drop index notifications_pending_idx;
create index notifications_pending_idx on notifications (created_at) where sent_at is null and failed_at is null;

-- Claims up to p_limit pending notifications for two minutes. Concurrent senders (the webhook and
-- the cron) never get the same row.
create or replace function claim_notifications(p_limit int)
returns setof notifications
language plpgsql security definer set search_path = public
as $$
declare
  v_max int;
begin
  select max_email_attempts into v_max from app_config;
  return query
  update notifications n
  set attempts = n.attempts + 1,
      claimed_until = now() + interval '2 minutes'
  where n.id in (
    select id from notifications
    where sent_at is null
      and failed_at is null
      and attempts < v_max
      and (claimed_until is null or claimed_until < now())
    order by created_at
    limit p_limit
    for update skip locked
  )
  returning n.*;
end $$;

create or replace function mark_notification_sent(p_id bigint)
returns void
language sql security definer set search_path = public
as $$
  update notifications set sent_at = now(), claimed_until = null, last_error = null where id = p_id;
$$;

-- A failed send is retried by the next claim, unless it was the last attempt or p_final says
-- retrying cannot help (no recipient, alert turned off, unknown kind).
create or replace function mark_notification_failed(p_id bigint, p_error text, p_final boolean)
returns void
language sql security definer set search_path = public
as $$
  update notifications n
  set claimed_until = null,
      last_error = left(p_error, 500),
      failed_at = case when p_final or n.attempts >= c.max_email_attempts then now() end
  from app_config c
  where n.id = p_id;
$$;

-- One-click "turn off" links in alert emails.
create or replace function turn_off_alert(p_profile_id uuid, p_kind text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_kind = 'dethroned' then
    update profile_private set alerts_dethroned = false where profile_id = p_profile_id;
  elsif p_kind = 'price_drop' then
    update profile_private set alerts_price_below_cents = null where profile_id = p_profile_id;
  elsif p_kind = 'season_started' then
    update profile_private set alerts_season_start = false where profile_id = p_profile_id;
  else
    raise exception 'unknown_alert';
  end if;
end $$;

revoke execute on function
  claim_notifications(int),
  mark_notification_sent(bigint),
  mark_notification_failed(bigint, text, boolean),
  turn_off_alert(uuid, text)
from public, anon, authenticated;
