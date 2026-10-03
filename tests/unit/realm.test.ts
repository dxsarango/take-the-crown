import { describe, expect, it } from "vitest";
import { drainLeft, toastFrame } from "@/lib/achievements/toast-motion";
import { framePixels } from "@/lib/art/frames";
import { BANNER_HEIGHT, BANNER_WIDTH, PEDESTAL_HEIGHT, PEDESTAL_WIDTH, bannerPixels, pedestalPixels } from "@/lib/art/podium";
import { formatClock, formatDurationPrecise } from "@/lib/format";

const units = { h: "h", m: "m", s: "s" };

describe("podium art", () => {
  it("builds pedestals of the design's sizes with gold, silver and bronze trims", () => {
    for (const [place, trim] of [
      [1, "#F2C14E"],
      [2, "#C3C8D0"],
      [3, "#B98050"],
    ] as const) {
      const pixels = pedestalPixels(place, 0);
      expect(pixels).toHaveLength(PEDESTAL_WIDTH * PEDESTAL_HEIGHT[place]);
      // Row 4 is the trim, edge to edge inside the outline.
      expect(pixels[4 * PEDESTAL_WIDTH + 10]).toBe(trim);
      expect(pixels[0]).toBe("#1F1C27");
    }
  });

  it("uses each season's stone", () => {
    // Season 2 is Day of the Dead (art set T1); Frost (season 1) uses Genesis until its art ships.
    expect(pedestalPixels(1, 2)[0]).toBe("#0C1E26");
    expect(pedestalPixels(1, 1)[0]).toBe("#1F1C27");
  });

  it("puts the portrait on the banner and can leave the avatar window open for uploads", () => {
    const frame = framePixels("emperor", null);
    const closed = bannerPixels(frame, 0);
    const open = bannerPixels(frame, 0, true);
    expect(closed).toHaveLength(BANNER_WIDTH * BANNER_HEIGHT);
    const windowCell = (7 + 20) * BANNER_WIDTH + 8 + 20;
    expect(closed[windowCell]).not.toBeNull();
    expect(open[windowCell]).toBeNull();
    // The gold rod along the top.
    expect(closed[1 * BANNER_WIDTH + 30]).not.toBeNull();
  });
});

describe("unlock toast timing (MOTION §2)", () => {
  it("rises 24 px in 4 px steps and fades in", () => {
    expect(toastFrame(0, false).ty).toBe(24);
    expect(toastFrame(33, false).ty).toBe(20);
    expect(toastFrame(199, false).ty).toBe(0);
    expect(toastFrame(150, false).opacity).toBe(1);
  });

  it("bounces the medal ×1 → ×2 → ×4 → ×3 at integer scales", () => {
    expect([100, 170, 230, 300, 400, 3000].map((t) => toastFrame(t, false).scale)).toEqual([0, 1, 2, 4, 3, 3]);
  });

  it("throws three spark steps and slides the text in", () => {
    expect([270, 290, 350, 410, 470].map((t) => toastFrame(t, false).sparks)).toEqual([0, 1, 2, 3, 0]);
    expect(toastFrame(220, false)).toMatchObject({ textOpacity: 0, textX: 12 });
    expect(toastFrame(360, false)).toMatchObject({ textOpacity: 1, textX: 0 });
  });

  it("drains 20 segments over the six seconds and leaves in 200 ms", () => {
    expect(drainLeft(0)).toBe(20);
    expect(drainLeft(3300)).toBe(10);
    expect(drainLeft(6000)).toBe(0);
    expect(toastFrame(6100, false).opacity).toBeCloseTo(0.5);
    expect(toastFrame(6100, false).ty).toBe(12);
  });

  it("only fades for reduced motion", () => {
    expect(toastFrame(100, true)).toEqual({ ty: 0, opacity: 0.5, scale: 3, sparks: 0, textOpacity: 1, textX: 0 });
    expect(toastFrame(6100, true).ty).toBe(0);
  });
});

describe("record formats", () => {
  it("keeps seconds under an hour", () => {
    expect(formatDurationPrecise(11, units)).toBe("11s");
    expect(formatDurationPrecise(64, units)).toBe("1m 04s");
    expect(formatDurationPrecise(31 * 3600 + 7 * 60, units)).toBe("31h 07m");
    expect(formatClock(5 * 3600 + 41 * 60 + 9, units)).toBe("5h 41m 09s");
  });
});
