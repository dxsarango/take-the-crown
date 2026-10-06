import type { Locator, Page } from "@playwright/test";

/** Ticks the required "delivered right away, no withdrawal" box in the payment modal (terms §5). */
export async function acceptDelivery(scope: Page | Locator): Promise<void> {
  await scope
    .getByRole("checkbox", { name: /right of withdrawal|derecho de desistimiento/ })
    .filter({ visible: true })
    .check();
}

/**
 * Cloudflare's dummy Turnstile token, accepted by its test secret key. A production build
 * (`pnpm e2e:prod`) checks it on every lock; `next dev` without a secret skips the check.
 */
export const HUMAN_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
