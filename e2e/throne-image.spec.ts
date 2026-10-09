import { expect, test } from "@playwright/test";

// The home page has a throne scene for phones and another for desktops; CSS shows one. The hidden
// one must not cost a download: it is the largest image on the page.
async function throneImages(page: import("@playwright/test").Page): Promise<string[]> {
  const urls: string[] = [];
  page.on("request", (request) => {
    const match = /[/]art[/]throne[/]t\d+-(?:seat|spot)-(mobile|desktop)[.]svg/.exec(request.url());
    if (match) urls.push(match[1]);
  });
  await page.goto("/en");
  await page.waitForLoadState("networkidle");
  return urls;
}

test("a phone downloads the phone throne scene only", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "viewport");
  expect(await throneImages(page)).toEqual(["mobile"]);
});

test("a desktop shows its throne scene", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "viewport");
  const images = await throneImages(page);
  expect(images).toContain("desktop");
  await expect(page.locator("img[src*='-desktop.svg']")).toBeVisible();
});
