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
  // Checkout is a full-page redirect and share links open with noopener, so no window keeps a handle on ours.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Other sites may not embed our pages or API answers; images are allowed below.
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

// Images other sites and mail clients load: share cards, email flags and images, avatars, pixel art, icons.
const EMBEDDABLE = ["/og/:path*", "/art/:path*", "/avatar/:path*", "/icons/:path*"];

// Nothing to index in the API or the auth routes.
const NOINDEX = ["/api/:path*", "/auth/:path*"];

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  async headers() {
    // For the same header, a later matching entry wins.
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      ...EMBEDDABLE.map((source) => ({ source, headers: [{ key: "Cross-Origin-Resource-Policy", value: "cross-origin" }] })),
      ...NOINDEX.map((source) => ({ source, headers: [{ key: "X-Robots-Tag", value: "noindex" }] })),
    ];
  },
  // Share cards read fonts and design pixel art from disk at request time.
  outputFileTracingIncludes: {
    "/og/**": ["./assets/fonts/**", "./design/assets/flags/**", "./design/assets/medals/**"],
    // The legal pages render docs/legal (small files; every route may include them).
    "/**": ["./docs/legal/*.md"],
  },
};

export default withNextIntl(nextConfig);
