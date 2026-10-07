-- Password sign-ups (decision 53). The app signs players in only with magic links, Google and X,
-- but Supabase Auth still accepts POST /auth/v1/signup with an email and a password from anyone
-- holding the public anon key. Someone could register a player's email with a password of their
-- own: with email confirmation off they get a session at once; with it on, the account waits until
-- the real owner confirms it by signing in, and the password is still theirs. Every user also has
-- a password hash (Supabase stores a random one for magic-link users), so a hash proves nothing.
--
-- The app refuses sessions that signed in with a password (lib/auth/viewer.ts). This function runs
-- when the inbox owner signs in by link or OAuth: it replaces whatever password the account has
-- with a random one nobody knows and ends every session that signed in with a password.

create or replace function forget_password_access(p_user_id uuid)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_ended int;
begin
  update auth.users
  set encrypted_password = extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf')),
      updated_at = now()
  where id = p_user_id;

  delete from auth.sessions s
  where s.user_id = p_user_id
    and exists (select 1 from auth.mfa_amr_claims c where c.session_id = s.id and c.authentication_method = 'password');
  get diagnostics v_ended = row_count;
  return v_ended;
end $$;

revoke execute on function forget_password_access(uuid) from public, anon, authenticated;
