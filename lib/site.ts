import "server-only";
import { serverEnv } from "@/lib/env.server";

/** The site's origin without a trailing slash: https://takethecrown.app */
export function siteUrl(): string {
  const url = serverEnv().NEXT_PUBLIC_SITE_URL;
  return url.endsWith("/") ? url.slice(0, -1) : url;
}
