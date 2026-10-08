import { type JsonLd, serializeJsonLd } from "@/lib/seo-jsonld";

/**
 * Structured data for crawlers. A data block is never executed, so the page's script policy does
 * not apply to it; the serializer keeps user text from ending it early.
 */
export function JsonLdScript({ data }: { data: JsonLd }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
