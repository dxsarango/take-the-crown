"use client";

import { ErrorScreen, errorAction } from "@/components/error-screen";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import "./globals.css";

/**
 * The root layout itself failed (for example, the database was unreachable), so there is no
 * language context: the page shows both languages.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <ErrorScreen title={`${en.errors.errorTitle} · ${es.errors.errorTitle}`} body={`${en.errors.errorBody} ${es.errors.errorBody}`} crownAlt={en.errors.crownAlt}>
          <button type="button" onClick={reset} className={errorAction}>
            {en.errors.retry} · {es.errors.retry}
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full reload, since the root layout failed */}
          <a href="/" className="hit-area flex h-12 items-center px-3 text-16 font-bold underline decoration-crown-stone-hi underline-offset-4">
            {en.errors.home} · {es.errors.home}
          </a>
        </ErrorScreen>
      </body>
    </html>
  );
}
