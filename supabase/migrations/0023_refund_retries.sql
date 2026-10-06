-- Refunds that survive the provider saying no (M10b). Asking the provider for a refund can fail
-- (Dodo answers INSUFFICIENT_WALLET_FUNDS while the wallet is short, or is briefly unreachable).
-- The payment stays refund_pending and the refund is retried from a cron with exponential backoff;
-- a refusal that retrying can't fix stops the retries and waits for an admin. Admins get one email
-- per alert interval while any refund is stuck.

alter table payments
  add column refund_attempts int not null default 0,
  add column refund_next_attempt_at timestamptz,
  add column refund_last_error text,
  -- The provider accepted the request; its refund webhook marks the payment refunded.
  add column refund_requested_at timestamptz;

create index payments_refund_due_idx on payments (refund_next_attempt_at)
  where status = 'refund_pending' and refund_requested_at is null;

alter table app_config
  add column refund_retry_base_seconds int not null default 60 check (refund_retry_base_seconds > 0),
  add column refund_retry_max_seconds int not null default 21600 check (refund_retry_max_seconds > 0),
  add column refund_alert_interval_seconds int not null default 3600 check (refund_alert_interval_seconds > 0);

-- Every way into refund_pending (a payment that can't be applied, an admin refund) schedules the
-- first attempt right away.
create or replace function schedule_refund()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.status = 'refund_pending' and old.status is distinct from 'refund_pending' then
    new.refund_attempts := 0;
    new.refund_next_attempt_at := now();
    new.refund_last_error := null;
    new.refund_requested_at := null;
  end if;
  return new;
end $$;

create trigger payments_schedule_refund
before update of status on payments
for each row execute function schedule_refund();

-- Refunds pending since before this migration have never been asked for, or their request failed.
update payments set refund_next_attempt_at = now()
where status = 'refund_pending';

-- Claims due refunds (or one payment, from the webhook or an admin's "retry now"). Each claim is an
-- attempt; the next one is already scheduled by the backoff, so a crash mid-request retries later
-- instead of never.
create or replace function claim_refunds(p_limit int default 10, p_payment_id uuid default null)
returns setof payments
language plpgsql security definer set search_path = public
as $$
declare
  v_cfg app_config;
begin
  select * into v_cfg from app_config;
  return query
  update payments p
  set refund_attempts = p.refund_attempts + 1,
      refund_next_attempt_at = now() + make_interval(secs => least(
        v_cfg.refund_retry_base_seconds::numeric * power(2, least(p.refund_attempts, 30)),
        v_cfg.refund_retry_max_seconds
      )),
      updated_at = now()
  where p.id in (
    select id from payments
    where status = 'refund_pending'
      and refund_requested_at is null
      and (
        (p_payment_id is null and refund_next_attempt_at <= now())
        or id = p_payment_id
      )
    order by refund_next_attempt_at nulls first
    limit case when p_payment_id is null then p_limit else 1 end
    for update skip locked
  )
  returning p.*;
end $$;

-- The provider accepted the refund request.
create or replace function record_refund_requested(p_payment_id uuid)
returns void
language sql security definer set search_path = public
as $$
  update payments
  set refund_requested_at = now(), refund_next_attempt_at = null, refund_last_error = null, updated_at = now()
  where id = p_payment_id and status = 'refund_pending';
$$;

-- The provider refused. A retryable refusal keeps the backoff the claim scheduled; a permanent one
-- stops the retries until an admin retries by hand.
create or replace function record_refund_failed(p_payment_id uuid, p_error text, p_retry boolean)
returns void
language sql security definer set search_path = public
as $$
  update payments
  set refund_last_error = left(p_error, 500),
      refund_next_attempt_at = case when p_retry then refund_next_attempt_at else null end,
      updated_at = now()
  where id = p_payment_id and status = 'refund_pending';
$$;

-- One email to every admin per alert interval while any refund is stuck: its last request failed.
create or replace function queue_stuck_refund_alert()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_cfg app_config;
  v_count int;
  v_oldest timestamptz;
  v_queued int;
begin
  select * into v_cfg from app_config;
  select count(*), min(created_at) into v_count, v_oldest
  from payments
  where status = 'refund_pending' and refund_requested_at is null and refund_last_error is not null;
  if v_count = 0 then
    return 0;
  end if;
  if exists (
    select 1 from notifications
    where kind = 'refunds_stuck' and created_at > now() - make_interval(secs => v_cfg.refund_alert_interval_seconds)
  ) then
    return 0;
  end if;
  insert into notifications (kind, profile_id, payload)
  select 'refunds_stuck', pp.profile_id, jsonb_build_object('count', v_count, 'oldest_at', v_oldest)
  from profile_private pp
  where pp.is_admin;
  get diagnostics v_queued = row_count;
  return v_queued;
end $$;

revoke execute on function
  claim_refunds(int, uuid),
  record_refund_requested(uuid),
  record_refund_failed(uuid, text, boolean),
  queue_stuck_refund_alert()
from public, anon, authenticated;

select cron.schedule('stuck-refund-alerts', '* * * * *', 'select public.queue_stuck_refund_alert()');
