"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/art";
import { useAuth } from "@/components/auth/auth-provider";
import { useHumanCheck } from "@/components/security/human-check";
import type { King } from "@/lib/home/data";
import { useLiveHails } from "./use-live-hails";

type Outcome = "hailed" | "limit" | "rate" | "human" | "ended" | "self" | "error";

// The reign this browser last hailed: a reload shows the same state without asking the server, and
// the page's two panels (phone and desktop layouts) agree on it.
const STORAGE_KEY = "hailed-reign";
const listeners = new Set<() => void>();
let hailedInMemory: number | null = null;

function storedReign(): number | null {
  if (hailedInMemory !== null) return hailedInMemory;
  try {
    const value = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function remember(reignId: number) {
  hailedInMemory = reignId;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(reignId));
  } catch {
    // The server still refuses a second hail.
  }
  listeners.forEach((listener) => listener());
}

function subscribeToHailed(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

async function postHail(reignId: number, turnstileToken: string | null): Promise<{ outcome: Outcome; hails: number | null }> {
  try {
    const response = await fetch("/api/hails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reignId, turnstileToken }),
    });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; status?: string; error?: string; hails?: number } | null;
    const hails = typeof body?.hails === "number" ? body.hails : null;
    if (body?.ok) return { outcome: body.status === "own_reign" ? "self" : "hailed", hails };
    switch (body?.error) {
      case "ip_limit":
        return { outcome: "limit", hails };
      case "rate_limited":
        return { outcome: "rate", hails };
      case "human_check_failed":
        return { outcome: "human", hails };
      case "not_current":
        return { outcome: "ended", hails };
      default:
        return { outcome: "error", hails };
    }
  } catch {
    return { outcome: "error", hails: null };
  }
}

/**
 * Mounted only once the visitor taps the button, so the bot check (Cloudflare's script) is not
 * loaded for everyone who just looks. Sends the hail as soon as the check has a token.
 */
function HailSubmit({ reignId, onDone }: { reignId: number; onDone: (outcome: Outcome, hails: number | null) => void }) {
  const human = useHumanCheck("hail");
  const sent = useRef(false);
  const { ready, token } = human;
  useEffect(() => {
    if (!ready || sent.current) return;
    sent.current = true;
    void postHail(reignId, token).then((result) => onDone(result.outcome, result.hails));
  }, [ready, token, reignId, onDone]);
  return human.widget;
}

const BUTTON =
  "hit-area m-1 flex h-12 items-center justify-center gap-2.5 bg-crown-hall px-4 text-16 font-bold shadow-relief hover:bg-crown-stone focus-visible:outline-offset-[6px] active:bg-crown-velvet active:shadow-relief-pressed disabled:cursor-default disabled:text-crown-muted disabled:hover:bg-crown-hall disabled:active:shadow-relief";

/**
 * Hailing the king: free for anyone, no account needed. The count is live; the king themselves
 * sees the count only.
 */
export function HailPanel({ king }: { king: King }) {
  const t = useTranslations("home.hail");
  const { viewer } = useAuth();
  const hails = useLiveHails(king.reignId, king.hails);
  const [engaged, setEngaged] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [reported, setReported] = useState(0);
  const remembered = useSyncExternalStore(subscribeToHailed, storedReign, () => null) === king.reignId;

  const done = useCallback(
    (result: Outcome, count: number | null) => {
      setEngaged(false);
      setOutcome(result);
      if (count !== null) setReported(count);
      if (result === "hailed") remember(king.reignId);
    },
    [king.reignId],
  );

  const isKing = viewer?.profileId === king.profileId;
  const hailed = remembered || outcome === "hailed";
  const sending = engaged;
  const failure = outcome !== null && outcome !== "hailed" ? outcome : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {!isKing && (
          <button
            type="button"
            disabled={hailed || sending}
            onClick={() => {
              setOutcome(null);
              setEngaged(true);
            }}
            className={BUTTON}
          >
            {hailed ? (
              <Icon name="check" size={16} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- pixel art must not be resampled by next/image
              <img src="/art/crowns/icon-16.svg" width={32} height={32} alt="" className="block flex-none [image-rendering:pixelated]" />
            )}
            {hailed ? t("done") : sending ? t("sending") : t("button")}
          </button>
        )}
        <p aria-label={t("countLabel")} className="text-14 text-crown-muted tabular-nums">
          {t("count", { count: Math.max(hails, reported) })}
        </p>
      </div>
      {engaged && <HailSubmit reignId={king.reignId} onDone={done} />}
      {failure && (
        <div role="alert" className="flex items-start gap-3 bg-crown-velvet px-3.5 py-3 shadow-flag-danger lg:max-w-[400px]">
          <span className="flex size-6 flex-none items-center justify-center bg-crown-danger text-crown-ink">
            <Icon name="bang" size={16} />
          </span>
          <p className="text-14 leading-snug">{t(failure)}</p>
        </div>
      )}
    </div>
  );
}
