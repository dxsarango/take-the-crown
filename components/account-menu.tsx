"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { ViewerSummary } from "@/lib/profile/viewer";
import { Icon, Portrait } from "./art";

const item =
  "flex h-11 w-full items-center px-4 text-left text-14 font-bold whitespace-nowrap hover:bg-crown-stone focus-visible:bg-crown-stone focus-visible:outline-offset-[-2px]";

/**
 * The signed-in player's portrait in the top bar, opening a menu (WAI-ARIA menu button): view
 * profile, edit profile, sign out. The design has no menu; it reuses the toast's raised panel.
 */
export function AccountMenu({ viewer, season }: { viewer: ViewerSummary; season: number }) {
  const t = useTranslations("login");
  const locale = useLocale();
  const pathname = usePathname();
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  // Which item takes focus when the menu opens.
  const [focusOnOpen, setFocusOnOpen] = useState<"first" | "last">("first");

  const items = () => [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];

  useEffect(() => {
    if (!open) return;
    const all = items();
    all[focusOnOpen === "first" ? 0 : all.length - 1]?.focus();
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open, focusOnOpen]);

  const show = (focus: "first" | "last") => {
    setFocusOnOpen(focus);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  const onButtonKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      show("first");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      show("last");
    }
  };

  const onMenuKey = (e: KeyboardEvent) => {
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => {
      e.preventDefault();
      all[(to + all.length) % all.length]?.focus();
    };
    if (e.key === "ArrowDown") move(at + 1);
    else if (e.key === "ArrowUp") move(at - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(all.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") setOpen(false);
  };

  // Back to the page the player was on; pages that need a session send them home instead.
  const next = pathname.includes("/settings/") ? `/${locale}` : pathname;

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        id={`${id}-button`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        aria-label={t("accountMenu")}
        title={viewer.name}
        onClick={() => (open ? setOpen(false) : show("first"))}
        onKeyDown={onButtonKey}
        className="hit-area flex items-center gap-3 focus-visible:outline-offset-2"
      >
        <span className="hidden max-w-40 truncate text-14 font-bold lg:block">{viewer.name}</span>
        <Portrait avatar={viewer.avatar} rank={viewer.rank} season={season} crown={false} scale={1} />
        <Icon name="chev" size={8} height={5} className={`hidden lg:block ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          ref={menu}
          id={`${id}-menu`}
          role="menu"
          aria-labelledby={`${id}-button`}
          onKeyDown={onMenuKey}
          className="absolute top-full right-0 z-40 mt-4 flex min-w-48 flex-col bg-crown-hall py-1 shadow-toast"
        >
          <Link role="menuitem" tabIndex={-1} href={`/u/${viewer.name.toLowerCase()}`} onClick={() => setOpen(false)} className={item}>
            {t("viewProfile")}
          </Link>
          <Link role="menuitem" tabIndex={-1} href="/settings/profile" onClick={() => setOpen(false)} className={item}>
            {t("editProfile")}
          </Link>
          <form action="/auth/sign-out" method="post" className="contents">
            <input type="hidden" name="next" value={next} />
            <button role="menuitem" tabIndex={-1} type="submit" className={item}>
              {t("signOut")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
