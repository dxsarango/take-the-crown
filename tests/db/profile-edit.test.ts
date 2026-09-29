import { describe, expect, it } from "vitest";
import { Player, ageCurrentReign, asRole, closeSeason, one, q, svc, withFreshGame } from "./helpers";

withFreshGame();

type Settings = {
  name: string;
  country_code: string | null;
  main_link: string | null;
  link_website: string | null;
  link_x: string | null;
  link_youtube: string | null;
  link_tiktok: string | null;
  link_instagram: string | null;
  link_github: string | null;
  link_linkedin: string | null;
  avatar_mode: string;
  avatar_path: string | null;
  avatar_pixelated: boolean;
  avatar_traits: Record<string, number> | null;
  showcase: string[];
  show_rival: boolean;
  show_chronicle: boolean;
  alerts_dethroned: boolean;
  alerts_price_below_cents: number | null;
  alerts_season_start: boolean;
  locale: string;
};

async function current(profileId: string): Promise<Settings> {
  return one<Settings>(
    `select p.name, p.country_code, p.main_link, p.link_website, p.link_x, p.link_youtube, p.link_tiktok,
       p.link_instagram, p.link_github, p.link_linkedin, p.avatar_mode, p.avatar_path, p.avatar_pixelated,
       p.avatar_traits, p.showcase, p.show_rival, p.show_chronicle, pp.alerts_dethroned,
       pp.alerts_price_below_cents, pp.alerts_season_start, pp.locale
     from profiles p join profile_private pp on pp.profile_id = p.id where p.id = $1`,
    [profileId],
  );
}

async function save(profileId: string, changes: Partial<Settings>): Promise<Settings> {
  const s = { ...(await current(profileId)), ...changes };
  await svc(
    `select update_profile($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
    [
      profileId,
      s.name,
      s.country_code,
      s.main_link,
      s.link_website,
      s.link_x,
      s.link_youtube,
      s.link_tiktok,
      s.link_instagram,
      s.link_github,
      s.link_linkedin,
      s.avatar_mode,
      s.avatar_path,
      s.avatar_pixelated,
      s.avatar_traits === null ? null : JSON.stringify(s.avatar_traits),
      s.showcase,
      s.show_rival,
      s.show_chronicle,
      s.alerts_dethroned,
      s.alerts_price_below_cents,
      s.alerts_season_start,
      s.locale,
    ],
  );
  return current(profileId);
}

async function player(label: string): Promise<{ player: Player; id: string }> {
  const p = new Player(label);
  await p.takeover();
  return { player: p, id: await p.id() };
}

const UPLOAD = "00000000-0000-4000-8000-000000000001";

describe("update_profile", () => {
  it("saves every setting of the edit profile form", async () => {
    const { id } = await player("editor");
    const saved = await save(id, {
      country_code: null,
      main_link: "https://ana.dev",
      link_x: "https://x.com/ana",
      link_tiktok: "https://tiktok.com/@ana.codes",
      link_linkedin: "https://linkedin.com/in/ana-codes",
      avatar_traits: { hair: 3, acc: -1 },
      showcase: ["founder"],
      show_rival: false,
      show_chronicle: false,
      alerts_dethroned: false,
      alerts_price_below_cents: 2000,
      alerts_season_start: true,
      locale: "es",
    });
    expect(saved).toMatchObject({
      country_code: null,
      main_link: "https://ana.dev",
      link_x: "https://x.com/ana",
      link_tiktok: "https://tiktok.com/@ana.codes",
      link_linkedin: "https://linkedin.com/in/ana-codes",
      avatar_traits: { hair: 3, acc: -1 },
      showcase: ["founder"],
      show_rival: false,
      show_chronicle: false,
      alerts_dethroned: false,
      alerts_price_below_cents: 2000,
      alerts_season_start: true,
      locale: "es",
    });
  });

  it("changes the name through the name rules and keeps the old one reserved", async () => {
    const { player: p, id } = await player("renamer");
    const saved = await save(id, { name: "brand_new" });
    expect(saved.name).toBe("brand_new");
    expect(await one("select profile_id from profile_name_history where name = $1", [p.name])).toEqual({ profile_id: id });
    await expect(save(id, { name: "again_new" })).rejects.toThrow(/name_change_too_soon/);
  });

  it("saves nothing when any part fails", async () => {
    const { id } = await player("atomic");
    const { player: other } = await player("holder");
    const before = await current(id);

    await expect(save(id, { name: other.name, link_x: "https://x.com/changed" })).rejects.toThrow(/name_taken/);
    await expect(save(id, { link_x: "https://x.com/changed", link_github: "https://github.com/-bad" })).rejects.toThrow(
      /profiles_link_github_format/,
    );
    expect(await current(id)).toEqual(before);
  });

  it("only accepts up to three distinct achievements the player has earned", async () => {
    const { id } = await player("collector");
    expect((await save(id, { showcase: ["founder", "first_blood"] })).showcase).toEqual(["founder", "first_blood"]);
    await expect(save(id, { showcase: ["regicide"] })).rejects.toThrow(/showcase_invalid/);
    await expect(save(id, { showcase: ["founder", "founder"] })).rejects.toThrow(/showcase_invalid/);
    await expect(save(id, { showcase: ["founder", "first_blood", "bargain_hunter", "patriot"] })).rejects.toThrow(
      /showcase_invalid/,
    );
  });

  it("only points uploaded avatars at files stored under the profile", async () => {
    const { id } = await player("uploader");
    const { id: otherId } = await player("victim");
    const saved = await save(id, { avatar_mode: "upload", avatar_path: `${id}/${UPLOAD}`, avatar_pixelated: false });
    expect(saved).toMatchObject({ avatar_mode: "upload", avatar_path: `${id}/${UPLOAD}`, avatar_pixelated: false });

    await expect(save(id, { avatar_mode: "upload", avatar_path: null })).rejects.toThrow(/avatar_invalid/);
    await expect(save(id, { avatar_path: `${otherId}/${UPLOAD}` })).rejects.toThrow(/avatar_invalid/);
    await expect(save(id, { avatar_path: `${id}/../${otherId}/${UPLOAD}` })).rejects.toThrow(/avatar_invalid/);
    await expect(save(id, { avatar_mode: "gif" })).rejects.toThrow(/avatar_invalid/);
  });

  it("rejects invalid avatar traits", async () => {
    const { id } = await player("painter");
    await expect(save(id, { avatar_traits: { hair: 99 } })).rejects.toThrow(/avatar_traits/);
  });

  it("keeps the price alert between the floor and $999 in whole dollars", async () => {
    const { id } = await player("bargain");
    await expect(save(id, { alerts_price_below_cents: 400 })).rejects.toThrow(/alert_price_invalid/);
    await expect(save(id, { alerts_price_below_cents: 2050 })).rejects.toThrow(/alert_price_invalid/);
    await expect(save(id, { alerts_price_below_cents: 100_000 })).rejects.toThrow(/alert_price_invalid/);
    expect((await save(id, { alerts_price_below_cents: 500 })).alerts_price_below_cents).toBe(500);
    expect((await save(id, { alerts_price_below_cents: null })).alerts_price_below_cents).toBeNull();
  });

  it("lets a new price threshold alert in the current price cycle", async () => {
    const { id } = await player("rewatcher");
    await q("update profile_private set alerts_price_below_cents = 1000, alerts_price_notified_for = now() where profile_id = $1", [id]);
    await save(id, { alerts_price_below_cents: 1500 });
    expect(await one("select alerts_price_notified_for from profile_private where profile_id = $1", [id])).toEqual({
      alerts_price_notified_for: null,
    });
  });

  it("rejects unknown locales and profiles", async () => {
    const { id } = await player("polyglot");
    await expect(save(id, { locale: "fr" })).rejects.toThrow(/locale_invalid/);
    await expect(
      svc("select update_profile($1, 'ghost', null, null, null, null, null, null, null, null, null, 'generated', null, true, null, '{}', true, true, true, null, false, 'en')", [
        "00000000-0000-4000-8000-00000000abcd",
      ]),
    ).rejects.toThrow(/profile_not_found/);
  });

  it("cannot be called by clients", async () => {
    for (const role of ["anon", "authenticated"]) {
      await expect(
        asRole(role, (c) =>
          c.query(
            "select update_profile(gen_random_uuid(), 'x', null, null, null, null, null, null, null, null, null, 'generated', null, true, null, '{}', true, true, true, null, false, 'en')",
          ),
        ),
      ).rejects.toThrow(/permission denied/);
    }
  });
});

describe("avatars bucket", () => {
  it("is public and only takes the processed image types", async () => {
    expect(await one("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars'")).toEqual({
      public: true,
      file_size_limit: 1048576,
      allowed_mime_types: ["image/png", "image/webp"],
    });
  });

  it("has no client write policies", async () => {
    const rows = await q("select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'");
    expect(rows).toEqual([]);
  });
});

describe("public_chronicle", () => {
  it("links each reign to who it was taken from and who took it", async () => {
    const ana = new Player("ana");
    const ben = new Player("ben");
    await ana.takeover();
    await ageCurrentReign(60);
    await ben.takeover();
    await ageCurrentReign(60);
    await ana.takeover();

    const rows = await q(
      "select name, from_name, to_name, to_profile_id is not null as has_to from public_chronicle order by id",
    );
    expect(rows).toEqual([
      { name: ana.name, from_name: null, to_name: ben.name, has_to: true },
      { name: ben.name, from_name: ana.name, to_name: ana.name, has_to: true },
      { name: ana.name, from_name: ben.name, to_name: null, has_to: false },
    ]);
  });

  it("starts a new season from the empty throne", async () => {
    const ana = new Player("ana");
    await ana.takeover();
    await ageCurrentReign(60);
    await closeSeason(0);
    await svc("select rollover_season()");
    const ben = new Player("ben");
    await ben.takeover();

    const rows = await q("select name, from_name, to_name, end_reason from public_chronicle order by id");
    expect(rows).toEqual([
      { name: ana.name, from_name: null, to_name: null, end_reason: "season_end" },
      { name: ben.name, from_name: null, to_name: null, end_reason: null },
    ]);
  });

  it("is readable by clients", async () => {
    await new Player("reader").takeover();
    const rows = await asRole("anon", (c) => c.query("select count(*)::int as n from public_chronicle"));
    expect(rows.rows).toEqual([{ n: 1 }]);
  });
});

describe("public_rivalries", () => {
  it("counts how often each player took the crown from the other", async () => {
    const ana = new Player("ana");
    const ben = new Player("ben");
    const cy = new Player("cy");
    for (const p of [ana, ben, ana, ben, ana, cy]) {
      await p.takeover();
      await ageCurrentReign(60);
    }
    const [anaId, benId, cyId] = await Promise.all([ana.id(), ben.id(), cy.id()]);
    const rows = await q<{ profile_id: string; rival_id: string; wins: number; losses: number }>(
      "select profile_id, rival_id, wins, losses from public_rivalries",
    );
    const pair = (a: string, b: string) => rows.find((r) => r.profile_id === a && r.rival_id === b);
    expect(pair(anaId, benId)).toMatchObject({ wins: 2, losses: 2 });
    expect(pair(benId, anaId)).toMatchObject({ wins: 2, losses: 2 });
    expect(pair(cyId, anaId)).toMatchObject({ wins: 1, losses: 0 });
    expect(pair(anaId, cyId)).toMatchObject({ wins: 0, losses: 1 });
    expect(pair(benId, cyId)).toBeUndefined();
  });
});
