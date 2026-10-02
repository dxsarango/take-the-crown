"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/art";
import { useAuth } from "@/components/auth/auth-provider";
import { useRouter } from "@/i18n/navigation";

/**
 * Account deletion (terms §13, privacy §8). The player types their public name to confirm; the
 * server checks it again and needs a recent sign-in. Without one it emails a sign-in link that
 * reopens this dialog (`?delete=1`). Afterwards the player lands on the home page, signed out.
 */
export function DeleteAccount({ name, maskedEmail, openOnLoad }: { name: string; maskedEmail: string; openOnLoad: boolean }) {
  const t = useTranslations("editProfile");
  const common = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const { refresh } = useAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const inputId = useId();
  const [open, setOpen] = useState(openOnLoad);
  const [typed, setTyped] = useState("");
  const [state, setState] = useState<"idle" | "deleting" | "failed" | "reauth">("idle");
  const matches = typed.trim().toLowerCase() === name.toLowerCase();

  useEffect(() => {
    const el = dialog.current;
    if (open && el && !el.open) el.showModal();
  }, [open]);

  // Opened from the sign-in link: drop the flag so a reload does not open it again.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("delete")) return;
    url.searchParams.delete("delete");
    window.history.replaceState(null, "", url);
  }, []);

  const close = () => {
    if (state === "deleting") return;
    dialog.current?.close();
    setOpen(false);
    setTyped("");
    setState("idle");
  };

  const remove = async () => {
    if (!matches || state === "deleting") return;
    setState("deleting");
    const response = await fetch("/api/profile", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName: typed, locale }),
    }).catch(() => null);
    if (response?.status === 403 && ((await response.json().catch(() => null)) as { error?: string } | null)?.error === "reauth") {
      return setState("reauth");
    }
    if (!response?.ok) return setState("failed");
    refresh();
    router.replace("/");
  };

  const effects = [t("delWhat1"), t("delWhat2"), t("delWhat3")];

  return (
    <>
      <ul className="flex flex-col gap-2">
        {effects.map((line) => (
          <li key={line} className="flex items-start gap-3 text-14 leading-body text-pretty text-crown-muted">
            <span aria-hidden className="mt-[9px] size-1.5 flex-none bg-crown-muted" />
            {line}
          </li>
        ))}
      </ul>
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="hit-area m-1 h-12 bg-crown-hall px-5 text-16 font-bold text-crown-danger shadow-relief hover:bg-crown-stone focus-visible:outline-offset-[6px] active:bg-crown-velvet active:shadow-relief-pressed"
        >
          {t("delButton")}
        </button>
      </div>
      {open && (
        <dialog
          ref={dialog}
          aria-labelledby={titleId}
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
          className="m-0 mt-auto w-full max-w-none bg-crown-ink text-crown-text shadow-[0_-4px_0_var(--crown-velvet)] backdrop:bg-crown-abyss/80 lg:m-auto lg:w-[480px] lg:shadow-modal"
        >
          <div className="flex items-start gap-3 pt-4 pr-1 pl-4 lg:pt-6 lg:pr-2 lg:pl-7">
            <h2 id={titleId} className="min-w-0 flex-1 pt-1.5 text-20 leading-[1.3] font-bold text-pretty">
              {t("delTitle")}
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label={common("close")}
              className="hit-area flex size-11 flex-none items-center justify-center hover:bg-crown-hall focus-visible:outline-offset-[-2px]"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void remove();
            }}
            className="flex flex-col gap-4 px-4 pt-3 pb-5 lg:px-7 lg:pb-6"
          >
            <p className="text-14 leading-body text-pretty text-crown-muted">{t("delBody")}</p>
            <div className="flex flex-col gap-2">
              <label htmlFor={inputId} className="text-14 font-bold">
                {t("delConfirmL", { name })}
              </label>
              <input
                id={inputId}
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value);
                  if (state === "failed") setState("idle");
                }}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                disabled={state === "deleting"}
                className="h-13 w-full bg-crown-velvet px-4 text-16 shadow-inset-field focus-visible:outline-offset-2"
              />
            </div>
            {state === "failed" && (
              <div role="alert" className="flex items-start gap-2 bg-crown-velvet p-3 text-14 leading-snug font-bold shadow-flag-danger">
                <span className="flex size-4 flex-none items-center justify-center bg-crown-danger text-crown-ink">
                  <Icon name="bang" size={8} />
                </span>
                {t("delFailed")}
              </div>
            )}
            {state === "reauth" && (
              <div role="status" className="flex items-start gap-2 bg-crown-velvet p-3 text-14 leading-snug font-bold shadow-[inset_4px_0_0_var(--crown-text)]">
                <span className="flex size-4 flex-none items-center justify-center bg-crown-text text-crown-ink">
                  <Icon name="check" size={8} height={6} />
                </span>
                {t("delReauth", { email: maskedEmail })}
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 lg:flex-row lg:items-center lg:justify-end lg:gap-4">
              <button type="button" onClick={close} className="hit-area h-11 px-3 text-14 font-bold underline decoration-crown-stone decoration-2 underline-offset-[6px] hover:bg-crown-velvet">
                {common("cancel")}
              </button>
              <button
                type="submit"
                disabled={!matches || state === "reauth"}
                aria-busy={state === "deleting"}
                className="hit-area m-1 h-13 bg-crown-danger px-5 text-16 font-bold text-crown-ink shadow-relief-danger focus-visible:outline-offset-[6px] active:pt-1 active:shadow-relief-danger-pressed disabled:cursor-not-allowed disabled:bg-crown-hall disabled:text-crown-muted disabled:shadow-none"
              >
                {state === "deleting" ? t("delDeleting") : t("delConfirm")}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
