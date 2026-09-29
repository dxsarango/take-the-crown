export const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// PostgREST connects as `authenticator` and switches to anon/authenticated per request.
// Switching roles from a `postgres` session crashes the local image's backend on function
// permission errors, so role tests use the same login as the real API.
export const AUTHENTICATOR_URL =
  process.env.SUPABASE_AUTHENTICATOR_URL ?? "postgresql://authenticator:postgres@127.0.0.1:54322/postgres";
