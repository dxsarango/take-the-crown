import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Every response (SPEC §11). The page CSP carries a per-request nonce, so it is set in proxy.ts.
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  // Checkout overlays may open the provider in a popup.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // Share cards read fonts and design pixel art from disk at request time.
  outputFileTracingIncludes: {
    "/og/**": ["./assets/fonts/**", "./design/assets/flags/**", "./design/assets/medals/**"],
    // The legal pages render docs/legal (small files; every route may include them).
    "/**": ["./docs/legal/*.md"],
  },
};

export default withNextIntl(nextConfig);
