import { describe, expect, it } from "vitest";
import { Player, count, q, svc, withFreshGame } from "./helpers";

withFreshGame();

async function admin(): Promise<string> {
  const player = new Player("admin");
  await player.takeover();
  const id = await player.id();
  await q("update profile_private set is_admin = true where profile_id = $1", [id]);
  return id;
}

const queue = () => svc("select queue_season_readiness_alerts()");

describe("queue_season_readiness_alerts", () => {
  it("emails each admin once, 30 days before a season starts without its final name or art", async () => {
    const adminId = await admin();
    await new Player("player").takeover();
    await q("update seasons set starts_at = now() + interval '20 days', ends_at = now() + interval '20 days' + interval '30 days' where id = 1");
    await q("update seasons set starts_at = now() + interval '40 days', ends_at = now() + interval '40 days' + interval '30 days' where id = 2");

    await queue();
    await queue();

    const rows = await q<{ profile_id: string; payload: Record<string, unknown> }>(
      "select profile_id, payload from notifications where kind = 'season_not_ready'",
    );
    // Frost (art missing) is within 30 days; season 2 (name and art missing) is not yet.
    expect(rows).toEqual([
      { profile_id: adminId, payload: expect.objectContaining({ season_id: 1, name_final: true, art_final: false }) },
    ]);
  });

  it("skips seasons that are ready and seasons already under way", async () => {
    await admin();
    await q("update seasons set art_final = true where id = 1");
    await q("update seasons set starts_at = now() + interval '10 days', ends_at = now() + interval '10 days' + interval '30 days' where id = 1");
    await q("update seasons set starts_at = now() - interval '1 day' where id = 2");
    await queue();
    expect(await count("notifications", "kind = 'season_not_ready'")).toBe(0);
  });

  it("follows season_ready_alert_days and warns again after launch moves the dates", async () => {
    await admin();
    await q("update app_config set season_ready_alert_days = 60");
    await q("update seasons set starts_at = now() + interval '45 days', ends_at = now() + interval '45 days' + interval '30 days' where id = 1");
    await queue();
    expect(await count("notifications", "kind = 'season_not_ready' and payload->>'season_id' = '1'")).toBe(1);

    await q("update app_config set prelaunch = true");
    await svc("select launch_game(now() + interval '1 hour')");
    expect(await q("select ready_alert_at from seasons where ready_alert_at is not null")).toEqual([]);
  });
});
