import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { traitsFromUsername } from "@/design/lib/avatar-lib.js";
import { CORE_PALETTE, nearestColor, processAvatar } from "@/lib/profile/avatar-image";
import { type SettingsForm, fieldForDbError, formProblems, mainLinkUrl, settingsSchema, toUpdateArgs } from "@/lib/profile/settings";
import { SOCIAL_KEYS, cleanSocial, isValidSocial, socialHandle, socialLabel, socialUrl } from "@/lib/profile/socials";

// Canonical forms accepted by the database checks in migration 0006.
const DB_CHECKS: Record<string, RegExp> = {
  x: /^https:\/\/x\.com\/[A-Za-z0-9_]{1,15}$/,
  ig: /^https:\/\/instagram\.com\/[A-Za-z0-9._]{1,30}$/,
  tt: /^https:\/\/tiktok\.com\/@[A-Za-z0-9._]{2,24}$/,
  yt: /^https:\/\/youtube\.com\/@[A-Za-z0-9._-]{3,30}$/,
  gh: /^https:\/\/github\.com\/[A-Za-z0-9]([A-Za-z0-9]|-[A-Za-z0-9]){0,38}$/,
  li: /^https:\/\/linkedin\.com\/in\/[A-Za-z0-9-]{3,100}$/,
  web: /^https:\/\/[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(\/[^\s]*)?$/,
};

describe("social links", () => {
  const cases: Record<(typeof SOCIAL_KEYS)[number], { input: string; url: string }[]> = {
    x: [
      { input: "@ana_codes", url: "https://x.com/ana_codes" },
      { input: "https://twitter.com/ana_codes?s=20", url: "https://x.com/ana_codes" },
      { input: "www.x.com/ana_codes/", url: "https://x.com/ana_codes" },
    ],
    ig: [{ input: "https://www.instagram.com/ana.codes/", url: "https://instagram.com/ana.codes" }],
    tt: [
      { input: "@ana.codes", url: "https://tiktok.com/@ana.codes" },
      { input: "https://www.tiktok.com/@ana.codes?lang=en", url: "https://tiktok.com/@ana.codes" },
    ],
    yt: [{ input: "https://m.youtube.com/@ana.codes", url: "https://youtube.com/@ana.codes" }],
    gh: [{ input: "github.com/ana-codes", url: "https://github.com/ana-codes" }],
    li: [{ input: "https://es.linkedin.com/in/ana-codes", url: "https://linkedin.com/in/ana-codes" }],
    web: [
      { input: "ana.dev", url: "https://ana.dev" },
      { input: "http://shop.ana.dev/launch/", url: "https://shop.ana.dev/launch" },
    ],
  };

  for (const key of SOCIAL_KEYS) {
    it(`normalizes ${key} input to the canonical URL the database accepts`, () => {
      for (const { input, url } of cases[key]) {
        expect(isValidSocial(key, input), input).toBe(true);
        expect(socialUrl(key, input)).toBe(url);
        expect(url).toMatch(DB_CHECKS[key]);
        expect(socialUrl(key, socialHandle(key, url))).toBe(url);
      }
    });
  }

  it("rejects handles each platform does not allow", () => {
    expect(isValidSocial("x", "priya ships!")).toBe(false);
    expect(isValidSocial("x", "way_too_long_handle")).toBe(false);
    expect(isValidSocial("ig", ".ana")).toBe(false);
    expect(isValidSocial("ig", "ana..codes")).toBe(false);
    expect(isValidSocial("gh", "ana--codes")).toBe(false);
    expect(isValidSocial("li", "ab")).toBe(false);
    expect(isValidSocial("tt", "a")).toBe(false);
    expect(isValidSocial("web", "localhost")).toBe(false);
  });

  it("treats an empty field as no link", () => {
    expect(isValidSocial("x", "  ")).toBe(true);
    expect(socialUrl("x", "")).toBeNull();
    expect(cleanSocial("gh", "")).toBe("");
  });

  it("labels links the way each platform shows them", () => {
    expect(socialLabel("x", "https://x.com/ana")).toBe("@ana");
    expect(socialLabel("tt", "https://tiktok.com/@ana")).toBe("@ana");
    expect(socialLabel("gh", "https://github.com/ana")).toBe("ana");
    expect(socialLabel("web", "https://ana.dev")).toBe("ana.dev");
  });
});

function form(overrides: Partial<SettingsForm> = {}): SettingsForm {
  return {
    avatarMode: "generated",
    avatarTraits: traitsFromUsername("priya_ships"),
    avatarPath: null,
    avatarPixelated: true,
    name: "priya_ships",
    country: "IN",
    link: "lumen-notes.app",
    socials: { x: "priya_ships", ig: "", tt: "", yt: "", gh: "priyaships", li: "", web: "" },
    showcase: ["founder"],
    showRival: true,
    showChronicle: true,
    alertsDethroned: true,
    priceOn: false,
    price: "20",
    alertsSeasonStart: false,
    locale: "en",
    ...overrides,
  };
}

describe("edit profile validation", () => {
  it("accepts the design's example", () => {
    expect(formProblems(form(), 5)).toEqual([]);
    expect(settingsSchema.safeParse(form()).success).toBe(true);
  });

  it("reports every field to fix, like the design's error state", () => {
    const problems = formProblems(
      form({ name: "pr", link: "lumen notes", socials: { ...form().socials, x: "priya ships!" }, priceOn: true, price: "2" }),
      5,
    );
    expect(problems.map((p) => p.field)).toEqual(["name", "link", "soc_x", "price"]);
    expect(formProblems(form({ name: "priya ships" }), 5)).toEqual([{ field: "name", problem: "chars" }]);
  });

  it("keeps the price alert between the floor and $999", () => {
    expect(formProblems(form({ priceOn: true, price: "5" }), 5)).toEqual([]);
    expect(formProblems(form({ priceOn: true, price: "999" }), 5)).toEqual([]);
    for (const price of ["4", "1000", "12.5", ""]) {
      expect(formProblems(form({ priceOn: true, price }), 5), price).toEqual([{ field: "price", problem: "range" }]);
    }
    // Off means no threshold, whatever is typed.
    expect(formProblems(form({ priceOn: false, price: "x" }), 5)).toEqual([]);
  });

  it("needs an image when showing a photo or logo", () => {
    expect(formProblems(form({ avatarMode: "upload" }), 5)).toEqual([{ field: "up", problem: "none" }]);
  });

  it("rejects traits outside the avatar library", () => {
    expect(settingsSchema.safeParse(form({ avatarTraits: { ...traitsFromUsername("a"), hair: 10 } })).success).toBe(false);
    expect(settingsSchema.safeParse(form({ avatarTraits: { ...traitsFromUsername("a"), acc: -1 } })).success).toBe(true);
  });

  it("builds update_profile arguments with canonical links and cents", () => {
    const result = toUpdateArgs("id", form({ link: "http://lumen-notes.app", priceOn: true, price: "20" }), 5);
    expect(result).toMatchObject({
      args: {
        p_main_link: "https://lumen-notes.app",
        p_link_x: "https://x.com/priya_ships",
        p_link_github: "https://github.com/priyaships",
        p_link_tiktok: null,
        p_alerts_price_below_cents: 2000,
      },
    });
    expect(mainLinkUrl("")).toBeNull();
  });

  it("maps database errors to the field they concern", () => {
    expect(fieldForDbError("name_taken")).toEqual({ field: "name", nameProblem: "taken" });
    expect(fieldForDbError("name_change_too_soon")).toEqual({ field: "name", nameProblem: "cooldown" });
    expect(fieldForDbError('violates check constraint "profiles_link_tiktok_format"')).toEqual({ field: "soc_tt" });
    expect(fieldForDbError("alert_price_invalid")).toEqual({ field: "price" });
    expect(fieldForDbError("something else")).toBeNull();
  });
});

describe("avatar uploads", () => {
  const photo = (format: "png" | "jpeg" | "webp", width = 900, height = 600) => {
    const patch = Math.floor(Math.min(width, height) / 6);
    return sharp({ create: { width, height, channels: 4, background: { r: 200, g: 60, b: 90, alpha: 1 } } })
      .composite([{ input: Buffer.alloc(patch * patch * 4, 255), raw: { width: patch, height: patch, channels: 4 }, left: 0, top: 0 }])
      [format]()
      .toBuffer();
  };

  it("keeps the original at most 512 px and a 32×32 palette version", async () => {
    for (const format of ["png", "jpeg", "webp"] as const) {
      const result = await processAvatar(await photo(format));
      if ("error" in result) throw new Error(result.error);
      const original = await sharp(result.original).metadata();
      expect(original.format).toBe("webp");
      expect(Math.max(original.width ?? 0, original.height ?? 0)).toBe(512);

      const { data, info } = await sharp(result.pixel).raw().toBuffer({ resolveWithObject: true });
      expect([info.width, info.height, info.format]).toEqual([32, 32, "raw"]);
      const palette = new Set(CORE_PALETTE.map((c) => c.join(",")).concat("42,36,56"));
      for (let i = 0; i < data.length; i += info.channels) {
        expect(palette.has(`${data[i]},${data[i + 1]},${data[i + 2]}`)).toBe(true);
      }
    }
  });

  it("does not enlarge small images", async () => {
    const result = await processAvatar(await photo("png", 64, 64));
    if ("error" in result) throw new Error(result.error);
    expect((await sharp(result.original).metadata()).width).toBe(64);
  });

  it("fills transparent areas with the frame window's stone", async () => {
    const clear = await sharp({ create: { width: 40, height: 40, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const result = await processAvatar(clear);
    if ("error" in result) throw new Error(result.error);
    const { data } = await sharp(result.pixel).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([0x2a, 0x24, 0x38]);
  });

  it("checks the real file type and size, not the name", async () => {
    expect(await processAvatar(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toEqual({ error: "type" });
    expect(await processAvatar(Buffer.from("GIF89a not really"))).toEqual({ error: "type" });
    const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#fff" } }).gif().toBuffer();
    expect(await processAvatar(gif)).toEqual({ error: "type" });
    expect(await processAvatar(Buffer.alloc(5 * 1024 * 1024 + 1))).toEqual({ error: "size" });
  });

  it("picks the nearest palette color", () => {
    expect(nearestColor([0xf2, 0xc1, 0x4e])).toEqual([0xf2, 0xc1, 0x4e]);
    expect(nearestColor([250, 195, 80], [[0, 0, 0], [0xf2, 0xc1, 0x4e]])).toEqual([0xf2, 0xc1, 0x4e]);
  });
});
