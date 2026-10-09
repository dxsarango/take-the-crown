import { type Page, expect, test } from "@playwright/test";

test.beforeEach(() => {
  test.skip(test.info().project.name !== "desktop", "same bundles at every viewport");
});

/** The JavaScript a page loads, as text, until the network is quiet. */
async function loadedScripts(page: Page, path: string): Promise<string[]> {
  const urls: string[] = [];
  page.on("response", (response) => {
    if (response.request().resourceType() === "script") urls.push(response.url());
  });
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  expect(urls.length).toBeGreaterThan(5);
  return Promise.all(urls.map(async (url) => (await page.request.get(url)).text()));
}

const hasRealtimeClient = (scripts: string[]) => scripts.some((code) => code.includes("phx_join"));

// The realtime client is about 40% of the JavaScript a page ships. Only pages that listen to the
// database need it; dialogs and toasts load when something opens them.
test.describe("pages without live data do not load the realtime client", () => {
  for (const path of ["/en/rules", "/en/faq", "/en/hall-of-fame", "/en/seasons/genesis"]) {
    test(path, async ({ page }) => {
      expect(hasRealtimeClient(await loadedScripts(page, path))).toBe(false);
    });
  }
});

test("the home page still listens for the crown", async ({ page }) => {
  expect(hasRealtimeClient(await loadedScripts(page, "/en"))).toBe(true);
});

test("the sign-in dialog loads when it opens, not before", async ({ page }) => {
  const scripts: string[] = [];
  page.on("response", (response) => {
    if (response.request().resourceType() === "script") scripts.push(response.url());
  });
  await page.goto("/en/rules");
  await page.waitForLoadState("networkidle");
  const before = scripts.length;
  await page.getByRole("button", { name: /sign in/i }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(scripts.length).toBeGreaterThan(before);
});

// The live clock re-renders only what shows it. React reports each commit to this hook; a
// component is counted when it did work in the commit (dev builds keep component names).
const COUNT_RENDERS = () => {
  const counts: Record<string, number> = {};
  (window as unknown as { __renders: Record<string, number> }).__renders = counts;
  type Fiber = { child: Fiber | null; sibling: Fiber | null; flags: number; type: unknown; alternate: Fiber | null };
  // A subtree React skipped keeps its old flags and the same child as its alternate: do not enter it.
  const walk = (fiber: Fiber | null) => {
    for (let f = fiber; f; f = f.sibling) {
      const name = typeof f.type === "function" ? (f.type as { name?: string }).name : undefined;
      if (name && f.alternate && f.flags & 1) counts[name] = (counts[name] ?? 0) + 1;
      if (!f.alternate || f.child !== f.alternate.child) walk(f.child);
    }
  };
  (window as unknown as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject: () => 1,
    onScheduleFiberRoot: () => undefined,
    onCommitFiberUnmount: () => undefined,
    checkDCE: () => undefined,
    onCommitFiberRoot: (_id: number, root: { current: Fiber }) => walk(root.current),
  };
};

const renders = (page: Page) => page.evaluate(() => (window as unknown as { __renders: Record<string, number> }).__renders);
const resetRenders = (page: Page) => page.evaluate(() => Object.keys((window as unknown as { __renders: object }).__renders).forEach((k) => delete (window as unknown as { __renders: Record<string, number> }).__renders[k]));

test.describe("the live clock", () => {
  test("ticks in the hero and nowhere else on the home page", async ({ page }) => {
    await page.addInitScript(COUNT_RENDERS);
    await page.goto("/en");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    await resetRenders(page);
    await page.waitForTimeout(4500);
    const counts = await renders(page);
    expect(counts.Hero ?? 0).toBeGreaterThanOrEqual(3);
    for (const name of ["HomeView", "ThroneScene", "TopBar", "Feed", "Footer", "Succession", "HallOfFamePreview", "About"]) {
      expect(counts[name] ?? 0, name).toBe(0);
    }
  });

  test("stops while the tab is hidden and catches up when it is shown", async ({ page }) => {
    await page.addInitScript(COUNT_RENDERS);
    await page.goto("/en");
    await page.waitForLoadState("networkidle");
    const setVisibility = (state: "hidden" | "visible") =>
      page.evaluate((s) => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => s });
        document.dispatchEvent(new Event("visibilitychange"));
      }, state);
    await setVisibility("hidden");
    await page.waitForTimeout(500);
    await resetRenders(page);
    await page.waitForTimeout(3500);
    expect((await renders(page)).Hero ?? 0).toBe(0);
    await setVisibility("visible");
    await page.waitForTimeout(2500);
    expect((await renders(page)).Hero ?? 0).toBeGreaterThanOrEqual(2);
  });
});
