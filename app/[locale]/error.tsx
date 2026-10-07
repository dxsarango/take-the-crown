"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { ErrorScreen, errorAction } from "@/components/error-screen";
import { Link } from "@/i18n/navigation";

/** A page that failed to render: no stack trace, a way to retry and a way home. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errors");
  useEffect(() => {
    // The digest matches the server log entry; the message never reaches production clients.
    console.error("page error", error.digest ?? "");
  }, [error]);
  return (
    <ErrorScreen title={t("errorTitle")} body={t("errorBody")} crownAlt={t("crownAlt")}>
      <button type="button" onClick={reset} className={errorAction}>
        {t("retry")}
      </button>
      <Link href="/" className="hit-area flex h-12 items-center px-3 text-16 font-bold underline decoration-crown-stone-hi underline-offset-4">
        {t("home")}
      </Link>
    </ErrorScreen>
  );
}
