import { expect, test } from "@playwright/test";

test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "head tags do not depend on the viewport"));

test("every page links the favicon set and the manifest, and they are served", async ({ page, request }) => {
  for (const path of ["/en", "/es/kingdom"]) {
    await page.goto(path);
    const links = await page.locator("head link[rel=icon], head link[rel=apple-touch-icon], head link[rel=manifest]").evaluateAll((els) =>
      els.map((el) => ({ rel: el.getAttribute("rel"), type: el.getAttribute("type"), sizes: el.getAttribute("sizes"), href: el.getAttribute("href")! })),
    );
    expect(links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rel: "icon", type: "image/svg+xml" }),
        expect.objectContaining({ rel: "icon", type: "image/png", sizes: "16x16" }),
        expect.objectContaining({ rel: "icon", type: "image/png", sizes: "32x32" }),
        expect.objectContaining({ rel: "apple-touch-icon", sizes: "180x180" }),
        expect.objectContaining({ rel: "manifest" }),
      ]),
    );
    for (const link of links) {
      const response = await request.get(link.href);
      expect(response.status(), link.href).toBe(200);
    }
  }

  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "Take the Crown", background_color: "#14111C" });
  for (const icon of manifest.icons as { src: string; type: string }[]) {
    const response = await request.get(icon.src);
    expect(response.status(), icon.src).toBe(200);
    expect(response.headers()["content-type"]).toBe(icon.type);
  }
});
