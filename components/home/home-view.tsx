"use client";

import { useLocale } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { PaymentModal } from "@/components/payment/payment-modal";
import { type Draft, type PaymentResult, newAvatarSeed, takeDraft } from "@/components/payment/use-payment";
import { TopBar } from "@/components/top-bar";
import type { Monarch } from "@/lib/art/coronation";
import type { HomeData } from "@/lib/home/data";
import { heroState } from "@/lib/home/hero";
import { Coronation } from "./coronation";
import { Hero, type HomeNotice, KingMessage } from "./hero";
import { Feed, Footer, HallOfFamePreview, Succession } from "./sections";
import { ThroneScene } from "./throne-scene";
import { useLiveHome, useServerNow } from "./use-live-home";

type Crowning = {
  key: string;
  from: Monarch | null;
  to: Monarch;
  reduced: boolean;
  /** What the page showed before; it stays on screen until the crown lands. */
  before: HomeData;
  landed: boolean;
};

const monarch = (king: HomeData["king"]): Monarch | null => (king ? { avatar: king.avatar, rank: king.rank } : null);

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Plays the coronation whenever the reign changes; the new data shows when the crown lands. */
function useCoronation(live: HomeData) {
  const [previous, setPrevious] = useState(live);
  const [crowning, setCrowning] = useState<Crowning | null>(null);
  const [lastPair, setLastPair] = useState<Pick<Crowning, "from" | "to"> | null>(null);

  // Adjusting state while rendering when the live data changes (react.dev: "you might not need an effect").
  if (live !== previous) {
    setPrevious(live);
    const to = monarch(live.king);
    if (to && live.crown.currentReignId !== previous.crown.currentReignId && !crowning) {
      const from = monarch(previous.king);
      setLastPair({ from, to });
      setCrowning({ key: live.readAt, from, to, reduced: prefersReducedMotion(), before: previous, landed: false });
    }
  }

  const land = useCallback(() => setCrowning((c) => c && { ...c, landed: true }), []);
  const end = useCallback(() => setCrowning(null), []);
  /** "Watch your coronation": the buyer replays the one that played behind the modal. */
  const replay = useCallback(() => {
    if (lastPair) {
      setCrowning({ key: String(Date.now()), ...lastPair, reduced: prefersReducedMotion(), before: live, landed: true });
    }
  }, [lastPair, live]);

  const shown = crowning && !crowning.landed ? crowning.before : live;
  return { shown, crowning, land, end, replay };
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
  const live = useLiveHome(initial);
  const now = useServerNow(initial.readAt);
  const { shown: data, crowning, land, end, replay } = useCoronation(live);
  const season = data.season.id;
  const state = heroState(data.crown, data.king?.startedAt ?? null, now);
  const [modal, setModal] = useState<{ draft: Draft; detected: boolean } | null>(null);
  const [notice, setNotice] = useState<HomeNotice | null>(null);
  const geo = useRef<string | null>(null);
  const { viewer, openLogin } = useAuth();
  const locale = useLocale();

  // The server sets data-season on <html>; keep it in step when a season rolls over live.
  useEffect(() => {
    document.documentElement.dataset.season = String(season);
  }, [season]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const resume = takeParam(url, "resume");
    // "Take the crown" from another page (the profile's come-back block).
    const take = takeParam(url, "take");
    if (resume || take) window.history.replaceState(null, "", url);
    fetch("/api/geo")
      .then((r) => r.json() as Promise<{ country: string | null }>)
      .then((r) => {
        geo.current = r.country;
        // Back from the magic link sent to a known email: reopen the form where the buyer left it.
        const draft = resume ? takeDraft() : null;
        if (draft) setModal({ draft, detected: false });
        else if (take) setModal({ draft: emptyDraft(r.country), detected: r.country !== null });
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
      <TopBar season={data.season} now={now} />
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
          {data.king?.name}
        </div>
        <Hero king={data.king} crown={data.crown} state={state} season={season} notice={notice} onTake={openPayment} />
        {data.king && (data.king.message || data.king.link) && (
          <div className="mx-4 flex flex-col gap-2.5 pt-4 pb-6 shadow-[var(--crown-bar-top)] lg:hidden">
            <KingMessage king={data.king} size="mobile" />
          </div>
        )}
        <div className="lg:px-18">
          <Succession reigns={data.succession} season={season} />
          <div className="mx-4 flex flex-col gap-6 py-6 shadow-[var(--crown-bar-top)] lg:mx-0 lg:grid lg:grid-cols-2 lg:items-start lg:gap-16 lg:pt-8 lg:pb-12">
            <HallOfFamePreview hall={data.hallOfFame} season={season} />
            <Feed items={data.feed} now={now} />
          </div>
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
          detectedCountry={modal.detected}
          viewer={viewer}
          onDone={onPaymentDone}
          onSignIn={signInAfterPayment}
        />
      )}
    </div>
  );
}
