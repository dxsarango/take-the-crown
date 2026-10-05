-- Reversals after delivery (M10b): a refund of a payment whose crown was delivered, or a
-- chargeback. The reign stays in the public history, marked as reversed, with its message and link
-- hidden; it stops counting toward statistics, leaderboards, ranks, records and future achievements,
-- and the achievements earned through it are revoked. A chargeback also suspends the account.
-- Refunds we requested before delivery (refund_pending) never had a reign and change nothing else.

alter type reign_end_reason add value if not exists 'reversed';

alter table reigns
  add column reversed_at timestamptz,
  add column reversal_kind text check (reversal_kind in ('refund', 'chargeback'));
create index reigns_reversed_idx on reigns (reversed_at) where reversed_at is not null;

-- Latest dispute status the provider reported (Dodo: dispute_opened … dispute_lost).
alter table payments add column dispute_status text;

-- ---------------------------------------------------------------------------
-- The reversal
-- ---------------------------------------------------------------------------

-- Reverses the reign a payment bought, if the crown was delivered. Idempotent; a later chargeback
-- upgrades a refund. Returns the reign id, or null when the payment never crowned anyone.
create or replace function reverse_payment(p_payment_id uuid, p_kind text)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_reign reigns;
  v_total bigint;
  v_ranks text[] := array['peasant', 'knight', 'baron', 'count', 'duke', 'emperor'];
begin
  if p_kind not in ('refund', 'chargeback') then
    raise exception 'unknown_reversal';
  end if;
  perform 1 from crown_state where id for update;
  select * into v_reign from reigns where payment_id = p_payment_id for update;
  if v_reign.id is null then
    return null;
  end if;

  if v_reign.reversed_at is null then
    -- A king whose payment is reversed leaves the throne at once; the price stays where it is.
    if v_reign.ended_at is null then
      update reigns set ended_at = now(), end_reason = 'reversed' where id = v_reign.id;
      update crown_state set current_reign_id = null, updated_at = now()
      where id and current_reign_id = v_reign.id;
    end if;
    update reigns set reversed_at = now(), reversal_kind = p_kind, message_hidden = true where id = v_reign.id;
    delete from profile_achievements where reign_id = v_reign.id;

    -- Ranks the player no longer reaches without this reign.
    select total_reign_seconds into v_total from profile_stats where profile_id = v_reign.profile_id;
    delete from rank_ups
    where profile_id = v_reign.profile_id
      and array_position(v_ranks, rank) > array_position(v_ranks, rank_for_seconds(coalesce(v_total, 0)));

    -- A season already closed gets its King of the Season again without this reign.
    update seasons s
    set king_profile_id = (
      select r.profile_id from reigns r
      where r.season_id = s.id and r.reversed_at is null
      group by r.profile_id
      order by sum(r.duration_seconds) desc
      limit 1
    )
    where s.id = v_reign.season_id and s.closed_at is not null;
  elsif p_kind = 'chargeback' then
    update reigns set reversal_kind = 'chargeback' where id = v_reign.id;
  end if;

  return v_reign.id;
end $$;

revoke execute on function reverse_payment(uuid, text) from public, anon, authenticated;

-- The refund webhook: a refund of a payment that crowned someone reverses that reign.
create or replace function mark_payment_refunded(p_provider text, p_provider_payment_id text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_payment_id uuid;
begin
  update payments set status = 'refunded', updated_at = now()
  where provider = p_provider and provider_payment_id = p_provider_payment_id
  returning id into v_payment_id;
  if v_payment_id is not null then
    perform reverse_payment(v_payment_id, 'refund');
  end if;
end $$;

revoke execute on function mark_payment_refunded(text, text) from public, anon, authenticated;

-- Dispute webhooks. Opened, accepted or lost disputes are chargebacks: the reign is reversed and the
-- buyer's profile suspended. Other statuses (challenged, won, cancelled, expired) are only recorded;
-- an admin decides whether to lift the suspension. Returns 'reversed', 'recorded' or 'unknown_payment'.
create or replace function record_payment_dispute(p_provider text, p_provider_payment_id text, p_status text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_payment payments;
  v_profile uuid;
begin
  update payments set dispute_status = p_status, updated_at = now()
  where provider = p_provider and provider_payment_id = p_provider_payment_id
  returning * into v_payment;
  if v_payment.id is null then
    return 'unknown_payment';
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

revoke execute on function record_payment_dispute(text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reversed reigns stop counting
-- ---------------------------------------------------------------------------

create or replace view profile_stats as
select profile_id, crowns_taken, total_reign_seconds, longest_reign_seconds, times_dethroned, total_spent_cents,
       rank_for_seconds(total_reign_seconds) as rank
from (
  select p.id as profile_id,
         count(r.id)::integer as crowns_taken,
         coalesce(sum(coalesce(r.duration_seconds, extract(epoch from now() - r.started_at)::integer)), 0::bigint) as total_reign_seconds,
         coalesce(max(coalesce(r.duration_seconds, extract(epoch from now() - r.started_at)::integer)), 0) as longest_reign_seconds,
         count(r.id) filter (where r.end_reason = 'dethroned')::integer as times_dethroned,
         case when p.show_total_spent then coalesce(sum(r.price_paid_cents), 0::bigint) else null::bigint end as total_spent_cents
  from profiles p
  left join reigns r on r.profile_id = p.id and r.reversed_at is null
  group by p.id
) s;

create or replace view season_leaderboard as
select season_id, profile_id,
       count(*)::integer as crowns,
       sum(coalesce(duration_seconds, extract(epoch from now() - started_at)::integer)) as reign_seconds,
       max(coalesce(duration_seconds, extract(epoch from now() - started_at)::integer)) as longest_seconds,
       min(duration_seconds) as shortest_seconds
from reigns
where reversed_at is null
group by season_id, profile_id;

create or replace view country_leaderboard as
select season_id, country_code,
       count(*)::integer as crowns,
       sum(coalesce(duration_seconds, extract(epoch from now() - started_at)::integer)) as reign_seconds,
       count(distinct profile_id)::integer as kings
from reigns
where country_code is not null and reversed_at is null
group by season_id, country_code;

create or replace view public_rivalries as
with duels as (
  select reigns.dethroned_by as winner, reigns.profile_id as loser, reigns.ended_at as at
  from reigns
  where reigns.end_reason = 'dethroned' and reigns.dethroned_by is not null
    and reigns.dethroned_by <> reigns.profile_id and reigns.reversed_at is null
)
select me as profile_id, them as rival_id, sum(won)::integer as wins, sum(lost)::integer as losses, max(at) as last_at
from (
  select duels.winner as me, duels.loser as them, 1 as won, 0 as lost, duels.at from duels
  union all
  select duels.loser, duels.winner, 0, 1, duels.at from duels
) d
group by me, them;

create or replace view season_stats as
select season_id,
       count(*)::integer as reigns,
       count(distinct profile_id)::integer as kings,
       count(distinct country_code)::integer as countries,
       max(coalesce(duration_seconds, extract(epoch from now() - started_at)::integer)) as longest_seconds,
       min(duration_seconds) as shortest_seconds,
       max(price_paid_cents) as peak_price_cents
from reigns
where reversed_at is null
group by season_id;

-- The history keeps reversed reigns, marked, without their message or link.
create or replace view public_reigns as
select id, season_id, profile_id, price_paid_cents, name, country_code,
       case when message_hidden or moderation_status <> 'approved' then null::text else message end as message,
       case when message_hidden or moderation_status <> 'approved' then null::text else link end as link,
       started_at, ended_at, end_reason, dethroned_by, duration_seconds,
       reversed_at is not null as reversed
from reigns;

-- ---------------------------------------------------------------------------
-- Future achievements and season kings ignore reversed reigns
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.award_takeover_achievements(p_reign reigns, p_prev reigns, p_lock price_locks)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cfg app_config;
  v_season seasons;
begin
  select * into v_cfg from app_config;
  select * into v_season from seasons where id = p_reign.season_id;

  if not exists (select 1 from reigns where season_id = p_reign.season_id and id <> p_reign.id and reversed_at is null) then
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

  if (select count(*) from reigns where profile_id = p_reign.profile_id and reversed_at is null) >= 10 then
    perform award(p_reign.profile_id, 'collector', p_reign.id);
  end if;

  if p_reign.country_code is not null
     and not exists (select 1 from reigns where country_code = p_reign.country_code and id <> p_reign.id and reversed_at is null) then
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
      where profile_id = p_reign.profile_id and id <> p_reign.id and ended_at is not null and reversed_at is null
      order by started_at desc
      limit 1
    ) last_reign
    where last_reign.dethroned_by = p_prev.profile_id
  ) then
    perform award(p_reign.profile_id, 'revenge', p_reign.id);
  end if;

  if (
    select count(*) from reigns r
    where ((r.profile_id = p_prev.profile_id and r.dethroned_by = p_reign.profile_id)
       or (r.profile_id = p_reign.profile_id and r.dethroned_by = p_prev.profile_id))
      and r.reversed_at is null
  ) >= 5 then
    perform award(p_reign.profile_id, 'rivalry', p_reign.id);
    perform award(p_prev.profile_id, 'rivalry', p_prev.id);
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.rollover_season()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cfg app_config;
  v_state crown_state;
  v_season seasons;
  v_next seasons;
  v_king uuid;
  v_closed reigns;
begin
  select * into v_cfg from app_config;
  select * into v_state from crown_state where id for update;
  select * into v_season from seasons where id = v_state.season_id;

  if now() < v_season.ends_at then
    return;
  end if;

  select * into v_next from seasons where starts_at = v_season.ends_at and id <> v_season.id order by id limit 1;
  if v_next.id is null then
    update seasons set ends_at = ends_at + interval '1 month' where id = v_season.id returning * into v_season;
    insert into notifications (kind, profile_id, payload)
    select 'season_extended', pp.profile_id, jsonb_build_object('season_id', v_season.id, 'ends_at', v_season.ends_at)
    from profile_private pp
    where pp.is_admin;
    return;
  end if;

  update reigns set ended_at = v_season.ends_at, end_reason = 'season_end'
  where id = v_state.current_reign_id
  returning * into v_closed;

  if v_closed.id is not null then
    perform award_guardian(v_closed.profile_id, v_closed.duration_seconds, v_closed.id);
  end if;

  update price_locks set status = 'expired' where id = v_state.active_lock_id and status = 'active';

  select profile_id into v_king
  from reigns
  where season_id = v_season.id and reversed_at is null
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

  insert into notifications (kind, profile_id, payload)
  select 'season_started', pp.profile_id, jsonb_build_object('season_id', v_next.id, 'slug', v_next.slug)
  from profile_private pp
  join profiles p on p.id = pp.profile_id
  where pp.alerts_season_start and not p.is_banned;
end $function$;
