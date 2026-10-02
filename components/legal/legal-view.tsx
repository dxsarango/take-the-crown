"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Footer } from "@/components/home/sections";
import { useServerNow } from "@/components/home/use-live-home";
import { TopBar } from "@/components/top-bar";
import { Link } from "@/i18n/navigation";
import type { Season } from "@/lib/home/data";
import type { LegalDoc } from "@/lib/legal/docs-list";
import { LEGAL_DOCS } from "@/lib/legal/docs-list";
import type { Block, Inline } from "@/lib/legal/markdown";

const link = "underline decoration-crown-stone-hi underline-offset-4 hover:decoration-crown-text";

function Text({ parts }: { parts: Inline[] }) {
  return parts.map((p, i) =>
    p.kind === "bold" ? (
      <strong key={i} className="font-bold">
        {p.text}
      </strong>
    ) : p.kind === "email" ? (
      <a key={i} href={`mailto:${p.text}`} className={`${link} [overflow-wrap:anywhere]`}>
        {p.text}
      </a>
    ) : (
      p.text
    ),
  );
}

function BlockView({ block }: { block: Block }): ReactNode {
  switch (block.kind) {
    case "title":
      return <h1 className="text-28 leading-tight font-bold text-pretty lg:text-40">{block.text}</h1>;
    case "heading":
      return (
        <h2 id={block.id} className="mt-4 scroll-mt-6 pt-7 text-20 leading-tight font-bold text-pretty shadow-[var(--crown-bar-top)] lg:text-24">
          {block.text}
        </h2>
      );
    case "question":
      return (
        <div className="flex flex-col gap-2 pt-6 shadow-[var(--crown-bar-top)]">
          <h2 className="text-18 leading-snug font-bold text-pretty lg:text-20">
            <Text parts={block.question.map((p) => (p.kind === "bold" ? { kind: "text", text: p.text } : p))} />
          </h2>
          <p className="text-16 leading-body text-pretty text-crown-muted">
            <Text parts={block.answer} />
          </p>
        </div>
      );
    case "paragraph":
      return (
        <p className="text-16 leading-body text-pretty">
          <Text parts={block.content} />
        </p>
      );
    case "list":
      return (
        <ul className="flex flex-col gap-2.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-16 leading-body text-pretty">
              <span aria-hidden className="mt-[10px] size-1.5 flex-none bg-crown-text" />
              <span>
                <Text parts={item} />
              </span>
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <table className="w-full min-w-[320px] border-collapse text-left">
            <thead>
              <tr className="shadow-[inset_0_-2px_0_var(--crown-stone)]">
                {block.head.map((cell) => (
                  <th key={cell} scope="col" className="py-2.5 pr-4 text-12 font-bold text-crown-muted last:pr-0">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="shadow-[inset_0_-2px_0_var(--crown-velvet)]">
                  {row.map((cell, j) => (
                    <td key={j} className={`py-3 pr-4 align-top text-14 leading-snug last:pr-0 lg:text-16 ${j === 0 ? "font-bold" : ""}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** Rules, FAQ, terms and privacy: one reading column, the four pages linked at the top. */
export function LegalView({ doc, blocks, season, readAt }: { doc: LegalDoc; blocks: Block[]; season: Season; readAt: string }) {
  const home = useTranslations("home");
  const now = useServerNow(readAt);
  return (
    <div className="flex min-h-dvh flex-col bg-crown-ink">
      <TopBar season={season} now={now} />
      <main className="flex flex-1 flex-col px-4 pt-6 pb-12 lg:px-18 lg:pt-12 lg:pb-16">
        <article className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
          <nav aria-label={home("legal")} className="flex flex-wrap gap-x-5 gap-y-2 pb-2 text-14 font-medium">
            {LEGAL_DOCS.map((d) => (
              <Link
                key={d}
                href={`/${d}`}
                aria-current={d === doc ? "page" : undefined}
                className={`hit-area ${d === doc ? "font-bold text-crown-gold" : `text-crown-muted hover:text-crown-text ${link}`}`}
              >
                {home(d)}
              </Link>
            ))}
          </nav>
          {blocks.map((block, i) => (
            <BlockView key={i} block={block} />
          ))}
        </article>
      </main>
      <Footer season={season.id} now={now} />
    </div>
  );
}
