import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeEach } from "vitest";
import { AUTHENTICATOR_URL, DB_URL } from "./db-url";
import { resetToSeed } from "./reset";

pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

export const admin = new pg.Pool({ connectionString: DB_URL, max: 4 });
const authenticator = new pg.Pool({ connectionString: AUTHENTICATOR_URL, max: 2 });

// The app calls every SQL function as the service role; tests do the same.
export const service = new pg.Pool({ connectionString: DB_URL, max: 12 });
service.on("connect", (client) => {
  void client.query("set role service_role");
});

export type Row = Record<string, unknown>;

export async function q<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { rows } = await admin.query<T>(sql, params);
  return rows;
}

export async function one<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T> {
  const rows = await q<T>(sql, params);
  if (rows.length !== 1) throw new Error(`Expected one row, got ${rows.length}: ${sql}`);
  return rows[0];
}

export async function svc<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { rows } = await service.query<T>(sql, params);
  return rows;
}

/**
 * Runs queries the way PostgREST does: logged in as `authenticator`, inside a transaction that
 * switches to the request role with its JWT claims. The transaction is always rolled back.
 */
export async function asRole<T>(role: string, fn: (client: pg.PoolClient) => Promise<T>, claims?: Row): Promise<T> {
  const client = await authenticator.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims ?? { role })]);
    await client.query(`set local role ${role}`);
    return await fn(client);
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
}

/** Extra tables added by later migrations that the reset must empty. */
const EXTRA_TABLES = ["profile_name_history"];

/** Fresh game with season 0 open (started a day ago, ends in 10 days) and the next seasons after it. */
export async function resetGame(): Promise<void> {
  const client = await admin.connect();
  try {
    await resetToSeed(client, EXTRA_TABLES);
    await client.query(`
      update seasons set
        starts_at = now() - interval '1 day' + (id * interval '11 days'),
        ends_at = now() + interval '10 days' + (id * interval '11 days')
    `);
  } finally {
    client.release();
  }
}

export function withFreshGame(): void {
  beforeEach(resetGame);
  afterAll(async () => {
    await admin.end();
    await service.end();
    await authenticator.end();
  });
}

// ---------------------------------------------------------------------------
// Game actions
// ---------------------------------------------------------------------------

export type Lock = {
  id: string;
  profile_id: string | null;
  email: string;
  price_cents: number;
  expected_reign_id: number | null;
  season_id: number;
  status: string;
  expires_at: Date;
};

export type LockInput = {
  email?: string;
  ip?: string;
  profileId?: string | null;
  name?: string;
  country?: string | null;
  message?: string | null;
  link?: string | null;
  localHour?: number | null;
  locale?: string;
  avatarSeed?: string | null;
};

let counter = 0;

/** A valid, unused public name: 3–24 chars of letters, numbers, dot, underscore and hyphen. */
export function uniqueName(prefix = "player"): string {
  counter += 1;
  return `${prefix.slice(0, 14)}_${counter}`;
}

export function uniqueEmail(prefix = "buyer"): string {
  counter += 1;
  return `${prefix}${counter}_${randomUUID().slice(0, 6)}@test.local`;
}

export async function createLock(input: LockInput = {}): Promise<Lock> {
  const rows = await svc<Lock>(
    "select * from create_price_lock($1, $2, $3, $4, $5, $6, $7, $8::smallint, $9, $10)",
    [
      input.email ?? uniqueEmail(),
      input.ip ?? `ip-${randomUUID()}`,
      input.profileId ?? null,
      input.name ?? uniqueName(),
      input.country === undefined ? "EC" : input.country,
      input.message ?? null,
      input.link ?? null,
      input.localHour === undefined ? 12 : input.localHour,
      input.locale ?? "en",
      input.avatarSeed ?? null,
    ],
  );
  return rows[0];
}

export type PaymentInput = {
  eventId?: string;
  providerPaymentId?: string;
  amountCents?: number;
  currency?: string;
  email?: string;
  provider?: string;
  /** Taken by a provider in live mode (kept at launch). */
  live?: boolean;
};

export async function pay(lock: Lock, input: PaymentInput = {}): Promise<string> {
  const rows = await svc<{ result: string }>(
    "select record_paid_payment($1, $2, $3, $4, $5, $6, $7, $8) as result",
    [
      input.provider ?? "test",
      input.eventId ?? `evt_${randomUUID()}`,
      input.providerPaymentId ?? `pay_${randomUUID()}`,
      lock.id,
      input.amountCents ?? lock.price_cents,
      input.currency ?? "USD",
      input.email ?? lock.email,
      input.live ?? false,
    ],
  );
  return rows[0].result;
}

export type Reign = {
  id: number;
  profile_id: string;
  season_id: number;
  price_paid_cents: number;
  started_at: Date;
  ended_at: Date | null;
  end_reason: string | null;
  dethroned_by: string | null;
  duration_seconds: number | null;
  country_code: string | null;
  local_hour: number | null;
};

export async function currentReign(): Promise<Reign | null> {
  const rows = await q<Reign>("select r.* from reigns r join crown_state s on s.current_reign_id = r.id");
  return rows[0] ?? null;
}

/** Locks, pays and asserts the takeover applied. Returns the new reign. */
export async function takeover(input: LockInput = {}): Promise<Reign> {
  const lock = await createLock(input);
  const result = await pay(lock);
  if (result !== "applied") throw new Error(`Takeover not applied: ${result}`);
  const reign = await currentReign();
  if (!reign) throw new Error("No current reign after takeover");
  return reign;
}

export async function profileIdByEmail(email: string): Promise<string> {
  const row = await one<{ profile_id: string }>("select profile_id from profile_private where lower(email) = lower($1)", [email]);
  return row.profile_id;
}

/** A player identified by email; buys as a guest unless a profile id is known. */
export class Player {
  readonly email: string;
  readonly name: string;
  constructor(
    readonly label: string,
    readonly country: string | null = "EC",
  ) {
    this.email = uniqueEmail(label);
    this.name = uniqueName(label);
  }

  /** Buys as a guest the first time and as the signed-in owner of the profile afterwards. */
  async takeover(input: LockInput = {}): Promise<Reign> {
    const [existing] = await q<{ profile_id: string }>(
      "select profile_id from profile_private where lower(email) = lower($1)",
      [this.email],
    );
    return takeover({
      email: this.email,
      name: this.name,
      country: this.country,
      profileId: existing?.profile_id ?? null,
      ...input,
    });
  }

  id(): Promise<string> {
    return profileIdByEmail(this.email);
  }
}

// ---------------------------------------------------------------------------
// Time travel: move stored timestamps into the past instead of waiting.
// ---------------------------------------------------------------------------

/** Makes the current reign appear to have started `seconds` ago. */
export async function ageCurrentReign(seconds: number): Promise<void> {
  await q(
    "update reigns set started_at = now() - make_interval(secs => $1) where id = (select current_reign_id from crown_state)",
    [seconds],
  );
}

/** Makes a lock appear to have expired `seconds` ago. */
export async function expireLock(lockId: string, secondsAgo = 1): Promise<void> {
  await q("update price_locks set expires_at = now() - make_interval(secs => $2) where id = $1", [lockId, secondsAgo]);
  await q(
    "update crown_state set active_lock_expires_at = now() - make_interval(secs => $2) where active_lock_id = $1",
    [lockId, secondsAgo],
  );
}

export async function achievementsOf(profileId: string): Promise<string[]> {
  const rows = await q<{ code: string }>(
    "select achievement_code as code from profile_achievements where profile_id = $1 order by code",
    [profileId],
  );
  return rows.map((row) => row.code);
}

export async function paymentStatus(providerPaymentId: string): Promise<string> {
  const row = await one<{ status: string }>("select status from payments where provider_payment_id = $1", [
    providerPaymentId,
  ]);
  return row.status;
}

export async function count(table: string, where = "true", params: unknown[] = []): Promise<number> {
  const row = await one<{ n: number }>(`select count(*)::int as n from ${table} where ${where}`, params);
  return row.n;
}

/** Ends season `id` `secondsAgo` seconds ago and starts the next one at that moment, like the real calendar. */
export async function closeSeason(id: number, secondsAgo = 0): Promise<void> {
  // One statement, so the end and the next start are the very same instant (rollover looks for it).
  await q(
    `with t as (select now() - make_interval(secs => $2) as at)
     update seasons s set
       starts_at = case when s.id = $1 then least(s.starts_at, t.at - interval '1 day') else least(s.starts_at, t.at) end,
       ends_at = case when s.id = $1 then t.at else s.ends_at end
     from t
     where s.id in ($1, $1 + 1)`,
    [id, secondsAgo],
  );
}
