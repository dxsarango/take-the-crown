// MOTION §2: 200 ms in, 6 s on screen (paused on hover or focus), 200 ms out, 700 ms between toasts.
export const DWELL = 6000;
export const OUT = 200;
export const GAP = 700;
export const SEGMENTS = 20;

export type Frame = { ty: number; opacity: number; scale: number; sparks: number; textOpacity: number; textX: number };

/** The animation at time t (ms), as in the prototype's frameAt(). */
export function toastFrame(t: number, reduced: boolean): Frame {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  if (reduced) {
    const opacity = t < 200 ? clamp(t / 200) : t > DWELL ? 1 - clamp((t - DWELL) / OUT) : 1;
    return { ty: 0, opacity, scale: 3, sparks: 0, textOpacity: 1, textX: 0 };
  }
  let ty = 0;
  let opacity = 1;
  if (t < 200) {
    ty = 24 - Math.min(6, Math.floor(t / 33)) * 4;
    opacity = clamp(t / 150);
  } else if (t > DWELL) {
    ty = Math.min(6, Math.floor((t - DWELL) / 33)) * 4;
    opacity = 1 - clamp((t - DWELL) / OUT);
  }
  const scale = t < 160 ? 0 : t < 220 ? 1 : t < 280 ? 2 : t < 380 ? 4 : 3;
  const sparks = t >= 280 && t < 460 ? 1 + Math.floor((t - 280) / 60) : 0;
  const text = clamp((t - 220) / 140);
  return { ty, opacity, scale, sparks, textOpacity: text, textX: Math.round((1 - text) * 3) * 4 };
}

/** Segments still lit: the bar drains over the dwell. */
export function drainLeft(t: number): number {
  return Math.max(0, Math.min(SEGMENTS, Math.round(((DWELL - Math.max(600, t)) / (DWELL - 600)) * SEGMENTS)));
}

