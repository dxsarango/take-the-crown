import { expect, it } from "vitest";
import { applyDevSeed, resetToSeed } from "./reset";
import { admin, createLock, one, q, withFreshGame } from "./helpers";

withFreshGame();

it("opens the current season for local development", async () => {
  const client = await admin.connect();
  try {
    await resetToSeed(client);
    await q("update seasons set starts_at = now() + interval '3 days' where id = 0");
    await expect(createLock()).rejects.toThrow("season_closed");

    await applyDevSeed(client);
  } finally {
    client.release();
  }
  const season = await one<{ open: boolean }>("select starts_at <= now() and now() < ends_at as open from seasons where id = 0");
  expect(season.open).toBe(true);
  await expect(createLock()).resolves.toMatchObject({ status: "active" });
});
