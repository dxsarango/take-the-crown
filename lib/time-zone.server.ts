import "server-only";
import { cookies } from "next/headers";
import { TIME_ZONE_COOKIE, validTimeZone } from "./time-zone";

/** The reader's time zone from a previous visit, or null on a first visit. Makes the page dynamic. */
export async function readerTimeZone(): Promise<string | null> {
  const raw = (await cookies()).get(TIME_ZONE_COOKIE)?.value;
  try {
    return validTimeZone(raw ? decodeURIComponent(raw) : null);
  } catch {
    return null;
  }
}
