import "server-only";
import { z } from "zod";
import { serverEnv } from "@/lib/env.server";

export type Email = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  /** Stable per notification, so a retried send is delivered once (Resend idempotency). */
  idempotencyKey: string;
};

/** The send did not go through; `retry` says whether trying again later can help. */
export class EmailError extends Error {
  constructor(
    message: string,
    readonly retry: boolean,
  ) {
    super(message);
  }
}

const resendAnswer = z.object({ id: z.string() });

async function viaResend(email: Email): Promise<void> {
  const env = serverEnv();
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new EmailError("RESEND_API_KEY and EMAIL_FROM are required", true);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": email.idempotencyKey,
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [email.to], subject: email.subject, html: email.html, text: email.text, headers: email.headers }),
    signal: AbortSignal.timeout(10_000),
  }).catch((e: unknown) => {
    throw new EmailError(`Resend unreachable: ${e instanceof Error ? e.message : String(e)}`, true);
  });
  if (!response.ok) {
    // 4xx other than rate limits means the email itself is wrong; retrying sends the same thing.
    const retry = response.status === 429 || response.status >= 500;
    throw new EmailError(`Resend answered ${response.status}: ${(await response.text()).slice(0, 200)}`, retry);
  }
  if (!resendAnswer.safeParse(await response.json().catch(() => null)).success) throw new EmailError("Unexpected Resend answer", true);
}

/** Local stand-in: Mailpit's send API, where the e2e suite reads emails. */
async function viaMailpit(email: Email): Promise<void> {
  const env = serverEnv();
  if (process.env.VERCEL_ENV === "production") throw new EmailError("The test email provider is disabled in production", false);
  const from = /^(.*)<(.+)>$/.exec(env.EMAIL_FROM ?? "") ?? [null, "", "alerts@test.local"];
  const response = await fetch(`${env.MAILPIT_URL}/api/v1/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      From: { Email: from[2].trim(), Name: from[1].trim() },
      To: [{ Email: email.to }],
      Subject: email.subject,
      HTML: email.html,
      Text: email.text,
      Headers: email.headers ?? {},
    }),
  }).catch((e: unknown) => {
    throw new EmailError(`Mailpit unreachable: ${e instanceof Error ? e.message : String(e)}`, true);
  });
  if (!response.ok) throw new EmailError(`Mailpit answered ${response.status}`, true);
}

export async function sendEmail(email: Email): Promise<void> {
  return serverEnv().EMAIL_PROVIDER === "test" ? viaMailpit(email) : viaResend(email);
}
