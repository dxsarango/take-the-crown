"use client";

import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { type AuthError, isAuthError } from "@/lib/auth/next";
import type { AvatarSource } from "@/lib/art/avatar";
import type { ViewerSummary } from "@/lib/profile/viewer";
import { LoginDialog } from "./login-dialog";

export type LoginRequest = {
  /** "afterPayment" greets a buyer who was just crowned (SCREENS §9.2). */
  variant?: "interactive" | "afterPayment";
  /** Page to open once signed in; defaults to the current one. */
  next?: string;
  email?: string;
  avatar?: AvatarSource;
  error?: AuthError;
};

type AuthContextValue = {
  viewer: ViewerSummary | null;
  /** False until /api/me has answered. */
  ready: boolean;
  openLogin: (request?: LoginRequest) => void;
  refresh: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth outside AuthProvider");
  return value;
}

function currentPath(): string {
  return `${window.location.pathname}${window.location.search}`;
}

/** Takes the login hints the server left in the URL (a failed sign-in, or a page that needs one). */
function takeLoginParams(): LoginRequest | null {
  const url = new URL(window.location.href);
  const error = url.searchParams.get("auth_error");
  const wanted = url.searchParams.get("login");
  if (error === null && wanted === null) return null;
  url.searchParams.delete("auth_error");
  url.searchParams.delete("login");
  window.history.replaceState(null, "", url);
  return { error: isAuthError(error) ? error : undefined, next: wanted || currentPath() };
}

export function AuthProvider({ season, children }: { season: number; children: ReactNode }) {
  const [viewer, setViewer] = useState<ViewerSummary | null>(null);
  const [ready, setReady] = useState(false);
  const [login, setLogin] = useState<LoginRequest | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ viewer: ViewerSummary | null }>)
      .catch(() => ({ viewer: null }))
      .then(({ viewer: me }) => {
        if (cancelled) return;
        setViewer(me);
        setReady(true);
        const request = version === 0 ? takeLoginParams() : null;
        if (request && !me) setLogin(request);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const openLogin = useCallback((request: LoginRequest = {}) => setLogin({ next: currentPath(), ...request }), []);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const value = useMemo(() => ({ viewer, ready, openLogin, refresh }), [viewer, ready, openLogin, refresh]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      {login && <LoginDialog season={season} request={login} onClose={() => setLogin(null)} />}
    </AuthContext.Provider>
  );
}
