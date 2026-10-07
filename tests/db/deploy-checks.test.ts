import { describe, expect, it } from "vitest";
import { anonReadProblems, clientFunctionProblems, clientWriteProblems, rlsProblems } from "../../scripts/database-checks.mjs";
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

  it("finds clients writing nothing and calling only the safe functions", async () => {
    expect(await clientWriteProblems(query)).toEqual([]);
    expect(await clientFunctionProblems(query)).toEqual([]);
  });

  it("catches the active lock id becoming readable again", async () => {
    const problems = await inRollback(async (tx) => {
      await tx("grant select (active_lock_id) on public.crown_state to authenticated");
      return anonReadProblems(tx);
    });
    expect(problems).toEqual(["authenticated can read crown_state.active_lock_id"]);
  });

  it("catches a client gaining a write or a security definer function", async () => {
    const problems = await inRollback(async (tx) => {
      await tx("grant update (name) on public.profiles to authenticated");
      await tx("grant insert on public.reports to anon");
      await tx("grant execute on function public.launch_game(timestamptz) to authenticated");
      return [...(await clientWriteProblems(tx)), ...(await clientFunctionProblems(tx))];
    });
    expect(problems).toEqual([
      "authenticated can update profiles",
      "anon can insert reports",
      "clients can call launch_game (security definer)",
    ]);
  });
});
