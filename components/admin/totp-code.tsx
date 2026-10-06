import { useTranslations } from "next-intl";

export const primary =
  "hit-area m-1 h-12 self-start bg-crown-gold px-5 text-16 font-bold text-crown-ink shadow-relief-gold hover:bg-crown-gold-glow hover:shadow-relief-gold-hover focus-visible:outline-offset-[6px] active:bg-crown-gold-old active:pt-1 active:shadow-relief-gold-pressed disabled:cursor-wait";

/** The six-digit code from the authenticator app. */
export function CodeField() {
  const t = useTranslations("admin.security");
  return (
    <label className="flex flex-col gap-1.5 text-14 font-bold">
      {t("codeL")}
      <input
        name="code"
        required
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,7}"
        maxLength={7}
        className="h-12 w-40 bg-crown-velvet px-3 text-20 font-bold tracking-[0.2em] shadow-inset-field focus-visible:outline-offset-2"
      />
    </label>
  );
}
