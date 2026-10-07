// How `pnpm check:deploy` reports country detection (/api/geo): the country, which source gave it,
// and, when Cloudflare's country was not used, why. The site runs behind Cloudflare, where
// Vercel's geolocation sees Cloudflare's edge, so a Vercel-sourced country is only a warning.

const WHY_NOT_CLOUDFLARE = {
  not_configured: "CLOUDFLARE_ORIGIN_SECRET is not set on Vercel",
  no_secret_header: "the request carried no x-origin-secret; check the Cloudflare Transform Rule (DEPLOY step 6)",
  wrong_secret: "x-origin-secret does not match CLOUDFLARE_ORIGIN_SECRET on Vercel",
  trusted: "Cloudflare sent no country",
};

/** @param {{ country?: string | null, source?: string | null, cloudflare?: string }} geo */
export function countryReport(geo) {
  const why = WHY_NOT_CLOUDFLARE[geo.cloudflare] ?? `unknown Cloudflare state ${geo.cloudflare}`;
  if (geo.source === "cloudflare" && geo.country) return { status: "PASS", detail: `${geo.country} (source: Cloudflare cf-ipcountry)` };
  if (geo.source === "vercel" && geo.country) {
    return { status: "WARN", detail: `${geo.country} (source: Vercel geolocation, which sees Cloudflare's edge; not Cloudflare because ${why})` };
  }
  return { status: "WARN", detail: `none (source: none; not Cloudflare because ${why})` };
}
