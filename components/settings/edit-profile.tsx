"use client";

import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { traitsFromUsername } from "@/design/lib/avatar-lib.js";
import { Arrow, Flag, Icon, Portrait, RankTag } from "@/components/art";
import { useAuth } from "@/components/auth/auth-provider";
import { useServerNow } from "@/components/home/use-live-home";
import { Medal, SocialIcon, rarityColor } from "@/components/profile/parts";
import { TopBar } from "@/components/top-bar";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { AvatarSource } from "@/lib/art/avatar";
import { BRAND_NAME } from "@/lib/config/brand";
import type { ModerationReason } from "@/lib/moderation/reasons";
import { displayLink, formatPercent, formatPrice } from "@/lib/format";
import { MEDAL_KEY } from "@/lib/game/achievements";
import { priceAt } from "@/lib/game/price";
import type { Season } from "@/lib/home/data";
import type { OwnSettings } from "@/lib/profile/own";
import {
  type FieldKey,
  type SaveOutcome,
  type SettingsForm,
  TRAIT_KEYS,
  TRAIT_RANGES,
  type TraitKey,
  formProblems,
  mainLinkUrl,
} from "@/lib/profile/settings";
import { PLATFORMS, SOCIAL_KEYS, type SocialKey, isValidSocial, socialLabel, socialUrl } from "@/lib/profile/socials";

type Phase = "idle" | "saving" | "saved" | "failed" | "rejected" | "unavailable";
type Upload = { pixelUrl: string; originalUrl: string; name: string };
type ServerErrors = Partial<Record<FieldKey, "taken" | "cooldown" | "bad">>;

const SECTIONS = [
  { id: "avatar", label: "secAvatar", fields: ["up"] },
  { id: "identity", label: "secId", fields: ["name", "link"] },
  { id: "socials", label: "secSoc", fields: SOCIAL_KEYS.map((k) => `soc_${k}`) },
  { id: "showcase", label: "secShow", fields: [] },
  { id: "privacy", label: "secPriv", fields: [] },
  { id: "alerts", label: "secAl", fields: ["price"] },
  { id: "language", label: "secLang", fields: [] },
] as const;

const UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_UPLOAD = 5 * 1024 * 1024;

/** Unsaved changes, counted the way the save bar reports them. */
function changes(a: SettingsForm, b: SettingsForm): number {
  const parts = (f: SettingsForm) => [
    f.avatarMode === "generated" ? ["g", f.avatarTraits] : ["u", f.avatarPath, f.avatarPixelated],
    f.name.trim(),
    f.country,
    mainLinkUrl(f.link),
    ...SOCIAL_KEYS.map((k) => (isValidSocial(k, f.socials[k]) ? socialUrl(k, f.socials[k]) : f.socials[k])),
    f.showcase,
    f.showRival,
    f.showChronicle,
    f.alertsDethroned,
    f.priceOn ? f.price.trim() : false,
    f.alertsSeasonStart,
    f.locale,
  ];
  const x = parts(a);
  const y = parts(b);
  return x.filter((v, i) => JSON.stringify(v) !== JSON.stringify(y[i])).length;
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 1)}••••@${domain}`;
}

// ---------------------------------------------------------------------------
// Small controls from the design system
// ---------------------------------------------------------------------------

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  wide = false,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; lang?: string }[];
  onChange: (value: T) => void;
  wide?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 self-start bg-crown-ink p-1 shadow-[inset_0_0_0_2px_var(--crown-hall)]">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            lang={o.lang}
            onClick={() => onChange(o.value)}
            className={`hit-area h-10 px-4 text-14 font-bold ${wide ? "min-w-26" : ""} ${
              on ? "bg-crown-hall text-crown-text shadow-inset-segment-on" : "text-crown-muted"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Switch({ id, on, title, desc, onToggle, children }: { id: string; on: boolean; title: string; desc: string; onToggle: () => void; children?: ReactNode }) {
  const t = useTranslations("editProfile");
  return (
    <div className="flex flex-col gap-3 bg-crown-velvet py-3.5 pr-3 pl-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div id={`${id}-t`} className="text-14 font-bold">
            {title}
          </div>
          <div id={`${id}-d`} className="text-12 leading-[1.45] text-pretty text-crown-muted">
            {desc}
          </div>
        </div>
        <div className="flex flex-none items-center gap-2.5">
          <div aria-hidden className="min-w-6 text-right text-12 font-bold text-crown-muted">
            {on ? t("on") : t("off")}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-labelledby={`${id}-t`}
            aria-describedby={`${id}-d`}
            onClick={onToggle}
            className={`hit-area relative my-1.5 h-8 w-14 focus-visible:outline-offset-4 ${on ? "bg-crown-text" : "bg-crown-ink shadow-[inset_0_0_0_2px_var(--crown-stone)]"}`}
          >
            <span className={`absolute top-1 size-6 ${on ? "left-7 bg-crown-ink" : "left-1 bg-crown-stone-hi"}`} />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

function ErrorLine({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <div id={id} className="flex items-start gap-2 text-12 leading-[1.45] font-bold">
      <span className="flex size-4 flex-none items-center justify-center bg-crown-danger text-crown-ink">
        <Icon name="bang" size={8} />
      </span>
      {children}
    </div>
  );
}

function Help({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <div id={id} className="text-12 leading-[1.45] text-crown-muted">
      {children}
    </div>
  );
}

function SmallRelief({ onClick, children, disabled }: { onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="hit-area m-1 h-10 bg-crown-hall px-3.5 text-14 font-bold shadow-relief-card hover:bg-crown-stone focus-visible:outline-offset-[6px] active:bg-crown-ink disabled:text-crown-muted"
    >
      {children}
    </button>
  );
}

function UnderlineButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hit-area min-h-11 px-1 text-14 font-bold underline decoration-crown-stone-hi underline-offset-4"
    >
      {children}
    </button>
  );
}

const fieldClass = (bad: boolean) =>
  `h-13 w-full bg-crown-velvet px-4 text-16 placeholder:text-crown-muted focus-visible:outline-offset-2 ${
    bad ? "shadow-inset-field-error" : "shadow-inset-field"
  }`;

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

type Props = {
  settings: OwnSettings;
  season: Season;
  readAt: string;
  /** Sorted on the server: browsers and Node name some regions differently, which breaks hydration. */
  countries: { code: string; name: string }[];
};

export function EditProfile({ settings, season, readAt, countries }: Props) {
  const now = useServerNow(readAt);
  const t = useTranslations("editProfile");
  const common = useTranslations("common");
  const login = useTranslations("login");
  const payment = useTranslations("payment");
  /** The design's wording for gambling and shorteners, the shared reason line otherwise. */
  const rejectionWhy = (reason: ModerationReason) =>
    reason === "gambling"
      ? t("bRejWhy", { brand: BRAND_NAME })
      : reason === "shortener"
        ? t("bRejWhyShortener")
        : reason === "link_in_message"
          ? payment("rejMsgW")
          : payment(`rejWhy.${reason}` as "rejWhy.hate");
  const rankName = useTranslations("rank");
  const medals = useTranslations("medals");
  const social = useTranslations("social");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const { refresh } = useAuth();
  const uid = useId();

  const [form, setForm] = useState<SettingsForm>(settings.form);
  const [saved, setSaved] = useState<SettingsForm>(settings.form);
  const [phase, setPhase] = useState<Phase>("idle");
  const [rejection, setRejection] = useState<{ field: "name" | "link"; reason: ModerationReason } | null>(null);
  const [tried, setTried] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<ServerErrors>({});
  const [uploads, setUploads] = useState<Record<string, Upload>>(() =>
    settings.upload ? { [settings.upload.path]: { ...settings.upload, name: t("modeUp") } } : {},
  );
  const [upError, setUpError] = useState<"type" | "size" | "failed" | null>(null);
  const [uploading, setUploading] = useState(false);
  const [nameTaken, setNameTaken] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const floorDollars = Math.ceil(settings.floorCents / 100);
  const cooldownDate = settings.nameChangeAt
    ? new Intl.DateTimeFormat(locale === "es" ? "es-419" : "en-US", { dateStyle: "long" }).format(new Date(settings.nameChangeAt))
    : null;

  // Name availability, debounced; the player's own current and former names count as free.
  const trimmedName = form.name.trim();
  useEffect(() => {
    if (trimmedName === saved.name || trimmedName.length < 3) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/names/availability?name=${encodeURIComponent(trimmedName)}`)
        .then((r) => r.json() as Promise<{ valid: boolean; available: boolean }>)
        .then((r) => !cancelled && setNameTaken(r.valid && !r.available))
        .catch(() => undefined);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmedName, saved.name]);

  const update = (patch: Partial<SettingsForm>, fields: FieldKey[] = []) => {
    setForm((f) => ({ ...f, ...patch }));
    if (phase !== "saving") setPhase("idle");
    if (fields.length) {
      setServerErrors((e) => {
        const next = { ...e };
        for (const f of fields) delete next[f];
        return next;
      });
    }
  };

  // ---- Errors ----
  const problems = formProblems(form, floorDollars);
  const errorOf = (field: FieldKey): string | null => {
    const server = serverErrors[field];
    if (field === "name") {
      if (server === "cooldown") return t("nameCooldownErr", { date: cooldownDate ?? "" });
      if (server === "taken" || (nameTaken && trimmedName !== saved.name)) return t("nameTaken", { name: trimmedName });
    } else if (server) {
      return messageFor(field, "bad");
    }
    const problem = problems.find((p) => p.field === field);
    return problem ? messageFor(field, problem.problem) : null;
  };
  function messageFor(field: FieldKey, problem: string): string {
    if (field === "name") return problem === "short" ? t("nameShort") : t("nameChars");
    if (field === "link") return t("linkBad");
    if (field === "price") return t("priceErr", { min: floorDollars });
    if (field === "up") return t("upErrNone");
    return social(`${field.slice(4) as SocialKey}.invalid`);
  }
  const allFields: FieldKey[] = ["up", "name", "link", ...SOCIAL_KEYS.map((k) => `soc_${k}` as const), "price"];
  const invalidFields = allFields.filter((f) => errorOf(f) !== null);
  const visible = (field: FieldKey) => errorOf(field) !== null && (tried || touched[field] || serverErrors[field] !== undefined);
  const touch = (field: FieldKey) => () => setTouched((x) => (x[field] ? x : { ...x, [field]: true }));
  const labelOf = (field: FieldKey) =>
    field === "up" ? t("secAvatar") : field === "name" ? common("nameL") : field === "link" ? t("linkL") : field === "price" ? t("priceL") : social(`${field.slice(4) as SocialKey}.name`);

  // ---- Save ----
  const dirty = changes(form, saved);
  const invalid = tried && invalidFields.length > 0 && phase !== "saving";

  const save = async () => {
    if (phase === "saving") return;
    if (invalidFields.length) {
      setTried(true);
      setPhase("idle");
      return;
    }
    setPhase("saving");
    setTried(false);
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }).catch(() => null);
    const outcome = (await response?.json().catch(() => null)) as SaveOutcome | null;
    if (!outcome) return setPhase("failed");
    if (outcome.ok) {
      const clean = { ...form, name: form.name.trim() };
      setForm(clean);
      setSaved(clean);
      setTouched({});
      setPhase("saved");
      refresh();
      if (form.locale !== locale) router.replace(pathname, { locale: form.locale });
      return;
    }
    if (outcome.error === "rejected") {
      setRejection({ field: outcome.field, reason: outcome.reason });
      return setPhase("rejected");
    }
    if (outcome.error === "moderation_unavailable") return setPhase("unavailable");
    if (outcome.error === "invalid") {
      const next: ServerErrors = {};
      for (const f of outcome.fields) next[f] = f === "name" ? (outcome.nameProblem ?? "bad") : "bad";
      setServerErrors(next);
      setTried(true);
      return setPhase("idle");
    }
    setPhase("failed");
  };

  const discard = () => {
    setForm(saved);
    setPhase("idle");
    setTried(false);
    setTouched({});
    setServerErrors({});
    setUpError(null);
  };

  const go = (id: string, focus = false) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    if (focus) el.focus({ preventScroll: true });
  };
  const fieldTarget = (field: FieldKey) =>
    field === "up" ? `${uid}-avatar` : field === "price" ? `${uid}-price` : field.startsWith("soc_") ? `${uid}-${field}` : `${uid}-${field}`;

  // ---- Avatar ----
  const upload = form.avatarPath ? uploads[form.avatarPath] : undefined;
  const avatar: AvatarSource =
    form.avatarMode === "upload"
      ? {
          seed: settings.avatarSeed,
          traits: form.avatarTraits,
          image: upload ? { pixelUrl: upload.pixelUrl, originalUrl: upload.originalUrl, pixelated: form.avatarPixelated } : null,
        }
      : { seed: settings.avatarSeed, traits: form.avatarTraits };
  const emptyUpload = form.avatarMode === "upload" && !upload;

  const sendFile = async (file: File | undefined) => {
    if (!file) return;
    if (!UPLOAD_TYPES.includes(file.type)) return setUpError("type");
    if (file.size > MAX_UPLOAD) return setUpError("size");
    setUpError(null);
    setUploading(true);
    const body = new FormData();
    body.set("file", file);
    const response = await fetch("/api/profile/avatar", { method: "POST", body }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as
      | { ok: true; path: string; pixelUrl: string; originalUrl: string }
      | { ok: false; error: "type" | "size" | "failed" }
      | null;
    setUploading(false);
    if (!result || !result.ok) return setUpError(result && !result.ok ? result.error : "failed");
    setUploads((u) => ({ ...u, [result.path]: { pixelUrl: result.pixelUrl, originalUrl: result.originalUrl, name: file.name } }));
    update({ avatarPath: result.path, avatarPixelated: true }, ["up"]);
  };

  const stepTrait = (key: TraitKey, delta: number) => {
    const [min, max] = TRAIT_RANGES[key];
    const size = max - min + 1;
    const value = form.avatarTraits[key];
    update({ avatarTraits: { ...form.avatarTraits, [key]: ((value - min + delta + size) % size) + min } });
  };

  const upErrorText =
    upError === "type" ? t("upErrType") : upError === "size" ? t("upErrSize") : upError === "failed" ? t("upErrFailed") : visible("up") ? t("upErrNone") : null;

  // ---- Alerts ----
  const livePrice = priceAt(settings.basePriceCents, new Date(settings.baseSetAt), new Date(now), {
    floorCents: settings.floorCents,
    decayBpsPerHour: settings.decayBpsPerHour,
  });
  const target = Number(form.price) * 100;
  const keep = 1 - settings.decayBpsPerHour / 10_000;
  const hours =
    target >= livePrice ? 0 : target >= settings.floorCents && keep > 0 && keep < 1 ? Math.ceil(Math.log(target / livePrice) / Math.log(keep)) : -1;
  const priceNote = t("priceNote", {
    price: formatPrice(livePrice, locale),
    percent: formatPercent(settings.decayBpsPerHour, locale),
    estimate: hours < 0 ? t("never") : t("soon", { h: hours }),
  });

  // ---- Status ----
  let statusText: string;
  let statusTone: "bad" | "good" | "plain" = "plain";
  if (phase === "saving") statusText = t("saving");
  else if (invalid) {
    statusText = t("stInvalid", { n: invalidFields.length });
    statusTone = "bad";
  } else if (phase === "failed" || phase === "rejected" || phase === "unavailable") {
    statusText = t("stFailed");
    statusTone = "bad";
  } else if (phase === "saved" && !dirty) {
    statusText = t("stSaved");
    statusTone = "good";
  } else statusText = dirty ? t("stDirty", { n: dirty }) : t("stClean");
  const canSave = phase !== "saving" && (dirty > 0 || phase === "failed");
  const canDiscard = dirty > 0 && phase !== "saving";

  const statusLine = (size: "mobile" | "desktop") => (
    <div
      aria-live="polite"
      className={`flex min-w-0 items-center gap-2 font-bold ${size === "mobile" ? "flex-1 text-12 leading-[1.3]" : "min-h-6 text-14"} ${
        statusTone === "plain" && !dirty ? "text-crown-muted" : ""
      }`}
    >
      {statusTone === "bad" && (
        <span className="flex size-4 flex-none items-center justify-center bg-crown-danger text-crown-ink">
          <Icon name="bang" size={8} />
        </span>
      )}
      {statusTone === "good" && (
        <span className="flex size-4 flex-none items-center justify-center bg-crown-text text-crown-ink">
          <Icon name="check" size={8} height={6} />
        </span>
      )}
      {statusText}
    </div>
  );

  const saveButton = (size: "mobile" | "desktop") =>
    canSave ? (
      <button
        type="button"
        onClick={() => void save()}
        className={`hit-area m-1 bg-crown-text font-bold text-crown-ink shadow-relief-parchment hover:bg-crown-parchment-hi focus-visible:outline-offset-[6px] active:bg-crown-parchment-shade active:pt-1 active:shadow-relief-parchment-pressed ${
          size === "mobile" ? "h-12 flex-none px-4.5 text-16" : "h-14 flex-1 text-16"
        }`}
      >
        {size === "mobile" ? t("saveShort") : t("save")}
      </button>
    ) : (
      <button
        type="button"
        aria-disabled="true"
        className={`m-1 cursor-default bg-crown-hall font-bold text-crown-muted ${size === "mobile" ? "h-12 flex-none px-4.5 text-16" : "h-14 flex-1 text-16"}`}
      >
        {phase === "saving" ? t("saving") : size === "mobile" ? t("saveShort") : t("save")}
      </button>
    );

  const discardButton = (size: "mobile" | "desktop") =>
    canDiscard && (
      <button
        type="button"
        onClick={discard}
        className={`hit-area flex-none px-2 text-14 font-bold underline decoration-crown-stone-hi underline-offset-4 ${size === "mobile" ? "h-11" : "h-14 px-3"}`}
      >
        {t("discard")}
      </button>
    );

  // ---- Banners ----
  const banner = (tone: "danger" | "parchment", icon: "bang" | "check", body: ReactNode) => (
    <div className={`mt-4 flex gap-3 bg-crown-velvet p-4 ${tone === "danger" ? "shadow-flag-danger" : "shadow-[inset_4px_0_0_var(--crown-text)]"}`}>
      <span className={`flex size-6 flex-none items-center justify-center text-crown-ink ${tone === "danger" ? "bg-crown-danger" : "bg-crown-text"}`}>
        <Icon name={icon} size={8} height={icon === "check" ? 6 : 8} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-14 leading-[1.45]">{body}</div>
    </div>
  );

  const banners = (
    <div role="status" aria-live="polite" className="flex flex-col">
      {invalid &&
        banner(
          "danger",
          "bang",
          <>
            <div className="font-bold">{t("bInv", { n: invalidFields.length })}</div>
            <div className="text-crown-muted">{t("bInvSub")}</div>
            <div className="flex flex-col">
              {invalidFields.map((f) => (
                <button key={f} type="button" onClick={() => go(fieldTarget(f), f !== "up")} className="flex min-h-11 items-center gap-2 py-1 text-left">
                  <span className="flex-none font-bold underline decoration-crown-stone-hi underline-offset-4">{labelOf(f)}</span>
                  <span className="min-w-0 text-crown-muted">{errorOf(f)}</span>
                </button>
              ))}
            </div>
          </>,
        )}
      {phase === "rejected" &&
        rejection &&
        banner(
          "danger",
          "bang",
          <>
            <div className="font-bold">{rejection.field === "name" ? t("bRejNameTitle") : t("bRejTitle")}</div>
            <div>{rejectionWhy(rejection.reason)}</div>
            <div className="text-crown-muted">{rejection.field === "name" ? t("bRejNameFix") : t("bRejFix")}</div>
            <button
              type="button"
              onClick={() => go(`${uid}-${rejection.field}`, true)}
              className="hit-area min-h-11 self-start font-bold underline underline-offset-4"
            >
              {rejection.field === "name" ? t("editName") : t("editLink")}
            </button>
          </>,
        )}
      {phase === "unavailable" &&
        banner(
          "danger",
          "bang",
          <>
            <div className="font-bold">{t("bModTitle")}</div>
            <div className="text-crown-muted">{t("bModWhy")}</div>
          </>,
        )}
      {phase === "failed" &&
        banner(
          "danger",
          "bang",
          <>
            <div className="font-bold">{t("bFailTitle")}</div>
            <div className="text-crown-muted">{t("bFailWhy")}</div>
            <div className="mt-3">
              <SmallRelief onClick={() => void save()}>{t("retry")}</SmallRelief>
            </div>
          </>,
        )}
      {phase === "saved" &&
        !dirty &&
        banner(
          "parchment",
          "check",
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div className="flex flex-col gap-0.5">
              <div className="font-bold">{t("bSavedTitle")}</div>
              <div className="text-crown-muted">{t("bSavedWhy")}</div>
            </div>
            <Link href={`/u/${saved.name.toLowerCase()}`} className="flex min-h-11 items-center font-bold underline underline-offset-4">
              {t("viewProfile")}
            </Link>
          </div>,
        )}
    </div>
  );

  const section = (id: string, first: boolean, children: ReactNode, gap = "gap-4") => (
    <section id={`${uid}-${id}`} className={`flex scroll-mt-6 flex-col py-7 ${gap} ${first ? "" : "shadow-[var(--crown-bar-top)]"}`}>
      {children}
    </section>
  );
  const heading = (title: string, help?: string) => (
    <div className="flex flex-col gap-1.5">
      <h2 className="text-20 font-bold">{title}</h2>
      {help && <div className="text-14 leading-body text-pretty text-crown-muted">{help}</div>}
    </div>
  );

  // ---- Sections ----
  const avatarSection = section(
    "avatar",
    true,
    <>
      {heading(t("secAvatar"), t("avHelp"))}
      <Segmented
        label={t("secAvatar")}
        value={form.avatarMode}
        options={[
          { value: "generated", label: t("modeGen") },
          { value: "upload", label: t("modeUp") },
        ]}
        onChange={(mode) => update({ avatarMode: mode }, ["up"])}
      />
      <div className="grid gap-5 lg:grid-cols-[176px_minmax(0,1fr)] lg:items-start">
        <div className="flex items-start gap-4 lg:flex-col">
          <div role="img" aria-label={t("avAlt", { rank: rankName(settings.rank) })}>
            <div className="lg:hidden">
              <Portrait avatar={avatar} rank={settings.rank} season={season.id} crown={false} scale={3} />
            </div>
            <div className="hidden lg:block">
              <Portrait avatar={avatar} rank={settings.rank} season={season.id} crown={false} scale={4} />
            </div>
          </div>
          <div className="flex flex-col items-start gap-2">
            {form.avatarMode === "generated" ? (
              <>
                <SmallRelief onClick={() => update({ avatarTraits: traitsFromUsername(Math.random().toString(36)) })}>{t("shuffle")}</SmallRelief>
                <UnderlineButton onClick={() => update({ avatarTraits: saved.avatarTraits })}>{t("reset")}</UnderlineButton>
              </>
            ) : (
              upload && (
                <>
                  <SmallRelief onClick={() => fileInput.current?.click()} disabled={uploading}>
                    {uploading ? t("uploading") : t("replace")}
                  </SmallRelief>
                  <UnderlineButton onClick={() => update({ avatarPath: null })}>{t("remove")}</UnderlineButton>
                </>
              )
            )}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          {form.avatarMode === "generated" && (
            <div className="grid gap-1 lg:grid-cols-2">
              {TRAIT_KEYS.map((key) => {
                const [min, max] = TRAIT_RANGES[key];
                const part = t(`parts.${key}`);
                return (
                  <div key={key} className="flex h-12 items-center justify-between gap-2 bg-crown-velvet pr-0.5 pl-3.5">
                    <div className="min-w-0 text-14 font-bold">{part}</div>
                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={() => stepTrait(key, -1)}
                        aria-label={`${t("prev")}: ${part}`}
                        className="flex size-11 items-center justify-center hover:bg-crown-hall focus-visible:outline-offset-[-2px]"
                      >
                        <Arrow direction="left" scale={2} />
                      </button>
                      <div aria-live="polite" className="w-11 text-center font-pixel text-14 font-medium">
                        {form.avatarTraits[key] - min + 1}/{max - min + 1}
                      </div>
                      <button
                        type="button"
                        onClick={() => stepTrait(key, 1)}
                        aria-label={`${t("next")}: ${part}`}
                        className="flex size-11 items-center justify-center hover:bg-crown-hall focus-visible:outline-offset-[-2px]"
                      >
                        <Arrow direction="right" scale={2} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {emptyUpload && (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void sendFile(e.dataTransfer.files[0]);
              }}
              aria-describedby={`${uid}-upmsg`}
              disabled={uploading}
              className="flex min-h-37 w-full flex-col items-center justify-center gap-1.5 border-2 border-dashed border-crown-stone p-5 text-center hover:border-crown-stone-hi hover:bg-crown-velvet"
            >
              <span className="text-16 font-bold underline underline-offset-4">{uploading ? t("uploading") : t("upChoose")}</span>
              <span className="text-14 text-crown-muted">{t("upDrop")}</span>
              <span className="text-12 text-crown-muted">{t("upRules")}</span>
            </button>
          )}
          {form.avatarMode === "upload" && upload && (
            <div className="flex flex-col gap-2">
              <div className="text-14 font-bold">{t("upShowAs")}</div>
              <Segmented
                label={t("upShowAs")}
                value={form.avatarPixelated ? "pix" : "asis"}
                options={[
                  { value: "pix", label: t("upPix") },
                  { value: "asis", label: t("upAsIs") },
                ]}
                onChange={(v) => update({ avatarPixelated: v === "pix" })}
              />
              <div className="text-12 leading-[1.45] [overflow-wrap:anywhere] text-crown-muted">
                {form.avatarPixelated ? t("upNotePix", { name: upload.name }) : t("upNoteAsIs", { name: upload.name })}
              </div>
            </div>
          )}
          {upErrorText && <ErrorLine id={`${uid}-upmsg`}>{upErrorText}</ErrorLine>}
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        tabIndex={-1}
        aria-hidden
        className="hidden"
        onChange={(e) => {
          void sendFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </>,
  );

  // "Taken" is a live check, shown as soon as the answer arrives.
  const liveTaken = nameTaken && trimmedName !== saved.name;
  const nameError = visible("name") || serverErrors.name || liveTaken ? errorOf("name") : null;
  const identitySection = section(
    "identity",
    false,
    <>
      <h2 className="text-20 font-bold">{t("secId")}</h2>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={`${uid}-name`} className="text-14 font-bold">
            {common("nameL")}
          </label>
          <div className="font-pixel text-12 font-medium text-crown-muted">{form.name.length}/24</div>
        </div>
        <input
          id={`${uid}-name`}
          value={form.name}
          onChange={(e) => {
            setNameTaken(false);
            update({ name: e.target.value.slice(0, 24) }, ["name"]);
          }}
          onBlur={touch("name")}
          readOnly={settings.nameChangeAt !== null}
          maxLength={24}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={nameError !== null}
          aria-describedby={`${uid}-name-msg`}
          className={fieldClass(nameError !== null || (phase === "rejected" && rejection?.field === "name"))}
        />
        {nameError ? (
          <ErrorLine id={`${uid}-name-msg`}>{nameError}</ErrorLine>
        ) : (
          <Help id={`${uid}-name-msg`}>{cooldownDate ? t("nameCooldown", { date: cooldownDate }) : t("nameHelp")}</Help>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${uid}-country`} className="text-14 font-bold">
          {common("countryL")}
        </label>
        <div className="relative">
          <select
            id={`${uid}-country`}
            value={form.country ?? ""}
            onChange={(e) => update({ country: e.target.value || null })}
            aria-describedby={`${uid}-country-msg`}
            className="h-13 w-full cursor-pointer appearance-none rounded-none bg-crown-velvet pr-12 pl-14 text-16 shadow-inset-field focus-visible:outline-offset-2"
          >
            <option value="">{t("noCountry")}</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute top-4.5 left-4.5">
            {form.country ? <Flag code={form.country} /> : <span className="block h-4 w-6 bg-crown-stone" />}
          </span>
          <span className="pointer-events-none absolute top-5.25 right-4.5 text-crown-muted">
            <Icon name="chev" size={16} height={10} />
          </span>
        </div>
        <Help id={`${uid}-country-msg`}>{t("countryHelp")}</Help>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={`${uid}-link`} className="text-14 font-bold">
            {t("linkL")}
          </label>
          <div className="text-12 text-crown-muted">{t("optional")}</div>
        </div>
        <input
          id={`${uid}-link`}
          value={form.link}
          onChange={(e) => update({ link: e.target.value.slice(0, 80) }, ["link"])}
          onBlur={touch("link")}
          maxLength={80}
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          placeholder={t("linkPh")}
          aria-invalid={visible("link")}
          aria-describedby={`${uid}-link-msg`}
          className={fieldClass(visible("link") || (phase === "rejected" && rejection?.field === "link"))}
        />
        {visible("link") ? <ErrorLine id={`${uid}-link-msg`}>{errorOf("link")}</ErrorLine> : <Help id={`${uid}-link-msg`}>{t("linkHelp")}</Help>}
      </div>
    </>,
    "gap-5",
  );

  const socialsSection = section(
    "socials",
    false,
    <>
      {heading(t("secSoc"), t("socHelp"))}
      <div className="grid gap-x-4 gap-y-5 lg:grid-cols-2">
        {SOCIAL_KEYS.map((key) => {
          const field = `soc_${key}` as const;
          const bad = visible(field);
          return (
            <div key={key} className="flex min-w-0 flex-col gap-2">
              <label htmlFor={`${uid}-${field}`} className="flex items-center gap-2 text-14 font-bold">
                <SocialIcon platform={key} size={16} />
                {social(`${key}.name`)}
              </label>
              <div className={`flex h-13 items-stretch bg-crown-velvet ${bad ? "shadow-inset-field-error" : "shadow-inset-field"}`}>
                <div aria-hidden className="flex flex-none items-center pl-4 text-14 whitespace-nowrap text-crown-muted">
                  {PLATFORMS[key].host}
                </div>
                <input
                  id={`${uid}-${field}`}
                  value={form.socials[key]}
                  onChange={(e) => update({ socials: { ...form.socials, [key]: e.target.value } }, [field])}
                  onBlur={touch(field)}
                  maxLength={120}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={key === "web" ? t("linkPh") : t("socPh")}
                  aria-invalid={bad}
                  aria-describedby={bad ? `${uid}-${field}-msg` : undefined}
                  className="h-13 min-w-0 flex-1 bg-transparent pr-4 pl-0.5 text-16 placeholder:text-crown-muted focus-visible:outline-offset-[-2px]"
                />
              </div>
              {bad && <ErrorLine id={`${uid}-${field}-msg`}>{errorOf(field)}</ErrorLine>}
            </div>
          );
        })}
      </div>
    </>,
    "gap-5",
  );

  const full = form.showcase.length >= 3;
  const showcaseSection = section(
    "showcase",
    false,
    <>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-20 font-bold">{t("secShow")}</h2>
          <div className="font-pixel text-14 font-medium">{t("showCount", { count: form.showcase.length })}</div>
        </div>
        <div className="text-14 leading-body text-pretty text-crown-muted">{t("showHelp")}</div>
      </div>
      <div className="grid grid-cols-3 gap-1 lg:grid-cols-5">
        {settings.earned.map((m) => {
          const index = form.showcase.indexOf(m.code);
          const selected = index >= 0;
          const disabled = !selected && full;
          const name = medals(`${MEDAL_KEY[m.code]}.name`);
          return (
            <button
              key={m.code}
              type="button"
              aria-pressed={selected}
              aria-disabled={disabled}
              aria-label={selected ? t("inShow", { name, position: index + 1 }) : t("notShow", { name })}
              onClick={() => {
                if (selected) update({ showcase: form.showcase.filter((c) => c !== m.code) });
                else if (!full) update({ showcase: [...form.showcase, m.code] });
              }}
              className={`relative flex min-h-28 min-w-0 flex-col items-center gap-2 px-2 pt-3.5 pb-3 hover:bg-crown-hall ${
                selected ? "bg-crown-hall shadow-[inset_0_0_0_2px_var(--crown-text)]" : "bg-crown-velvet"
              } ${disabled ? "text-crown-muted" : ""}`}
            >
              <span style={{ opacity: disabled ? 0.45 : 1 }}>
                <Medal code={m.code} on scale={2} />
              </span>
              <span className="text-center text-12 leading-[1.3] font-bold">{name}</span>
              {selected && (
                <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center bg-crown-text font-pixel text-12 font-bold text-crown-ink">
                  {index + 1}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {full && <div className="text-12 leading-[1.45] text-crown-muted">{t("showFull")}</div>}
    </>,
  );

  const privacySection = section(
    "privacy",
    false,
    <>
      <h2 className="mb-1 text-20 font-bold">{t("secPriv")}</h2>
      <Switch id={`${uid}-rival`} on={form.showRival} title={t("rival")} desc={t("rivalD")} onToggle={() => update({ showRival: !form.showRival })} />
      <Switch id={`${uid}-chron`} on={form.showChronicle} title={t("chron")} desc={t("chronD")} onToggle={() => update({ showChronicle: !form.showChronicle })} />
    </>,
    "gap-3",
  );

  const priceBad = visible("price");
  const alertsSection = section(
    "alerts",
    false,
    <>
      <div className="flex flex-col gap-1.5 pb-1">
        <h2 className="text-20 font-bold">{t("secAl")}</h2>
        <div className="text-14 leading-body text-crown-muted">{t("alHelp", { email: maskEmail(settings.email) })}</div>
      </div>
      <Switch id={`${uid}-dethr`} on={form.alertsDethroned} title={t("dethr")} desc={t("dethrD")} onToggle={() => update({ alertsDethroned: !form.alertsDethroned })} />
      <Switch id={`${uid}-priceon`} on={form.priceOn} title={t("price")} desc={t("priceD")} onToggle={() => update({ priceOn: !form.priceOn }, ["price"])}>
        {form.priceOn && (
          <div className="flex flex-col gap-2">
            <label htmlFor={`${uid}-price`} className="text-12 font-bold">
              {t("priceL")}
            </label>
            <div
              className={`flex h-13 w-40 items-stretch bg-crown-ink ${priceBad ? "shadow-[inset_0_0_0_2px_var(--crown-danger)]" : "shadow-[inset_0_0_0_2px_var(--crown-hall)]"}`}
            >
              <div aria-hidden className="flex items-center pl-4 font-pixel text-20 font-bold text-crown-muted">
                $
              </div>
              <input
                id={`${uid}-price`}
                value={form.price}
                onChange={(e) => update({ price: e.target.value.replace(/[^\d]/g, "").slice(0, 3) }, ["price"])}
                onBlur={touch("price")}
                inputMode="numeric"
                maxLength={3}
                autoComplete="off"
                aria-invalid={priceBad}
                aria-describedby={`${uid}-price-msg`}
                className="h-13 min-w-0 flex-1 bg-transparent pr-3 pl-1 font-pixel text-20 font-bold focus-visible:outline-offset-[-2px]"
              />
            </div>
            {priceBad ? <ErrorLine id={`${uid}-price-msg`}>{errorOf("price")}</ErrorLine> : <Help id={`${uid}-price-msg`}>{priceNote}</Help>}
          </div>
        )}
      </Switch>
      <Switch
        id={`${uid}-season`}
        on={form.alertsSeasonStart}
        title={t("season")}
        desc={t("seasonD")}
        onToggle={() => update({ alertsSeasonStart: !form.alertsSeasonStart })}
      />
    </>,
    "gap-3",
  );

  const signOut = (
    <form action="/auth/sign-out" method="post">
      <input type="hidden" name="next" value={`/${locale}`} />
      <button type="submit" className="hit-area min-h-11 text-14 font-bold underline decoration-crown-stone-hi underline-offset-4">
        {login("signOut")}
      </button>
    </form>
  );

  const languageSection = section(
    "language",
    false,
    <>
      {heading(t("secLang"), t("langHelp"))}
      <Segmented
        label={t("secLang")}
        value={form.locale}
        wide
        options={[
          { value: "en", label: "English", lang: "en" },
          { value: "es", label: "Español", lang: "es" },
        ]}
        onChange={(l) => update({ locale: l })}
      />
      <div className="pt-4 lg:hidden">{signOut}</div>
    </>,
    "gap-3.5",
  );

  // ---- Preview (desktop) ----
  const previewLink = form.link.trim() && !problems.some((p) => p.field === "link") ? displayLink(mainLinkUrl(form.link) ?? "") : "";
  const previewSocials = SOCIAL_KEYS.flatMap((k) => {
    const url = form.socials[k].trim() && isValidSocial(k, form.socials[k]) ? socialUrl(k, form.socials[k]) : null;
    return url ? [{ key: k, url }] : [];
  });
  const preview = (
    <div className="flex flex-col gap-4 bg-crown-velvet p-6">
      <div className="flex items-center gap-4">
        <Portrait avatar={avatar} rank={settings.rank} season={season.id} crown={false} scale={3} />
        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="text-24 leading-tight font-bold [overflow-wrap:anywhere]">{form.name.trim() || "—"}</div>
          <div className="flex flex-wrap items-center gap-2">
            <Flag code={form.country} />
            <RankTag rank={settings.rank} label={rankName(settings.rank)} />
          </div>
        </div>
      </div>
      {previewLink && (
        <div className="text-16 font-bold [overflow-wrap:anywhere] underline decoration-crown-stone decoration-2 underline-offset-[5px]">{previewLink}</div>
      )}
      {previewSocials.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {previewSocials.map(({ key, url }) => (
            <div key={key} title={`${social(`${key}.name`)}: ${socialLabel(key, url)}`} className="flex size-11 items-center justify-center bg-crown-hall">
              <SocialIcon platform={key} size={20} />
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 gap-1">
        {[0, 1, 2].map((i) => {
          const code = form.showcase[i];
          const medal = settings.earned.find((m) => m.code === code);
          return (
            <div
              key={i}
              className={`flex h-18 items-center justify-center bg-crown-ink ${medal ? "" : "border-2 border-dashed border-crown-stone"}`}
              style={medal ? { boxShadow: `inset 0 4px 0 ${rarityColor(medal.rarity, medal.seasonId)}` } : undefined}
            >
              {medal && <Medal code={medal.code} on scale={2} />}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-crown-ink">
      {/* Mobile header: back to the profile and the page title. */}
      <header className="grid h-14 grid-cols-[44px_minmax(0,1fr)_44px] items-center bg-crown-velvet px-1 shadow-bar-bottom lg:hidden">
        <Link href={`/u/${saved.name.toLowerCase()}`} aria-label={t("back")} className="flex size-11 items-center justify-center hover:bg-crown-hall">
          <Arrow direction="left" scale={2} />
        </Link>
        <h1 className="text-center text-16 font-bold">{t("title")}</h1>
        <div />
      </header>
      <div className="hidden lg:block">
        <TopBar season={season} now={now} />
      </div>

      <div className="flex flex-1 items-start">
        <nav aria-label={t("title")} className="sticky top-0 hidden w-60 flex-none flex-col gap-1 self-stretch px-6 py-10 shadow-[inset_-4px_0_0_var(--crown-velvet)] lg:flex">
          <Link href={`/u/${saved.name.toLowerCase()}`} className="mb-4 flex min-h-11 items-center gap-2.5 self-start text-14 font-bold hover:underline">
            <Arrow direction="left" scale={1} />
            {t("back")}
          </Link>
          {SECTIONS.map((s) => {
            const count = (s.fields as readonly FieldKey[]).filter((f) => visible(f)).length;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => go(`${uid}-${s.id}`)}
                className="flex h-11 items-center justify-between gap-2 px-3 text-left text-14 font-medium hover:bg-crown-velvet focus-visible:outline-offset-[-2px]"
              >
                <span>{t(s.label)}</span>
                {count > 0 && (
                  <span className="flex items-center gap-1.5 text-12 font-bold">
                    <span className="flex size-4 items-center justify-center bg-crown-danger text-crown-ink">
                      <Icon name="bang" size={8} />
                    </span>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
          <div className="mt-6 px-3">{signOut}</div>
        </nav>

        <main className="min-w-0 flex-1 pb-28 lg:pb-0">
          <div className="mx-auto flex flex-col px-4 lg:max-w-[800px] lg:px-12 lg:pt-10">
            <div className="hidden flex-col gap-1.5 pb-3 lg:flex">
              <h1 className="text-40 leading-tight font-bold">{t("title")}</h1>
              <div className="text-14 text-crown-muted">{t("titleSub")}</div>
            </div>
            {banners}
            {avatarSection}
            {identitySection}
            {socialsSection}
            {showcaseSection}
            {privacySection}
            {alertsSection}
            {languageSection}
          </div>
        </main>

        <aside
          aria-label={t("preview")}
          className="sticky top-0 hidden h-[calc(100dvh-72px)] w-100 flex-none flex-col gap-4 px-8 pt-10 pb-8 shadow-[inset_4px_0_0_var(--crown-velvet)] lg:flex"
        >
          <div className="flex flex-col gap-1">
            <div className="text-14 font-bold">{t("preview")}</div>
            <div className="text-12 text-crown-muted">{t("previewNote")}</div>
          </div>
          {preview}
          <div className="flex-1" />
          {statusLine("desktop")}
          <div className="flex items-center gap-3">
            {saveButton("desktop")}
            {discardButton("desktop")}
          </div>
        </aside>
      </div>

      {/* Mobile save bar */}
      <div className="fixed inset-x-0 bottom-0 z-10 flex items-center gap-2 bg-crown-velvet px-4 pt-3 pb-4 shadow-[inset_0_4px_0_var(--crown-ink)] lg:hidden">
        {statusLine("mobile")}
        {discardButton("mobile")}
        {saveButton("mobile")}
      </div>
    </div>
  );
}
