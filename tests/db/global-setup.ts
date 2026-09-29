import pg from "pg";
import { DB_URL } from "./db-url";
import { resetToSeed } from "./reset";

// pg_cron runs rollover and live achievements every minute; pause it so tests control time.
export default async function setup() {
  const client = new pg.Client({ connectionString: DB_URL });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(`Local Supabase is not reachable at ${DB_URL}. Run \`supabase start\` first.`, { cause: error });
  }
  await client.query("select cron.alter_job(jobid, active := false) from cron.job");
  await client.end();

  return async () => {
    const teardown = new pg.Client({ connectionString: DB_URL });
    await teardown.connect();
    await resetToSeed(teardown);
    await teardown.query("select cron.alter_job(jobid, active := true) from cron.job");
    await teardown.end();
  };
}
