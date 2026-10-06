"use client";

import { useLocale, useMessages, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { Flag, Icon, RankTag } from "@/components/art";
import { signInHref } from "@/components/auth/login-dialog";
import { useHumanCheck } from "@/components/security/human-check";
import type { Locale } from "@/i18n/routing";
import { type AvatarSource, pixelsToSVG } from "@/lib/art/avatar";
import { portraitPixels } from "@/lib/art/portrait";
import { portraitOrigin, seasonScene } from "@/lib/art/scenes";
import { COUNTRY_CODES, countryName } from "@/lib/countries";
import { displayLink, formatCountdown, formatPrice } from "@/lib/format";
import { NAME_PATTERN, normalizeLink } from "@/lib/locks/input";
import type { LockFailure, LockField } from "@/lib/locks/outcome";
import type { ModerationReason } from "@/lib/moderation/reasons";
import type { Rank } from "@/lib/game/rank";
import { lockSegments } from "@/lib/home/hero";
import type { ViewerSummary } from "@/lib/profile/viewer";
import { ReignShare } from "./reign-share";
import { type CheckoutReturn, type Draft, type PaymentResult, usePayment } from "./use-payment";

const SEGMENTS = 20;
type Size = "mobile" | "desktop";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type NameCheck = "idle" | "checking" | "available" | "taken" | "short" | "chars";

function useNameCheck(name: string): NameCheck {
  const [check, setCheck] = useState<NameCheck>("idle");
  const trimmed = name.trim();
  const local: NameCheck | null = !trimmed
    ? "idle"
    : trimmed.length < 3
      ? "short"
      : !NAME_PATTERN.test(trimmed)
        ? "chars"
        : null;

  useEffect(() => {
    if (local) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setCheck("checking");
      fetch(`/api/names/availability?name=${encodeURIComponent(trimmed)}`)
        .then((r) => r.json() as Promise<{ available: boolean }>)
        .then((r) => !cancelled && setCheck(r.available ? "available" : "taken"))
        .catch(() => !cancelled && setCheck("idle"));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, local]);

  return local ?? check;
}

function Preview({ avatar, rank, season, scale, width }: { avatar: AvatarSource; rank: Rank; season: number; scale: number; width: number }) {
  const traitsKey = JSON.stringify(avatar.traits ?? null);
  const svg = useMemo(() => {
    const frame = portraitPixels(avatar, rank, { season, crown: true });
    return pixelsToSVG(seasonScene(season, width, 72, { frame }), width, 72);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by value, not identity
  }, [avatar.seed, traitsKey, avatar.image?.pixelUrl, rank, season, width]);
  const origin = portraitOrigin(width, 72);
  const image = avatar.image;
  return (
    <span aria-hidden className="relative block flex-none" style={{ width: width * scale, height: 72 * scale }}>
      {image && (
        // eslint-disable-next-line @next/next/no-img-element -- pixel art must not be resampled by next/image
        <img
          src={image.pixelated ? image.pixelUrl : image.originalUrl}
          alt=""
          className={`absolute object-cover ${image.pixelated ? "[image-rendering:pixelated]" : ""}`}
          style={{ left: (origin.x + 6) * scale, top: (origin.y + 6) * scale, width: 32 * scale, height: 32 * scale }}
        />
      )}
      <span
        className="absolute inset-0 block [image-rendering:pixelated] [&>svg]:block [&>svg]:size-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </span>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-12 font-bold" role="alert">
      <span className="flex size-4 flex-none items-center justify-center bg-crown-danger text-crown-ink">
        <Icon name="bang" size={8} />
      </span>
      {children}
    </div>
  );
}

function FieldOk({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-12 font-bold text-crown-success">
      <Icon name="check" size={8} height={6} />
      {children}
    </div>
  );
}

function Notice({ title, why, fix, size }: { title: string; why: string; fix: string; size: "mobile" | "desktop" }) {
  return (
    <div
      role="alert"
      className={`flex bg-crown-velvet shadow-flag-danger ${size === "mobile" ? "gap-3 p-3.5" : "gap-3.5 p-4"}`}
    >
      <span
        className={`flex flex-none items-center justify-center bg-crown-danger text-crown-ink ${size === "mobile" ? "size-6" : "size-7"}`}
      >
        <Icon name="bang" size={16} />
      </span>
      <div className="flex flex-col gap-1 text-14 leading-[1.45]">
        <div className={`font-bold ${size === "desktop" ? "text-16" : ""}`}>{title}</div>
        <div>{why}</div>
        <div className="text-crown-muted">{fix}</div>
      </div>
    </div>
  );
}

const inputClass = (bad: boolean) =>
  `h-13 w-full bg-crown-velvet px-4 text-16 text-crown-text placeholder:text-crown-muted focus-visible:outline-offset-2 ${
    bad ? "shadow-inset-field-error" : "shadow-inset-field"
  }`;

function CountrySelect({
  value,
  detected,
  onChange,
  compact,
}: {
  value: string | null;
  detected: boolean;
  onChange: (code: string | null) => void;
  compact: boolean;
}) {
  const t = useTranslations("payment");
  const locale = useLocale() as Locale;
  const messages = useMessages() as { country: Record<string, string> };
  const [open, setOpen] = useState(false);
  const listId = useId();
  const options = useMemo(
    () =>
      COUNTRY_CODES.map((code) => ({ code, name: countryName(code, locale, messages.country) })).sort((a, b) =>
        a.name.localeCompare(b.name, locale),
      ),
    [locale, messages.country],
  );
  const label = value ? countryName(value, locale, messages.country) : t("noCountry");

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className={`hit-area flex h-13 w-full min-w-0 items-center bg-crown-velvet text-left text-16 shadow-inset-field ${compact ? "gap-2.5 px-3.5" : "gap-3 px-4"}`}
      >
        {value ? <Flag code={value} /> : <span className="h-4 w-6 flex-none bg-crown-stone" />}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {detected && !compact && <span className="text-12 text-crown-muted">{t("detected")}</span>}
        <Icon name="chev" size={16} height={10} />
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className={`absolute z-10 flex max-h-[264px] flex-col overflow-y-auto bg-crown-hall shadow-ring-2 lg:max-h-[308px] ${
            compact ? "top-[60px] left-0 w-[260px]" : "right-0 bottom-14 left-0"
          }`}
        >
          {[{ code: null, name: t("noCountry") }, ...options].map((option) => (
            <li key={option.code ?? "none"} role="option" aria-selected={option.code === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(option.code);
                  setOpen(false);
                }}
                className={`hit-area flex h-11 w-full items-center gap-3 px-3.5 text-left text-14 font-medium hover:bg-crown-stone ${
                  option.code === value ? "bg-crown-stone" : ""
                }`}
              >
                {option.code ? <Flag code={option.code} /> : <span className="h-4 w-6 flex-none bg-crown-stone" />}
                {option.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Props = {
  season: number;
  priceCents: number;
  lockSeconds: number;
  messageMax: number;
  now: number;
  initial: Draft;
  /** Set when the buyer comes back from a redirect checkout. */
  returning?: CheckoutReturn | null;
  detectedCountry: boolean;
  /** Signed-in buyers keep their name, avatar and email. */
  viewer: ViewerSummary | null;
  onDone: (result: PaymentResult) => void;
  /** The buyer was crowned; the page plays the coronation if it never saw the crown change. */
  onCrowned?: (reignId: number) => void;
  /** "Email me a magic link" after paying: the home closes this and opens the sign-in sheet. */
  onSignIn: (draft: Draft) => void;
};

export function PaymentModal({ season, priceCents, lockSeconds, messageMax, now, initial, returning = null, detectedCountry, viewer, onDone, onCrowned, onSignIn }: Props) {
  const t = useTranslations("payment");
  const common = useTranslations("common");
  const login = useTranslations("login");
  const editProfile = useTranslations("editProfile");
  const units = useTranslations("common.units");
  const rankLabel = useTranslations("rank");
  const locale = useLocale() as Locale;
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Draft>(initial);
  const [countryTouched, setCountryTouched] = useState(false);
  const { phase, submit, payTest, decline, close, clearFailure } = usePayment({ locale, now, onDone, onCrowned, returning });
  const nameCheck = useNameCheck(viewer ? "" : draft.name);
  const human = useHumanCheck("lock");
  // Terms §5: the buyer accepts immediate delivery and the loss of withdrawal before every checkout.
  const [ack, setAck] = useState(false);
  const titleId = useId();

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  const failure: LockFailure | undefined = phase.kind === "form" ? phase.failure : undefined;
  const fieldBad = (field: LockField) =>
    (failure?.error === "moderation_rejected" && failure.field === field) ||
    (failure?.error === "invalid_input" && failure.fields.includes(field)) ||
    (field === "name" && failure?.error === "name_taken");

  const isSuccess = phase.kind === "success";
  const locked = phase.kind === "checkout";
  const shownPrice = formatPrice(locked ? phase.priceCents : priceCents, locale);
  // Clamped: the database clock may run a moment ahead of ours.
  const secondsLeft = locked ? Math.min(lockSeconds, Math.max(0, (new Date(phase.expiresAt).getTime() - now) / 1000)) : 0;
  const lit = locked ? lockSegments(secondsLeft, lockSeconds, SEGMENTS) : 0;
  const reignSeconds = isSuccess ? Math.max(0, Math.floor((now - phase.crownedAt) / 1000)) : 0;
  const reign = `${Math.floor(reignSeconds / 3600)}${units("h")} ${String(Math.floor(reignSeconds / 60) % 60).padStart(2, "0")}${units("m")} ${String(reignSeconds % 60).padStart(2, "0")}${units("s")}`;

  const emailOk = EMAIL.test(draft.email.trim());
  const nameOk = nameCheck === "available" || nameCheck === "checking";
  const detailsOk = viewer !== null || (nameOk && emailOk);
  const canPay = phase.kind === "form" && detailsOk && ack && human.ready;
  const busy = phase.kind === "submitting" || (locked && phase.paying);
  const payOff = busy || locked ? t("processing") : !detailsOk ? t("needName") : !ack ? t("needAck") : t("needHuman");
  // Signed-in buyers keep their public name (SPEC §4).
  const name = viewer ? viewer.name : draft.name;
  const shownName = name.trim() || t("youName");
  const avatar: AvatarSource = viewer?.avatar ?? { seed: draft.avatarSeed };
  const rank: Rank = viewer?.rank ?? "peasant";
  const link = draft.link.trim() ? displayLink(normalizeLink(draft.link)) : "";

  const update = (field: keyof Draft, value: string | null) => {
    setDraft((d) => ({ ...d, [field]: value }));
    if (field === "link" || field === "message" || field === "name" || field === "email") clearFailure(field);
  };

  /** Moderation copy: the design's wording for shorteners and links in messages, a reason line otherwise. */
  const rejection = (field: "link" | "message" | "name", reason: ModerationReason) => {
    const why =
      reason === "shortener" ? t("rejLinkW") : reason === "link_in_message" ? t("rejMsgW") : t(`rejWhy.${reason}` as "rejWhy.hate");
    if (field === "name") return { title: t("rejNameT"), why, fix: t("rejNameF"), line: t("rejNameLine") };
    if (field === "link") {
      const design = reason === "shortener";
      return { title: t("rejLinkT"), why, fix: design ? t("rejLinkF") : t("rejLinkFOther"), line: design ? t("rejLinkLine") : t("rejLinkLineOther") };
    }
    const design = reason === "link_in_message";
    return { title: t("rejMsgT"), why, fix: design ? t("rejMsgF") : t("rejMsgFOther"), line: design ? t("rejMsgLine") : t("rejMsgLineOther") };
  };

  const noticeFor = (f: LockFailure) => {
    if (f.error === "moderation_rejected") {
      const { title, why, fix } = rejection(f.field, f.reason);
      return { title, why, fix };
    }
    const code = f.error === "name_invalid" ? "invalid_input" : f.error === "avatar_seed_invalid" ? "unknown" : f.error;
    return {
      title: t(`errors.${code}.title`),
      why: t(`errors.${code}.why`),
      fix: t(`errors.${code}.fix`),
    };
  };
  const notice = failure ? noticeFor(failure) : null;

  const nameLine = () => {
    if (failure?.error === "moderation_rejected" && failure.field === "name") return <FieldError>{rejection("name", failure.reason).line}</FieldError>;
    if (viewer) return <div className="text-12 text-crown-muted">{t("nameSignedIn")}</div>;
    if (failure?.error === "name_taken" || nameCheck === "taken")
      return <FieldError>{editProfile("nameTaken", { name: draft.name.trim() })}</FieldError>;
    if (nameCheck === "short") return <FieldError>{editProfile("nameShort")}</FieldError>;
    if (nameCheck === "chars") return <FieldError>{editProfile("nameChars")}</FieldError>;
    if (nameCheck === "available") return <FieldOk>{t("nameAvailable")}</FieldOk>;
    return <div className="text-12 text-crown-muted">{t("nameHelp")}</div>;
  };

  const linkLine = () => {
    if (failure?.error === "moderation_rejected" && failure.field === "link") return <FieldError>{rejection("link", failure.reason).line}</FieldError>;
    if (failure?.error === "invalid_input" && failure.fields.includes("link")) return <FieldError>{editProfile("linkBad")}</FieldError>;
    return <div className="text-12 text-crown-muted">{t("linkHelp")}</div>;
  };

  const header = (size: "mobile" | "desktop") => (
    <>
      <div
        className={
          size === "mobile"
            ? "flex h-16 flex-none items-center gap-3 bg-crown-velvet pr-1 pl-4"
            : "flex items-center gap-4 bg-crown-velvet pt-5 pr-3 pb-4 pl-7"
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- pixel art must not be resampled by next/image */}
        <img
          src="/art/crowns/icon-16.svg"
          width={size === "mobile" ? 32 : 48}
          height={size === "mobile" ? 32 : 48}
          alt=""
          className="block flex-none [image-rendering:pixelated]"
        />
        <div className={`flex min-w-0 flex-1 flex-col ${size === "mobile" ? "gap-0.5" : "gap-1"}`}>
          <h2 id={size === "desktop" ? titleId : undefined} className={size === "mobile" ? "text-16 font-bold" : "text-28 leading-tight font-bold"}>
            {isSuccess ? t("headOk") : t("head")}
          </h2>
          {(locked || isSuccess) && (
            <div className={`flex items-baseline text-crown-muted ${size === "mobile" ? "gap-1.5 text-14" : "gap-2 text-16"}`}>
              {isSuccess ? t("reigning") : t("lockPre")}
              <span
                className={`font-pixel font-bold text-crown-text tabular-nums ${size === "mobile" ? "text-16" : "text-20"}`}
                role="timer"
              >
                {isSuccess ? reign : formatCountdown(secondsLeft)}
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          aria-label={common("close")}
          className={`hit-area flex flex-none items-center justify-center hover:bg-crown-hall focus-visible:outline-offset-[-2px] ${size === "mobile" ? "size-11" : "size-12 self-start"}`}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className={`flex gap-0.5 bg-crown-velvet ${size === "mobile" ? "px-4 pb-2" : "px-7 pb-3"}`} aria-hidden>
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 ${isSuccess ? "bg-crown-gold" : i < lit ? "bg-crown-muted" : "bg-crown-hall"}`}
          />
        ))}
      </div>
    </>
  );

  const previewCard = (size: "mobile" | "desktop") => (
    <div className={size === "mobile" ? "flex flex-col gap-2.5" : "flex flex-col gap-3 bg-crown-velvet p-5"}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-14 font-bold">{t("preview")}</div>
        <div className="text-12 text-crown-muted">{t("previewSub")}</div>
      </div>
      {size === "mobile" ? (
        <div className="flex h-36 justify-center overflow-hidden bg-crown-ink">
          <Preview avatar={avatar} rank={rank} season={season} scale={2} width={180} />
        </div>
      ) : (
        <Preview avatar={avatar} rank={rank} season={season} scale={3} width={120} />
      )}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-16 font-bold break-all">{shownName}</span>
          <Flag code={draft.country} />
          <RankTag rank={rank} label={viewer ? rankLabel(rank) : t("rank")} />
        </div>
        {draft.message.trim() && <p className="text-14 leading-[1.45] text-pretty">“{draft.message.trim()}”</p>}
        {link && <span className="text-14 font-bold underline decoration-crown-stone decoration-2 underline-offset-[5px]">{link}</span>}
      </div>
    </div>
  );

  const nameField = (size: Size) => (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={`pay-${size}-name`} className="text-14 font-bold">
        {common("nameL")}
      </label>
      <input
        id={`pay-${size}-name`}
        value={name}
        onChange={(e) => update("name", e.target.value.slice(0, 24))}
        readOnly={viewer !== null}
        maxLength={24}
        autoComplete="nickname"
        placeholder={t("namePh")}
        className={inputClass(fieldBad("name") || nameCheck === "taken" || nameCheck === "chars")}
      />
    </div>
  );

  const emailField = (size: Size) => (
    <div className="flex flex-col gap-2">
      <label htmlFor={`pay-${size}-email`} className="text-14 font-bold">
        {login("emailL")}
      </label>
      <input
        id={`pay-${size}-email`}
        type="email"
        value={draft.email}
        onChange={(e) => update("email", e.target.value)}
        autoComplete="email"
        placeholder={login("emailPh")}
        className={inputClass(fieldBad("email"))}
      />
      {fieldBad("email") ? <FieldError>{login("emailBad")}</FieldError> : <div className="text-12 text-crown-muted">{t("emailHelp")}</div>}
    </div>
  );

  const linkField = (size: Size) => (
    <div className="flex flex-col gap-2">
      <label htmlFor={`pay-${size}-link`} className="text-14 font-bold">
        {t("linkL")}
      </label>
      <input
        id={`pay-${size}-link`}
        value={draft.link}
        onChange={(e) => update("link", e.target.value.slice(0, 80))}
        maxLength={80}
        inputMode="url"
        placeholder={t("linkPh")}
        className={inputClass(fieldBad("link"))}
      />
      {linkLine()}
    </div>
  );

  const messageField = (size: Size) => (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between gap-3">
        <label htmlFor={`pay-${size}-message`} className="text-14 font-bold">
          {t("msgL")}
        </label>
        <span className={`font-pixel text-14 ${draft.message.length >= messageMax - 10 ? "text-crown-text" : "text-crown-muted"}`}>
          {draft.message.length}/{messageMax}
        </span>
      </div>
      <textarea
        id={`pay-${size}-message`}
        value={draft.message}
        onChange={(e) => update("message", e.target.value.replace(/\n/g, " ").slice(0, messageMax))}
        maxLength={messageMax}
        rows={2}
        placeholder={t("msgPh")}
        className={`h-20 w-full resize-none bg-crown-velvet px-4 py-3.5 text-16 leading-snug placeholder:text-crown-muted ${
          fieldBad("message") ? "shadow-inset-field-error" : "shadow-inset-field"
        }`}
      />
      <div className="flex h-1 gap-0.5" aria-hidden>
        <span className="bg-crown-muted" style={{ flex: draft.message.length }} />
        <span className="bg-crown-hall" style={{ flex: messageMax - draft.message.length }} />
      </div>
      {fieldBad("message") && (
        <FieldError>{failure?.error === "moderation_rejected" ? rejection("message", failure.reason).line : t("rejMsgLine")}</FieldError>
      )}
    </div>
  );

  const country = (compact: boolean) => (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex justify-between gap-2">
        <span className="text-14 font-bold">{common("countryL")}</span>
        {compact && detectedCountry && !countryTouched && draft.country && (
          <span className="text-12 text-crown-muted">{t("detected")}</span>
        )}
      </div>
      <CountrySelect
        value={draft.country}
        detected={detectedCountry && !countryTouched && draft.country !== null}
        compact={compact}
        onChange={(code) => {
          setCountryTouched(true);
          update("country", code);
        }}
      />
    </div>
  );

  const testCheckout = locked && (
    <div className="flex flex-col gap-3 bg-crown-velvet p-4 shadow-ring-2" data-testid="test-checkout">
      <div className="text-16 font-bold">{t("test.title")}</div>
      <p className="text-14 text-crown-muted">{t("test.note")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={phase.paying}
          onClick={payTest}
          className="hit-area m-1 h-12 bg-crown-hall px-4 text-16 font-bold shadow-relief hover:bg-crown-stone disabled:text-crown-muted"
        >
          {t("test.pay", { price: shownPrice })}
        </button>
        <button
          type="button"
          disabled={phase.paying}
          onClick={decline}
          className="hit-area h-11 px-3 text-14 font-bold underline decoration-crown-stone decoration-2 underline-offset-[6px] hover:bg-crown-velvet"
        >
          {t("test.decline")}
        </button>
      </div>
      {/* As on a real checkout, so test runs show what buyers see. */}
      <p className="text-12 text-crown-muted">{common("taxes")}</p>
    </div>
  );

  const pendingReview = (phase.kind === "checkout" || phase.kind === "success") && phase.moderationPending && (
    <div role="status" className="bg-crown-velvet p-3.5 text-14 leading-[1.45] font-bold shadow-[inset_4px_0_0_var(--crown-text)] lg:p-4">
      {t("pendingReview")}
    </div>
  );

  const verify = phase.kind === "verify" && (
    <div role="status" className="flex gap-3 bg-crown-velvet p-3.5 shadow-flag-success lg:p-4">
      <span className="flex size-6 flex-none items-center justify-center bg-crown-success text-crown-ink lg:size-7">
        <Icon name="check" size={16} height={12} />
      </span>
      <div className="flex flex-col gap-1 text-14 leading-[1.45]">
        <div className="font-bold lg:text-16">{t("verifyTitle")}</div>
        <div>{t("verifyBody", { email: phase.email })}</div>
      </div>
    </div>
  );

  const next = `/${locale}`;
  const signInClass =
    "hit-area m-1 flex h-13 items-center justify-center bg-crown-hall text-16 font-bold shadow-relief hover:bg-crown-stone focus-visible:outline-offset-[6px]";
  const signIn = viewer ? null : (
    <>
      <p className="text-16 leading-snug font-bold text-pretty lg:text-20">{t("signin")}</p>
      <a href={signInHref("google", next)} className={signInClass}>
        {common("google")}
      </a>
      <a href={signInHref("x", next)} className={signInClass}>
        {t("xLogin")}
      </a>
      <button type="button" onClick={() => onSignIn(draft)} className={signInClass}>
        {t("email")}
      </button>
    </>
  );

  const ackBox = (size: "mobile" | "desktop") => (
    <div className={`flex items-start ${size === "mobile" ? "gap-2.5 text-14" : "gap-3 text-16 font-medium"} leading-snug`}>
      <span className="relative mt-px flex size-6 flex-none">
        <input
          id={`${titleId}-ack-${size}`}
          type="checkbox"
          required
          checked={ack}
          disabled={phase.kind !== "form"}
          onChange={(e) => setAck(e.target.checked)}
          className="peer hit-area size-6 cursor-pointer appearance-none bg-crown-ink shadow-[inset_0_0_0_2px_var(--crown-stone-hi)] checked:bg-crown-gold checked:shadow-none focus-visible:outline-offset-2 disabled:cursor-default"
        />
        <span aria-hidden className="pointer-events-none absolute inset-0 hidden items-center justify-center text-crown-ink peer-checked:flex">
          <Icon name="check" size={16} height={12} />
        </span>
      </span>
      <span className="flex flex-col gap-1">
        <label htmlFor={`${titleId}-ack-${size}`} className="cursor-pointer text-pretty">
          {t.rich("ack", {
            terms: (chunks) => (
              <a href={`/${locale}/terms#s5`} target="_blank" rel="noopener" className="underline decoration-crown-stone-hi underline-offset-4 hover:decoration-crown-text">
                {chunks}
              </a>
            ),
          })}
        </label>
        <span className={`${size === "mobile" ? "text-12" : "text-14 font-normal"} text-crown-muted`}>{common("final")}</span>
      </span>
    </div>
  );

  const payButton = (className: string) =>
    canPay ? (
      <button
        type="submit"
        form="payment-form"
        className={`hit-area m-1 h-14 bg-crown-gold text-18 font-bold text-crown-ink shadow-relief-gold hover:bg-crown-gold-glow hover:shadow-relief-gold-hover focus-visible:outline-offset-[6px] active:bg-crown-gold-old active:pt-1 active:shadow-relief-gold-pressed ${className}`}
      >
        {t("pay", { price: shownPrice })}
      </button>
    ) : (
      <div aria-live="polite" className={`m-1 flex h-14 items-center justify-center bg-crown-hall text-18 font-bold text-crown-muted ${className}`}>
        {payOff}
      </div>
    );

  // Signed-in buyers are already kept; the success screen's other column is for sharing the reign.
  const reignShare = (size: Size) =>
    isSuccess && viewer && phase.reignId !== null ? <ReignShare reignId={phase.reignId} viewer={viewer} size={size} /> : null;

  const showForm = !isSuccess;
  const formDisabled = phase.kind !== "form";

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      className="m-0 max-h-none w-full max-w-none bg-crown-ink text-crown-text backdrop:bg-crown-abyss/84 max-lg:h-dvh lg:m-auto lg:max-h-[calc(100dvh-48px)] lg:w-[920px] lg:shadow-modal"
    >
      <form
        id="payment-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canPay) return;
          void submit(viewer ? { ...draft, name: viewer.name } : draft, { acceptWithdrawal: ack, turnstileToken: human.token });
          human.reset();
        }}
        className="flex h-full flex-col lg:max-h-[calc(100dvh-48px)]"
      >
        {/* Mobile sheet */}
        <div className="flex h-full min-h-0 flex-col lg:hidden">
          {header("mobile")}
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-x-hidden overflow-y-auto px-4 pt-4 pb-6">
            {notice && <Notice {...notice} size="mobile" />}
            {verify}
            {pendingReview}
            {testCheckout}
            {previewCard("mobile")}
            {showForm && (
              <fieldset disabled={formDisabled} className="flex flex-col gap-5 pt-5 shadow-[var(--crown-bar-top)]">
                <div className="flex flex-col gap-2">
                  {nameField("mobile")}
                  {nameLine()}
                </div>
                {!viewer && emailField("mobile")}
                {linkField("mobile")}
                {messageField("mobile")}
                {country(false)}
              </fieldset>
            )}
            {isSuccess && signIn && <div className="flex flex-col gap-3 pt-5 shadow-[var(--crown-bar-top)]">{signIn}</div>}
            {reignShare("mobile") && <div className="pt-5 shadow-[var(--crown-bar-top)]">{reignShare("mobile")}</div>}
          </div>
          {showForm && (
            <div className="flex flex-none flex-col gap-2.5 bg-crown-ink px-4 pt-3.5 pb-4 shadow-[var(--crown-bar-top)]">
              {ackBox("mobile")}
              {human.widget}
              {payButton("")}
              <div className="text-center text-12 text-crown-muted">{common("taxes")}</div>
              {!viewer && <div className="text-center text-12 text-crown-muted">{t("noAcct")}</div>}
            </div>
          )}
          {isSuccess && (
            <div className="flex flex-none items-center justify-between gap-3 px-4 pt-3 pb-4 shadow-[var(--crown-bar-top)]">
              {!viewer && (
                <button type="button" onClick={close} className="hit-area h-11 px-3 text-14 font-bold underline decoration-crown-stone decoration-2 underline-offset-[6px] hover:bg-crown-velvet">
                  {common("notNow")}
                </button>
              )}
              <button type="button" onClick={close} className="hit-area text-14 font-bold underline decoration-2 underline-offset-[6px]">
                {t("watch")}
              </button>
            </div>
          )}
        </div>

        {/* Desktop modal */}
        <div className="hidden min-h-0 flex-col lg:flex">
          {header("desktop")}
          <div className="min-h-0 flex-1 overflow-y-auto">
          {notice && (
            <div className="mx-7 mt-6">
              <Notice {...notice} size="desktop" />
            </div>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_400px] items-start gap-7 px-7 pt-6 pb-7">
            {showForm ? (
              <div className="flex flex-col gap-5">
                {verify}
                {pendingReview}
                {testCheckout}
                <fieldset disabled={formDisabled} className="flex flex-col gap-5">
                  <div className="grid grid-cols-[minmax(0,1fr)_200px] gap-4">
                    {nameField("desktop")}
                    {country(true)}
                  </div>
                  <div className="-mt-3">{nameLine()}</div>
                  {!viewer && emailField("desktop")}
                  {linkField("desktop")}
                  {messageField("desktop")}
                </fieldset>
              </div>
            ) : (
              <div className="flex flex-col gap-3.5">
                {pendingReview}
                {signIn}
                {signIn && <p className="text-12 leading-body text-crown-muted">{t("skipNote")}</p>}
                {reignShare("desktop")}
              </div>
            )}
            {previewCard("desktop")}
          </div>
          </div>
          {showForm && (
            <div className="flex items-center justify-between gap-8 px-7 pt-5 pb-6 shadow-[var(--crown-bar-top)]">
              <div className="flex max-w-[440px] flex-col gap-1.5">
                {ackBox("desktop")}
                {!viewer && <div className="pl-9 text-12 text-crown-muted">{t("noAcct")}</div>}
              </div>
              <div className="flex flex-col items-end gap-2">
                {human.widget}
                {payButton("min-w-[380px] px-7")}
                <div className="mx-1 text-right text-12 text-crown-muted">{common("taxes")}</div>
              </div>
            </div>
          )}
          {isSuccess && (
            <div className="flex items-center justify-between gap-6 px-7 pt-4 pb-5 shadow-[var(--crown-bar-top)]">
              {!viewer && (
                <button type="button" onClick={close} className="hit-area h-11 px-3 text-14 font-bold underline decoration-crown-stone decoration-2 underline-offset-[6px] hover:bg-crown-velvet">
                  {common("notNow")}
                </button>
              )}
              <button type="button" onClick={close} className="hit-area text-14 font-bold underline decoration-2 underline-offset-[6px]">
                {t("watch")}
              </button>
            </div>
          )}
        </div>
      </form>
    </dialog>
  );
}
