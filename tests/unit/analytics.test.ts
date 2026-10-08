import { describe, expect, it } from "vitest";
import { scrubAnalyticsEvent } from "@/lib/analytics";

const view = (url: string) => scrubAnalyticsEvent({ type: "pageview", url });

describe("scrubAnalyticsEvent", () => {
  it("keeps a page's path and its UTM campaign tags", () => {
    expect(view("https://takethecrown.app/en/u/ana?utm_source=x&utm_medium=social&utm_campaign=launch&utm_term=crown&utm_content=card")).toEqual({
      type: "pageview",
      url: "https://takethecrown.app/en/u/ana?utm_source=x&utm_medium=social&utm_campaign=launch&utm_term=crown&utm_content=card",
    });
  });

  it("drops everything else in the address: checkout ids, emails, sign-in redirects, cards", () => {
    const scrubbed = view(
      "https://takethecrown.app/en?lock=7f3c1b9e-0000-4000-8000-000000000000&payment_id=pay_123&email=ana%40example.com&status=succeeded&login=%2Fen%2Fsettings%2Fprofile&card=duke&utm_source=newsletter",
    );
    expect(scrubbed).toEqual({ type: "pageview", url: "https://takethecrown.app/en?utm_source=newsletter" });
  });

  it("drops the fragment", () => {
    expect(view("https://takethecrown.app/en/admin-guide#section")?.url).toBe("https://takethecrown.app/en/admin-guide");
    expect(view("https://takethecrown.app/en/faq#refunds")?.url).toBe("https://takethecrown.app/en/faq");
  });

  it("leaves an address with nothing to drop as it is", () => {
    expect(view("https://takethecrown.app/es/hall-of-fame")?.url).toBe("https://takethecrown.app/es/hall-of-fame");
  });

  it("does not send campaign-like tags it does not know, or look-alikes", () => {
    expect(view("https://takethecrown.app/en?utm_id=abc&utm_sourcex=1&xutm_source=2&UTM_SOURCE=3")?.url).toBe("https://takethecrown.app/en");
  });

  it.each(["/en/admin", "/es/admin", "/en/admin/anything", "/en/settings/profile", "/es/settings/profile?x=1", "/en/alerts/off?token=secret"])(
    "does not measure the private page %s",
    (path) => {
      expect(view(`https://takethecrown.app${path}`)).toBeNull();
    },
  );

  it("does measure pages that only start like a private one", () => {
    expect(view("https://takethecrown.app/en/u/admin")).not.toBeNull();
    expect(view("https://takethecrown.app/en/u/settings")).not.toBeNull();
  });

  it("sends no custom events, whatever they carry", () => {
    expect(scrubAnalyticsEvent({ type: "event", url: "https://takethecrown.app/en" })).toBeNull();
  });

  it("sends nothing it cannot read", () => {
    expect(view("not a url")).toBeNull();
    expect(view("")).toBeNull();
  });
});
