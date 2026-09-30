import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  agentRules: false,
  // Share cards read fonts and design pixel art from disk at request time.
  outputFileTracingIncludes: {
    "/og/**": ["./assets/fonts/**", "./design/assets/flags/**", "./design/assets/medals/**"],
  },
};

export default withNextIntl(nextConfig);
