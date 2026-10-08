/**
 * The address to put in an `href`, or null. Links are checked when saved, and checked again here
 * when shown, so a bad value that reaches the database by any other way never becomes a clickable
 * `javascript:` or `data:` link. Only https, a real domain, no credentials or port.
 */
export function safeHttpsUrl(value: string | null | undefined): string | null {
  if (!value || /\s/.test(value)) return null;
  try {
    const url = new URL(value);
    const ok = url.protocol === "https:" && url.hostname.includes(".") && !url.username && !url.password && !url.port;
    return ok ? value : null;
  } catch {
    return null;
  }
}
