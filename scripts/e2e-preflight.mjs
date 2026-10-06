// Checks what the e2e suites need before Playwright starts a server, and says what to start or
// install: `node scripts/e2e-preflight.mjs` (pnpm e2e, e2e:prod) or with `--dodo` (pnpm e2e:dodo).
// Prints variable names only, never their values.

import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { chromium } from "@playwright/test";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const dodo = process.argv.includes("--dodo");
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SUPABASE_API = "http://127.0.0.1:54321";
const MAILPIT = "http://127.0.0.1:54324";
// playwright.dodo.config.ts serves the app here; the tunnel must forward to it.
const DODO_PORT = 3100;
const PRODUCTION_HOSTS = new Set(["takethecrown.app", "www.takethecrown.app"]);

const problems = [];
const fail = (what, fix) => problems.push(`✗ ${what}\n    → ${fix}`);
const timeout = (ms) => AbortSignal.timeout(ms);

async function checkSupabase() {
  const client = new pg.Client({ connectionString: DB_URL, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    const { rows } = await client.query("select to_regclass('public.crown_state') is not null as migrated");
    if (!rows[0].migrated) fail("The local database has no schema", "Run `supabase db reset`.");
  } catch {
    return fail("Local Supabase database is not reachable (127.0.0.1:54322)", "Start Docker Desktop, then run `supabase start`.");
  } finally {
    await client.end().catch(() => undefined);
  }
  const auth = await fetch(`${SUPABASE_API}/auth/v1/health`, { signal: timeout(3000) }).catch(() => null);
  if (!auth) fail("Local Supabase API is not reachable (127.0.0.1:54321)", "Run `supabase start`.");
  // Sign-in tests read magic links from Mailpit.
  const mail = await fetch(`${MAILPIT}/api/v1/info`, { signal: timeout(3000) }).catch(() => null);
  if (!mail?.ok) fail("Mailpit is not reachable (127.0.0.1:54324)", "Run `supabase start` (it starts Mailpit).");
}

function checkBrowsers() {
  if (!existsSync(chromium.executablePath())) {
    fail("Playwright's Chromium is not installed", "Run `pnpm exec playwright install chromium`.");
  }
}

/** Answers once on the port the tunnel should reach, to prove the tunnel forwards there. */
function listenOnce(port, token) {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => res.end(token));
    server.once("error", () => resolve(null));
    server.listen(port, () => resolve(server));
  });
}

async function checkDodo() {
  const missing = ["DODO_API_KEY", "DODO_WEBHOOK_SECRET", "DODO_PRODUCT_ID"].filter((k) => !process.env[k]);
  if (missing.length) return fail(`Missing in .env.local: ${missing.join(", ")}`, "Add the test-mode values from Dodo's dashboard (docs/DEPLOY.md, step 8).");
  if (process.env.DODO_MODE === "live") return fail("DODO_MODE is live in .env.local", "e2e:dodo pays with a test card: use test mode.");

  const api = (path) =>
    fetch(`https://test.dodopayments.com${path}`, { headers: { Authorization: `Bearer ${process.env.DODO_API_KEY}` }, signal: timeout(10_000) });

  const productResponse = await api(`/products/${encodeURIComponent(process.env.DODO_PRODUCT_ID)}`).catch(() => null);
  if (!productResponse) return fail("Dodo's test API is not reachable", "Check your connection.");
  if (productResponse.status === 401) return fail("Dodo refused DODO_API_KEY", "Use a test-mode API key.");
  if (!productResponse.ok) return fail(`DODO_PRODUCT_ID not found in test mode (${productResponse.status})`, "Use the test-mode product id.");
  const product = await productResponse.json();
  if (product.price?.pay_what_you_want !== true) {
    fail(
      "The Dodo test product doesn't have Pay What You Want on",
      "Turn it on for the product in Dodo's test mode; otherwise Dodo charges its fixed price and every takeover is refunded.",
    );
  }

  const hooksResponse = await api("/webhooks").catch(() => null);
  const hooks = hooksResponse?.ok ? ((await hooksResponse.json()).data ?? []) : [];
  const local = hooks.filter((h) => !h.disabled && !PRODUCTION_HOSTS.has(new URL(h.url).hostname));
  if (!local.length) {
    return fail("No test-mode webhook endpoint for the tunnel in Dodo", "Add the tunnel's /api/webhooks/dodo endpoint in Dodo's test mode (docs/DEPLOY.md, step 8).");
  }
  for (const event of ["payment.succeeded", "refund.succeeded"]) {
    if (!local.some((h) => !h.filter_types?.length || h.filter_types.includes(event))) {
      fail(`The tunnel's webhook endpoint doesn't send ${event}`, "Subscribe it to that event in Dodo.");
    }
  }

  // Through the tunnel to a throwaway server on the app's port: proves it is up and points there.
  const token = randomUUID();
  const server = await listenOnce(DODO_PORT, token);
  if (!server) return fail(`Port ${DODO_PORT} is in use`, `Stop whatever runs on ${DODO_PORT} (an earlier e2e:dodo server?).`);
  try {
    let reached = false;
    for (const hook of local) {
      const response = await fetch(hook.url, { signal: timeout(10_000) }).catch(() => null);
      if (response && (await response.text()) === token) reached = true;
    }
    if (!reached) {
      fail(
        `The tunnel doesn't reach localhost:${DODO_PORT} (${local.map((h) => new URL(h.url).hostname).join(", ")})`,
        `Start it: \`cloudflared tunnel run --url http://localhost:${DODO_PORT} crown-dev\` (docs/DEPLOY.md, step 8).`,
      );
    }
  } finally {
    server.close();
  }
}

await checkSupabase();
checkBrowsers();
if (dodo) await checkDodo();

if (problems.length) {
  console.error(`e2e preflight failed:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`e2e preflight ok${dodo ? " (Dodo test mode, tunnel)" : ""}`);
