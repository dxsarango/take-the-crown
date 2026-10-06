-- Admin session policy. /admin needs a sign-in within admin_session_seconds and a second factor
-- (TOTP, Supabase Auth MFA); refunds, suspensions, config, season dates and launch need a sign-in
-- within admin_reauth_seconds. A sign-in starts a new auth session, so the session's creation time
-- is when this device last signed in (refreshes keep the session), unlike auth.users.last_sign_in_at
-- which moves with a sign-in on any device.

alter table app_config
  add column admin_session_seconds int not null default 43200 check (admin_session_seconds between 600 and 604800),
  add column admin_reauth_seconds int not null default 600 check (admin_reauth_seconds between 60 and 3600);

-- What the server needs to admit an admin's session: when it signed in, its assurance level, and
-- the user's verified TOTP factor. No row when the session ended or belongs to someone else.
create or replace function admin_session(p_user_id uuid, p_session_id uuid)
returns table (signed_in_at timestamptz, aal text, totp_factor_id uuid)
language sql stable security definer set search_path = ''
as $$
  select
    s.created_at,
    s.aal::text,
    (select f.id from auth.mfa_factors f
      where f.user_id = p_user_id and f.factor_type = 'totp' and f.status = 'verified'
      order by f.created_at limit 1)
  from auth.sessions s
  where s.id = p_session_id and s.user_id = p_user_id and (s.not_after is null or s.not_after > now())
$$;

revoke execute on function admin_session(uuid, uuid) from public, anon, authenticated;
