import { z } from "zod";
import { sameOrigin } from "@/lib/security/request";
import { serviceClient } from "@/lib/supabase/service";

/** The buyer closed or declined checkout: free the crown for everyone else. */
export async function POST(request: Request, { params }: RouteContext<"/api/locks/[id]/release">) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return new Response(null, { status: 404 });
  const { error } = await serviceClient().rpc("release_price_lock", { p_lock_id: id.data });
  if (error) return new Response(null, { status: 500 });
  return new Response(null, { status: 204 });
}
