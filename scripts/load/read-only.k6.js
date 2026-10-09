// Read-only load test for production in prelaunch: anonymous GETs only (no locks, payments or
// sign-ins). Run from the repo root:
//   k6 run -e PROFILE=<player name> scripts/load/read-only.k6.js
// Optional: -e BASE_URL=https://takethecrown.app -e LOCALE=en -e SEASON=genesis
import http from "k6/http";
import { check, sleep } from "k6";
import exec from "k6/execution";

const BASE_URL = (__ENV.BASE_URL || "https://takethecrown.app").replace(/\/$/, "");
const LOCALE = __ENV.LOCALE || "en";
const SEASON = __ENV.SEASON || "genesis";
const PROFILE = __ENV.PROFILE;

// A redirect would hide a misconfigured URL behind a second request; count it as a failed check instead.
const NO_REDIRECTS = { redirects: 0 };

export const options = {
  stages: [
    { duration: "2m", target: 200 },
    { duration: "5m", target: 200 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_failed: [
      "rate<0.01",
      // Safety brake: stop hammering production if it is clearly failing.
      { threshold: "rate<0.10", abortOnFail: true, delayAbortEval: "30s" },
    ],
    http_req_duration: ["p(95)<800"],
    "http_req_duration{name:home}": ["p(95)<800"],
    "http_req_duration{name:api_home}": ["p(95)<800"],
    "http_req_duration{name:kingdom}": ["p(95)<800"],
    "http_req_duration{name:profile}": ["p(95)<800"],
    "http_req_duration{name:season}": ["p(95)<800"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
  userAgent: "take-the-crown-loadtest/1.0 (k6)",
};

const pages = {
  home: () => `${BASE_URL}/${LOCALE}`,
  // Same URL a live page asks for: one version per 5 s window, shared by every client (SNAPSHOT_WINDOW_MS).
  api_home: () => `${BASE_URL}/api/home?v=w${Math.floor(Date.now() / 5000)}`,
  kingdom: () => `${BASE_URL}/${LOCALE}/kingdom`,
  profile: () => `${BASE_URL}/${LOCALE}/u/${encodeURIComponent(PROFILE)}`,
  season: () => `${BASE_URL}/${LOCALE}/seasons/${SEASON}`,
};

function get(name) {
  const res = http.get(pages[name](), { ...NO_REDIRECTS, tags: { name } });
  check(res, { [`${name} 200`]: (r) => r.status === 200 });
  return res;
}

export function setup() {
  if (!PROFILE) exec.test.abort("Set -e PROFILE=<an existing player name>");
  for (const name of Object.keys(pages)) {
    const res = http.get(pages[name](), { ...NO_REDIRECTS, tags: { name: "preflight" } });
    if (res.status !== 200) exec.test.abort(`Preflight ${name} answered ${res.status} at ${res.url}`);
  }
}

const secondary = ["kingdom", "profile", "season"];

export default function visitor() {
  get("home");
  sleep(1 + Math.random() * 2);
  get("api_home");
  sleep(2 + Math.random() * 4);
  get(secondary[exec.scenario.iterationInTest % secondary.length]);
  sleep(4 + Math.random() * 6);
}
