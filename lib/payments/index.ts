import "server-only";
import { isDeployed } from "@/lib/config/deployment";
import { serverEnv } from "@/lib/env.server";
import { serviceClient } from "@/lib/supabase/service";
import { TestProvider } from "./test-provider";
import type { PaymentProvider } from "./types";

/**
 * Whether the deployment is in prelaunch (app_config). There, and only there, admins try the
 * whole flow with the test provider; once the game launches the test provider stops working.
 */
async function inPrelaunch(): Promise<boolean> {
  const { data, error } = await serviceClient().from("app_config").select("prelaunch").single();
  if (error || !data) throw new Error(`Could not read app_config: ${error?.message}`);
  return data.prelaunch;
}

/** The configured provider. On a deployment the test provider runs only during prelaunch. */
export async function paymentProvider(): Promise<PaymentProvider> {
  const env = serverEnv();
  switch (env.PAYMENT_PROVIDER) {
    case "test":
      if (isDeployed() && !(await inPrelaunch())) throw new Error("The test payment provider only runs locally or in prelaunch");
      return new TestProvider(env.PAYMENT_WEBHOOK_SECRET, env.NEXT_PUBLIC_SITE_URL);
  }
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
