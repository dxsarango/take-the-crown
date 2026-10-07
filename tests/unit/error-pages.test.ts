import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import es from "@/messages/es.json";

vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, ...rest }: { href: string; children: unknown }) => createElement("a", { href, ...rest }, children as never) }));
vi.mock("./../../app/globals.css", () => ({}));

const { default: PageError } = await import("@/app/[locale]/error");
const { default: GlobalError } = await import("@/app/global-error");

const failure = Object.assign(new Error("relation \"secret_table\" does not exist at db.ts:42"), { digest: "123abc" });

describe("error pages", () => {
  it("show a way to retry and a way home, never the error itself", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const html = renderToStaticMarkup(
      createElement(NextIntlClientProvider, { locale: "es", messages: es, children: createElement(PageError, { error: failure, reset: () => undefined }) }),
    );
    expect(html).toContain(es.errors.errorTitle);
    expect(html).toContain(es.errors.retry);
    expect(html).toContain('href="/"');
    expect(html).not.toContain("secret_table");
    expect(html).not.toContain("db.ts");
  });

  it("render without any app context when the root layout failed, in both languages", () => {
    const html = renderToStaticMarkup(createElement(GlobalError, { error: failure, reset: () => undefined }));
    expect(html).toContain(en.errors.errorTitle);
    expect(html).toContain(es.errors.errorTitle);
    expect(html).toMatch(/^<html lang="en">.*<body/);
    expect(html).not.toContain("secret_table");
  });
});
