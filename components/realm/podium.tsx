"use client";

import { useMemo } from "react";
import { Flag, Portrait } from "@/components/art";
import { Link } from "@/i18n/navigation";
import { pixelsToSVG } from "@/lib/art/avatar";
import { portraitPixels } from "@/lib/art/portrait";
import {
  BANNER_HEIGHT,
  BANNER_PORTRAIT,
  BANNER_WIDTH,
  PEDESTAL_HEIGHT,
  PEDESTAL_WIDTH,
  type Place,
  bannerPixels,
  pedestalPixels,
} from "@/lib/art/podium";
import type { Person } from "@/lib/home/data";

function Pixels({ svg, width, height, scale }: { svg: string; width: number; height: number; scale: number }) {
  return (
    <span
      aria-hidden
      className="block flex-none [image-rendering:pixelated] [&>svg]:block [&>svg]:size-full"
      style={{ width: width * scale, height: height * scale }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function Pedestal({ place, season, scale }: { place: Place; season: number; scale: number }) {
  const svg = useMemo(() => pixelsToSVG(pedestalPixels(place, season), PEDESTAL_WIDTH, PEDESTAL_HEIGHT[place]), [place, season]);
  return <Pixels svg={svg} width={PEDESTAL_WIDTH} height={PEDESTAL_HEIGHT[place]} scale={scale} />;
}

export type PodiumSpot = {
  key: string;
  value: string;
  name: string;
  href?: string;
  person?: Person;
  countryCode?: string | null;
};

/** Three stone pedestals, second · first · third (Reino.dc.html), ×2 on mobile and ×3 on desktop. */
export function Podium({ spots, season }: { spots: PodiumSpot[]; season: number }) {
  const order: [number, Place][] = [
    [1, 2],
    [0, 1],
    [2, 3],
  ];
  return (
    <ol className="flex items-end justify-center gap-2 shadow-[inset_0_-4px_0_var(--crown-velvet)] lg:gap-3">
      {order.map(([index, place]) => {
        const spot = spots[index];
        if (!spot) return <li key={place} className="w-25 lg:w-37.5" aria-hidden />;
        const country = !spot.person;
        return (
          <li key={spot.key} value={place} className="flex w-25 flex-col items-center gap-2 lg:w-37.5 lg:gap-3">
            <div className="flex w-25 flex-col items-center gap-0.5 text-center lg:w-auto lg:gap-1">
              <div className={`font-pixel leading-[1.1] font-bold ${place === 1 ? "text-20 lg:text-28" : "text-16 lg:text-20"}`}>{spot.value}</div>
              <div className="flex max-w-full items-center gap-1.5">
                {spot.href ? (
                  <Link href={spot.href} className="max-w-25 truncate text-12 font-bold hover:underline lg:max-w-30 lg:text-14">
                    {spot.name}
                  </Link>
                ) : (
                  <span className="max-w-25 truncate text-12 font-bold lg:max-w-30 lg:text-14">{spot.name}</span>
                )}
                {!country && <Flag code={spot.person?.countryCode ?? null} className="hidden lg:block" />}
              </div>
            </div>
            {spot.person ? (
              <>
                <span className="lg:hidden">
                  <Portrait avatar={spot.person.avatar} rank={spot.person.rank} season={season} crown={false} scale={2} />
                </span>
                <span className="hidden lg:block">
                  <Portrait avatar={spot.person.avatar} rank={spot.person.rank} season={season} crown={false} scale={3} />
                </span>
              </>
            ) : (
              <>
                <span className="my-5 shadow-[0_0_0_4px_#1F1C27] lg:hidden">
                  <Flag code={spot.countryCode ?? null} scale={6} />
                </span>
                <span className="my-7.5 hidden shadow-[0_0_0_6px_#1F1C27] lg:block">
                  <Flag code={spot.countryCode ?? null} scale={9} />
                </span>
              </>
            )}
            <span className="lg:hidden">
              <Pedestal place={place} season={season} scale={2} />
            </span>
            <span className="hidden lg:block">
              <Pedestal place={place} season={season} scale={3} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** King of the Season: the portrait (rank frame and crown) on the season's banner. */
export function Banner({ person, season, scale }: { person: Person; season: number; scale: number }) {
  const image = person.avatar.pixels ? null : person.avatar.image;
  const traitsKey = JSON.stringify(person.avatar.traits ?? null);
  const svg = useMemo(
    () => pixelsToSVG(bannerPixels(portraitPixels(person.avatar, person.rank, { season, crown: true }), season, !!image), BANNER_WIDTH, BANNER_HEIGHT),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by value, not identity
    [person.avatar.seed, traitsKey, image?.pixelUrl, person.rank, season],
  );
  return (
    <span className="relative block flex-none" style={{ width: BANNER_WIDTH * scale, height: BANNER_HEIGHT * scale }}>
      {image && (
        // eslint-disable-next-line @next/next/no-img-element -- pixel art must not be resampled by next/image
        <img
          src={image.pixelated ? image.pixelUrl : image.originalUrl}
          alt=""
          className={`absolute object-cover ${image.pixelated ? "[image-rendering:pixelated]" : ""}`}
          style={{
            left: (BANNER_PORTRAIT.x + 6) * scale,
            top: (BANNER_PORTRAIT.y + 6) * scale,
            width: 32 * scale,
            height: 32 * scale,
          }}
        />
      )}
      <span className="absolute inset-0">
        <Pixels svg={svg} width={BANNER_WIDTH} height={BANNER_HEIGHT} scale={scale} />
      </span>
    </span>
  );
}
