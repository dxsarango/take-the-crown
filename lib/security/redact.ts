// Letters, digits and the characters an address may contain, on both sides of the "@".
const EMAIL = /[\p{L}\p{N}.!#$%&'*+/=?^_`{|}~-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*/gu;

/** Replaces every email address in `text`, so provider messages can be logged and stored. */
export function redactEmails(text: string): string {
  return text.replace(EMAIL, "[email]");
}

/** The message of a thrown value with email addresses removed. */
export function errorText(error: unknown): string {
  return redactEmails(error instanceof Error ? error.message : String(error));
}
