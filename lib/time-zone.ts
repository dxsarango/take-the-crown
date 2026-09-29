/** Cookie holding the reader's IANA time zone, so the server can render times the way the browser will. */
export const TIME_ZONE_COOKIE = "tz";

/** The zone if Intl knows it, else null (the cookie is client-controlled input). */
export function validTimeZone(value: string | undefined | null): string | null {
  if (!value || value.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return null;
  }
}
