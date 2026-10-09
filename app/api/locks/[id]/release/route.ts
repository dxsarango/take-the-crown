import { z } from "zod";
import { revalidateHome } from "@/lib/home/cache";
import { sameOrigin } from "@/lib/security/request";
import { serviceClient } from "@/lib/supabase/service";

/** The buyer closed or declined checkout: free the crown for everyone else. */
export async function POST(request: Request, { params }: RouteContext<"/api/locks/[id]/release">) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return new Response(null, { status: 404 });
  const db = serviceClient();
  const { data: lock } = await db.from("price_locks").select("status").eq("id", id.data).maybeSingle();
  const { error } = await db.rpc("release_price_lock", { p_lock_id: id.data });
  if (error) return new Response(null, { status: 500 });
  // The home shows the lock from a cache: refresh it now that the crown is free. Only when a lock
  // was really held, so nobody can keep the cache empty by calling this with ids that mean nothing.
  if (lock?.status === "active") revalidateHome();
  return new Response(null, { status: 204 });
}
