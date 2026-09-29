-- Seven optional profile links. The app accepts a handle or a URL and stores one canonical https URL
-- per platform; these checks reject anything that is not in that canonical form.

alter table profiles
  add column link_github text,
  add column link_linkedin text;

alter table profiles
  add constraint profiles_main_link_format
    check (main_link ~ '^https://[^\s]+$' and char_length(main_link) <= 200),
  add constraint profiles_link_website_format
    check (link_website ~ '^https://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(/[^\s]*)?$' and char_length(link_website) <= 200),
  add constraint profiles_link_x_format
    check (link_x ~ '^https://x\.com/[A-Za-z0-9_]{1,15}$'),
  add constraint profiles_link_youtube_format
    check (link_youtube ~ '^https://youtube\.com/@[A-Za-z0-9._-]{3,30}$'),
  add constraint profiles_link_tiktok_format
    check (link_tiktok ~ '^https://tiktok\.com/@[A-Za-z0-9._]{2,24}$'),
  add constraint profiles_link_instagram_format
    check (link_instagram ~ '^https://instagram\.com/[A-Za-z0-9._]{1,30}$' and link_instagram !~ '\.\.' and link_instagram !~ '/\.' and link_instagram !~ '\.$'),
  add constraint profiles_link_github_format
    check (link_github ~ '^https://github\.com/[A-Za-z0-9]([A-Za-z0-9]|-[A-Za-z0-9]){0,38}$'
      and char_length(link_github) <= char_length('https://github.com/') + 39),
  add constraint profiles_link_linkedin_format
    check (link_linkedin ~ '^https://linkedin\.com/in/[A-Za-z0-9-]{3,100}$');

-- The throne link is https only (spec §7); domain rules live in the app's moderation step.
alter table price_locks
  add constraint price_locks_link_format check (link ~ '^https://[^\s]+$' and char_length(link) <= 200);
