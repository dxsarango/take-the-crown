"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { type TotpEnrollment, confirmTotpEnrollment, startTotpEnrollment } from "@/app/[locale]/admin/actions";
import { CodeField, primary } from "./totp-code";

/**
 * TOTP enrollment: the QR code and setup key come from Supabase Auth, then a first code confirms
 * it. A mistyped code keeps the QR code on screen.
 */
export function TotpEnroll() {
  const t = useTranslations("admin.security");
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [codeBad, setCodeBad] = useState(false);
  const [pending, start] = useTransition();

  if (!enrollment?.ok) {
    return (
      <div className="flex flex-col gap-3">
        {enrollment && (
          <p role="alert" className="bg-crown-velvet p-4 text-14 font-bold shadow-flag-danger">
            {t("enrollFailed")}
          </p>
        )}
        <button type="button" disabled={pending} aria-busy={pending} onClick={() => start(async () => setEnrollment(await startTotpEnrollment()))} className={primary}>
          {t("enrollStart")}
        </button>
      </div>
    );
  }

  const confirm = (form: FormData) =>
    start(async () => {
      const ok = await confirmTotpEnrollment(enrollment.factorId, String(form.get("code") ?? ""));
      setCodeBad(!ok);
      if (ok) router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-14 leading-body">{t("enrollScan")}</p>
      {/* Supabase's QR code is an SVG data URL; the white margin keeps it scannable on the dark page. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- a data URL, nothing for next/image to optimize */}
      <img src={enrollment.qrCode} alt={t("qrAlt")} width={192} height={192} className="size-48 bg-white p-2 [image-rendering:pixelated]" />
      <div className="flex flex-col gap-1">
        <span className="text-12 font-bold text-crown-muted">{t("secretL")}</span>
        <code data-testid="totp-secret" className="text-14 font-bold break-all select-all">
          {enrollment.secret}
        </code>
      </div>
      {codeBad && (
        <p role="alert" className="bg-crown-velvet p-4 text-14 font-bold shadow-flag-danger">
          {t("codeBad")}
        </p>
      )}
      <form action={confirm} className="flex flex-col gap-3">
        <CodeField />
        <button type="submit" disabled={pending} aria-busy={pending} className={primary}>
          {t("verify")}
        </button>
      </form>
    </div>
  );
}
