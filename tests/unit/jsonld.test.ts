import { describe, expect, it } from "vitest";
import type { Block } from "@/lib/legal/markdown";
import { breadcrumbs, faqPage, profilePage, questionsOf, serializeJsonLd, siteAndOrganization } from "@/lib/seo-jsonld";

const SITE = "https://takethecrown.app";

describe("serializeJsonLd", () => {
  const hostile = {
    name: "</script><script>alert(1)</script>",
    note: "a & b <!-- c --> d",
    line: "x" + String.fromCharCode(0x2028) + "y" + String.fromCharCode(0x2029) + "z",
  };

  it("never lets user text close the block, open a tag or break a parser", () => {
    const out = serializeJsonLd(hostile);
    expect(out).not.toMatch(/[<>&]/);
    expect(out).not.toContain(String.fromCharCode(0x2028));
    expect(out).not.toContain(String.fromCharCode(0x2029));
    expect(out.toLowerCase()).not.toContain("</script");
  });

  it("is still the same JSON", () => {
    expect(JSON.parse(serializeJsonLd(hostile))).toEqual(hostile);
  });
});

describe("siteAndOrganization", () => {
  const base = { site: SITE, locale: "es", brand: "Take the Crown", contactEmail: "hello@takethecrown.app", sameAs: ["https://x.com/takethecrown"] } as const;
  const [website, organization] = (siteAndOrganization(base)["@graph"] as Record<string, unknown>[]) ?? [];

  it("describes the website in both languages and its publisher", () => {
    expect(website).toMatchObject({ "@type": "WebSite", name: "Take the Crown", url: `${SITE}/es`, inLanguage: ["en", "es"], publisher: { "@id": `${SITE}/#organization` } });
  });

  it("describes the organization with a logo, a contact email and its official accounts", () => {
    expect(organization).toMatchObject({
      "@type": "Organization",
      "@id": `${SITE}/#organization`,
      logo: { url: `${SITE}/icons/icon-512.png` },
      email: "hello@takethecrown.app",
      contactPoint: { contactType: "customer support", email: "hello@takethecrown.app" },
      sameAs: ["https://x.com/takethecrown"],
    });
  });

  it("leaves out what is not set, and any account that is not https", () => {
    const [, bare] = siteAndOrganization({ ...base, contactEmail: null, sameAs: ["http://x.com/a", "javascript:alert(1)"] })["@graph"] as Record<string, unknown>[];
    expect(bare).not.toHaveProperty("email");
    expect(bare).not.toHaveProperty("contactPoint");
    expect(bare).not.toHaveProperty("sameAs");
  });
});

describe("breadcrumbs", () => {
  it("numbers the steps from the home page", () => {
    expect(
      breadcrumbs({
        site: SITE,
        locale: "en",
        trail: [
          { name: "Take the Crown", route: "" },
          { name: "History of the realm", route: "/kingdom" },
          { name: "Genesis", route: "/seasons/genesis" },
        ],
      }),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Take the Crown", item: `${SITE}/en` },
        { "@type": "ListItem", position: 2, name: "History of the realm", item: `${SITE}/en/kingdom` },
        { "@type": "ListItem", position: 3, name: "Genesis", item: `${SITE}/en/seasons/genesis` },
      ],
    });
  });
});

describe("profilePage", () => {
  const input = { site: SITE, locale: "en", route: "/u/ana", name: "ana", joinedAt: "2026-09-01T10:00:00Z", image: null, sameAs: [] } as const;

  it("makes the player the main entity of the page", () => {
    expect(profilePage({ ...input, image: "https://cdn.example/ana.webp", sameAs: ["https://x.com/ana", "https://ana.dev"] })).toMatchObject({
      "@type": "ProfilePage",
      url: `${SITE}/en/u/ana`,
      dateCreated: "2026-09-01T10:00:00.000Z",
      mainEntity: {
        "@type": "Person",
        name: "ana",
        url: `${SITE}/en/u/ana`,
        image: "https://cdn.example/ana.webp",
        sameAs: ["https://x.com/ana", "https://ana.dev"],
      },
    });
  });

  it("lists each link once and only if it is a safe https link; no image for a generated avatar", () => {
    const { mainEntity } = profilePage({ ...input, sameAs: ["https://x.com/ana", null, "https://x.com/ana", "javascript:alert(1)", "http://ana.dev"] }) as {
      mainEntity: Record<string, unknown>;
    };
    expect(mainEntity.sameAs).toEqual(["https://x.com/ana"]);
    expect(mainEntity).not.toHaveProperty("image");
    expect(profilePage(input).mainEntity).not.toHaveProperty("sameAs");
  });
});

describe("faqPage", () => {
  const blocks: Block[] = [
    { kind: "title", text: "FAQ" },
    { kind: "question", question: [{ kind: "text", text: "Can I get a refund?" }], answer: [{ kind: "text", text: "Only if the crown " }, { kind: "bold", text: "could not" }, { kind: "text", text: " be delivered." }] },
    { kind: "paragraph", content: [{ kind: "text", text: "Not a question." }] },
    { kind: "question", question: [{ kind: "text", text: "Do I need an account?" }], answer: [{ kind: "text", text: "No." }] },
  ];

  it("takes the questions and answers as plain text", () => {
    expect(questionsOf(blocks)).toEqual([
      { question: "Can I get a refund?", answer: "Only if the crown could not be delivered." },
      { question: "Do I need an account?", answer: "No." },
    ]);
  });

  it("marks them up as a FAQPage", () => {
    expect(faqPage({ site: SITE, locale: "en", route: "/faq", questions: questionsOf(blocks) })).toMatchObject({
      "@type": "FAQPage",
      url: `${SITE}/en/faq`,
      mainEntity: [
        { "@type": "Question", name: "Can I get a refund?", acceptedAnswer: { "@type": "Answer", text: "Only if the crown could not be delivered." } },
        { "@type": "Question", name: "Do I need an account?", acceptedAnswer: { "@type": "Answer", text: "No." } },
      ],
    });
  });
});
