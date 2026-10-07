-- Live payments survive the launch (decision 52). Production may run the payment provider in live
-- mode while still in prelaunch (an admin's real purchase to verify the flow). Launching clears
-- the prelaunch game, but real money must stay on record for accounting, with its refund and
-- dispute status. payments.live marks a payment the provider took in live mode; test-provider and
-- test-mode payments stay false and are deleted at launch as before.

alter table payments add column live boolean not null default false;

-- The webhook says whether the provider that verified it runs in live mode.
drop function record_paid_payment(text, text, text, uuid, int, text, text);

create function record_paid_payment(
  p_provider text,
  p_event_id text,
  p_provider_payment_id text,
  p_lock_id uuid,
  p_amount_cents int,
  p_currency text,
  p_email text,
  p_live boolean default false
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

  insert into payments (lock_id, provider, provider_payment_id, amount_cents, currency, email, live)
  values (p_lock_id, p_provider, p_provider_payment_id, p_amount_cents, p_currency, lower(p_email), p_live)
  on conflict (provider, provider_payment_id) do nothing
  returning id into v_payment_id;

  if v_payment_id is null then
    return 'duplicate';
  end if;

  return apply_payment(v_payment_id);
end $$;

revoke execute on function record_paid_payment(text, text, text, uuid, int, text, text, boolean) from public, anon, authenticated;

-- Same as 0021, except live payments and their locks are kept. Every prelaunch reign still goes,
-- a live one included: the payment stays, with no reign pointing at it, so a later refund or
-- dispute only updates the payment.
create or replace function launch_game(p_starts_at timestamptz)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_cfg app_config;
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
  delete from payments where not live;
  delete from webhook_events;
  delete from price_locks l where not exists (select 1 from payments p where p.lock_id = l.id);
  delete from rate_limit_hits;

  update seasons s
  set starts_at = p.starts_at, ends_at = p.ends_at, closed_at = null, king_profile_id = null, ready_alert_at = null
  from launch_plan(p_starts_at) p
  where p.season_id = s.id;
  update crown_state
  set season_id = 0, base_price_cents = v_cfg.floor_cents, base_set_at = p_starts_at, updated_at = now()
  where id;

  update app_config set prelaunch = false, updated_at = now();
end $$;
