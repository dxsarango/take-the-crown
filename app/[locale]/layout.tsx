import type { Metadata } from "next";
import { Manrope, Pixelify_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthProvider } from "@/components/auth/auth-provider";
import { TimeZoneCookie } from "@/components/time-zone";
import { routing } from "@/i18n/routing";
import { BRAND_NAME } from "@/lib/config/brand";
import { publicClient } from "@/lib/supabase/public";
import "../globals.css";

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
  return { title: BRAND_NAME, description: t("description") };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  // The active season recolors --crown-season through <html data-season>.
  const { data: crown } = await publicClient().from("crown_state").select("season_id").single();

  return (
    <html lang={locale} data-season={crown?.season_id ?? 0} className={`${manrope.variable} ${pixelify.variable}`}>
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          <AuthProvider season={crown?.season_id ?? 0}>{children}</AuthProvider>
          <TimeZoneCookie />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
