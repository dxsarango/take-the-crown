/**
 * The design numbers its season art T0 Genesis, T1 Day of the Dead, T2 Frost. The game's season
 * order differs (migration 0020: Genesis, Frost, Day of the Dead), so every art lookup goes through
 * the season's art set. Art sets without their own art yet (T2 Frost) fall back to Genesis.
 */
const ART_SET: Record<number, number> = { 0: 0, 1: 2, 2: 1 };

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
