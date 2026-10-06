import type { MetadataRoute } from "next";
import en from "@/messages/en.json";
import { BRAND_NAME } from "@/lib/config/brand";

/** Web app manifest: name and launcher icons (the design's crown, `pnpm favicons`). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_NAME,
    short_name: BRAND_NAME,
    description: en.app.description,
    start_url: "/",
    display: "browser",
    // --crown-ink (page) and --crown-velvet (top bar).
    background_color: "#14111C",
    theme_color: "#1E1A29",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
