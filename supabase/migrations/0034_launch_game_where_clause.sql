-- launch_game ran bare DELETE and UPDATE statements. The hosted API role refuses those
-- ("DELETE requires a WHERE clause"), so the launch failed there. Same body, every statement filtered.
create or replace function public.launch_game(p_starts_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
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
  delete from reports where true;
  delete from events where true;
  delete from profile_achievements where true;
  delete from rank_ups where true;
  delete from notifications where true;
  delete from reigns where true;
  delete from payments where not live;
  delete from webhook_events where true;
  delete from price_locks l where not exists (select 1 from payments p where p.lock_id = l.id);
  delete from rate_limit_hits where true;

  update seasons s
  set starts_at = p.starts_at, ends_at = p.ends_at, closed_at = null, king_profile_id = null, ready_alert_at = null
  from launch_plan(p_starts_at) p
  where p.season_id = s.id;
  update crown_state
  set season_id = 0, base_price_cents = v_cfg.floor_cents, base_set_at = p_starts_at, updated_at = now()
  where id;

  update app_config set prelaunch = false, updated_at = now() where true;
end $$;
