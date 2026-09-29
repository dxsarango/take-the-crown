-- Privacy toggles and the price-drop and season-start alerts. The weekly digest is not part of v1.
-- "No country" needs no change: country_code is already nullable.

alter table profiles
  add column show_rival boolean not null default true,
  add column show_chronicle boolean not null default true;

alter table profile_private
  add column alerts_price_below_cents int
    check (alerts_price_below_cents > 0 and alerts_price_below_cents <= 99900 and alerts_price_below_cents % 100 = 0),
  -- base_set_at of the price cycle already alerted, so each cycle alerts at most once.
  add column alerts_price_notified_for timestamptz,
  -- Also set by the "Remind me" button on the season end page.
  add column alerts_season_start boolean not null default false;

-- Runs every minute: queues a price_drop notification when the live price reaches a player's
-- threshold. Skips the current king, banned players and closed seasons.
create or replace function queue_price_alerts()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_state crown_state;
  v_season seasons;
  v_price int;
  v_king uuid;
  v_count int;
begin
  select * into v_state from crown_state;
  select * into v_season from seasons where id = v_state.season_id;

  if now() < v_season.starts_at or now() >= v_season.ends_at then
    return 0;
  end if;

  v_price := current_price_cents();
  select profile_id into v_king from reigns where id = v_state.current_reign_id;

  with due as (
    update profile_private pp
    set alerts_price_notified_for = v_state.base_set_at
    from profiles p
    where p.id = pp.profile_id
      and not p.is_banned
      and pp.alerts_price_below_cents is not null
      and v_price <= pp.alerts_price_below_cents
      and pp.alerts_price_notified_for is distinct from v_state.base_set_at
      and pp.profile_id is distinct from v_king
    returning pp.profile_id, pp.alerts_price_below_cents
  )
  insert into notifications (kind, profile_id, payload)
  select 'price_drop', due.profile_id, jsonb_build_object(
    'price_cents', v_price,
    'threshold_cents', due.alerts_price_below_cents,
    'season_id', v_state.season_id
  )
  from due;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function queue_price_alerts() from public, anon, authenticated;

select cron.schedule('price-alerts', '* * * * *', 'select public.queue_price_alerts()');

-- Same as 0005, plus season_started notifications for players who asked for them.
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
  v_closed reigns;
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
  where id = v_state.current_reign_id
  returning * into v_closed;

  if v_closed.id is not null then
    perform award_guardian(v_closed.profile_id, v_closed.duration_seconds, v_closed.id);
  end if;

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

  insert into notifications (kind, profile_id, payload)
  select 'season_started', pp.profile_id, jsonb_build_object('season_id', v_next.id, 'slug', v_next.slug)
  from profile_private pp
  join profiles p on p.id = pp.profile_id
  where pp.alerts_season_start and not p.is_banned;
end $$;
