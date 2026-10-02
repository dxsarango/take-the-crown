"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Icon, MailIcon, Portrait, ProviderIcon, Seal } from "@/components/art";
import type { OAuthProvider } from "@/lib/auth/next";
import type { LoginRequest } from "./auth-provider";

// Same check as the prototype: something@something.tld.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESEND_SECONDS = 30;
type Busy = OAuthProvider | "mail" | null;

/** Three pixel dots stepping every 250 ms inside a busy button (static with reduced motion). */
function Dots() {
  const [step, setStep] = useState(0);
  const [reduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => setStep((s) => (s + 1) % 3), 250);
    return () => clearInterval(timer);
  }, [reduced]);
  return (
    <span className="flex gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5"
          style={{ background: reduced ? "var(--crown-text-muted)" : i === step ? "var(--crown-text)" : "#57525F" }}
        />
      ))}
    </span>
  );
}

const RELIEF =
  "hit-area m-1 flex h-13 items-center justify-center gap-3 bg-crown-hall text-16 font-bold shadow-relief hover:bg-crown-stone focus-visible:outline-offset-[6px] active:bg-crown-velvet active:shadow-relief-pressed";

/** Full-page navigation to the OAuth start route (a route handler, not a page). */
export function signInHref(provider: OAuthProvider, next: string): string {
  return `/auth/sign-in/${provider}?next=${encodeURIComponent(next)}`;
}

function TextButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hit-area h-11 px-3 text-14 font-bold underline decoration-crown-stone decoration-2 underline-offset-[6px] hover:bg-crown-velvet"
    >
      {children}
    </button>
  );
}

type Props = { season: number; request: LoginRequest; onClose: () => void };

/** Sign-in sheet (mobile) / 440 px modal (desktop): Google, X or a magic link (SCREENS §9). */
export function LoginDialog({ season, request, onClose }: Props) {
  const t = useTranslations("login");
  const common = useTranslations("common");
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const emailId = useId();
  const [email, setEmail] = useState(request.email ?? "");
  const [emailBad, setEmailBad] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [sent, setSent] = useState<{ email: string; at: number } | null>(null);
  const [limited, setLimited] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const afterPayment = request.variant === "afterPayment";
  const next = request.next ?? "/";

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  useEffect(() => {
    if (!sent) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [sent]);

  const sendLink = async (address: string) => {
    if (busy) return;
    if (!EMAIL.test(address.trim())) {
      setEmailBad(true);
      return;
    }
    setBusy("mail");
    setEmailBad(false);
    const response = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: address.trim(), next }),
    }).catch(() => null);
    setBusy(null);
    setLimited(response?.status === 429);
    if (response?.status === 429) {
      setSent(null);
      return;
    }
    if (!response?.ok) {
      setEmailBad(true);
      return;
    }
    const at = Date.now();
    setNow(at);
    setSent({ email: address.trim(), at });
  };

  const left = sent ? Math.max(0, RESEND_SECONDS - Math.floor((now - sent.at) / 1000)) : 0;
  const errorText = limited
    ? t("errLimited")
    : request.error === "no_email" ? t("errNoEmail") : request.error === "unavailable" ? t("errUnavailable") : request.error ? t("errFailed") : null;

  const header = (
    <div className="flex items-start gap-3 pt-2 pr-1 pl-4 lg:gap-3.5 lg:pt-6 lg:pr-2 lg:pl-7">
      {afterPayment && request.avatar && (
        <Portrait avatar={request.avatar} rank="peasant" season={season} crown scale={1} className="mt-1" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1.5 lg:gap-1.5 lg:pt-1">
        {afterPayment && !sent && <div className="font-pixel text-12 font-medium text-crown-gold">{t("kicker")}</div>}
        <h2 id={titleId} className="text-20 leading-[1.3] font-bold text-pretty">
          {sent ? t("sentHead") : afterPayment ? t("headKing") : t("head")}
        </h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={common("close")}
        className="hit-area flex size-11 flex-none items-center justify-center hover:bg-crown-hall focus-visible:outline-offset-[-2px]"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );

  const form = (
    <>
      <div className="flex flex-col gap-3 px-4 pt-4 lg:px-7 lg:pt-5">
        <div className="flex justify-center">
          <Seal season={season} scale={2} />
        </div>
        {errorText && (
          <div role="alert" className="flex items-start gap-2 bg-crown-velvet p-3 text-14 leading-snug font-bold shadow-flag-danger">
            <span className="flex size-4 flex-none items-center justify-center bg-crown-danger text-crown-ink">
              <Icon name="bang" size={8} />
            </span>
            {errorText}
          </div>
        )}
        {(["google", "x"] as const).map((provider) => (
          <a
            key={provider}
            href={signInHref(provider, next)}
            onClick={() => setBusy(provider)}
            aria-busy={busy === provider}
            className={RELIEF}
          >
            {busy === provider ? <Dots /> : <ProviderIcon provider={provider} />}
            {provider === "google" ? common("google") : t("x")}
          </a>
        ))}
        <div className="flex items-center gap-3 py-1" aria-hidden>
          <span className="h-0.5 flex-1 bg-crown-velvet" />
          <span className="text-12 text-crown-muted">{t("or")}</span>
          <span className="h-0.5 flex-1 bg-crown-velvet" />
        </div>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void sendLink(email);
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-2">
            <label htmlFor={emailId} className="text-14 font-bold">
              {t("emailL")}
            </label>
            <input
              id={emailId}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailBad(false);
              }}
              placeholder={t("emailPh")}
              aria-invalid={emailBad}
              className={`h-13 w-full bg-crown-velvet px-4 text-16 placeholder:text-crown-muted focus-visible:outline-offset-2 ${
                emailBad ? "shadow-inset-field-error" : "shadow-inset-field"
              }`}
            />
            {emailBad && (
              <div role="alert" className="flex items-center gap-2 text-12 font-bold">
                <span className="flex size-4 flex-none items-center justify-center bg-crown-danger text-crown-ink">
                  <Icon name="bang" size={8} />
                </span>
                {t("emailBad")}
              </div>
            )}
          </div>
          <button
            type="submit"
            aria-busy={busy === "mail"}
            className={`${RELIEF} gap-2.5`}
          >
            {busy === "mail" && <Dots />}
            {t("magic")}
          </button>
        </form>
      </div>
      <div className="flex flex-col items-center gap-2.5 px-4 pt-3.5 pb-5 text-center lg:gap-2 lg:px-7 lg:pt-4 lg:pb-6">
        <p className="text-12 leading-body text-pretty text-crown-muted">{t("legal")}</p>
        {afterPayment && <TextButton onClick={onClose}>{common("notNow")}</TextButton>}
      </div>
    </>
  );

  const sentView = sent && (
    <div className="flex flex-col gap-4 px-4 pt-5 pb-6 lg:px-7 lg:pb-7">
      <div role="status" className="flex items-center gap-3.5 bg-crown-velvet p-4 shadow-flag-success">
        <MailIcon />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="text-14 text-crown-muted">{t("sentTo")}</div>
          <div className="text-16 font-bold [overflow-wrap:anywhere]">{sent.email}</div>
        </div>
      </div>
      <p className="text-14 leading-body text-pretty text-crown-muted">{t("sentHelp")}</p>
      <div className="flex items-center justify-between gap-3">
        <TextButton
          onClick={() => {
            setSent(null);
            setEmail("");
          }}
        >
          {t("wrong")}
        </TextButton>
        {left > 0 ? (
          <div className="text-12 text-crown-muted tabular-nums">{t("resendIn", { ss: String(left).padStart(2, "0") })}</div>
        ) : (
          <TextButton onClick={() => void sendLink(sent.email)}>{t("resendNow")}</TextButton>
        )}
      </div>
    </div>
  );

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-0 mt-auto w-full max-w-none bg-crown-ink text-crown-text shadow-[0_-4px_0_var(--crown-velvet)] backdrop:bg-crown-abyss/80 lg:m-auto lg:w-[440px] lg:shadow-modal"
    >
      <div className="flex justify-center pt-2.5 pb-0.5 lg:hidden" aria-hidden>
        <span className="h-1 w-10 bg-crown-stone" />
      </div>
      {header}
      {sent ? sentView : form}
    </dialog>
  );
}
