"use client";

import { useLocale } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { HumanAction } from "@/lib/security/human-action";

type Turnstile = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      appearance: "interaction-only";
      theme: "dark";
      language: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
// Next inlines NEXT_PUBLIC_* only when referenced literally.
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

let loading: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    script.onerror = () => {
      loading = null;
      reject(new Error("turnstile failed to load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Cloudflare Turnstile for one form. Invisible unless Cloudflare wants an interaction, in which
 * case the widget shows where `widget` is placed. Without a site key (local development and e2e)
 * it is off and `ready` is always true. Tokens are single use: call `reset` after each submit.
 */
export function useHumanCheck(action: HumanAction) {
  const locale = useLocale();
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY || !container.current) return;
    let cancelled = false;
    const el = container.current;
    void loadTurnstile()
      .then((turnstile) => {
        if (cancelled) return;
        widgetId.current = turnstile.render(el, {
          sitekey: SITE_KEY,
          action,
          appearance: "interaction-only",
          theme: "dark",
          language: locale,
          callback: setToken,
          "expired-callback": () => setToken(null),
          "error-callback": () => setToken(null),
        });
      })
      .catch(() => setToken(null));
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [action, locale]);

  const reset = useCallback(() => {
    setToken(null);
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
  }, []);

  return {
    enabled: SITE_KEY !== "",
    ready: SITE_KEY === "" || token !== null,
    token,
    reset,
    widget: SITE_KEY ? <div ref={container} className="empty:hidden" /> : null,
  };
}
