import { expect, test } from "@playwright/test";

test("health check reads the database and is never cached", async ({ request }) => {
  test.skip(test.info().project.name !== "desktop", "server behaviour");
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(response.headers()["cache-control"]).toBe("no-store");
});
