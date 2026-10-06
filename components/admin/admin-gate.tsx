import { getTranslations } from "next-intl/server";
import { sendAdminSignInLink, verifyTotp } from "@/app/[locale]/admin/actions";
import type { Locale } from "@/i18n/routing";
import type { AdminAccess } from "@/lib/admin/guard";
import { BRAND_NAME } from "@/lib/config/brand";
import { CodeField, primary } from "./totp-code";
import { TotpEnroll } from "./totp-enroll";

/**
 * What an admin sees before the panel when the session misses a step (decision 49): a sign-in
 * that is too old, TOTP not set up yet, or TOTP not verified in this session.
 */
export async function AdminGate({
  access,
  locale,
  status,
  reason,
}: {
  access: Exclude<AdminAccess, { state: "ok" }>;
  locale: Locale;
  status?: string;
  reason?: string;
}) {
  const t = await getTranslations({ locale, namespace: "admin.security" });
  const admin = await getTranslations({ locale, namespace: "admin" });
  const login = await getTranslations({ locale, namespace: "login" });
  const hours = Math.round(access.limits.sessionSeconds / 3600);
  const notice =
    status === "linkSent"
      ? { ok: true, text: t("linkSent", { email: access.admin.email }) }
      : status === "failed" && reason === "code"
        ? { ok: false, text: t("codeBad") }
        : null;

  return (
    <div className="min-h-dvh bg-crown-ink">
      <header className="flex items-center justify-between gap-4 bg-crown-velvet px-4 py-3 shadow-bar-bottom lg:px-12">
        <div className="flex items-center gap-4">
          <span className="font-pixel text-20 font-bold whitespace-nowrap">{BRAND_NAME}</span>
          <span className="hidden text-16 font-bold sm:inline">{admin("title")}</span>
        </div>
        <form action="/auth/sign-out" method="post">
          <input type="hidden" name="next" value={`/${locale}`} />
          <button type="submit" className="flex h-11 items-center px-3 text-14 font-bold whitespace-nowrap text-crown-muted hover:bg-crown-hall hover:text-crown-text">
            {login("signOut")}
          </button>
        </form>
      </header>
      <main className="mx-auto flex max-w-[560px] flex-col gap-4 px-4 py-10">
        <h1 className="text-28 leading-tight font-bold">{t(`${access.state}Head`)}</h1>
        <p className="text-16 leading-body text-crown-muted">
          {access.state === "stale" ? t("staleBody", { hours, email: access.admin.email }) : t(`${access.state}Body`)}
        </p>
        {notice && (
          <p role={notice.ok ? "status" : "alert"} className={`bg-crown-velvet p-4 text-14 font-bold ${notice.ok ? "shadow-flag-success" : "shadow-flag-danger"}`}>
            {notice.text}
          </p>
        )}
        {access.state === "stale" && (
          <form action={sendAdminSignInLink}>
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className={primary}>
              {t("sendLink")}
            </button>
          </form>
        )}
        {access.state === "enroll" && <TotpEnroll />}
        {access.state === "verify" && (
          <form action={verifyTotp} className="flex flex-col gap-3">
            <input type="hidden" name="locale" value={locale} />
            <CodeField />
            <button type="submit" className={primary}>
              {t("verify")}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
