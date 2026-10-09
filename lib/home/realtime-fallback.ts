/** What a realtime subscription reports (supabase-js `REALTIME_SUBSCRIBE_STATES`). */
export type RealtimeStatus = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";

/** While realtime is down (plan limit reached, network trouble), look again this often. */
export const FALLBACK_REFRESH_MS = 30_000;

/**
 * Keeps a page current while its realtime channel is not working. Whatever way Supabase turns a
 * connection away reaches the page as one of three states: the join is refused with an error
 * (channel or join rate limit: CHANNEL_ERROR), the server never answers or refuses the socket
 * (connection limit: TIMED_OUT, or CHANNEL_ERROR when the socket errors), or it drops an open
 * channel (CLOSED). The client library retries the join by itself; SUBSCRIBED ends the fallback.
 */
export function realtimeFallback(refresh: () => void, visible: () => boolean = () => document.visibilityState === "visible") {
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  return {
    onStatus(status: RealtimeStatus): void {
      if (stopped) return;
      if (status === "SUBSCRIBED") {
        clearInterval(timer);
        timer = undefined;
      } else {
        timer ??= setInterval(() => {
          if (visible()) refresh();
        }, FALLBACK_REFRESH_MS);
      }
    },
    /** The page is leaving: the channel's own CLOSED must not start the fallback again. */
    stop(): void {
      stopped = true;
      clearInterval(timer);
      timer = undefined;
    },
  };
}
