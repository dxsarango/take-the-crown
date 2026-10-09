import { isDeployed } from "@/lib/config/deployment";
import { revalidateHome } from "@/lib/home/cache";

/**
 * Local only: e2e fixtures write to the database directly, past the routes that drop the cached
 * public data, so they call this after each write. Absent on any deployment.
 */
export function POST() {
  if (isDeployed()) return new Response(null, { status: 404 });
  revalidateHome();
  return new Response(null, { status: 204 });
}
