// Records the launch videos against a local production build: `pnpm record:videos`.
// Standalone (not part of the e2e suite). It reseeds the LOCAL database and never talks to
// production or Dodo: the payment, email and moderation providers are forced to their test stand-ins.
//
//   pnpm record:videos [--skip-build] [--only=coronation,coronation-desktop,toast,profile]
//
// Output goes to ../take-the-crown-videos/public/recordings (override with RECORD_OUT).

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { findFfmpeg } from "./capture.mjs";
import { achievementToast, coronation, outFile, profile } from "./flows.mjs";
import { DB_URL, resetWorld } from "./seed.mjs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const root = process.cwd();
const videosRepo = path.resolve(root, "..", "take-the-crown-videos");
const outDir = process.env.RECORD_OUT ? path.resolve(process.env.RECORD_OUT) : path.join(videosRepo, "public", "recordings");
const port = Number(process.env.RECORD_PORT ?? 3300);
const base = `http://localhost:${port}`;
// Cloudflare's published Turnstile test keys: always pass, invisible (as in playwright.prod.config.ts).
const TURNSTILE_TEST = { site: "1x00000000000000000000AA", secret: "1x0000000000000000000000000000000AA" };
const FLOWS = ["coronation", "coronation-desktop", "toast", "profile"];

const args = process.argv.slice(2);
const skipBuild = args.includes("--skip-build");
const only = args.find((a) => a.startsWith("--only="))?.slice("--only=".length).split(",") ?? FLOWS;

const isLocal = (url) => ["127.0.0.1", "localhost"].includes(new URL(url).hostname);

function guard() {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabase || !isLocal(supabase)) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not the local Supabase; refusing to record");
  if (!isLocal(DB_URL)) throw new Error("SUPABASE_DB_URL is not the local database; refusing to record");
  if (process.env.DODO_MODE === "live") throw new Error("DODO_MODE is live; refusing to record");
  const unknown = only.filter((name) => !FLOWS.includes(name));
  if (unknown.length) throw new Error(`Unknown flow: ${unknown.join(", ")} (choose from ${FLOWS.join(", ")})`);
}

async function reachable(url) {
  return fetch(url, { signal: AbortSignal.timeout(3000) }).then((r) => r.ok, () => false);
}

function run(command, commandArgs, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${commandArgs.join(" ")} exited with ${code}`))));
  });
}

async function main() {
  guard();
  if (!(await reachable("http://127.0.0.1:54321/auth/v1/health"))) throw new Error("Local Supabase is not running: `supabase start`");
  if (!(await reachable("http://127.0.0.1:54324/api/v1/info"))) throw new Error("Mailpit is not running: `supabase start` starts it");
  if (await reachable(`${base}/en`)) throw new Error(`Port ${port} is in use; stop what runs there or set RECORD_PORT`);
  const ffmpeg = await findFfmpeg(videosRepo);

  const env = {
    ...process.env,
    NODE_ENV: "production",
    PAYMENT_PROVIDER: "test",
    EMAIL_PROVIDER: "test",
    MODERATION_PROVIDER: "test",
    NEXT_PUBLIC_SITE_URL: base,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: TURNSTILE_TEST.site,
    TURNSTILE_SECRET_KEY: TURNSTILE_TEST.secret,
  };
  const next = path.join(root, "node_modules", "next", "dist", "bin", "next");
  if (!skipBuild) await run(process.execPath, [next, "build"], env);
  const server = spawn(process.execPath, [next, "start", "-p", String(port)], { env, stdio: "inherit" });

  try {
    for (let i = 0; i < 120 && !(await reachable(`${base}/en`)); i++) await new Promise((r) => setTimeout(r, 1000));
    if (!(await reachable(`${base}/en`))) throw new Error("The production server did not start");

    const ctx = {
      base,
      // Fixtures write past the routes that drop the app's cached public data (app/api/e2e/revalidate).
      dropCache: () => fetch(`${base}/api/e2e/revalidate`, { method: "POST" }).then(() => undefined),
    };
    await mkdir(outDir, { recursive: true });
    const browser = await chromium.launch({ args: ["--hide-scrollbars"] });
    const timestamps = {};
    const files = [];
    try {
      const runs = {
        coronation: () => coronation(browser, ctx, "mobile"),
        "coronation-desktop": () => coronation(browser, ctx, "desktop"),
        toast: () => achievementToast(browser, ctx),
        profile: () => profile(browser, ctx),
      };
      for (const name of only) {
        console.log(`\n▶ ${name}`);
        const result = await runs[name]();
        Object.assign(timestamps, result.timestamps);
        for (const { name: clipName, clip, from, to } of result.clips) {
          const out = outFile(outDir, clipName);
          const { frames, encode } = clip;
          await encode({ from, to, out, ffmpeg });
          console.log(`  ${out} (${frames} frames, ${((to - from) / 1000).toFixed(1)} s)`);
          files.push(out);
        }
      }
    } finally {
      await browser.close();
    }

    if (Object.keys(timestamps).length) {
      const file = path.join(outDir, "coronation-timestamps.json");
      await writeFile(file, `${JSON.stringify(timestamps, null, 2)}\n`);
      console.log("\nCoronation animation starts (seconds into each clip):");
      for (const [name, t] of Object.entries(timestamps)) console.log(`  ${name}: ${JSON.stringify(t)}`);
      console.log(`  → ${file}`);
    }
  } finally {
    server.kill();
    await resetWorld().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(`record:videos failed: ${error.message}`);
  process.exitCode = 1;
});
