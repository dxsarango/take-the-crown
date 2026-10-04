"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";
import type { LockFailure, LockField, LockOutcome } from "@/lib/locks/outcome";

export type Draft = {
  name: string;
  email: string;
  link: string;
  message: string;
  country: string | null;
  avatarSeed: string;
};

export type PaymentPhase =
  | { kind: "form"; failure?: LockFailure }
  | { kind: "submitting" }
  | { kind: "checkout"; lockId: string; priceCents: number; expiresAt: string; paying: boolean; moderationPending: boolean }
  | { kind: "verify"; email: string }
  | { kind: "success"; crownedAt: number; moderationPending: boolean };

/** How the modal ended, so the home can show the matching state. */
export type PaymentResult = "crowned" | "payment_failed" | "lock_expired" | "closed";

const DRAFT_KEY = "crown:payment-draft";
const POLL_MS = 1000;

export function newAvatarSeed(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function saveDraft(draft: Draft): void {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Private mode: resuming after the magic link just starts from an empty form.
  }
}

export function takeDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    sessionStorage.removeItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export function releaseLock(lockId: string): void {
  void fetch(`/api/locks/${lockId}/release`, { method: "POST", keepalive: true }).catch(() => undefined);
}

/** Back from a redirect checkout (Dodo): the lock, and the status the provider put in the URL. */
export type CheckoutReturn = { lockId: string; status: string | null };

type Options = {
  locale: string;
  now: number;
  onDone: (result: PaymentResult) => void;
  returning?: CheckoutReturn | null;
};

/** The payment flow: lock on submit, checkout, then wait for the webhook to crown the buyer. */
export function usePayment({ locale, now, onDone, returning = null }: Options) {
  const [phase, setPhase] = useState<PaymentPhase>(returning ? { kind: "submitting" } : { kind: "form" });
  const finish = useEffectEvent((result: PaymentResult) => onDone(result));

  // Back from the provider's page: pick the lock up again and wait for its webhook like an overlay.
  const returnedLock = returning?.lockId ?? null;
  const returnedStatus = returning?.status ?? null;
  useEffect(() => {
    if (!returnedLock) return;
    if (returnedStatus === "failed" || returnedStatus === "cancelled") {
      releaseLock(returnedLock);
      finish("payment_failed");
      return;
    }
    void fetch(`/api/locks/${returnedLock}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ status: string; expiresAt?: string; priceCents?: number }>)
      .then((lock) => {
        if (lock.status === "applied") setPhase({ kind: "success", crownedAt: Date.now(), moderationPending: false });
        else if (lock.status === "active" && lock.expiresAt && lock.priceCents)
          setPhase({ kind: "checkout", lockId: returnedLock, priceCents: lock.priceCents, expiresAt: lock.expiresAt, paying: true, moderationPending: false });
        else finish("lock_expired");
      })
      .catch(() => finish("payment_failed"));
  }, [returnedLock, returnedStatus]);

  const submit = useCallback(
    async (draft: Draft, consent: { acceptWithdrawal: boolean; turnstileToken: string | null }) => {
      setPhase({ kind: "submitting" });
      let outcome: LockOutcome;
      try {
        const response = await postJson("/api/locks", {
          name: draft.name.trim(),
          email: draft.email.trim() || undefined,
          link: draft.link.trim() || undefined,
          message: draft.message.trim() || undefined,
          country: draft.country,
          avatarSeed: draft.avatarSeed,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          locale,
          acceptWithdrawal: consent.acceptWithdrawal,
          turnstileToken: consent.turnstileToken ?? undefined,
        });
        outcome = (await response.json()) as LockOutcome;
      } catch {
        outcome = { ok: false, error: "unknown" };
      }

      if (!outcome.ok) return setPhase({ kind: "form", failure: outcome });
      if ("verifyEmail" in outcome) {
        saveDraft(draft);
        return setPhase({ kind: "verify", email: draft.email.trim() });
      }
      if (outcome.checkout.mode === "redirect") {
        // The success screen after the provider's page shows what the buyer typed.
        saveDraft(draft);
        window.location.assign(outcome.checkout.url);
        return;
      }
      setPhase({
        kind: "checkout",
        lockId: outcome.lockId,
        priceCents: outcome.priceCents,
        expiresAt: outcome.expiresAt,
        paying: false,
        moderationPending: outcome.moderationPending,
      });
    },
    [locale],
  );

  /** Test provider overlay: pay or decline. */
  const payTest = useCallback(async () => {
    if (phase.kind !== "checkout") return;
    setPhase({ ...phase, paying: true });
    const response = await postJson("/api/test-provider/pay", { lockId: phase.lockId }).catch(() => null);
    if (!response?.ok) {
      releaseLock(phase.lockId);
      onDone("payment_failed");
    }
  }, [phase, onDone]);

  const decline = useCallback(() => {
    if (phase.kind !== "checkout") return;
    releaseLock(phase.lockId);
    onDone("payment_failed");
  }, [phase, onDone]);

  const close = useCallback(() => {
    if (phase.kind === "checkout" && !phase.paying) releaseLock(phase.lockId);
    onDone(phase.kind === "success" ? "crowned" : "closed");
  }, [phase, onDone]);

  // While checkout is open, follow the lock until the webhook crowns the buyer or it runs out.
  const lockId = phase.kind === "checkout" ? phase.lockId : null;
  useEffect(() => {
    if (!lockId) return;
    let stopped = false;
    const poll = async () => {
      const response = await fetch(`/api/locks/${lockId}`, { cache: "no-store" }).catch(() => null);
      const body = response?.ok ? ((await response.json()) as { status: string }) : null;
      if (stopped || !body) return;
      if (body.status === "applied") {
        setPhase((p) => ({ kind: "success", crownedAt: Date.now(), moderationPending: p.kind === "checkout" && p.moderationPending }));
      }
      else if (body.status === "refunded" || body.status === "expired") finish("lock_expired");
    };
    const timer = setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [lockId]);

  // The countdown is the lock: when it runs out before payment, the crown opens up again.
  const expired = phase.kind === "checkout" && !phase.paying && new Date(phase.expiresAt).getTime() <= now;
  useEffect(() => {
    if (expired && phase.kind === "checkout") {
      releaseLock(phase.lockId);
      finish("lock_expired");
    }
  }, [expired, phase]);

  const clearFailure = useCallback((field?: LockField) => {
    setPhase((p) => {
      if (p.kind !== "form" || !p.failure) return p;
      const failure = p.failure;
      const touched =
        field &&
        ((failure.error === "moderation_rejected" && failure.field === field) ||
          (failure.error === "invalid_input" && failure.fields.includes(field)));
      return touched ? { kind: "form" } : p;
    });
  }, []);

  return { phase, submit, payTest, decline, close, clearFailure };
}
