/**
 * Pages read public data through a cache that the app drops on every change it makes. Fixtures
 * write to the database directly, so they drop it themselves (app/api/e2e/revalidate).
 */
export async function dropPublicCache(): Promise<void> {
  const base = process.env.E2E_BASE_URL;
  // Without a local server (or before it is up) there is nothing cached to drop.
  if (base) await fetch(`${base}/api/e2e/revalidate`, { method: "POST" }).catch(() => undefined);
}
