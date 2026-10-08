import type { Locale } from "@/i18n/routing";
import { routing } from "@/i18n/routing";
import { safeHttpsUrl } from "@/lib/links";
import type { Block, Inline } from "@/lib/legal/markdown";

export type JsonLd = Record<string, unknown>;

const CONTEXT = "https://schema.org";

// "<", ">" and "&" could end the script block or open a tag; U+2028 and U+2029 break older parsers.
const UNSAFE = new RegExp("[<>&" + String.fromCharCode(0x2028) + String.fromCharCode(0x2029) + "]", "g");
const BACKSLASH = String.fromCharCode(92);

/**
 * JSON for a `<script type="application/ld+json">` block. Player names and links come from users,
 * so nothing in the text may close the script or start a comment.
 */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(UNSAFE, (char) => BACKSLASH + "u" + char.charCodeAt(0).toString(16).padStart(4, "0"));
}

const page = (site: string, locale: Locale, route: string) => `${site}/${locale}${route}`;

/** The site and the organization behind it, on the home page. */
export function siteAndOrganization(input: { site: string; locale: Locale; brand: string; contactEmail: string | null; sameAs: readonly string[] }): JsonLd {
  const { site, locale, brand } = input;
  const sameAs = input.sameAs.flatMap((url) => safeHttpsUrl(url) ?? []);
  return {
    "@context": CONTEXT,
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${site}/#website`,
        name: brand,
        url: page(site, locale, ""),
        inLanguage: [...routing.locales],
        publisher: { "@id": `${site}/#organization` },
      },
      {
        "@type": "Organization",
        "@id": `${site}/#organization`,
        name: brand,
        url: page(site, locale, ""),
        logo: { "@type": "ImageObject", url: `${site}/icons/icon-512.png`, width: 512, height: 512 },
        ...(input.contactEmail ? { email: input.contactEmail, contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: input.contactEmail } } : {}),
        ...(sameAs.length ? { sameAs } : {}),
      },
    ],
  };
}

/** The path to a page, from the home page: [{ name: "Take the Crown", route: "" }, { name: "Rules", route: "/rules" }]. */
export function breadcrumbs(input: { site: string; locale: Locale; trail: { name: string; route: string }[] }): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: input.trail.map((step, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: step.name,
      item: page(input.site, input.locale, step.route),
    })),
  };
}

/** A public profile: a ProfilePage whose main entity is the player. Only what the page itself shows. */
export function profilePage(input: {
  site: string;
  locale: Locale;
  route: string;
  name: string;
  joinedAt: string;
  image: string | null;
  sameAs: readonly (string | null)[];
}): JsonLd {
  const url = page(input.site, input.locale, input.route);
  const image = safeHttpsUrl(input.image);
  const sameAs = [...new Set(input.sameAs.flatMap((link) => safeHttpsUrl(link) ?? []))];
  return {
    "@context": CONTEXT,
    "@type": "ProfilePage",
    "@id": `${url}#profile`,
    url,
    inLanguage: input.locale,
    dateCreated: new Date(input.joinedAt).toISOString(),
    mainEntity: {
      "@type": "Person",
      "@id": `${url}#person`,
      name: input.name,
      url,
      ...(image ? { image } : {}),
      ...(sameAs.length ? { sameAs } : {}),
    },
  };
}

/** Question and answer pairs, as the FAQ page shows them. */
export function faqPage(input: { site: string; locale: Locale; route: string; questions: { question: string; answer: string }[] }): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "FAQPage",
    url: page(input.site, input.locale, input.route),
    inLanguage: input.locale,
    mainEntity: input.questions.map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: { "@type": "Answer", text: q.answer },
    })),
  };
}

const text = (parts: Inline[]) => parts.map((p) => p.text).join("");

/** The questions and answers of a rendered FAQ, as plain text. */
export function questionsOf(blocks: Block[]): { question: string; answer: string }[] {
  return blocks.flatMap((b) => (b.kind === "question" ? [{ question: text(b.question), answer: text(b.answer) }] : []));
}
