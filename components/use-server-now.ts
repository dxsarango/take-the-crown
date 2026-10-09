"use client";

import { useSyncExternalStore } from "react";
import { clockOffset } from "@/lib/home/hero";

// One clock for the whole page: a single offset from the server, a single timer, and a component
// re-renders only when the value it reads changes. The timer stops while the tab is hidden.
const TICK_MS = 1000;

let offset = 0;
let synced = false;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

const serverNow = () => Date.now() + offset;
const emit = () => listeners.forEach((listener) => listener());

function startTicking() {
  if (timer === undefined && document.visibilityState === "visible") timer = setInterval(emit, TICK_MS);
}

function stopTicking() {
  clearInterval(timer);
  timer = undefined;
}

function onVisibility() {
  if (document.visibilityState === "visible") {
    emit();
    startTicking();
  } else stopTicking();
}

function syncOffset() {
  if (synced) return;
  synced = true;
  const sentAt = Date.now();
  fetch("/api/time", { cache: "no-store" })
    .then((response) => response.json() as Promise<{ now: number }>)
    .then(({ now }) => {
      offset = clockOffset(sentAt, Date.now(), now);
      emit();
    })
    .catch(() => {
      synced = false;
    });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", onVisibility);
    startTicking();
  }
  syncOffset();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      document.removeEventListener("visibilitychange", onVisibility);
      stopTicking();
    }
  };
}

const floorTo = (ms: number, step: number) => Math.floor(ms / step) * step;

/**
 * Server-corrected clock (SPEC §6), in milliseconds, rounded down to `stepMs` (a second by
 * default). The first render uses the time the data was read, so the server HTML and the first
 * client render match. Ask for the coarsest step you display: a footer year or "5m ago" label
 * has no reason to re-render every second.
 */
export function useServerNow(initial: string, stepMs = TICK_MS): number {
  return useSyncExternalStore(
    subscribe,
    () => floorTo(serverNow(), stepMs),
    () => floorTo(new Date(initial).getTime(), stepMs),
  );
}

/**
 * A value derived from the clock, for components that care about a change rather than the time
 * (whether a lock is still on): it re-renders only when the value changes. `select` must return a
 * primitive.
 */
export function useServerClock<T extends string | number | boolean>(initial: string, select: (now: number) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => select(floorTo(serverNow(), TICK_MS)),
    () => select(floorTo(new Date(initial).getTime(), TICK_MS)),
  );
}
