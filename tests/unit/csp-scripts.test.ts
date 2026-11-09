import { describe, expect, it } from "vitest";
import { executableScripts } from "@/scripts/csp-scripts.mjs";

describe("scripts the strict CSP applies to", () => {
  it("counts executable scripts and skips JSON-LD data blocks", () => {
    const html = [
      '<script src="/a.js" nonce="n1" async="">',
      '<script type="application/ld+json">{"@type":"WebSite"}</script>',
      "<script nonce='n1'>self.__next_f=[]</script>",
      '<script type="application/LD+JSON" id="x">{}</script>',
    ].join("");
    expect(executableScripts(html)).toEqual(['<script src="/a.js" nonce="n1" async="">', "<script nonce='n1'>"]);
  });

  it("still reports an executable script without a nonce", () => {
    const html = '<script type="application/ld+json">{}</script><script src="https://x.test/beacon.js">';
    expect(executableScripts(html)).toEqual(['<script src="https://x.test/beacon.js">']);
  });

  it("returns nothing for a page without scripts", () => {
    expect(executableScripts("<html></html>")).toEqual([]);
  });
});
