import { z } from "zod";
import { serviceClient } from "@/lib/supabase/service";

/** The buyer closed or declined checkout: free the crown for everyone else. */
export async function POST(_request: Request, { params }: RouteContext<"/api/locks/[id]/release">) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return new Response(null, { status: 404 });
  const { error } = await serviceClient().rpc("release_price_lock", { p_lock_id: id.data });
  if (error) return new Response(null, { status: 500 });
  return new Response(null, { status: 204 });
}
