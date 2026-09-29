"use client";

import { useEffect, useState } from "react";
import { Portrait } from "@/components/art";
import { portraitOrigin } from "@/lib/art/scenes";
import { THRONE_SIZES, type ThroneSize, throneFile } from "@/lib/art/throne";
import type { King } from "@/lib/home/data";

// MOTION §3: while someone holds a lock the crown shakes 1 scene pixel, every 70 ms in bursts,
// then rests for 1.4 s. Values index [-1, 0, +1].
const SHAKE = [1, 0, -1, 0, 1, 0, -1, 0] as const;
const SHAKE_STEP_MS = 70;
const SHAKE_REST_MS = 1400;

function useCrownShake(active: boolean): -1 | 0 | 1 {
  const [shift, setShift] = useState<-1 | 0 | 1>(0);
  useEffect(() => {
    if (!active || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let step = 0;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      if (step < SHAKE.length) {
        setShift(SHAKE[step++]);
        timer = setTimeout(next, SHAKE_STEP_MS);
      } else {
        step = 0;
        setShift(0);
        timer = setTimeout(next, SHAKE_REST_MS);
      }
    };
    timer = setTimeout(next, SHAKE_REST_MS);
    return () => {
      clearTimeout(timer);
      setShift(0);
    };
  }, [active]);
  return shift;
}

type Props = { season: number; king: King | null; locked: boolean };

function Scene({ season, king, shift, size }: { season: number; king: King | null; shift: -1 | 0 | 1; size: ThroneSize }) {
  const { width, height, scale } = THRONE_SIZES[size];
  const origin = portraitOrigin(width, height);
  return (
    <div className="flex justify-center overflow-hidden bg-crown-abyss" style={{ height: height * scale }}>
      <div className="relative flex-none" style={{ width: width * scale, height: height * scale }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- pixel art must not be resampled by next/image */}
        <img
          src={`/art/throne/${throneFile(season, king ? "seat" : "spot", size)}`}
          width={width * scale}
          height={height * scale}
          alt=""
          className="block [image-rendering:pixelated]"
        />
        {king && (
          <div className="absolute" style={{ left: origin.x * scale, top: origin.y * scale }}>
            <Portrait avatar={king.avatar} rank={king.rank} season={season} crown crownShift={shift} scale={scale} />
          </div>
        )}
      </div>
    </div>
  );
}

export function ThroneScene({ season, king, locked }: Props) {
  const shift = useCrownShake(locked && king !== null);
  return (
    <>
      <div className="lg:hidden">
        <Scene season={season} king={king} shift={shift} size="mobile" />
      </div>
      <div className="hidden lg:block">
        <Scene season={season} king={king} shift={shift} size="desktop" />
      </div>
    </>
  );
}
