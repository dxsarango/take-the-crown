import "server-only";
import { isDeployed } from "@/lib/config/deployment";
import { serverEnv } from "@/lib/env.server";
import { serviceClient } from "@/lib/supabase/service";
import { DodoProvider } from "./dodo";
import { TestProvider } from "./test-provider";
import type { PaymentProvider } from "./types";

/**
 * Whether the deployment is in prelaunch (app_config). There, and only there, admins try the
 * whole flow with test payments; once the game launches, test payments stop working.
 */
async function inPrelaunch(): Promise<boolean> {
  const { data, error } = await serviceClient().from("app_config").select("prelaunch").single();
  if (error || !data) throw new Error(`Could not read app_config: ${error?.message}`);
  return data.prelaunch;
}

/** Payments that move no real money: the test provider, or Dodo in test mode. Launch needs neither. */
export function testPayments(): boolean {
  const env = serverEnv();
  return env.PAYMENT_PROVIDER === "test" || env.DODO_MODE === "test";
}

/** The configured provider. On a deployment, test payments run only during prelaunch. */
export async function paymentProvider(): Promise<PaymentProvider> {
  const env = serverEnv();
  if (isDeployed() && testPayments() && !(await inPrelaunch())) {
    throw new Error("Test payments only run locally or in prelaunch");
  }
  switch (env.PAYMENT_PROVIDER) {
    case "test":
      return new TestProvider(env.PAYMENT_WEBHOOK_SECRET, env.NEXT_PUBLIC_SITE_URL);
    case "dodo":
      return dodoProvider();
  }
}

/** Dodo with its settings, or an error naming what is missing. */
export function dodoProvider(): DodoProvider {
  const env = serverEnv();
  const missing = (["DODO_API_KEY", "DODO_WEBHOOK_SECRET", "DODO_PRODUCT_ID"] as const).filter((k) => !env[k]);
  if (missing.length) throw new Error(`Dodo Payments needs ${missing.join(", ")}`);
  return new DodoProvider({ mode: env.DODO_MODE, apiKey: env.DODO_API_KEY!, webhookSecret: env.DODO_WEBHOOK_SECRET!, productId: env.DODO_PRODUCT_ID! });
}

/** The lowest price the payment provider accepts, in cents, or null when it has none (test provider). */
export async function paymentMinimumCents(): Promise<number | null> {
  return serverEnv().PAYMENT_PROVIDER === "dodo" ? dodoProvider().minimumCents() : null;
}

/** The provider named in a webhook URL, if it is the configured one. */
export async function providerByName(name: string): Promise<PaymentProvider | null> {
  const provider = await paymentProvider();
  return provider.name === name ? provider : null;
}

export async function testProvider(): Promise<TestProvider | null> {
  const provider = await paymentProvider().catch(() => null);
  return provider instanceof TestProvider ? provider : null;
}
