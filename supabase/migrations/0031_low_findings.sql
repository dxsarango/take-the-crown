-- Low findings from the security audit (L2, L4, L5).

-- ---------------------------------------------------------------------------
-- L2: a per-IP limit on the live public-name check
-- ---------------------------------------------------------------------------

alter table app_config
  add column max_name_checks_per_ip_per_hour int not null default 600 check (max_name_checks_per_ip_per_hour between 1 and 10000);

-- ---------------------------------------------------------------------------
-- L4: the service role gets a statement timeout too (anon has 3 s, authenticated 8 s)
-- ---------------------------------------------------------------------------

-- Longer than the client roles because admin work (closing a season, launching the game) is heavier.
-- PostgREST applies the role's settings to each request; a function stops at 300 s on Vercel anyway.
alter role service_role set statement_timeout = '30s';

-- ---------------------------------------------------------------------------
-- L5: suspension ends the account's sessions and blocks profile edits
-- ---------------------------------------------------------------------------

-- Every way to suspend a profile (the admin action, a chargeback) goes through this trigger. Deleting
-- the sessions deletes their refresh tokens (on delete cascade), so the player is signed out
-- everywhere; the next request fails getUser(). A new sign-in still works, which is why
-- update_profile refuses suspended profiles as well.
create or replace function end_sessions_of_suspended_profile()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.user_id is not null then
    delete from auth.sessions where user_id = new.user_id;
  end if;
  return new;
end $$;

revoke execute on function end_sessions_of_suspended_profile() from public, anon, authenticated, service_role;

create trigger profiles_end_sessions_on_suspension
  after update of is_banned on profiles
  for each row
  when (new.is_banned and not old.is_banned)
  execute function end_sessions_of_suspended_profile();

-- Errors: profile_not_found, profile_suspended, name_invalid, name_change_too_soon, name_taken,
-- showcase_invalid, avatar_invalid, alert_price_invalid, locale_invalid, plus check violations.
CREATE OR REPLACE FUNCTION public.update_profile(p_profile_id uuid, p_name text, p_country_code text, p_main_link text, p_link_website text, p_link_x text, p_link_youtube text, p_link_tiktok text, p_link_instagram text, p_link_github text, p_link_linkedin text, p_avatar_mode text, p_avatar_path text, p_avatar_pixelated boolean, p_avatar_traits jsonb, p_showcase text[], p_show_rival boolean, p_show_chronicle boolean, p_alerts_dethroned boolean, p_alerts_price_below_cents integer, p_alerts_season_start boolean, p_locale text)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cfg app_config;
  v_profile profiles;
  v_showcase text[] := coalesce(p_showcase, '{}');
begin
  select * into v_cfg from app_config;
  select * into v_profile from profiles where id = p_profile_id for update;
  if v_profile.id is null then
    raise exception 'profile_not_found';
  end if;

  if v_profile.is_banned then
    raise exception 'profile_suspended';
  end if;

  if p_name is distinct from v_profile.name then
    perform change_profile_name(p_profile_id, p_name);
  end if;

  if cardinality(v_showcase) > 3
    or cardinality(v_showcase) <> (select count(distinct c) from unnest(v_showcase) c)
    or exists (
      select 1 from unnest(v_showcase) c
      where not exists (
        select 1 from profile_achievements pa where pa.profile_id = p_profile_id and pa.achievement_code = c
      )
    )
  then
    raise exception 'showcase_invalid';
  end if;

  -- Uploaded files are stored under the owner's id, so a profile can only point at its own.
  if p_avatar_mode not in ('generated', 'upload')
    or (p_avatar_mode = 'upload' and (p_avatar_path is null or p_avatar_path !~ ('^' || p_profile_id::text || '/[0-9a-f-]{36}$')))
    or (p_avatar_path is not null and p_avatar_path !~ ('^' || p_profile_id::text || '/[0-9a-f-]{36}$'))
  then
    raise exception 'avatar_invalid';
  end if;

  if p_alerts_price_below_cents is not null
    and (p_alerts_price_below_cents < v_cfg.floor_cents or p_alerts_price_below_cents > 99900 or p_alerts_price_below_cents % 100 <> 0)
  then
    raise exception 'alert_price_invalid';
  end if;

  if p_locale not in ('en', 'es') then
    raise exception 'locale_invalid';
  end if;

  update profiles set
    country_code = p_country_code,
    main_link = p_main_link,
    link_website = p_link_website,
    link_x = p_link_x,
    link_youtube = p_link_youtube,
    link_tiktok = p_link_tiktok,
    link_instagram = p_link_instagram,
    link_github = p_link_github,
    link_linkedin = p_link_linkedin,
    avatar_mode = p_avatar_mode,
    avatar_path = p_avatar_path,
    avatar_pixelated = coalesce(p_avatar_pixelated, true),
    avatar_traits = p_avatar_traits,
    showcase = v_showcase,
    show_rival = coalesce(p_show_rival, true),
    show_chronicle = coalesce(p_show_chronicle, true),
    updated_at = now()
  where id = p_profile_id
  returning * into v_profile;

  update profile_private set
    alerts_dethroned = coalesce(p_alerts_dethroned, true),
    alerts_price_below_cents = p_alerts_price_below_cents,
    -- A new threshold may alert in the current price cycle.
    alerts_price_notified_for = case
      when alerts_price_below_cents is distinct from p_alerts_price_below_cents then null
      else alerts_price_notified_for
    end,
    alerts_season_start = coalesce(p_alerts_season_start, false),
    locale = p_locale
  where profile_id = p_profile_id;

  return v_profile;
end $function$;
