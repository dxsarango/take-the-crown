import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { CONFIG_FIELDS, LEGAL_FIELDS } from "@/lib/admin/config";
import { fetchAdminOverview, fetchLaunchPlan } from "@/lib/admin/data";
import { adminAccess } from "@/lib/admin/guard";
import { BRAND_NAME } from "@/lib/config/brand";
import { paymentProduct, testPayments } from "@/lib/payments";
import { displayLink, formatPrice } from "@/lib/format";
import { MODEL_REASONS } from "@/lib/moderation/model";
import { dismissReport, hideMessage, refundPayment, retryRefund, releaseName, reviewContent, launchGame, previewLaunch, saveConfig, saveLegal, saveSeasonDates, setBanned, setPaused } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: `${t("title")} · ${BRAND_NAME}`, robots: { index: false, follow: false } };
}

const SECTIONS = ["crown", "launch", "payments", "refunds", "reversals", "reports", "review", "names", "seasons", "config", "log"] as const;

const secondary =
  "hit-area m-1 h-10 bg-crown-hall px-3.5 text-14 font-bold whitespace-nowrap shadow-relief-card hover:bg-crown-stone focus-visible:outline-offset-[6px] active:bg-crown-ink";
const field = "h-11 w-full bg-crown-velvet px-3 text-14 shadow-inset-field focus-visible:outline-offset-2";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-4 py-8 shadow-[var(--crown-bar-top)]">
      <h2 className="text-20 font-bold lg:text-28">{title}</h2>
      {children}
    </section>
  );
}

/** Hidden fields every action form sends back, so the redirect lands where the admin was. */
function Back({ locale, section }: { locale: string; section: string }) {
  return (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="section" value={section} />
    </>
  );
}

export default async function AdminPage({ params, searchParams }: PageProps<"/[locale]/admin">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  // Anyone else gets a plain 404: the page does not admit it exists.
  const access = await adminAccess();
  if (!access) notFound();
  const query = await searchParams;
  const status = query.status;
  if (access.state !== "ok") {
    const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
    return <AdminGate access={access} locale={locale} status={one(status)} reason={one(query.reason)} />;
  }

  const t = await getTranslations({ locale, namespace: "admin" });
  const home = await getTranslations({ locale, namespace: "home" });
  const login = await getTranslations({ locale, namespace: "login" });
  const payment = await getTranslations({ locale, namespace: "payment" });
  const reasonText = (reason: string) =>
    payment.has(`rejWhy.${reason}` as "rejWhy.hate") ? payment(`rejWhy.${reason}` as "rejWhy.hate") : reason;
  const data = await fetchAdminOverview();
  const utc = (iso: string) =>
    `${new Intl.DateTimeFormat(locale === "es" ? "es-419" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso))} UTC`;
  const localInput = (iso: string) => iso.slice(0, 16);
  const paymentsAreTest = testPayments();
  const product = await paymentProduct().catch(() => null);
  const paymentMinimum = product?.minimumCents ?? null;
  const launchPlan = data.config.prelaunch ? await fetchLaunchPlan(query.launchAt) : null;
  const now = new Date();

  const notice =
    status === "reauth"
      ? t("security.reauth", { minutes: Math.round(access.limits.reauthSeconds / 60), email: access.admin.email })
      : status === "ok"
      ? typeof query.name === "string"
        ? query.released === "1"
          ? t("names.released", { name: query.name })
          : t("names.notReserved", { name: query.name })
        : t("done")
      : status === "failed"
        ? query.reason === "season"
          ? t("seasons.invalid")
          : query.reason === "config"
            ? t("config.invalid")
            : query.reason === "legal"
              ? t("legal.invalid")
            : query.reason === "launch"
              ? t("launch.invalid")
            : query.reason === "floor"
              ? t("config.floorBelowMinimum", { minimum: formatPrice(Number(query.minimum), locale) })
            : query.reason === "floor_unknown"
              ? t("config.floorUnknown")
            : t("failed")
        : null;

  return (
    <div className="min-h-dvh bg-crown-ink">
      <header className="sticky top-0 z-10 flex flex-col gap-2 bg-crown-velvet px-4 py-3 shadow-bar-bottom lg:flex-row lg:items-center lg:justify-between lg:px-12">
        <div className="flex items-center gap-4">
          <span className="font-pixel text-20 font-bold">{BRAND_NAME}</span>
          <h1 className="text-16 font-bold">{t("title")}</h1>
        </div>
        <nav aria-label={t("title")} className="-mx-1 flex gap-1 overflow-x-auto text-14 font-bold">
          {SECTIONS.map((s) => (
            <a key={s} href={`#${s}`} className="flex h-11 flex-none items-center px-3 hover:bg-crown-hall">
              {t(`nav.${s}`)}
            </a>
          ))}
          <Link href="/" className="flex h-11 flex-none items-center px-3 text-crown-muted hover:bg-crown-hall hover:text-crown-text">
            {t("back")}
          </Link>
          <form action="/auth/sign-out" method="post" className="flex flex-none">
            <input type="hidden" name="next" value={`/${locale}`} />
            <button type="submit" className="flex h-11 items-center px-3 text-crown-muted hover:bg-crown-hall hover:text-crown-text">
              {login("signOut")}
            </button>
          </form>
        </nav>
      </header>

      <main className="mx-auto flex max-w-[1100px] flex-col px-4 pb-16 lg:px-12">
        {notice && (
          <p
            role="status"
            className={`mt-6 bg-crown-velvet p-4 text-14 font-bold ${status === "ok" ? "shadow-flag-success" : "shadow-flag-danger"}`}
          >
            {notice}
          </p>
        )}

        <Section id="crown" title={t("nav.crown")}>
          <dl className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { k: t("crown.season"), v: String(data.crown.seasonId) },
              { k: t("crown.king"), v: data.crown.king ? `${data.crown.king.name} · ${t("crown.since", { date: utc(data.crown.king.startedAt) })}` : t("crown.noKing") },
              { k: t("crown.price"), v: formatPrice(data.crown.priceCents, locale) },
              {
                k: t("crown.lock"),
                v: data.crown.lock
                  ? `${data.crown.lock.name} (${data.crown.lock.email}) · ${formatPrice(data.crown.lock.priceCents, locale)} · ${t("crown.lockUntil", { date: utc(data.crown.lock.expiresAt) })}`
                  : t("crown.noLock"),
              },
            ].map((item) => (
              <div key={item.k} className="flex flex-col gap-1.5 bg-crown-velvet p-4">
                <dt className="text-12 text-crown-muted">{item.k}</dt>
                <dd className="text-14 font-bold [overflow-wrap:anywhere]">{item.v}</dd>
              </div>
            ))}
          </dl>
          <form action={setPaused} className="flex flex-col gap-3 bg-crown-velvet p-4 sm:flex-row sm:items-center sm:justify-between">
            <Back locale={locale} section="crown" />
            <input type="hidden" name="paused" value={data.config.paused ? "false" : "true"} />
            <p role="status" className={`text-14 font-bold ${data.config.paused ? "text-crown-danger" : ""}`}>
              {data.config.paused ? t("crown.paused") : t("crown.running")}
            </p>
            <ConfirmButton question={data.config.paused ? t("crown.confirmResume") : t("crown.confirmPause")} className={secondary}>
              {data.config.paused ? t("crown.resume") : t("crown.pause")}
            </ConfirmButton>
          </form>
        </Section>

        <Section id="launch" title={t("nav.launch")}>
          {data.config.prelaunch ? (
            <>
              <p className="text-14 leading-body text-crown-muted">{t("launch.prelaunch", { days: data.config.min_first_season_days })}</p>
              {/* Step 1: pick the start and see the resulting season dates. */}
              <form action={previewLaunch} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Back locale={locale} section="launch" />
                <label className="flex flex-col gap-2 text-12 font-bold">
                  {t("launch.startsAt")}
                  <input type="datetime-local" name="startsAt" defaultValue={localInput(launchPlan?.startsAt ?? now.toISOString())} required className={field} />
                </label>
                <button type="submit" className={secondary}>
                  {t("launch.preview")}
                </button>
              </form>
              {launchPlan && (
                <div className="flex flex-col gap-3">
                  <table className="w-full max-w-160 text-left text-14">
                    <thead>
                      <tr className="text-12 text-crown-muted">
                        <th className="py-2 pr-4 font-bold">{t("launch.season")}</th>
                        <th className="py-2 pr-4 font-bold">{t("seasons.starts")}</th>
                        <th className="py-2 font-bold">{t("seasons.ends")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {launchPlan.rows.map((row) => (
                        <tr key={row.season_id} className="shadow-[inset_0_-2px_0_var(--crown-velvet)]">
                          <td className="py-2 pr-4 font-bold">{data.seasons.find((s) => s.id === row.season_id)?.slug ?? row.season_id}</td>
                          <td className="py-2 pr-4">{utc(row.starts_at)}</td>
                          <td className="py-2">{utc(row.ends_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {launchPlan.extended && <p className="text-14 font-bold">{t("launch.extended", { days: data.config.min_first_season_days })}</p>}
                  {/* Step 2: launch with exactly these dates. */}
                  {paymentsAreTest ? (
                    <p className="bg-crown-velvet p-4 text-14 leading-body font-bold shadow-[inset_4px_0_0_var(--crown-text)]">{t("launch.needProvider")}</p>
                  ) : (
                    <form action={launchGame}>
                      <Back locale={locale} section="launch" />
                      <input type="hidden" name="startsAt" value={localInput(launchPlan.startsAt)} />
                      <ConfirmButton question={t("launch.confirm")} className={secondary}>
                        {t("launch.go")}
                      </ConfirmButton>
                    </form>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-14 leading-body text-crown-muted">{t("launch.live")}</p>
          )}
        </Section>

        <Section id="payments" title={t("nav.payments")}>
          {data.payments.length === 0 ? (
            <p className="text-14 text-crown-muted">{t("payments.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-14">
                <thead className="text-12 text-crown-muted">
                  <tr>
                    <th className="py-2 pr-4 font-medium">{t("payments.when")}</th>
                    <th className="py-2 pr-4 font-medium">{t("payments.email")}</th>
                    <th className="py-2 pr-4 font-medium">{t("payments.amount")}</th>
                    <th className="py-2 pr-4 font-medium">{t("payments.provider")}</th>
                    <th className="py-2 pr-4 font-medium">{t("payments.status")}</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p) => (
                    <tr key={p.id} className="shadow-[inset_0_-2px_0_var(--crown-velvet)]" data-testid="admin-payment">
                      <td className="py-2 pr-4 whitespace-nowrap">{utc(p.created_at)}</td>
                      <td className="py-2 pr-4">{p.email}</td>
                      <td className="py-2 pr-4 font-pixel font-bold">
                        {formatPrice(p.amount_cents, locale)} {p.currency}
                      </td>
                      <td className="py-2 pr-4 text-crown-muted">{p.provider}</td>
                      <td className="py-2 pr-4 font-bold">{t(`payments.status_${p.status}`)}</td>
                      <td className="py-2 text-right">
                        {(p.status === "paid" || p.status === "applied") && (
                          <form action={refundPayment}>
                            <Back locale={locale} section="payments" />
                            <input type="hidden" name="paymentId" value={p.id} />
                            <ConfirmButton
                              question={t("payments.confirmRefund", { amount: formatPrice(p.amount_cents, locale), email: p.email })}
                              className={secondary}
                            >
                              {t("payments.refund")}
                            </ConfirmButton>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section id="refunds" title={t("nav.refunds")}>
          <p className="text-14 text-crown-muted">{t("refunds.help")}</p>
          {data.refunds.length === 0 ? (
            <p className="text-14 text-crown-muted">{t("refunds.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.refunds.map((r) => {
                const failed = r.refund_requested_at === null && r.refund_last_error !== null;
                const state = r.refund_requested_at
                  ? t("refunds.requested", { date: utc(r.refund_requested_at), provider: r.provider })
                  : !failed
                    ? t("refunds.due", { provider: r.provider })
                    : r.refund_next_attempt_at
                      ? t("refunds.retrying", { attempts: r.refund_attempts, date: utc(r.refund_next_attempt_at) })
                      : t("refunds.stopped", { attempts: r.refund_attempts, provider: r.provider });
                return (
                  <li
                    key={r.id}
                    data-testid="admin-refund"
                    className={`flex flex-col gap-3 bg-crown-velvet p-4 sm:flex-row sm:items-center sm:justify-between ${failed ? "shadow-flag-danger" : "shadow-[inset_4px_0_0_var(--crown-text)]"}`}
                  >
                    <div className="flex min-w-0 flex-col gap-1 text-14">
                      <span className="font-bold">
                        <span className="font-pixel">{formatPrice(r.amount_cents, locale)}</span> {r.currency} · {r.email} · {utc(r.created_at)}
                      </span>
                      <span>{state}</span>
                      {failed && <span className="text-12 [overflow-wrap:anywhere] text-crown-muted">{r.refund_last_error}</span>}
                      <span className="text-12 [overflow-wrap:anywhere] text-crown-muted">
                        {r.provider} {r.provider_payment_id}
                      </span>
                    </div>
                    {!r.refund_requested_at && (
                      <form action={retryRefund}>
                        <Back locale={locale} section="refunds" />
                        <input type="hidden" name="paymentId" value={r.id} />
                        <button type="submit" className={secondary}>
                          {t("refunds.retry")}
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section id="reversals" title={t("nav.reversals")}>
          <p className="text-14 text-crown-muted">{t("reversals.help")}</p>
          {data.reversals.length === 0 ? (
            <p className="text-14 text-crown-muted">{t("reversals.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.reversals.map((r) => (
                <li
                  key={r.reignId}
                  className={`flex flex-col gap-3 bg-crown-velvet p-4 sm:flex-row sm:items-center sm:justify-between ${r.kind === "chargeback" ? "shadow-flag-danger" : "shadow-[inset_4px_0_0_var(--crown-text)]"}`}
                >
                  <div className="flex min-w-0 flex-col gap-1 text-14">
                    <span className="font-bold">{t("reversals.reign", { id: r.reignId, name: r.name, season: r.seasonId })}</span>
                    <span className="text-crown-muted">
                      {t(`reversals.${r.kind}`)} · {formatPrice(r.priceCents, locale)} · {utc(r.reversedAt)}
                      {r.disputeStatus ? ` · ${r.disputeStatus}` : ""}
                    </span>
                    {r.providerPaymentId && (
                      <span className="text-12 [overflow-wrap:anywhere] text-crown-muted">
                        {r.provider} {r.providerPaymentId}
                      </span>
                    )}
                  </div>
                  <form action={setBanned}>
                    <Back locale={locale} section="reversals" />
                    <input type="hidden" name="profileId" value={r.profileId} />
                    <input type="hidden" name="banned" value={r.banned ? "false" : "true"} />
                    <button type="submit" className={secondary}>
                      {r.banned ? t("reports.unban") : t("reports.ban")}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="reports" title={t("nav.reports")}>
          {data.reports.length === 0 ? (
            <p className="text-14 text-crown-muted">{t("reports.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.reports.map((r) => (
                <li key={r.reignId} data-testid="admin-report" className="flex flex-col gap-3 bg-crown-velvet p-4 shadow-flag-danger">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-14 font-bold">{t("reports.by", { name: r.name })}</span>
                    <span className="text-12 text-crown-muted">
                      {t("reports.count", { count: r.reports.length })}
                      {r.reports.some((x) => x.reason) &&
                        ` · ${t("reports.reason")}: ${[...new Set(r.reports.map((x) => x.reason).filter(Boolean))].join(", ")}`}
                    </span>
                  </div>
                  {r.message && <p className="text-16 leading-snug">{home("quote", { message: r.message })}</p>}
                  {r.link && <p className="text-14 text-crown-muted">{displayLink(r.link)}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    {r.hidden ? (
                      <span className="text-12 font-bold text-crown-muted">{t("reports.hidden")}</span>
                    ) : (
                      <form action={hideMessage}>
                        <Back locale={locale} section="reports" />
                        <input type="hidden" name="reignId" value={r.reignId} />
                        <button type="submit" className={secondary}>
                          {t("reports.hide")}
                        </button>
                      </form>
                    )}
                    <form action={setBanned}>
                      <Back locale={locale} section="reports" />
                      <input type="hidden" name="profileId" value={r.profileId} />
                      <input type="hidden" name="banned" value={r.banned ? "false" : "true"} />
                      <button type="submit" className={secondary}>
                        {r.banned ? t("reports.unban") : t("reports.ban")}
                      </button>
                    </form>
                    <form action={dismissReport}>
                      <Back locale={locale} section="reports" />
                      {r.reports.map((x) => (
                        <input key={x.id} type="hidden" name="reportId" value={x.id} />
                      ))}
                      <button type="submit" className="hit-area h-10 px-3 text-14 font-bold underline decoration-crown-stone decoration-2 underline-offset-[6px]">
                        {t("reports.dismiss")}
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="review" title={t("nav.review")}>
          <p className="text-14 text-crown-muted">{t("review.help")}</p>
          {data.held.length === 0 ? (
            <p className="text-14 text-crown-muted">{t("review.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.held.map((h) => (
                <li
                  key={h.reignId}
                  data-testid="admin-held"
                  className={`flex flex-col gap-3 bg-crown-velvet p-4 ${h.status === "pending" ? "shadow-[inset_4px_0_0_var(--crown-text)]" : "shadow-flag-danger"}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-14 font-bold">{t("review.reign", { id: h.reignId, name: h.name })}</span>
                    <span className="text-12 text-crown-muted">
                      {utc(h.startedAt)} · {t("review.attempts", { count: h.attempts })}
                    </span>
                  </div>
                  {h.message && <p className="text-16 leading-snug [overflow-wrap:anywhere]">{home("quote", { message: h.message })}</p>}
                  {h.link && <p className="text-14 text-crown-muted [overflow-wrap:anywhere]">{h.link}</p>}
                  <p className="text-14">
                    <span className="font-bold">{h.status === "pending" ? t("review.pending") : t("review.rejected")}</span>
                    {h.reason && (
                      <span className="text-crown-muted">
                        {" · "}
                        {t("review.reason")}: {h.reason} ({reasonText(h.reason)})
                      </span>
                    )}
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                    <form action={reviewContent}>
                      <Back locale={locale} section="review" />
                      <input type="hidden" name="reignId" value={h.reignId} />
                      <input type="hidden" name="decision" value="approve" />
                      {h.status === "pending" ? (
                        <button type="submit" className={secondary}>
                          {t("review.approve")}
                        </button>
                      ) : (
                        <ConfirmButton question={t("review.confirmApprove", { id: h.reignId })} className={secondary}>
                          {t("review.approve")}
                        </ConfirmButton>
                      )}
                    </form>
                    {h.status === "pending" && (
                      <form action={reviewContent} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <Back locale={locale} section="review" />
                        <input type="hidden" name="reignId" value={h.reignId} />
                        <input type="hidden" name="decision" value="reject" />
                        <label className="flex flex-col gap-2 text-12 font-bold">
                          {t("review.reason")}
                          <select name="reason" required defaultValue="" className={`${field} sm:w-56`}>
                            <option value="" disabled>
                              {t("review.pickReason")}
                            </option>
                            {MODEL_REASONS.map((reason) => (
                              <option key={reason} value={reason}>
                                {reason}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button type="submit" className={secondary}>
                          {t("review.reject")}
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="names" title={t("nav.names")}>
          <p className="text-14 text-crown-muted">{t("names.help")}</p>
          <form action={releaseName} className="flex max-w-lg flex-col gap-2 sm:flex-row sm:items-end">
            <Back locale={locale} section="names" />
            <label className="flex flex-1 flex-col gap-2 text-14 font-bold">
              {t("names.label")}
              <input name="name" required minLength={3} maxLength={24} autoComplete="off" className={field} />
            </label>
            <button type="submit" className={secondary}>
              {t("names.release")}
            </button>
          </form>
        </Section>

        <Section id="seasons" title={t("nav.seasons")}>
          <p className="text-14 text-crown-muted">{t("seasons.help")}</p>
          <ul className="flex flex-col gap-2">
            {data.seasons.map((s) => {
              const started = new Date(s.starts_at) <= now;
              return (
                <li key={s.id} className="flex flex-col gap-3 bg-crown-velvet p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-14 font-bold">
                      {s.id} · {s.name_en}
                    </span>
                    <span className="text-12 text-crown-muted">
                      {t("seasons.slug")}: {s.slug}
                    </span>
                  </div>
                  {started ? (
                    <p className="text-14 text-crown-muted">
                      {t("seasons.started")}: {utc(s.starts_at)} – {utc(s.ends_at)}
                    </p>
                  ) : (
                    <form action={saveSeasonDates} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <Back locale={locale} section="seasons" />
                      <input type="hidden" name="seasonId" value={s.id} />
                      <label className="flex flex-1 flex-col gap-2 text-12 font-bold">
                        {t("seasons.starts")}
                        <input type="datetime-local" name="startsAt" defaultValue={localInput(s.starts_at)} required className={field} />
                      </label>
                      <label className="flex flex-1 flex-col gap-2 text-12 font-bold">
                        {t("seasons.ends")}
                        <input type="datetime-local" name="endsAt" defaultValue={localInput(s.ends_at)} required className={field} />
                      </label>
                      <button type="submit" className={secondary}>
                        {t("seasons.save")}
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>

        <Section id="config" title={t("nav.config")}>
          <p className="text-14 text-crown-muted">{t("config.help")}</p>
          {paymentMinimum !== null && (
            <p className="text-14 text-crown-muted">{t("config.paymentMinimum", { minimum: formatPrice(paymentMinimum, locale) })}</p>
          )}
          {product && !product.payWhatYouWant && (
            <p role="alert" className="bg-crown-velvet p-4 text-14 font-bold shadow-flag-danger">
              {t("config.fixedPrice", { price: formatPrice(product.minimumCents, locale) })}
            </p>
          )}
          <form action={saveConfig} className="grid gap-4 sm:grid-cols-2">
            <Back locale={locale} section="config" />
            {CONFIG_FIELDS.map((key) => (
              <label key={key} className="flex flex-col gap-2 text-14 font-bold">
                {t(`config.${key}`)}
                <input type="number" name={key} defaultValue={data.config[key]} required className={`${field} font-pixel`} />
              </label>
            ))}
            <div className="sm:col-span-2">
              <button type="submit" className={secondary}>
                {t("config.save")}
              </button>
            </div>
          </form>
          <h3 className="pt-4 text-16 font-bold">{t("legal.title")}</h3>
          <p className="text-14 text-crown-muted">{t("legal.help")}</p>
          <form action={saveLegal} className="grid gap-4 sm:grid-cols-2">
            <Back locale={locale} section="config" />
            {LEGAL_FIELDS.map((key) => (
              <label key={key} className="flex flex-col gap-2 text-14 font-bold">
                {t(`legal.${key}`)}
                <input
                  type={key === "legal_effective_date" ? "date" : key === "legal_contact_email" ? "email" : "text"}
                  name={key}
                  defaultValue={data.config[key] ?? ""}
                  className={field}
                />
              </label>
            ))}
            <div className="sm:col-span-2">
              <button type="submit" className={secondary}>
                {t("legal.save")}
              </button>
            </div>
          </form>
        </Section>

        <Section id="log" title={t("nav.log")}>
          {data.log.length === 0 ? (
            <p className="text-14 text-crown-muted">{t("log.empty")}</p>
          ) : (
            <ul className="flex flex-col text-14">
              {data.log.map((l) => (
                <li key={l.id} className="flex flex-wrap gap-x-4 gap-y-1 py-2 shadow-[inset_0_-2px_0_var(--crown-velvet)]">
                  <span className="text-crown-muted">{utc(l.created_at)}</span>
                  <span className="font-bold">{l.action}</span>
                  {l.target && <span className="[overflow-wrap:anywhere]">{l.target}</span>}
                  <span className="text-crown-muted">{l.adminName}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </main>
    </div>
  );
}
