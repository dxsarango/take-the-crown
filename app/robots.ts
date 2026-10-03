import type { MetadataRoute } from "next";
import { serverEnv } from "@/lib/env.server";

/** Public pages are indexable; private, admin and API routes are not. */
export default function robots(): MetadataRoute.Robots {
  const site = serverEnv().NEXT_PUBLIC_SITE_URL;
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/auth/", "/*/admin", "/*/settings/", "/*/alerts/"] },
    sitemap: `${site}/sitemap.xml`,
  };
}
