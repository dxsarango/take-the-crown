import { type Page, expect } from "@playwright/test";

// Local Supabase sends auth email to Mailpit.
const MAILPIT = "http://127.0.0.1:54324/api/v1";

/** The newest sign-in link emailed to this address. */
export async function latestSignInLink(email: string): Promise<string> {
  let id: string | undefined;
  await expect
    .poll(async () => {
      const list = (await (await fetch(`${MAILPIT}/messages?limit=20`)).json()) as {
        messages: { ID: string; To: { Address: string }[] }[];
      };
      id = list.messages.find((m) => m.To.some((t) => t.Address === email))?.ID;
      return id;
    })
    .toBeTruthy();
  const message = (await (await fetch(`${MAILPIT}/message/${id}`)).json()) as { Text: string };
  const link = /https?:\/\/\S+verify\S+/.exec(message.Text)?.[0];
  if (!link) throw new Error("No sign-in link in the email");
  return link.replace(/[)\]>]+$/, "");
}

export async function clearMail(): Promise<void> {
  await fetch(`${MAILPIT}/messages`, { method: "DELETE" });
}

/** Signs in with a magic link, as a player would, and lands on `next`. */
export async function signInByEmail(page: Page, email: string, next = "/en"): Promise<void> {
  await clearMail();
  const response = await page.request.post("/api/auth/magic-link", { data: { email, next } });
  expect(response.ok()).toBe(true);
  await page.goto(await latestSignInLink(email));
  await page.waitForURL((url) => url.pathname === next.split("?")[0]);
}
