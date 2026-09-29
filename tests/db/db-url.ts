export const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// PostgREST logs in as `authenticator` and switches to anon/authenticated per request; role tests do the same.
export const AUTHENTICATOR_URL =
  process.env.SUPABASE_AUTHENTICATOR_URL ?? "postgresql://authenticator:postgres@127.0.0.1:54322/postgres";
