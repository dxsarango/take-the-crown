import { describe, expect, it } from "vitest";
import { anonReadProblems, rlsProblems } from "../../scripts/database-checks.mjs";
import { admin, q } from "./helpers";

type Query = (sql: string) => Promise<Record<string, unknown>[]>;
const query: Query = (sql) => q(sql);

/** Runs `fn` on one connection inside a transaction that is always rolled back. */
async function inRollback<T>(fn: (query: Query) => Promise<T>): Promise<T> {
  const client = await admin.connect();
  try {
    await client.query("begin");
    return await fn(async (sql) => (await client.query(sql)).rows);
  } finally {
    await client.query("rollback");
    client.release();
  }
}

describe("deploy checks (pnpm check:db runs the same ones on a hosted project)", () => {
  it("finds row level security on every public table", async () => {
    expect(await rlsProblems(query)).toEqual([]);
  });

  it("finds anon reading exactly the allowlist, never profiles.user_id", async () => {
    expect(await anonReadProblems(query)).toEqual([]);
  });

  it("catches a table created without row level security", async () => {
    const problems = await inRollback(async (tx) => {
      await tx("create table public.forgot_rls (id int)");
      return rlsProblems(tx);
    });
    expect(problems).toEqual(["row level security is off on forgot_rls"]);
  });

  it("catches anon gaining read access to a private table or the hidden column", async () => {
    const problems = await inRollback(async (tx) => {
      await tx("grant select on public.payments to anon");
      await tx("grant select (user_id) on public.profiles to anon");
      return anonReadProblems(tx);
    });
    expect(problems).toEqual(["anon can read payments, which is not in the allowlist", "anon can read profiles.user_id"]);
  });
});
