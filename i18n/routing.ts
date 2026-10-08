import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "es"],
  defaultLocale: "en",
  // hreflang lives in the page head and the sitemap. The Link header next-intl adds to the redirect
  // from "/" would name "/" as x-default, which is not a page.
  alternateLinks: false,
});

export type Locale = (typeof routing.locales)[number];
