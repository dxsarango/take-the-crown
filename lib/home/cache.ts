import "server-only";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { publicClient } from "@/lib/supabase/public";
import { fetchHomeData } from "./data";

export const HOME_TAG = "home";

/**
 * The home page renders per request (its CSP nonce is per request), so its data is cached
 * instead: traffic spikes hit the cache, realtime keeps open tabs current (SPEC §6).
 */
export const cachedHomeData = unstable_cache(() => fetchHomeData(publicClient()), ["home-data"], { revalidate: 10, tags: [HOME_TAG] });

/** After a takeover or a content change: the next visitor gets fresh data. */
export function revalidateHome(): void {
  revalidateTag(HOME_TAG, { expire: 0 });
  revalidatePath("/[locale]", "page");
}
