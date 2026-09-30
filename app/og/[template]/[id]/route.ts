import { z } from "zod";
import { routing } from "@/i18n/routing";
import { renderCard } from "@/lib/og/cards";
import { CARD_SIZES, CARD_TEMPLATES, cardModel } from "@/lib/og/data";
import { publicClient } from "@/lib/supabase/public";

const query = z.object({
  size: z.enum(Object.keys(CARD_SIZES) as ["og", "story"]).default("og"),
  locale: z.enum(routing.locales).default(routing.defaultLocale),
});

/**
 * Share cards (SPEC §8): 1200×630 for link previews, 1080×1920 (`?size=story`) for stories, in the
 * sharer's language (`?locale=`). Finished reigns never change; live ones are cached briefly.
 */
export async function GET(request: Request, { params }: RouteContext<"/og/[template]/[id]">) {
  const { template, id } = await params;
  const parsedTemplate = z.enum(CARD_TEMPLATES).safeParse(template);
  const parsedQuery = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsedTemplate.success || !parsedQuery.success) return new Response("Not found", { status: 404 });

  const model = await cardModel(publicClient(), parsedTemplate.data, id);
  if (!model) return new Response("Not found", { status: 404 });

  const image = await renderCard(model, parsedQuery.data.size, parsedQuery.data.locale);
  const settled = model.template === "dethroned" || (model.template === "victory" && model.ended);
  image.headers.set(
    "Cache-Control",
    settled ? "public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400" : "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
  );
  return image;
}
