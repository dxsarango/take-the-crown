import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { BRAND_NAME } from "@/lib/config/brand";
import { ALERT_KINDS, readAlertOffToken } from "@/lib/email/links";
import { turnOffAlert } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: BRAND_NAME, robots: { index: false, follow: false } };

const button =
  "hit-area m-1 h-12 bg-crown-hall px-5 text-16 font-bold shadow-relief hover:bg-crown-stone focus-visible:outline-offset-[6px] active:bg-crown-velvet active:shadow-relief-pressed";

/**
 * The "turn off alerts" link from an email. It asks before changing anything, because link
 * scanners open every URL in an email.
 */
export default async function AlertsOffPage({ params, searchParams }: PageProps<"/[locale]/alerts/off">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "email.off" });
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : "";
  const done = ALERT_KINDS.find((k) => k === query.done);
  const alert = done ? null : readAlertOffToken(token);

  return (
    <div className="flex min-h-dvh flex-col bg-crown-ink">
      <header className="flex h-16 items-center bg-crown-velvet px-4 shadow-bar-bottom lg:px-12">
        <Link href="/" className="font-pixel text-20 font-bold">
          {BRAND_NAME}
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-16 pb-16">
        <div className="flex w-full max-w-[440px] flex-col gap-4 bg-crown-velvet p-6 lg:p-8">
          {done ? (
            <p role="status" className="text-16 leading-body font-bold">
              {t("done")}
            </p>
          ) : alert ? (
            <form action={turnOffAlert} className="flex flex-col gap-4">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="locale" value={locale} />
              <h1 className="text-20 leading-[1.3] font-bold lg:text-28">{t("title", { kind: alert.kind })}</h1>
              <p className="text-14 leading-body text-crown-muted">{t("body")}</p>
              <div>
                <button type="submit" className={button}>
                  {t("confirm")}
                </button>
              </div>
            </form>
          ) : (
            <p className="text-16 leading-body">{t("invalid")}</p>
          )}
          <Link href="/settings/profile" className="self-start text-14 font-bold underline decoration-crown-stone decoration-2 underline-offset-[6px]">
            {t("settings")}
          </Link>
        </div>
      </main>
    </div>
  );
}
