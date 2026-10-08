import { describe, expect, it } from "vitest";
import { errorText, redactEmails } from "@/lib/security/redact";

describe("redactEmails", () => {
  it.each([
    ["Invalid recipient ana.codes+test@example.com", "Invalid recipient [email]"],
    ['Email address "ana@mail.example.co.uk" is not verified.', 'Email address "[email]" is not verified.'],
    ["rate limit for ana@example.com, retry later", "rate limit for [email], retry later"],
    ["from <a@b.io> to (c_d@e-f.dev).", "from <[email]> to ([email])."],
    ["Dodo refused ana@example.com and luis@example.org", "Dodo refused [email] and [email]"],
    ["señor.núñez@correo.example failed", "[email] failed"],
    ["ANA@EXAMPLE.COM", "[email]"],
  ])("removes the address in %j", (input, expected) => {
    expect(redactEmails(input)).toBe(expected);
  });

  it("leaves text without addresses alone", () => {
    for (const text of ["payment pay_123 not found", "429 Too Many Requests", "user @ home", "at-sign @ alone"]) {
      expect(redactEmails(text)).toBe(text);
    }
  });
});

describe("errorText", () => {
  it("reads the message of an Error and redacts it", () => {
    expect(errorText(new Error("no mailbox for ana@example.com"))).toBe("no mailbox for [email]");
  });

  it("stringifies other values", () => {
    expect(errorText("bounced: ana@example.com")).toBe("bounced: [email]");
    expect(errorText(42)).toBe("42");
  });
});
