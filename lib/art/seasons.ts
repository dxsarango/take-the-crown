/**
 * The design numbers its season art T0 Genesis, T1 Day of the Dead, T2 Frost. The game's season
 * order differs (migrations 0020 and 0021: Genesis, Frost, ten provisional months, Day of the Dead
 * as season 12), so every art lookup goes through the season's art set. Seasons without their own
 * art (Frost's T2, the provisional ones) fall back to Genesis.
 */
const ART_SET: Record<number, number> = { 0: 0, 1: 2, 12: 1 };

/** The design art set (T number) a season id is drawn with. */
export function artSet(season: number): number {
  return ART_SET[season] ?? 0;
}

/** Per-season art the UI needs. */
type SeasonArt = {
  /** Folder suffix of seal-t{n}.svg and stone-band-t{n}.svg. */
  asset: number;
  /** Stone ramp for the footer band: top line, band base. */
  stone: { cap: string; base: string };
};

const ART: Record<number, SeasonArt> = {
  0: { asset: 0, stone: { cap: "#3A3645", base: "#2C2936" } },
  1: { asset: 1, stone: { cap: "#1F4E5E", base: "#163644" } },
};

export function seasonArt(season: number): SeasonArt {
  return ART[artSet(season)] ?? ART[0];
}
