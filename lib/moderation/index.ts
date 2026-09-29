/**
 * Moderation before any lock or charge (SPEC §7). M7 adds the full link rules and the
 * claude-haiku-4-5 verdict behind this same function; for now it applies the two rules the
 * design shows in the payment modal.
 */
export type ModerationInput = { name: string; message: string | null; link: string | null };

export type ModerationVerdict =
  | { verdict: "allow" }
  | { verdict: "reject"; field: "link" | "message" | "name"; reason: "shortener" | "link_in_message" };

const SHORTENERS = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "cutt.ly", "rb.gy"];
const URL_IN_TEXT = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|app|io|dev|co|so|ly|me|net|org)\b)/i;

export async function moderate(input: ModerationInput): Promise<ModerationVerdict> {
  if (input.link) {
    const host = hostOf(input.link);
    if (host && SHORTENERS.some((s) => host === s || host.endsWith(`.${s}`))) {
      return { verdict: "reject", field: "link", reason: "shortener" };
    }
  }
  if (input.message && URL_IN_TEXT.test(input.message)) {
    return { verdict: "reject", field: "message", reason: "link_in_message" };
  }
  return { verdict: "allow" };
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}
