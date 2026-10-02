import "server-only";
import { serverEnv } from "@/lib/env.server";
import { TestProvider } from "./test-provider";
import type { PaymentProvider } from "./types";
import { isDeployed } from "@/lib/config/deployment";

/** The configured provider. The test provider never runs on a deployment. */
export function paymentProvider(): PaymentProvider {
  const env = serverEnv();
  switch (env.PAYMENT_PROVIDER) {
    case "test":
      if (isDeployed()) throw new Error("The test payment provider only runs locally");
      return new TestProvider(env.PAYMENT_WEBHOOK_SECRET, env.NEXT_PUBLIC_SITE_URL);
  }
}

/** The provider named in a webhook URL, if it is the configured one. */
export function providerByName(name: string): PaymentProvider | null {
  const provider = paymentProvider();
  return provider.name === name ? provider : null;
}

export function testProvider(): TestProvider | null {
  const provider = paymentProvider();
  return provider instanceof TestProvider ? provider : null;
}
