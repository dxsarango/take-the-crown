import "server-only";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { publicClient } from "@/lib/supabase/public";
import { serviceClient } from "@/lib/supabase/service";
import { fetchSeasons } from "@/lib/realm/data";
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

/**
 * Every public page asks which season is current, and most also list the seasons, once for its
 * metadata and once for its body. One cached read serves them all.
 */
export const cachedSeasons = unstable_cache(() => fetchSeasons(publicClient()), ["seasons"], { revalidate: 10, tags: [HOME_TAG] });

export const cachedContactEmail = unstable_cache(
  async () => {
    const { data } = await serviceClient().from("app_config").select("legal_contact_email").single();
    return data?.legal_contact_email ?? null;
  },
  ["legal-contact-email"],
  { revalidate: 10 },
);
