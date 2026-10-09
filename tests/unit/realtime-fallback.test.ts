import { createClient } from "@supabase/supabase-js";
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_REFRESH_MS, type RealtimeStatus, realtimeFallback } from "@/lib/home/realtime-fallback";

describe("realtimeFallback", () => {
  let refresh: Mock<() => void>;
  let visible: boolean;
  beforeEach(() => {
    vi.useFakeTimers();
    refresh = vi.fn<() => void>();
    visible = true;
  });
  afterEach(() => vi.useRealTimers());
  const start = () => realtimeFallback(refresh, () => visible);

  it.each<RealtimeStatus>(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"])("refreshes every 30 s once the channel reports %s", (status) => {
    const fallback = start();
    fallback.onStatus(status);
    vi.advanceTimersByTime(FALLBACK_REFRESH_MS - 1);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(FALLBACK_REFRESH_MS * 2);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("does not stack timers when the library retries and fails again", () => {
    const fallback = start();
    for (const status of ["TIMED_OUT", "CHANNEL_ERROR", "TIMED_OUT"] as const) fallback.onStatus(status);
    vi.advanceTimersByTime(FALLBACK_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("stops once the channel is subscribed, and starts again if it drops", () => {
    const fallback = start();
    fallback.onStatus("CHANNEL_ERROR");
    fallback.onStatus("SUBSCRIBED");
    vi.advanceTimersByTime(FALLBACK_REFRESH_MS * 3);
    expect(refresh).not.toHaveBeenCalled();
    fallback.onStatus("CLOSED");
    vi.advanceTimersByTime(FALLBACK_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does nothing while the tab is hidden", () => {
    const fallback = start();
    fallback.onStatus("TIMED_OUT");
    visible = false;
    vi.advanceTimersByTime(FALLBACK_REFRESH_MS * 2);
    expect(refresh).not.toHaveBeenCalled();
    visible = true;
    vi.advanceTimersByTime(FALLBACK_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("ignores the channel closing after the page is gone", () => {
    const fallback = start();
    fallback.onStatus("CHANNEL_ERROR");
    fallback.stop();
    fallback.onStatus("CLOSED");
    vi.advanceTimersByTime(FALLBACK_REFRESH_MS * 3);
    expect(refresh).not.toHaveBeenCalled();
  });
});

// The same page code, driven by the real client library against servers that turn it away.
describe("with the real realtime client", () => {
  type Behaviour = "refuse the socket" | "answer the join with an error" | "never answer";

  function fakeSocket(behaviour: Behaviour) {
    return class FakeSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      readyState = 0;
      binaryType = "arraybuffer";
      onopen: ((e: unknown) => void) | null = null;
      onclose: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      constructor() {
        setTimeout(() => {
          if (behaviour === "refuse the socket") {
            this.readyState = 3;
            this.onerror?.({ message: "connection refused" });
            this.onclose?.({ code: 1006, reason: "" });
          } else {
            this.readyState = 1;
            this.onopen?.({});
          }
        }, 5);
      }
      send(data: string) {
        if (behaviour !== "answer the join with an error") return;
        const [joinRef, ref, topic, event] = JSON.parse(data) as [string, string, string, string];
        if (event !== "phx_join") return;
        const reply = [joinRef, ref, topic, "phx_reply", { status: "error", response: { reason: "ConnectionRateLimitReached" } }];
        setTimeout(() => this.onmessage?.({ data: JSON.stringify(reply) }), 5);
      }
      close() {
        this.readyState = 3;
        this.onclose?.({ code: 1000, reason: "" });
      }
    };
  }

  async function statusesSeen(behaviour: Behaviour): Promise<RealtimeStatus[]> {
    const db = createClient("http://127.0.0.1:1", "anon-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: fakeSocket(behaviour) as never, timeout: 200 },
    });
    const seen: RealtimeStatus[] = [];
    const channel = db
      .channel("home")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "crown_state" }, () => undefined)
      .subscribe((status) => seen.push(status), 200);
    await new Promise((resolve) => setTimeout(resolve, 900));
    await db.removeChannel(channel);
    return seen;
  }

  it.each<Behaviour>(["refuse the socket", "answer the join with an error", "never answer"])("starts the fallback when the server will %s", async (behaviour) => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const refresh = vi.fn<() => void>();
      const fallback = realtimeFallback(refresh, () => true);
      const seen = await statusesSeen(behaviour);
      for (const status of seen) fallback.onStatus(status);
      expect(seen.length).toBeGreaterThan(0);
      expect(seen).not.toContain("SUBSCRIBED");
      vi.advanceTimersByTime(FALLBACK_REFRESH_MS);
      expect(refresh).toHaveBeenCalledTimes(1);
      fallback.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
