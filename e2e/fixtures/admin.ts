import { createHmac } from "node:crypto";
import { type Page, expect } from "@playwright/test";
import en from "../../messages/en.json";
import { sql } from "./db";
import { signInByEmail } from "./mail";

/** The current code (RFC 6238: SHA-1, 30-second steps, 6 digits) for a base32 TOTP secret. */
export function totp(secret: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

// Each admin's TOTP secret from its enrollment in this run (seeding deletes the users, and their factors).
const secrets = new Map<string, string>();

/** Enrolls TOTP on /admin or answers its challenge, and waits for the panel. */
export async function passTwoStep(page: Page, email: string): Promise<void> {
  const title = page.getByRole("heading", { level: 1 });
  await expect(title).toBeVisible();
  if ((await title.textContent()) === en.admin.security.enrollHead) {
    await page.getByRole("button", { name: en.admin.security.enrollStart }).click();
    secrets.set(email, (await page.getByTestId("totp-secret").textContent())!.trim());
  }
  const secret = secrets.get(email);
  if (!secret) throw new Error(`No TOTP secret enrolled for ${email} in this run`);
  await page.getByLabel(en.admin.security.codeL).fill(totp(secret));
  await page.getByRole("button", { name: en.admin.security.verify }).click();
  await expect(page.getByRole("heading", { level: 1, name: en.admin.title })).toBeVisible();
}

/** Makes `email` an admin, signs in by magic link and passes two-step verification on /en/admin. */
export async function signInAsAdmin(page: Page, email: string): Promise<void> {
  await sql("update profile_private set is_admin = true where email = $1", [email]);
  await signInByEmail(page, email, "/en/admin");
  await passTwoStep(page, email);
}
