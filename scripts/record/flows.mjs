// The four recorded flows. Each returns the clips it made; times are ms since epoch.

import path from "node:path";
import en from "../../messages/en.json" with { type: "json" };
import { startRecording } from "./capture.mjs";
import { DARIO, clearSignInLimits, seedWorld, unlock } from "./seed.mjs";

// The screencast delivers frames in CSS pixels and ignores the device scale factor, so a phone at 3x
// would be captured at 360 x 640 and upscaled. Instead the browser is 1080 x 1920 and the page is
// laid out as a 360 px phone at page scale 3 (see fixViewport): the capture is real 1080 x 1920 pixels.
export const LAYOUTS = {
  mobile: { viewport: { width: 1080, height: 1920 }, isMobile: true, hasTouch: true, phoneWidth: 360, suffix: "" },
  desktop: { viewport: { width: 1920, height: 1080 }, isMobile: false, hasTouch: false, suffix: "-desktop" },
};

const MAILPIT = "http://127.0.0.1:54324/api/v1";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const shown = (locator) => locator.filter({ visible: true });

/** A fixed-offset zone where it is about noon now, so the buyer's local hour never earns Night Owl. */
function zoneAtNoon(at) {
  const utcHour = at.getUTCHours() + at.getUTCMinutes() / 60;
  const shift = Math.round(12 - utcHour);
  if (shift === 0) return "Etc/GMT";
  return shift > 0 ? `Etc/GMT-${shift}` : `Etc/GMT+${-shift}`;
}

/** Lays the page out at `width` CSS px and scales it up to fill the browser, whatever meta viewport the page sets. */
function fixViewport([width, scale]) {
  const apply = () => {
    let meta = document.querySelector("meta[name=viewport]");
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      document.head?.append(meta);
    }
    meta.content = `width=${width}, initial-scale=${scale}, minimum-scale=${scale}, maximum-scale=${scale}`;
  };
  new MutationObserver(apply).observe(document, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", apply);
}

// The coronation's stage: the pixel-font price and timers are canvases too, so match this one by its wrapper.
const STAGE = "main div.bg-crown-abyss > canvas";

/** Notes when each coronation draws its first frame. Mobile and desktop stages draw together: one start. */
function watchCoronation(selector) {
  window.__canvasAt = [];
  const seen = new WeakSet();
  let lastDraw = 0;
  const putImageData = CanvasRenderingContext2D.prototype.putImageData;
  CanvasRenderingContext2D.prototype.putImageData = function (...args) {
    if (this.canvas.matches(selector)) {
      const now = Date.now();
      if (!seen.has(this.canvas)) {
        seen.add(this.canvas);
        if (now - lastDraw > 1000) window.__canvasAt.push(now);
      }
      lastDraw = now;
    }
    return putImageData.apply(this, args);
  };
}

async function newPage(browser, ctx, layout) {
  const { viewport, isMobile, hasTouch, phoneWidth } = LAYOUTS[layout];
  const context = await browser.newContext({
    baseURL: ctx.base,
    viewport,
    deviceScaleFactor: 1,
    isMobile,
    hasTouch,
    locale: "en-US",
    timezoneId: zoneAtNoon(new Date()),
  });
  await context.addInitScript(watchCoronation, STAGE);
  if (phoneWidth) await context.addInitScript(fixViewport, [phoneWidth, viewport.width / phoneWidth]);
  return { context, page: await context.newPage() };
}

/** Waits for the home to be live: the king is drawn and the realtime channel had time to subscribe. */
async function openHome(page) {
  await page.goto("/en");
  await shown(page.getByRole("button", { name: /Take the (crown|empty throne) for/ })).first().waitFor();
  await page.waitForLoadState("networkidle");
  await sleep(2500);
}

/** Waits until the nth coronation has started and ended (its stage is gone). */
async function coronationsPlayed(page, n) {
  await page.waitForFunction(([count, stage]) => window.__canvasAt.length >= count && !document.querySelector(stage), [n, STAGE], { timeout: 30_000, polling: 100 });
}

async function signIn(page, email, next) {
  await fetch(`${MAILPIT}/messages`, { method: "DELETE" });
  await clearSignInLimits();
  const sent = await page.request.post("/api/auth/magic-link", { data: { email, next } });
  if (!sent.ok()) throw new Error(`Sign-in link refused (${sent.status()})`);
  let link;
  for (let i = 0; i < 30 && !link; i++) {
    const list = await (await fetch(`${MAILPIT}/messages?limit=20`)).json();
    const id = list.messages.find((m) => m.To.some((t) => t.Address === email))?.ID;
    if (id) link = /https?:\/\/\S+verify\S+/.exec((await (await fetch(`${MAILPIT}/message/${id}`)).json()).Text)?.[0]?.replace(/[)\]>]+$/, "");
    else await sleep(500);
  }
  if (!link) throw new Error("No sign-in link arrived in Mailpit");
  await page.goto(link);
  await page.waitForURL((url) => url.pathname === next);
}

async function record(page, layout) {
  return startRecording(page, LAYOUTS[layout].viewport);
}

/** Flows 1 and 2: dario buys the crown while a second browser watches the home. */
export async function coronation(browser, ctx, layout) {
  await seedWorld({ dario: "absent" });
  await ctx.dropCache();
  const buyer = await newPage(browser, ctx, layout);
  const spectator = await newPage(browser, ctx, layout);
  await Promise.all([openHome(buyer.page), openHome(spectator.page)]);

  // Both start on the same tick; the shared clock lines the two clips up.
  const [buyerRec, spectatorRec] = await Promise.all([record(buyer.page, layout), record(spectator.page, layout)]);
  const from = Date.now();
  await sleep(1500);

  const { page } = buyer;
  const dialog = page.getByRole("dialog");
  const field = (label) => shown(dialog.getByLabel(label, { exact: true }));
  const type = async (label, text) => {
    await field(label).click();
    await field(label).pressSequentially(text, { delay: 70 });
    await sleep(350);
  };

  await shown(page.getByRole("button", { name: /Take the (crown|empty throne) for/ })).first().click();
  await dialog.waitFor();
  await sleep(900);
  await type(en.common.nameL, DARIO.name);
  await shown(page.getByText(en.payment.nameAvailable)).first().waitFor();
  await type(en.login.emailL, "dario@example.com");
  await type(en.payment.linkL, "dario-labs.app");
  await type(en.payment.msgL, "Ship small, ship daily.");
  await shown(dialog.getByRole("checkbox", { name: /right of withdrawal|derecho de desistimiento/ })).check();
  await sleep(700);
  await shown(dialog.getByRole("button", { name: /^Pay \$[\d.,]+ and take the crown$/ })).click();

  const checkout = shown(page.getByTestId("test-checkout"));
  await checkout.waitFor();
  // The checkout sits below the form: glide to it so the viewer sees where the payment happens.
  await checkout.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  await sleep(2500);
  await shown(page.getByRole("button", { name: /^Pay \$/ })).click();
  await shown(page.getByText(en.payment.headOk)).first().waitFor({ timeout: 15_000 });
  // The coronation plays behind the success card; "Watch your coronation" replays it in full view.
  await coronationsPlayed(page, 1);
  await sleep(2500);
  await shown(page.getByRole("button", { name: en.payment.watch })).click();
  await coronationsPlayed(page, 2);
  await shown(page.getByRole("heading", { level: 2, name: DARIO.name })).waitFor({ timeout: 15_000 });
  await sleep(3500);
  const to = Date.now();

  const stamps = async (p) => p.evaluate(() => window.__canvasAt);
  const buyerStamps = await stamps(page);
  const spectatorStamps = await stamps(spectator.page);
  if (!buyerStamps.length || !spectatorStamps.length) throw new Error("The coronation never played in one of the browsers");

  const buyerClip = await buyerRec.stop();
  const spectatorClip = await spectatorRec.stop();
  await Promise.all([buyer.context.close(), spectator.context.close()]);

  const seconds = (at) => Number(((at - from) / 1000).toFixed(3));
  return {
    clips: [
      { name: `coronation-buyer${LAYOUTS[layout].suffix}`, clip: buyerClip, from, to },
      { name: `coronation-spectator${LAYOUTS[layout].suffix}`, clip: spectatorClip, from, to },
    ],
    timestamps: {
      [`coronation-buyer${LAYOUTS[layout].suffix}`]: { coronationStart: seconds(buyerStamps[0]), replayStart: seconds(buyerStamps[1] ?? buyerStamps[0]) },
      [`coronation-spectator${LAYOUTS[layout].suffix}`]: { coronationStart: seconds(spectatorStamps[0]) },
    },
  };
}

/** Flow 3: dario is on the home when an achievement is unlocked. */
export async function achievementToast(browser, ctx) {
  await seedWorld({ dario: "veteran", withhold: ["regicide"] });
  await ctx.dropCache();
  const { context, page } = await newPage(browser, ctx, "mobile");
  await signIn(page, DARIO.email, "/en");
  await page.getByRole("button", { name: en.login.accountMenu }).waitFor();
  await page.waitForLoadState("networkidle");
  await sleep(2500);

  const rec = await record(page, "mobile");
  const from = Date.now();
  await sleep(1800);
  await unlock("regicide");
  const toast = page.getByTestId("unlock-toast");
  await toast.waitFor({ timeout: 15_000 });
  await toast.waitFor({ state: "detached", timeout: 15_000 });
  await sleep(1500);
  const to = Date.now();
  const clip = await rec.stop();
  await context.close();
  return { clips: [{ name: "achievement-toast", clip, from, to }], timestamps: {} };
}

/** Flow 4: dario's public profile, top to bottom. */
export async function profile(browser, ctx) {
  await seedWorld({ dario: "veteran" });
  await ctx.dropCache();
  const { context, page } = await newPage(browser, ctx, "mobile");
  await page.goto(`/en/u/${DARIO.name}`);
  await page.getByRole("heading", { level: 1, name: DARIO.name }).waitFor();
  await page.waitForLoadState("networkidle");
  await sleep(1500);

  const rec = await record(page, "mobile");
  const from = Date.now();
  await sleep(2000);
  // A steady glide, slow enough to read: the whole page in about 30 s.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const max = document.documentElement.scrollHeight - innerHeight;
        const speed = Math.min(420, Math.max(200, max / 30));
        let y = 0;
        let last = performance.now();
        const step = (now) => {
          y = Math.min(max, y + (speed * (now - last)) / 1000);
          last = now;
          scrollTo({ top: y, behavior: "instant" });
          if (y >= max) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  );
  await sleep(2000);
  const to = Date.now();
  const clip = await rec.stop();
  await context.close();
  return { clips: [{ name: "profile", clip, from, to }], timestamps: {} };
}

export const outFile = (dir, name) => path.join(dir, `${name}.mp4`);
