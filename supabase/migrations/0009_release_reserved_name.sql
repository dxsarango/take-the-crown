-- Admin action: frees a former name kept in profile_name_history so anyone can take it.
-- Current names are not affected. Returns false when the name was not reserved.
create or replace function release_profile_name(p_name text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  delete from profile_name_history where lower(name) = lower(p_name);
  return found;
end $$;

revoke execute on function release_profile_name(text) from public, anon, authenticated;
