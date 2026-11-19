/** The checkout this browser sent the buyer to, so coming back can resume it instead of locking them out. */
export type PendingCheckout = { lockId: string; url: string; expiresAt: string };

const KEY = "crown:pending-checkout";

/** Reads a stored value; anything malformed or past its expiry is no checkout at all. */
export function parsePending(raw: string | null, nowMs: number): PendingCheckout | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingCheckout> | null;
    if (!value || typeof value.lockId !== "string" || typeof value.url !== "string" || typeof value.expiresAt !== "string") return null;
    if (!(Date.parse(value.expiresAt) > nowMs)) return null;
    if (!/^https:\/\//.test(value.url)) return null;
    return { lockId: value.lockId, url: value.url, expiresAt: value.expiresAt };
  } catch {
    return null;
  }
}

export function savePendingCheckout(pending: PendingCheckout): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(pending));
  } catch {
    // Storage blocked: the buyer just has no resume shortcut.
  }
}

export function readPendingCheckout(nowMs: number): PendingCheckout | null {
  try {
    return parsePending(localStorage.getItem(KEY), nowMs);
  } catch {
    return null;
  }
}

/** With a lock id, only that lock's entry goes: a newer checkout is left alone. */
export function clearPendingCheckout(lockId?: string): void {
  try {
    if (lockId) {
      const stored = parsePending(localStorage.getItem(KEY), 0);
      if (stored && stored.lockId !== lockId) return;
    }
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
