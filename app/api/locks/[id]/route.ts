import { z } from "zod";
import { lockStatus } from "@/lib/locks/status";

/** Lock status for the buyer who holds its (unguessable) id. */
export async function GET(_request: Request, { params }: RouteContext<"/api/locks/[id]">) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return Response.json({ status: "not_found" }, { status: 404 });
  return Response.json(await lockStatus(id.data), { headers: { "Cache-Control": "no-store" } });
}
