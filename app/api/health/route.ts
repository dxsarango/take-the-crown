import { publicClient } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

/**
 * Uptime check: one tiny, uncached database read. Answers only whether the app can reach its
 * database, so it says nothing else about the system.
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const { error } = await publicClient().from("app_config").select("id").abortSignal(AbortSignal.timeout(5000)).single();
    if (error) throw new Error(error.message);
    return Response.json({ ok: true }, { headers });
  } catch (e) {
    console.error("health check failed", e);
    return Response.json({ ok: false }, { status: 503, headers });
  }
}
