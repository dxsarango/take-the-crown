/** Sitemaps are cached at the edge for an hour; crawlers fetch them rarely. */
export const XML_HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};
