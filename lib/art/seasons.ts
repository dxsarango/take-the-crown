/** Per-season art the UI needs; seasons without their own art (T2 until it ships) use Genesis. */
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
  return ART[season] ?? ART[0];
}
