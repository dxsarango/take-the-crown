import type { ReactNode } from "react";
import { BRAND_NAME } from "@/lib/config/brand";

export const errorAction =
  "hit-area m-1 flex h-12 items-center bg-crown-gold px-5 text-16 font-bold text-crown-ink shadow-relief-gold hover:bg-crown-gold-glow hover:shadow-relief-gold-hover focus-visible:outline-offset-[6px] active:bg-crown-gold-old active:pt-1 active:shadow-relief-gold-pressed";

/**
 * A full page for missing pages and errors. The design has no such screen: it reuses the
 * design's crown (the favicon art at 4×), the gold button and the app background.
 */
export function ErrorScreen({ title, body, crownAlt, children }: { title: string; body: string; crownAlt: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-crown-ink px-4 py-16 text-center">
      <span className="font-pixel text-20 font-bold">{BRAND_NAME}</span>
      {/* eslint-disable-next-line @next/next/no-img-element -- pixel art must not be resampled by next/image */}
      <img src="/icon.svg" alt={crownAlt} width={64} height={64} className="size-16 [image-rendering:pixelated]" />
      <div className="flex max-w-[480px] flex-col gap-3">
        <h1 className="text-28 leading-tight font-bold lg:text-40">{title}</h1>
        <p className="text-16 leading-body text-crown-muted">{body}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">{children}</div>
    </main>
  );
}
