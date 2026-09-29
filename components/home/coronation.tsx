"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import {
  CORONATION_MS,
  LANDING_MS,
  type Monarch,
  coronationStage,
  coronationStills,
  drawCoronation,
} from "@/lib/art/coronation";
import { decodeAvatarImage } from "@/lib/art/avatar";
import { THRONE_SIZES, type ThroneSize } from "@/lib/art/throne";

/** Canvas drawing needs an upload's pixels; read them before the animation starts. */
async function withPixels(who: Monarch | null): Promise<Monarch | null> {
  const image = who?.avatar.image;
  if (!who || !image || who.avatar.pixels) return who;
  const pixels = await decodeAvatarImage(image.pixelUrl);
  return { ...who, avatar: { ...who.avatar, pixels } };
}

type Props = {
  season: number;
  from: Monarch | null;
  to: Monarch;
  reduced: boolean;
  /** Name, clock and price change at this moment (MOTION §1). */
  onLand: () => void;
  onEnd: () => void;
};

function Stage({ size, season, from, to, reduced, onLand, onEnd }: Props & { size: ThroneSize }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { width, height, scale } = THRONE_SIZES[size];
  const landed = useEffectEvent(onLand);
  const ended = useEffectEvent(onEnd);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let stopped = false;

    const play = (fromReady: Monarch | null, toReady: Monarch) => {
      const stage = coronationStage(season, size, width, height, fromReady, toReady);
      const mode = reduced ? "reduced" : "full";
      const stills = reduced ? coronationStills(stage) : null;
      const frame = ctx.createImageData(width, height);
      const buffer = document.createElement("canvas");
      buffer.width = width;
      buffer.height = height;
      let start: number | null = null;
      let hasLanded = false;

      const tick = (ts: number) => {
        if (stopped) return;
        start ??= ts;
        const t = Math.min(ts - start, CORONATION_MS[mode]);
        if (stills) {
          // Reduced motion: a 400 ms full-frame crossfade, the one allowed use of alpha.
          ctx.putImageData(stills.before, 0, 0);
          buffer.getContext("2d")?.putImageData(stills.after, 0, 0);
          ctx.globalAlpha = t / CORONATION_MS.reduced;
          ctx.drawImage(buffer, 0, 0);
          ctx.globalAlpha = 1;
        } else {
          drawCoronation(stage, frame, t);
          ctx.putImageData(frame, 0, 0);
        }
        if (!hasLanded && t >= LANDING_MS[mode]) {
          hasLanded = true;
          landed();
        }
        if (t >= CORONATION_MS[mode]) ended();
        else raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    void Promise.all([withPixels(from), withPixels(to)]).then(([fromReady, toReady]) => {
      if (!stopped && toReady) play(fromReady, toReady);
    });
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
    // Runs once per coronation; the parent remounts it for the next one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex justify-center overflow-hidden bg-crown-abyss" style={{ height: height * scale }}>
      <canvas
        ref={canvas}
        width={width}
        height={height}
        aria-hidden
        className="block flex-none [image-rendering:pixelated]"
        style={{ width: width * scale, height: height * scale }}
      />
    </div>
  );
}

/** Replaces the throne scene while a new king is crowned, for everyone watching. */
export function Coronation(props: Props) {
  // Both stages run in step; the mobile one reports landing and end.
  return (
    <>
      <div className="lg:hidden">
        <Stage {...props} size="mobile" />
      </div>
      <div className="hidden lg:block">
        <Stage {...props} size="desktop" onLand={() => undefined} onEnd={() => undefined} />
      </div>
    </>
  );
}
