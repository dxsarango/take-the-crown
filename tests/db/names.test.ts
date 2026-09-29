import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PARTS, traitsFromUsername } from "@/design/lib/avatar-lib.js";
import {
  Player,
  createLock,
  one,
  pay,
  q,
  svc,
  withFreshGame,
} from "./helpers";

withFreshGame();

const seed = () => randomUUID().replaceAll("-", "");

async function available(name: string, profileId: string | null = null): Promise<boolean> {
  const [row] = await svc<{ ok: boolean }>("select is_profile_name_available($1, $2) as ok", [name, profileId]);
  return row.ok;
}

async function rename(profileId: string, name: string): Promise<void> {
  await svc("select change_profile_name($1, $2)", [profileId, name]);
}

async function profile(id: string): Promise<Record<string, unknown>> {
  return one("select * from profiles where id = $1", [id]);
}

async function resolve(name: string): Promise<string | null> {
  const [row] = await q<{ id: string | null }>("select profile_id_for_name($1) as id", [name]);
  return row.id;
}

describe("public names", () => {
  it.each(["abc", "Ana.Codes", "priya_ships", "a-b-c", "x".repeat(24)])("accepts %s", async (name) => {
    const [row] = await q<{ ok: boolean }>("select is_valid_profile_name($1) as ok", [name]);
    expect(row.ok).toBe(true);
  });

  it.each(["ab", "x".repeat(25), "has space", "emoji👑", "slash/name", "", null])("rejects %s", async (name) => {
    const [row] = await q<{ ok: boolean }>("select is_valid_profile_name($1) as ok", [name]);
    expect(row.ok).toBe(false);
  });

  it("is unique regardless of case", async () => {
    const king = new Player("king");
    await king.takeover({ name: "MixedCase" });
    expect(await available("mixedcase")).toBe(false);
    expect(await available("MIXEDCASE", await king.id())).toBe(true);
    await expect(q("insert into profiles (name) values ('MIXEDCASE')")).rejects.toThrow(/duplicate key/);
  });

  describe("in the payment flow", () => {
    it("rejects an invalid guest name before locking", async () => {
      await expect(createLock({ name: "no spaces" })).rejects.toThrow("name_invalid");
      const state = await one<{ is_locked: boolean }>("select is_locked from public_crown_state");
      expect(state.is_locked).toBe(false);
    });

    it("rejects a guest name already in use", async () => {
      await new Player("owner").takeover({ name: "Taken" });
      await expect(createLock({ name: "taken" })).rejects.toThrow("name_taken");
    });

    it("gives the new profile the chosen name and keeps it as the reign snapshot", async () => {
      const lock = await createLock({ name: "Fresh.King" });
      await pay(lock);
      const reign = await one<{ name: string; profile_id: string }>("select name, profile_id from reigns");
      expect(reign.name).toBe("Fresh.King");
      expect((await profile(reign.profile_id)).name).toBe("Fresh.King");
    });

    it("uses a signed-in buyer's current name and ignores the one sent", async () => {
      const player = new Player("known");
      await player.takeover();
      await new Player("other").takeover();
      const lock = await createLock({ email: player.email, profileId: await player.id(), name: "Something.Else" });
      expect(lock).toMatchObject({ name: player.name });
    });

    it("falls back to a generated name if the chosen one was taken before payment", async () => {
      const lock = await createLock({ name: "Contested" });
      await q("insert into profiles (name) values ('CONTESTED')");
      expect(await pay(lock)).toBe("applied");
      const reign = await one<{ name: string }>("select name from reigns");
      expect(reign.name).toMatch(/^king_[0-9a-f]{8}$/);
    });
  });

  describe("change_profile_name", () => {
    it("renames, records the old name and redirects it", async () => {
      const player = new Player("renamer");
      await player.takeover();
      const id = await player.id();
      await rename(id, "New.Name");

      expect(await profile(id)).toMatchObject({ name: "New.Name" });
      expect((await profile(id)).name_changed_at).not.toBeNull();
      expect(await resolve(player.name.toUpperCase())).toBe(id);
      expect(await resolve("new.name")).toBe(id);
      expect(await resolve("nobody_here")).toBeNull();
    });

    it("keeps reign snapshots with the name they were won with", async () => {
      const player = new Player("snapshot");
      await player.takeover();
      await rename(await player.id(), "Later.Name");
      const reign = await one<{ name: string }>("select name from public_reigns");
      expect(reign.name).toBe(player.name);
    });

    it("reserves old names for their owner", async () => {
      const player = new Player("reserver");
      await player.takeover();
      await rename(await player.id(), "Second");
      expect(await available(player.name)).toBe(false);
      await expect(createLock({ name: player.name })).rejects.toThrow("name_taken");

      const other = new Player("other");
      await other.takeover();
      await q("update profiles set name_changed_at = null where id = $1", [await other.id()]);
      await expect(rename(await other.id(), player.name)).rejects.toThrow("name_taken");
    });

    it("lets an admin release a reserved name", async () => {
      const player = new Player("released");
      await player.takeover();
      const id = await player.id();
      await rename(id, "Moved.On");

      const [released] = await svc<{ ok: boolean }>("select release_profile_name($1) as ok", [player.name.toUpperCase()]);
      expect(released.ok).toBe(true);
      expect(await available(player.name)).toBe(true);
      expect(await resolve(player.name)).toBeNull();
      expect(await profile(id)).toMatchObject({ name: "Moved.On" });

      const [again] = await svc<{ ok: boolean }>("select release_profile_name($1) as ok", [player.name]);
      expect(again.ok).toBe(false);
    });

    it("does not release a name in current use", async () => {
      const player = new Player("current");
      await player.takeover();
      const [released] = await svc<{ ok: boolean }>("select release_profile_name($1) as ok", [player.name]);
      expect(released.ok).toBe(false);
      expect(await available(player.name)).toBe(false);
    });

    it("lets the owner take back an old name after the cooldown", async () => {
      const player = new Player("comeback");
      await player.takeover();
      const id = await player.id();
      await rename(id, "Interim");
      await q("update profiles set name_changed_at = now() - interval '31 days' where id = $1", [id]);
      await rename(id, player.name);

      expect(await profile(id)).toMatchObject({ name: player.name });
      const history = await q<{ name: string }>("select name from profile_name_history where profile_id = $1", [id]);
      expect(history.map((row) => row.name)).toEqual(["Interim"]);
    });

    it("allows one change per configured period", async () => {
      const player = new Player("cooldown");
      await player.takeover();
      const id = await player.id();
      await rename(id, "First.Change");
      await expect(rename(id, "Second.Change")).rejects.toThrow("name_change_too_soon");

      await q("update profiles set name_changed_at = now() - interval '29 days' where id = $1", [id]);
      await expect(rename(id, "Second.Change")).rejects.toThrow("name_change_too_soon");

      await q("update app_config set name_change_days = 7");
      await rename(id, "Second.Change");
      expect(await profile(id)).toMatchObject({ name: "Second.Change" });
    });

    it("lets a guest-created profile rename right away", async () => {
      const player = new Player("guest");
      await player.takeover();
      await rename(await player.id(), "Chosen.Later");
      expect(await profile(await player.id())).toMatchObject({ name: "Chosen.Later" });
    });

    it("does not reserve the old spelling on a case-only change", async () => {
      const player = new Player("casey");
      await player.takeover({ name: "casey.one" });
      await rename(await player.id(), "Casey.One");
      expect(await profile(await player.id())).toMatchObject({ name: "Casey.One" });
      expect(await one("select count(*)::int as n from profile_name_history")).toEqual({ n: 0 });
    });

    it("is a no-op for the same name", async () => {
      const player = new Player("same");
      await player.takeover();
      await rename(await player.id(), player.name);
      expect((await profile(await player.id())).name_changed_at).toBeNull();
    });

    it("rejects invalid names and unknown profiles", async () => {
      const player = new Player("strict");
      await player.takeover();
      await expect(rename(await player.id(), "bad name")).rejects.toThrow("name_invalid");
      await expect(rename(randomUUID(), "Whoever")).rejects.toThrow("profile_not_found");
    });
  });
});

describe("avatars", () => {
  it("gives a guest profile the seed sent from the payment modal", async () => {
    const avatarSeed = seed();
    const lock = await createLock({ avatarSeed });
    await pay(lock);
    const reign = await one<{ profile_id: string }>("select profile_id from reigns");
    expect(await profile(reign.profile_id)).toMatchObject({ avatar_seed: avatarSeed, avatar_traits: null });
  });

  it("generates a seed when none is sent", async () => {
    const player = new Player("seedless");
    await player.takeover({ avatarSeed: null });
    expect(String((await profile(await player.id())).avatar_seed)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("keeps a known buyer's seed", async () => {
    const player = new Player("keeper");
    await player.takeover({ avatarSeed: seed() });
    const original = (await profile(await player.id())).avatar_seed;
    await new Player("other").takeover();
    await player.takeover({ avatarSeed: seed() });
    expect((await profile(await player.id())).avatar_seed).toBe(original);
  });

  it("rejects a malformed seed", async () => {
    await expect(createLock({ avatarSeed: "not-hex" })).rejects.toThrow("avatar_seed_invalid");
  });

  describe("avatar_traits", () => {
    async function valid(traits: unknown): Promise<boolean> {
      const [row] = await q<{ ok: boolean }>("select is_valid_avatar_traits($1::jsonb) as ok", [JSON.stringify(traits)]);
      return row.ok;
    }

    // Trait key → the PARTS list it indexes in design/lib/avatar-lib.js.
    const LISTS = {
      skin: "skins",
      hair: "hairStyles",
      hc: "hairColors",
      fh: "facialHair",
      ex: "expressions",
      cr: "crowns",
      cape: "capes",
      cc: "capeColors",
      acc: "accessories",
      bg: "backgrounds",
    } as const;

    it("covers exactly the traits avatar-lib generates", () => {
      expect(Object.keys(LISTS).sort()).toEqual(Object.keys(traitsFromUsername("anyone")).sort());
    });

    it.each(Object.entries(LISTS))("accepts every %s option and nothing past it", async (trait, list) => {
      const last = PARTS[list].length - 1;
      const first = trait === "acc" ? -1 : 0;
      expect(await valid({ [trait]: first })).toBe(true);
      expect(await valid({ [trait]: last })).toBe(true);
      expect(await valid({ [trait]: last + 1 })).toBe(false);
      expect(await valid({ [trait]: first - 1 })).toBe(false);
    });

    it("accepts a partial override and a full trait set", async () => {
      expect(await valid({ hair: 3 })).toBe(true);
      expect(await valid(traitsFromUsername("full.set"))).toBe(true);
      expect(await valid({})).toBe(true);
    });

    it.each([[{ wings: 1 }], [{ hair: "3" }], [{ hair: 1.5 }], [[1, 2]], ["hair"]])("rejects %j", async (traits) => {
      expect(await valid(traits)).toBe(false);
    });

    it("is enforced on profiles", async () => {
      const player = new Player("styled");
      await player.takeover();
      const id = await player.id();
      await q("update profiles set avatar_traits = $2 where id = $1", [id, JSON.stringify({ hair: 2, acc: -1 })]);
      await expect(
        q("update profiles set avatar_traits = $2 where id = $1", [id, JSON.stringify({ hair: 99 })]),
      ).rejects.toThrow(/profiles_avatar_traits_check/);
    });
  });
});
