-- Profile creation under concurrent first requests. A player's first page load after signing in
-- sends several requests at once, and each one ensured the profile: two could both find none and
-- both insert, so one failed on profiles_user_id_key. Calls for the same user now take turns, and
-- the later ones find the profile the first created. A session for an auth user that no longer
-- exists gets null (the app signs it out) instead of a foreign key error.

create or replace function ensure_profile_for_user(p_user_id uuid, p_email text, p_name_hint text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_hint text;
begin
  -- Held until the transaction ends; only calls for this user wait.
  perform pg_advisory_xact_lock(hashtextextended('ensure_profile:' || p_user_id::text, 0));

  select id into v_id from profiles where user_id = p_user_id;
  if v_id is not null then
    return v_id;
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    return null;
  end if;

  update profiles p set user_id = p_user_id, updated_at = now()
  from profile_private pp
  where pp.profile_id = p.id and lower(pp.email) = lower(p_email) and p.user_id is null
  returning p.id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  v_hint := left(regexp_replace(coalesce(p_name_hint, ''), '[^A-Za-z0-9._-]', '', 'g'), 24);

  insert into profiles (user_id, name)
  values (p_user_id, case when is_profile_name_available(v_hint) then v_hint else generate_profile_name() end)
  returning id into v_id;

  insert into profile_private (profile_id, email) values (v_id, lower(p_email));
  return v_id;
end $$;

revoke execute on function ensure_profile_for_user(uuid, text, text) from public, anon, authenticated;
