import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import es from "@/messages/es.json";

vi.mock("server-only", () => ({}));

const env = {
  SUPABASE_SERVICE_ROLE_KEY: "service",
  PAYMENT_PROVIDER: "test",
  PAYMENT_WEBHOOK_SECRET: "webhook-secret-0123456789",
  IP_HASH_SALT: "salt-0123456789abcdef",
  NEXT_PUBLIC_SITE_URL: "https://crown.test",
  NEXT_PUBLIC_SUPABASE_URL: "https://supabase.test",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  EMAIL_PROVIDER: "test",
  EMAIL_LINK_SECRET: "x".repeat(40),
};
for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);

// next-intl's server helper needs a Next request; the translator is the same underneath.
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: "en" | "es"; namespace: string }) =>
    createTranslator({ locale, messages: locale === "es" ? es : en, namespace: namespace as never }),
}));

// A minimal stand-in for the service client: rpc calls are recorded, table reads answer from `rows`.
const calls: { name: string; args: Record<string, unknown> }[] = [];
let claimed: { id: number; kind: string; profile_id: string; payload: unknown }[] = [];
let recipientRow: Record<string, unknown> | null = null;
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { data: name === "claim_notifications" ? claimed : null, error: null };
    },
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: recipientRow, error: null }),
      };
      return chain;
    },
  }),
}));

const sendEmail = vi.fn();
vi.mock("@/lib/email/provider", async (original) => ({
  ...(await original<typeof import("@/lib/email/provider")>()),
  sendEmail: (email: unknown) => sendEmail(email),
}));

const { alertOffToken, readAlertOffToken } = await import("@/lib/email/links");
const { EmailError } = await import("@/lib/email/provider");
const { processOutbox } = await import("@/lib/email/outbox");
const { Dethroned, Notice, renderEmail } = await import("@/lib/email/templates");
const { cardScene, mailHeader, MAIL_ART } = await import("@/lib/og/art");
const { portraitOrigin } = await import("@/lib/art/scenes");

const PROFILE = "7b0b3f7e-2b4e-4c55-9d5c-0f6a3c1d2e4f";

describe("alert links", () => {
  it("round-trips a signed token", () => {
    const token = alertOffToken(PROFILE, "dethroned");
    expect(readAlertOffToken(token)).toEqual({ profileId: PROFILE, kind: "dethroned" });
  });

  it("refuses tokens that were changed", () => {
    const token = alertOffToken(PROFILE, "price_drop");
    const [id, , sig] = token.split(".");
    expect(readAlertOffToken(`${id}.season_started.${sig}`)).toBeNull();
    expect(readAlertOffToken(`7b0b3f7e-2b4e-4c55-9d5c-0f6a3c1d2e40.price_drop.${sig}`)).toBeNull();
    expect(readAlertOffToken(`${token}x`)).toBeNull();
    expect(readAlertOffToken("nope")).toBeNull();
    expect(readAlertOffToken(`${id}.admin.${sig}`)).toBeNull();
  });
});

describe("email templates", () => {
  const frame = {
    lang: "en",
    preview: "Take it back for $34 before the price goes up.",
    season: "Season 0: Genesis",
    foot: "You're getting this because you reigned on Take the Crown.",
    unsubscribe: { label: "Turn off dethrone alerts", url: "https://crown.test/en/alerts/off?token=t" },
  };

  it("renders the dethroned email as the design lays it out", async () => {
    const { html, text } = await renderEmail(
      Dethroned({
        frame,
        title: "You were dethroned",
        image: { url: "https://crown.test/og/mail/7", alt: "Your portrait next to kenji, the new king", you: "You", newKing: "kenji · new king" },
        m1: "You were dethroned after",
        duration: "4h 12m",
        m2: " by ",
        king: { name: "kenji", flagUrl: "https://crown.test/og/flag/JP.png" },
        m3: "Take it back for",
        price: "$34",
        button: { label: "Take back the crown", url: "https://crown.test/en" },
        note: "The price drops 2% every hour. Floor price $5.",
      }),
    );
    expect(html).toContain('lang="en"');
    expect(html).toContain(frame.preview);
    const hero = /<img class="hero"[^>]+>/.exec(html)?.[0] ?? "";
    expect(hero).toContain('src="https://crown.test/og/mail/7"');
    expect(hero).toContain('width="440"');
    expect(hero).toContain('height="176"');
    expect(html).toMatch(/class="outer"[^>]*style="padding:40px 0"/);
    // Relief as solid borders, never box-shadow.
    expect(html).toContain("border-top:4px solid #F7D57F");
    expect(html).toContain("border-bottom:4px solid #C9962C");
    expect(html).not.toContain("box-shadow");
    expect(html).toContain("@media only screen and (max-width: 480px)");
    expect(html).toContain(frame.unsubscribe.url);
    expect(text).toContain("You were dethroned after 4h 12m by kenji");
    expect(text).toContain("Take it back for $34.");
  });

  it("renders notices without an unsubscribe link when there is none", async () => {
    const { html } = await renderEmail(
      Notice({
        frame: { ...frame, unsubscribe: null },
        title: "A message reached 3 reports",
        body: "Review it in the admin area.",
        button: { label: "Open reports", url: "https://crown.test/en/admin#reports" },
        note: null,
      }),
    );
    expect(html).toContain("A message reached 3 reports");
    expect(html).not.toContain("alerts/off");
  });
});

describe("the outbox sender", () => {
  const seasonAlert = { id: 41, kind: "season_started", profile_id: PROFILE, payload: { season_id: 1, slug: "day-of-the-dead" } };
  const recipient = (overrides: Record<string, unknown> = {}) => ({
    email: "kenji@test.local",
    locale: "en",
    is_admin: false,
    alerts_dethroned: true,
    alerts_price_below_cents: null,
    alerts_season_start: true,
    ...overrides,
  });
  const marks = () => calls.filter((c) => c.name.startsWith("mark_"));

  beforeEach(() => {
    calls.length = 0;
    sendEmail.mockReset();
    claimed = [seasonAlert];
    recipientRow = recipient();
  });

  it("sends once per notification and marks it sent", async () => {
    expect(await processOutbox()).toEqual({ sent: 1, failed: 0, skipped: 0 });
    const email = sendEmail.mock.calls[0][0];
    expect(email).toMatchObject({ to: "kenji@test.local", subject: "Season 1: Day of the Dead has started", idempotencyKey: "notification-41" });
    expect(email.headers["List-Unsubscribe"]).toMatch(/^<https:\/\/crown\.test\/api\/alerts\/off\?token=.+>$/);
    expect(email.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(marks()).toEqual([{ name: "mark_notification_sent", args: { p_id: 41 } }]);
  });

  it("writes in the player's language", async () => {
    recipientRow = recipient({ locale: "es" });
    await processOutbox();
    expect(sendEmail.mock.calls[0][0].subject).toBe("Empezó Temporada 1: Día de Muertos");
  });

  it("leaves a failed send for the next run when retrying can help", async () => {
    sendEmail.mockRejectedValue(new EmailError("Resend answered 503", true));
    expect(await processOutbox()).toEqual({ sent: 0, failed: 1, skipped: 0 });
    expect(marks()).toEqual([
      { name: "mark_notification_failed", args: { p_id: 41, p_error: "Resend answered 503", p_final: false } },
    ]);
  });

  it("gives up at once when the email itself is refused", async () => {
    sendEmail.mockRejectedValue(new EmailError("Resend answered 422", false));
    await processOutbox();
    expect(marks()[0].args).toMatchObject({ p_final: true });
  });

  it("skips alerts the player turned off since, without sending", async () => {
    recipientRow = recipient({ alerts_season_start: false });
    expect(await processOutbox()).toEqual({ sent: 0, failed: 0, skipped: 1 });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(marks()[0].args).toEqual({ p_id: 41, p_error: "skipped: alert_off", p_final: true });
  });

  it("skips malformed payloads and unknown kinds", async () => {
    claimed = [
      { ...seasonAlert, id: 1, payload: { season_id: "one" } },
      { ...seasonAlert, id: 2, kind: "mystery" },
    ];
    expect(await processOutbox()).toEqual({ sent: 0, failed: 0, skipped: 2 });
    expect(marks().map((m) => m.args.p_error)).toEqual(["skipped: bad_payload", "skipped: unknown_kind"]);
  });
});

describe("card and email art", () => {
  const avatar = { seed: "0123456789abcdef0123456789abcdef" };

  it("drops the crown upside down on the floor for a dethroning", () => {
    const W = 100;
    const H = 90;
    const crowned = cardScene(W, H, { season: 0, rank: "duke", avatar, mood: "victory" });
    const fallen = cardScene(W, H, { season: 0, rank: "duke", avatar, mood: "dethroned" });
    const bottom = (px: (string | null)[]) => px.slice((H - 12) * W).join(",");
    expect(bottom(fallen)).not.toBe(bottom(crowned));
    // The portrait's window loses its crown pixels.
    const P = portraitOrigin(W, H);
    const windowRow = (px: (string | null)[], y: number) => px.slice((P.y + y) * W + P.x, (P.y + y) * W + P.x + 44).join(",");
    expect(windowRow(fallen, 8)).not.toBe(windowRow(crowned, 8));
  });

  it("draws a sparkle for a victory and a reticle for a challenge", () => {
    const W = 100;
    const H = 90;
    const P = portraitOrigin(W, H);
    const victory = cardScene(W, H, { season: 0, rank: "duke", avatar, mood: "victory" });
    const challenge = cardScene(W, H, { season: 0, rank: "duke", avatar, mood: "challenge" });
    expect(victory[(P.y + 2) * W + P.x - 10]).toBe("#F7D57F");
    expect(challenge[(P.y - 4) * W + P.x - 4]).toBe("#F3EDE2");
  });

  it("lays out the email header as two portraits and an arrow", () => {
    const px = mailHeader({ season: 0, you: { avatar, rank: "duke" }, king: { avatar, rank: "count" } });
    expect(px).toHaveLength(MAIL_ART.W * MAIL_ART.H);
    expect(px[22 * MAIL_ART.W + 51]).toBe("#A89FB8");
    expect(px[22 * MAIL_ART.W + 45]).toBeNull();
    expect(px[0]).not.toBeNull();
    expect(px[66]).not.toBeNull();
  });
});
