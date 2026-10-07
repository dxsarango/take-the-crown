import { describe, expect, it } from "vitest";
import { findSecrets } from "@/scripts/bundle-secrets.mjs";

const jwt = (payload: object) =>
  ["eyJhbGciOiJIUzI1NiJ9", Buffer.from(JSON.stringify(payload)).toString("base64url"), "c2lnbmF0dXJlLXNpZ25hdHVyZQ"].join(".");

describe("client bundle secret scan", () => {
  it("finds secret key formats without repeating them", () => {
    const chunk = [
      'const a="sb_secret_abcdefghijklmnopqrstuvwx"',
      'const b="sk-ant-api03-abcdefghijklmnopqrstuvwxyz"',
      'const c="re_12345678_abcdefghijk"',
      'const d="-----BEGIN PRIVATE KEY-----"',
      'const e="whsec_abcdefghijklmnopqrstuvwxyz0123"',
      `const f="${jwt({ role: "service_role", iss: "supabase" })}"`,
    ].join(";");
    const found = findSecrets(chunk);
    expect(found).toEqual([
      "a Supabase secret key",
      "an Anthropic API key",
      "a Resend API key",
      "a private key",
      "a Standard Webhooks secret",
      "a Supabase service role key",
    ]);
    expect(found.join(" ")).not.toMatch(/sb_secret_|sk-ant-|whsec_/);
  });

  it("allows the public anon key and ordinary code", () => {
    const chunk = `const url="https://ref.supabase.co",anon="${jwt({ role: "anon", iss: "supabase" })}",pk="sb_publishable_abc";console.log("Take the crown")`;
    expect(findSecrets(chunk)).toEqual([]);
  });

  it("flags server variable names, which mean server code was bundled", () => {
    expect(findSecrets('throw new Error("CRON_SECRET is not set")')).toEqual(["the name CRON_SECRET (server code in the bundle?)"]);
  });

  it("finds the real values of local secrets, naming only the variable", () => {
    const value = "a-local-secret-value-1234567890";
    expect(findSecrets(`x="${value}"`, { EMAIL_LINK_SECRET: value, IP_HASH_SALT: "short" })).toEqual(["the value of EMAIL_LINK_SECRET"]);
  });
});
