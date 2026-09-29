export const dynamic = "force-dynamic";

/** Server clock for the client's clock offset (SPEC §6). */
export function GET() {
  return Response.json({ now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
