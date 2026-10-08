import { describe, expect, it } from "vitest";
import { safeHttpsUrl } from "@/lib/links";

describe("safeHttpsUrl", () => {
  it.each(["https://turno.app", "https://shop.example.co.uk/path?x=1#top", "https://x.com/ana_codes", "HTTPS://Ana.dev/Launch"])(
    "keeps %s as it is",
    (url) => {
      expect(safeHttpsUrl(url)).toBe(url);
    },
  );

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "http://turno.app",
    "ftp://turno.app",
    "//turno.app",
    "turno.app",
    "https://localhost",
    "https://bank.com@evil.example",
    "https://user:pass@turno.app",
    "https://turno.app:8443",
    "https://turno.app/a b",
    " https://turno.app",
    "https://",
    "",
  ])("refuses %j", (url) => {
    expect(safeHttpsUrl(url)).toBeNull();
  });

  it("refuses missing values", () => {
    expect(safeHttpsUrl(null)).toBeNull();
    expect(safeHttpsUrl(undefined)).toBeNull();
  });
});
