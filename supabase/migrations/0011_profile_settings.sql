-- Edit profile (M5): one function saves every setting atomically, uploaded avatars live in a public
-- Storage bucket, and two read-only views feed the public profile's chronicle and main rival.

-- ---------------------------------------------------------------------------
-- Avatar uploads
-- ---------------------------------------------------------------------------

-- Public read so pages can show the images; only the service role writes (no storage policies).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/png', 'image/webp'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Saving a profile
-- ---------------------------------------------------------------------------

-- Saves the whole edit-profile form or nothing. Name changes go through change_profile_name
-- (format, cooldown, uniqueness, history); link formats are enforced by the table checks.
-- Errors: profile_not_found, name_invalid, name_change_too_soon, name_taken, showcase_invalid,
-- avatar_invalid, alert_price_invalid, locale_invalid, plus check violations named after the column.
create or replace function update_profile(
  p_profile_id uuid,
  p_name text,
  p_country_code text,
  p_main_link text,
  p_link_website text,
  p_link_x text,
  p_link_youtube text,
  p_link_tiktok text,
  p_link_instagram text,
  p_link_github text,
  p_link_linkedin text,
  p_avatar_mode text,
  p_avatar_path text,
  p_avatar_pixelated boolean,
  p_avatar_traits jsonb,
  p_showcase text[],
  p_show_rival boolean,
  p_show_chronicle boolean,
  p_alerts_dethroned boolean,
  p_alerts_price_below_cents int,
  p_alerts_season_start boolean,
  p_locale text
)
returns profiles
language plpgsql security definer set search_path = public
as $$
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
end $$;

revoke execute on function update_profile(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, boolean, jsonb, text[],
  boolean, boolean, boolean, int, boolean, text
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public profile views
-- ---------------------------------------------------------------------------

-- Each reign with who it was taken from and who took it. "From" is the reign right before it when
-- that reign was ended by this player; the first reign of a season comes from the empty throne.
create view public_chronicle as
select
  r.id,
  r.season_id,
  r.profile_id,
  r.name,
  r.country_code,
  r.started_at,
  r.ended_at,
  r.end_reason,
  r.duration_seconds,
  f.profile_id as from_profile_id,
  f.name as from_name,
  f.country_code as from_country_code,
  n.profile_id as to_profile_id,
  n.name as to_name,
  n.country_code as to_country_code
from reigns r
left join lateral (
  select p.profile_id, p.name, p.country_code
  from reigns p
  where p.id = (select max(id) from reigns where id < r.id)
    and p.end_reason = 'dethroned'
    and p.dethroned_by = r.profile_id
) f on true
left join lateral (
  select x.profile_id, x.name, x.country_code
  from reigns x
  where r.end_reason = 'dethroned' and x.id = (select min(id) from reigns where id > r.id)
) n on true;

-- Head-to-head record between two players: how often each took the crown from the other.
create view public_rivalries as
with duels as (
  select dethroned_by as winner, profile_id as loser, ended_at as at
  from reigns
  where end_reason = 'dethroned' and dethroned_by is not null and dethroned_by <> profile_id
)
select
  me as profile_id,
  them as rival_id,
  sum(won)::int as wins,
  sum(lost)::int as losses,
  max(at) as last_at
from (
  select winner as me, loser as them, 1 as won, 0 as lost, at from duels
  union all
  select loser, winner, 0, 1, at from duels
) d
group by me, them;

grant select on public_chronicle, public_rivalries to anon, authenticated;
