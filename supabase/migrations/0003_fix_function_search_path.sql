-- generate_username() called pgcrypto's gen_random_bytes(), but on Supabase pgcrypto lives in the
-- `extensions` schema and every caller pins search_path = public, so creating a profile failed.
-- gen_random_uuid() is built into Postgres (pg_catalog) and needs no extension.
create or replace function generate_username()
returns text
language plpgsql
set search_path = public
as $$
declare
  v_name text;
begin
  loop
    v_name := 'king_' || left(replace(gen_random_uuid()::text, '-', ''), 8);
    exit when not exists (select 1 from profiles where username = v_name);
  end loop;
  return v_name;
end $$;

-- Pin search_path on the remaining functions so they never resolve objects through the caller's path.
alter function price_at(int, timestamptz, timestamptz) set search_path = public;
alter function current_price_cents() set search_path = public;
alter function rank_for_seconds(bigint) set search_path = public;
