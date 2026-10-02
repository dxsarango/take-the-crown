-- M9 follow-ups: profiles.user_id (the sign-in user's id) is no longer public, and the all-zero
-- avatar seed is reserved for deleted accounts, which the app draws as the Former king silhouette.

-- Clients read every profile column except user_id. A column added later needs its own grant.
revoke select on profiles from anon, authenticated;
grant select (id, name, country_code, avatar_mode, avatar_path, avatar_pixelated, main_link, link_website, link_x, link_youtube, link_tiktok, link_instagram, showcase, show_total_spent, is_banned, created_at, updated_at, link_github, link_linkedin, show_rival, show_chronicle, name_changed_at, avatar_seed, avatar_traits, deleted_at) on profiles to anon, authenticated;

alter table profiles add constraint profiles_avatar_seed_reserved check (
  avatar_seed <> '00000000000000000000000000000000' or deleted_at is not null
);
alter table price_locks add constraint price_locks_avatar_seed_reserved check (
  avatar_seed is distinct from '00000000000000000000000000000000'
);

-- Deleting an account needs a sign-in this recent; otherwise a sign-in link is emailed first.
alter table app_config
  add column delete_reauth_seconds int not null default 600 check (delete_reauth_seconds between 60 and 86400);

-- The own_read policy matched rows through profiles.user_id. No client reads profile_private (the
-- app reads it with the service role), so signed-in players lose that read instead.
drop policy own_read on profile_private;
revoke select on profile_private from authenticated;
