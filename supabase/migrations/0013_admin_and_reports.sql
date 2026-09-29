-- Reports and the admin area (SPEC §7, §13).

-- Report reasons are a fixed set chosen in the report dialog.
alter table reports
  add constraint reports_reason_check
    check (reason is null or reason in ('offensive', 'spam', 'scam', 'impersonation', 'other'));

create index reports_open_idx on reports (created_at desc) where not resolved;

-- Every admin action, for accountability. Service role only.
create table admin_actions (
  id bigint generated always as identity primary key,
  admin_profile_id uuid not null references profiles (id),
  action text not null,
  target text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table admin_actions enable row level security;

-- A report for a reign's message: one per IP per reign. Returns 'created', 'duplicate' or
-- 'not_found' (the reign does not exist or shows no message).
create or replace function report_reign(p_reign_id bigint, p_ip_hash text, p_reason text)
returns text
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from reigns where id = p_reign_id and message is not null and not message_hidden
  ) then
    return 'not_found';
  end if;

  insert into reports (reign_id, reporter_ip_hash, reason)
  values (p_reign_id, p_ip_hash, p_reason)
  on conflict (reign_id, reporter_ip_hash) do nothing;

  return case when found then 'created' else 'duplicate' end;
end $$;

-- Admin: hides a reign's message and link (no refund) and closes its reports.
create or replace function hide_reign_message(p_reign_id bigint, p_admin_profile_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update reigns set message_hidden = true where id = p_reign_id;
  if not found then
    raise exception 'reign_not_found';
  end if;
  update reports set resolved = true where reign_id = p_reign_id;
  insert into admin_actions (admin_profile_id, action, target) values (p_admin_profile_id, 'hide_message', p_reign_id::text);
end $$;

-- Admin: bans or unbans a player. Banned players cannot lock the crown or get alerts.
create or replace function set_profile_banned(p_profile_id uuid, p_banned boolean, p_admin_profile_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update profiles set is_banned = p_banned, updated_at = now() where id = p_profile_id;
  if not found then
    raise exception 'profile_not_found';
  end if;
  if p_banned then
    update reports r set resolved = true from reigns g where g.id = r.reign_id and g.profile_id = p_profile_id;
  end if;
  insert into admin_actions (admin_profile_id, action, target)
  values (p_admin_profile_id, case when p_banned then 'ban' else 'unban' end, p_profile_id::text);
end $$;

-- Admin: marks a report as handled without acting on the message.
create or replace function dismiss_report(p_report_id bigint, p_admin_profile_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update reports set resolved = true where id = p_report_id;
  if not found then
    raise exception 'report_not_found';
  end if;
  insert into admin_actions (admin_profile_id, action, target) values (p_admin_profile_id, 'dismiss_report', p_report_id::text);
end $$;

-- Admin: moves a paid or applied payment to refund_pending so the app refunds it through the
-- provider; the refund webhook then marks it refunded. A reign it paid for stays as it is.
create or replace function request_manual_refund(p_payment_id uuid, p_admin_profile_id uuid)
returns payments
language plpgsql security definer set search_path = public
as $$
declare
  v_payment payments;
begin
  update payments set status = 'refund_pending', updated_at = now()
  where id = p_payment_id and status in ('paid', 'applied')
  returning * into v_payment;
  if v_payment.id is null then
    raise exception 'payment_not_refundable';
  end if;
  insert into admin_actions (admin_profile_id, action, target) values (p_admin_profile_id, 'refund', p_payment_id::text);
  return v_payment;
end $$;

revoke execute on function
  report_reign(bigint, text, text),
  hide_reign_message(bigint, uuid),
  set_profile_banned(uuid, boolean, uuid),
  dismiss_report(bigint, uuid),
  request_manual_refund(uuid, uuid)
from public, anon, authenticated;
