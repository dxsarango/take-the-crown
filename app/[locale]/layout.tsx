import type { Metadata } from "next";
import { Manrope, Pixelify_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthProvider } from "@/components/auth/auth-provider";
import { TimeZoneCookie } from "@/components/time-zone";
import { SpeedMeasurement } from "@/components/speed-insights";
import { WebAnalytics } from "@/components/web-analytics";
import { routing } from "@/i18n/routing";
import { serverEnv } from "@/lib/env.server";
import { BRAND_NAME } from "@/lib/config/brand";
import { cachedSeasons } from "@/lib/home/cache";
import "../globals.css";
import { artSet } from "@/lib/art/seasons";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-manrope",
});

const pixelify = Pixelify_Sans({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-pixelify",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "app" });
  return { metadataBase: new URL(serverEnv().NEXT_PUBLIC_SITE_URL), title: BRAND_NAME, description: t("description") };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  // The active season recolors --crown-season through <html data-season>.
  const { currentId: seasonId } = await cachedSeasons();

  return (
    <html lang={locale} data-season={artSet(seasonId)} className={`${manrope.variable} ${pixelify.variable}`}>
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          <AuthProvider season={seasonId}>{children}</AuthProvider>
          <TimeZoneCookie />
          {/* Only on the live site: previews and local runs are not visitors. */}
          {process.env.VERCEL_ENV === "production" && (
            <>
              <WebAnalytics />
              <SpeedMeasurement />
            </>
          )}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
