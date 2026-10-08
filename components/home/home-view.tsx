"use client";

import { useLocale } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { announceReignUnlocks } from "@/components/achievements/unlock-toasts";
import { useAuth } from "@/components/auth/auth-provider";
import { PaymentModal } from "@/components/payment/payment-modal";
import { type CheckoutReturn, type Draft, type PaymentResult, newAvatarSeed, releaseLock, takeDraft } from "@/components/payment/use-payment";
import { TopBar } from "@/components/top-bar";
import type { Monarch } from "@/lib/art/coronation";
import type { HomeData } from "@/lib/home/data";
import { heroState } from "@/lib/home/hero";
import { Coronation } from "./coronation";
import { Hero, type HomeNotice, KingMessage } from "./hero";
import { About, Feed, Footer, HallOfFamePreview, Succession } from "./sections";
import { ThroneScene } from "./throne-scene";
import { useLiveHome, useServerNow } from "./use-live-home";
import { PlayerName } from "@/components/player-name";
import { artSet } from "@/lib/art/seasons";

type Crowning = {
  key: string;
  from: Monarch | null;
  to: Monarch;
  reduced: boolean;
  /** What the page showed before; it stays on screen until the crown lands. */
  before: HomeData;
  landed: boolean;
};

const monarch = (king: Pick<NonNullable<HomeData["king"]>, "avatar" | "rank"> | null | undefined): Monarch | null =>
  king ? { avatar: king.avatar, rank: king.rank } : null;

/**
 * Who handed the crown to the current king, read from the data: the last past reign if it ended the
 * moment this one started (a takeover), none if the throne was empty.
 */
function coronationOf(data: HomeData): Pick<Crowning, "from" | "to"> | null {
  const to = monarch(data.king);
  if (!to || !data.king) return null;
  const last = data.succession[0];
  const handedOver = last?.endedAt != null && new Date(last.endedAt).getTime() === new Date(data.king.startedAt).getTime();
  return { from: handedOver ? monarch(last) : null, to };
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Plays the coronation whenever the reign changes; the new data shows when the crown lands. A buyer
 * whose page never saw the change (back from a redirect checkout, or a missed realtime message)
 * gets it too: `celebrate` plays their reign's coronation once the data has it.
 */
function useCoronation(live: HomeData, refresh: () => void) {
  const [previous, setPrevious] = useState(live);
  const [crowning, setCrowning] = useState<Crowning | null>(null);
  const [played, setPlayed] = useState<number | null>(null);
  const [wanted, setWanted] = useState<number | null>(null);
  const reign = live.crown.currentReignId;

  // Adjusting state while rendering when the live data changes (react.dev: "you might not need an effect").
  if (live !== previous) {
    setPrevious(live);
    const to = monarch(live.king);
    if (to && reign !== previous.crown.currentReignId && !crowning) {
      setPlayed(reign);
      setCrowning({ key: live.readAt, from: monarch(previous.king), to, reduced: prefersReducedMotion(), before: previous, landed: false });
    }
  }
  if (wanted !== null && wanted === reign && played !== reign && !crowning) {
    const pair = coronationOf(live);
    setPlayed(reign);
    if (pair) setCrowning({ key: `celebrate-${reign}`, ...pair, reduced: prefersReducedMotion(), before: live, landed: true });
  }

  const land = useCallback(() => setCrowning((c) => c && { ...c, landed: true }), []);
  const end = useCallback(() => setCrowning(null), []);
  const celebrate = useCallback(
    (reignId: number) => {
      setWanted(reignId);
      if (reignId !== reign) refresh();
    },
    [reign, refresh],
  );
  /** "Watch your coronation": replays the current reign's coronation. */
  const replay = useCallback(() => {
    const pair = coronationOf(live);
    if (pair) setCrowning({ key: String(Date.now()), ...pair, reduced: prefersReducedMotion(), before: live, landed: true });
  }, [live]);

  const shown = crowning && !crowning.landed ? crowning.before : live;
  return { shown, crowning, land, end, replay, celebrate };
}

function emptyDraft(country: string | null): Draft {
  return { name: "", email: "", link: "", message: "", country, avatarSeed: newAvatarSeed() };
}

/** Removes a one-off query parameter and says whether it was there. */
function takeParam(url: URL, key: string): boolean {
  if (!url.searchParams.has(key)) return false;
  url.searchParams.delete(key);
  return true;
}

export function HomeView({ initial }: { initial: HomeData }) {
  const { data: live, refresh } = useLiveHome(initial);
  const now = useServerNow(initial.readAt);
  const { shown: data, crowning, land, end, replay, celebrate } = useCoronation(live, refresh);
  const season = data.season.id;
  const state = heroState(data.crown, data.king?.startedAt ?? null, now);
  const [modal, setModal] = useState<{ draft: Draft; detected: boolean; returning?: CheckoutReturn } | null>(null);
  const [notice, setNotice] = useState<HomeNotice | null>(null);
  const geo = useRef<string | null>(null);
  const prelaunchAtLoad = useRef(initial.crown.prelaunch);
  const { viewer, openLogin } = useAuth();
  const locale = useLocale();

  // The server sets data-season on <html>; keep it in step when a season rolls over live.
  useEffect(() => {
    document.documentElement.dataset.season = String(artSet(season));
  }, [season]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const resume = takeParam(url, "resume");
    // "Take the crown" from another page (the profile's come-back block).
    const take = takeParam(url, "take");
    // Back from the payment provider's page (?lock=…, with Dodo's payment_id and status, or cancelled=1).
    const lockId = url.searchParams.get("lock");
    const status = url.searchParams.get("status");
    const cancelled = takeParam(url, "cancelled");
    for (const key of ["lock", "status", "payment_id", "email"]) url.searchParams.delete(key);
    if (resume || take || lockId) window.history.replaceState(null, "", url);
    if (lockId && /^[0-9a-f-]{36}$/.test(lockId)) {
      const draft = takeDraft() ?? emptyDraft(null);
      if (cancelled) releaseLock(lockId);
      // Opened after the first render, like the other URL-driven dialogs.
      else queueMicrotask(() => setModal({ draft, detected: false, returning: { lockId, status } }));
      return;
    }
    fetch("/api/geo")
      .then((r) => r.json() as Promise<{ country: string | null }>)
      .then((r) => {
        geo.current = r.country;
        // Back from the magic link sent to a known email: reopen the form where the buyer left it.
        const draft = resume ? takeDraft() : null;
        if (draft) setModal({ draft, detected: false });
        // In prelaunch the button says "launching soon"; a link from another page opens nothing.
        else if (take && !prelaunchAtLoad.current) setModal({ draft: emptyDraft(r.country), detected: r.country !== null });
      })
      .catch(() => undefined);
  }, []);

  const openPayment = () => {
    setNotice(null);
    const country = viewer ? viewer.countryCode : geo.current;
    setModal({ draft: emptyDraft(country), detected: !viewer && geo.current !== null });
  };

  /** "Email me a magic link" after paying: the coronation replays, then the sign-in sheet opens. */
  const signInAfterPayment = (draft: Draft) => {
    onPaymentDone("crowned");
    openLogin({ variant: "afterPayment", email: draft.email, avatar: { seed: draft.avatarSeed }, next: `/${locale}` });
  };

  const onPaymentDone = (result: PaymentResult) => {
    setModal(null);
    if (result === "payment_failed" || result === "lock_expired") setNotice(result);
    if (result === "crowned") replay();
  };

  return (
    <div className="flex min-h-dvh flex-col bg-crown-ink">
      <TopBar season={data.season} now={now} heading />
      <main className="flex-1">
        {crowning ? (
          <Coronation
            key={crowning.key}
            season={season}
            from={crowning.from}
            to={crowning.to}
            reduced={crowning.reduced}
            onLand={land}
            onEnd={end}
          />
        ) : (
          <ThroneScene season={season} king={data.king} locked={state.mode === "locked"} />
        )}
        <div aria-live="polite" className="sr-only">
          {data.king && <PlayerName name={data.king.name} />}
        </div>
        <Hero king={data.king} crown={data.crown} state={state} season={season} notice={notice} onTake={openPayment} />
        {data.king && (data.king.message || data.king.link) && (
          <div className="mx-4 flex flex-col gap-2.5 pt-4 pb-6 shadow-[var(--crown-bar-top)] lg:hidden">
            <KingMessage king={data.king} size="mobile" />
          </div>
        )}
        <div className="lg:px-18">
          <Succession reigns={data.succession} season={season} hasKing={data.king !== null} />
          <div className="mx-4 flex flex-col gap-6 py-6 shadow-[var(--crown-bar-top)] lg:mx-0 lg:grid lg:grid-cols-2 lg:items-start lg:gap-16 lg:pt-8 lg:pb-12">
            <HallOfFamePreview hall={data.hallOfFame} season={season} />
            <Feed items={data.feed} now={now} />
          </div>
          <About crown={data.crown} season={data.season} />
        </div>
      </main>
      <Footer season={season} now={now} />
      {modal && (
        <PaymentModal
          season={season}
          priceCents={heroState(live.crown, live.king?.startedAt ?? null, now).priceCents}
          lockSeconds={live.crown.lockSeconds}
          messageMax={live.crown.maxMessageLength}
          now={now}
          initial={modal.draft}
          returning={modal.returning ?? null}
          detectedCountry={modal.detected}
          viewer={viewer}
          onDone={onPaymentDone}
          onCrowned={(reignId) => {
            celebrate(reignId);
            announceReignUnlocks(reignId);
          }}
          onSignIn={signInAfterPayment}
        />
      )}
    </div>
  );
}
