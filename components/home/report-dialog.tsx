"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/art";
import { REPORT_REASONS, type ReportReason } from "@/lib/reports";

type Props = { reignId: number; onClose: (sent: boolean) => void };

/** Report sheet (mobile) / 440 px modal (desktop), built like the sign-in dialog: pick a reason, send. */
export function ReportDialog({ reignId, onClose }: Props) {
  const t = useTranslations("report");
  const common = useTranslations("common");
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "failed">("idle");

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  const send = async () => {
    if (!reason || state === "sending") return;
    setState("sending");
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reignId, reason }),
    }).catch(() => null);
    if (response?.ok) onClose(true);
    else setState("failed");
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose(false);
      }}
      className="m-0 mt-auto w-full max-w-none bg-crown-ink text-crown-text shadow-[0_-4px_0_var(--crown-velvet)] backdrop:bg-crown-abyss/80 lg:m-auto lg:w-[440px] lg:shadow-modal"
    >
      <div className="flex justify-center pt-2.5 pb-0.5 lg:hidden" aria-hidden>
        <span className="h-1 w-10 bg-crown-stone" />
      </div>
      <div className="flex items-start gap-3 pt-2 pr-1 pl-4 lg:pt-6 lg:pr-2 lg:pl-7">
        <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1.5 lg:gap-1.5 lg:pt-1">
          <h2 id={titleId} className="text-20 leading-[1.3] font-bold text-pretty">
            {t("title")}
          </h2>
          <p className="text-14 leading-body text-pretty text-crown-muted">{t("question")}</p>
        </div>
        <button
          type="button"
          onClick={() => onClose(false)}
          aria-label={common("close")}
          className="hit-area flex size-11 flex-none items-center justify-center hover:bg-crown-hall focus-visible:outline-offset-[-2px]"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex flex-col gap-3 px-4 pt-4 pb-5 lg:px-7 lg:pt-5 lg:pb-6"
      >
        <fieldset className="flex flex-col gap-2" disabled={state === "sending"}>
          <legend className="sr-only">{t("question")}</legend>
          {REPORT_REASONS.map((value) => {
            const on = value === reason;
            return (
              <label
                key={value}
                className={`flex min-h-13 cursor-pointer items-center gap-3 px-4 py-3 text-16 font-bold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-crown-text ${
                  on ? "bg-crown-hall shadow-inset-segment-on" : "bg-crown-velvet hover:bg-crown-hall"
                }`}
              >
                <input
                  type="radio"
                  name="reason"
                  value={value}
                  checked={on}
                  onChange={() => {
                    setReason(value);
                    setState("idle");
                  }}
                  className="sr-only"
                />
                <span aria-hidden className="flex size-4 flex-none items-center justify-center bg-crown-ink shadow-[inset_0_0_0_2px_var(--crown-stone)]">
                  {on && <span className="size-2 bg-crown-text" />}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  {t(`reasons.${value}`)}
                  <span className="text-12 font-normal text-crown-muted">{t(`hints.${value}`)}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        {state === "failed" && (
          <div role="alert" className="flex items-start gap-2 bg-crown-velvet p-3 text-14 leading-snug font-bold shadow-flag-danger">
            <span className="flex size-4 flex-none items-center justify-center bg-crown-danger text-crown-ink">
              <Icon name="bang" size={8} />
            </span>
            {t("failed")}
          </div>
        )}
        <button
          type="submit"
          disabled={!reason}
          aria-busy={state === "sending"}
          className="hit-area m-1 flex h-13 items-center justify-center bg-crown-hall text-16 font-bold shadow-relief hover:bg-crown-stone focus-visible:outline-offset-[6px] active:bg-crown-velvet active:shadow-relief-pressed disabled:cursor-not-allowed disabled:text-crown-muted disabled:hover:bg-crown-hall"
        >
          {t("send")}
        </button>
      </form>
    </dialog>
  );
}
