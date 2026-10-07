-- Admins hear about chargebacks (security audit, medium). An opened dispute already reverses the
-- reign and suspends the account (decision 43), but nobody was told: the dispute has to be
-- answered in the payment provider's dashboard before its deadline. Same as 0022, plus one
-- dispute_opened email per admin, only when the payment's dispute status first becomes opened
-- (providers send the same event more than once).

create or replace function record_payment_dispute(p_provider text, p_provider_payment_id text, p_status text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_payment payments;
  v_before text;
  v_profile uuid;
begin
  select dispute_status into v_before from payments
  where provider = p_provider and provider_payment_id = p_provider_payment_id
  for update;
  update payments set dispute_status = p_status, updated_at = now()
  where provider = p_provider and provider_payment_id = p_provider_payment_id
  returning * into v_payment;
  if v_payment.id is null then
    return 'unknown_payment';
  end if;

  if p_status = 'dispute_opened' and v_before is distinct from 'dispute_opened' then
    insert into notifications (kind, profile_id, payload)
    select 'dispute_opened', pp.profile_id,
      jsonb_build_object('payment_id', v_payment.id, 'amount_cents', v_payment.amount_cents, 'currency', v_payment.currency, 'live', v_payment.live)
    from profile_private pp
    where pp.is_admin;
  end if;

  if p_status not in ('dispute_opened', 'dispute_accepted', 'dispute_lost') then
    return 'recorded';
  end if;

  perform reverse_payment(v_payment.id, 'chargeback');
  select coalesce(
    (select profile_id from reigns where payment_id = v_payment.id),
    l.profile_id,
    (select profile_id from profile_private where lower(email) = lower(v_payment.email))
  ) into v_profile
  from price_locks l where l.id = v_payment.lock_id;
  if v_profile is not null then
    update profiles set is_banned = true, updated_at = now() where id = v_profile;
  end if;
  return 'reversed';
end $$;
