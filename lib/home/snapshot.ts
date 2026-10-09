import { z } from "zod";

/** Catch-up reads (page load, manual refresh) share one snapshot per window. */
export const SNAPSHOT_WINDOW_MS = 5000;

/**
 * Names the home snapshot a client asks for. Every client that hears the same database change
 * (realtime carries its commit time) asks for the same URL, so the CDN answers all of them from one
 * read; a snapshot cached before the change can never be served for it.
 */
export function snapshotVersion(commitTimestamp: string | undefined, now: number): string {
  return commitTimestamp && snapshotVersionSchema.safeParse(commitTimestamp).success ? commitTimestamp : `w${Math.floor(now / SNAPSHOT_WINDOW_MS)}`;
}

export const snapshotVersionSchema = z.string().regex(/^[0-9A-Za-z:.+-]{1,40}$/);
