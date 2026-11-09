// Which <script> tags of a page the strict CSP applies to. A JSON-LD block is data the browser
// never runs, so it carries no nonce and is not counted (the SEO structured data).

/** @param {string} html */
export function executableScripts(html) {
  return (html.match(/<script[^>]*>/g) ?? []).filter((tag) => !/\btype=["']?application\/ld\+json["']?/i.test(tag));
}
