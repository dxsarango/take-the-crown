// Checks a deployed site from the outside: `pnpm check:deploy https://takethecrown.app`.
// Every check prints PASS, WARN or FAIL; the exit code is 1 if anything failed. It sends no
// credentials and changes nothing.

const base = new URL(process.argv[2] ?? "https://takethecrown.app");
const results = [];
const report = (status, name, detail = "") => results.push({ status, name, detail });

async function get(path, init = {}) {
  return fetch(new URL(path, base), { redirect: "manual", ...init });
}

async function check(name, fn) {
  try {
    await fn();
  } catch (e) {
    report("FAIL", name, e instanceof Error ? e.message : String(e));
  }
}

const SECURITY_HEADERS = {
  "strict-transport-security": /max-age=\d+/,
  "x-content-type-options": /^nosniff$/,
  "x-frame-options": /^DENY$/,
  "referrer-policy": /^strict-origin-when-cross-origin$/,
  "permissions-policy": /camera=\(\)/,
};

await check("root redirects to a language", async () => {
  const response = await get("/");
  const location = response.headers.get("location") ?? "";
  if (response.status >= 300 && response.status < 400 && /\/(en|es)$/.test(location)) report("PASS", "root redirects to a language", location);
  else report("FAIL", "root redirects to a language", `${response.status} ${location}`);
});

let home = "";
await check("home page", async () => {
  const response = await get("/en");
  home = await response.text();
  if (response.status !== 200) return report("FAIL", "home page", `status ${response.status}`);
  report("PASS", "home page", "200");

  const csp = response.headers.get("content-security-policy") ?? "";
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  const scripts = home.match(/<script[^>]*>/g) ?? [];
  if (!nonce || !csp.includes("'strict-dynamic'") || /script-src[^;]*'unsafe-inline'/.test(csp)) report("FAIL", "strict CSP", csp || "missing");
  else if (scripts.some((tag) => !tag.includes(`nonce="${nonce}"`))) report("FAIL", "strict CSP", "a script without the nonce");
  else if (csp.includes("'unsafe-eval'")) report("FAIL", "strict CSP", "unsafe-eval: a development build is deployed");
  else report("PASS", "strict CSP", `${scripts.length} scripts carry the nonce`);

  for (const [header, pattern] of Object.entries(SECURITY_HEADERS)) {
    const value = response.headers.get(header);
    report(value && pattern.test(value) ? "PASS" : "FAIL", `header ${header}`, value ?? "missing");
  }
  if (response.headers.get("x-powered-by")) report("FAIL", "no x-powered-by", response.headers.get("x-powered-by"));

  const cloudflare = response.headers.get("server") === "cloudflare" && response.headers.get("cf-ray");
  report(cloudflare ? "PASS" : "WARN", "served through Cloudflare", cloudflare ? `cf-ray ${response.headers.get("cf-ray")}` : "no cf-ray header");
  const cache = response.headers.get("cf-cache-status");
  report(!cache || /^(DYNAMIC|BYPASS|MISS)$/.test(cache) ? "PASS" : "FAIL", "HTML not cached by Cloudflare", cache ?? "no cf-cache-status");
});

await check("prelaunch state", async () => {
  if (home.includes("Launching soon")) report("PASS", "prelaunch state", "\"Launching soon\" shown to visitors");
  else if (/Take the (crown|empty throne) for/.test(home)) report("WARN", "prelaunch state", "the crown is open to everyone (launched)");
  else report("FAIL", "prelaunch state", "neither the take button nor \"Launching soon\" found");
});

for (const locale of ["en", "es"]) {
  for (const page of ["rules", "faq", "terms", "privacy"]) {
    await check(`/${locale}/${page}`, async () => {
      const response = await get(`/${locale}/${page}`);
      const html = await response.text();
      if (response.status !== 200) return report("FAIL", `/${locale}/${page}`, `status ${response.status}`);
      const placeholders = [...new Set(html.match(/\{\{[A-Z_]+\}\}/g) ?? [])];
      report(placeholders.length ? "WARN" : "PASS", `/${locale}/${page}`, placeholders.length ? `not filled in: ${placeholders.join(", ")}` : "200");
      if (html.includes("localhost")) report("FAIL", `/${locale}/${page} domain`, "mentions localhost: check NEXT_PUBLIC_SITE_URL");
    });
  }
}

await check("robots and sitemap", async () => {
  const robots = await (await get("/robots.txt")).text();
  const sitemap = await get("/sitemap.xml");
  const ok = robots.includes(`Sitemap: ${base.origin}/sitemap.xml`) && sitemap.status === 200;
  report(ok ? "PASS" : "FAIL", "robots and sitemap", ok ? "" : "robots.txt or sitemap.xml wrong (NEXT_PUBLIC_SITE_URL?)");
});

await check("API", async () => {
  const time = await get("/api/time");
  report(time.status === 200 ? "PASS" : "FAIL", "GET /api/time", String(time.status));
  for (const cron of ["/api/cron/notifications", "/api/cron/moderation"]) {
    const response = await get(cron);
    report(response.status === 401 ? "PASS" : "FAIL", `${cron} refuses without CRON_SECRET`, String(response.status));
  }
  const crossSite = await get("/api/reports", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
  report(crossSite.status === 403 ? "PASS" : "FAIL", "cross-site POST refused", String(crossSite.status));
  const lock = await get("/api/locks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "deploy_check", email: "deploy-check@example.com", locale: "en", acceptWithdrawal: true }),
  });
  const answer = await lock.json().catch(() => ({}));
  if (answer.error === "prelaunch" || answer.error === "human_check_failed") report("PASS", "anonymous lock refused", answer.error);
  else report("FAIL", "anonymous lock refused", `${lock.status} ${JSON.stringify(answer)}`);
  const geo = await (await get("/api/geo")).json();
  report(geo.country ? "PASS" : "WARN", "country detection", geo.country ?? "none (Cloudflare origin secret or Vercel geo missing)");
});

await check("images", async () => {
  const flag = await get("/og/flag/EC.png");
  report(flag.status === 200 && flag.headers.get("content-type") === "image/png" ? "PASS" : "FAIL", "PNG flag for emails", String(flag.status));
  const art = await get("/art/seal/seal-t0.svg");
  report(art.status === 200 ? "PASS" : "FAIL", "pixel art", String(art.status));
});

const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) console.log(`${r.status.padEnd(4)}  ${r.name.padEnd(width)}  ${r.detail}`);
const failed = results.filter((r) => r.status === "FAIL").length;
console.log(`\n${results.length} checks, ${failed} failed, ${results.filter((r) => r.status === "WARN").length} warnings`);
process.exit(failed ? 1 : 0);
