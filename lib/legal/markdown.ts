/**
 * The small Markdown subset of the legal drafts in docs/legal: headings, paragraphs, **bold**,
 * "- " lists and pipe tables. Parsed into blocks that React renders, so no HTML is ever injected.
 */

export type Inline = { kind: "text"; text: string } | { kind: "bold"; text: string } | { kind: "email"; text: string };

export type Block =
  | { kind: "title"; text: string }
  | { kind: "heading"; id: string; text: string }
  | { kind: "question"; question: Inline[]; answer: Inline[] }
  | { kind: "paragraph"; content: Inline[] }
  | { kind: "list"; items: Inline[][] }
  | { kind: "table"; head: string[]; rows: string[][] };

const EMAIL = /[^\s@()]+@[^\s@()]+\.[A-Za-z]{2,}/g;

function plain(text: string): Inline[] {
  const parts: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(EMAIL)) {
    // A sentence may end right after the address.
    const address = match[0].replace(/[.,;:]+$/, "");
    if (match.index > last) parts.push({ kind: "text", text: text.slice(last, match.index) });
    parts.push({ kind: "email", text: address });
    last = match.index + address.length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

export function inline(text: string): Inline[] {
  return text.split(/(\*\*[^*]+\*\*)/).flatMap((part): Inline[] => {
    if (!part) return [];
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    return bold ? [{ kind: "bold", text: bold[1] }] : plain(part);
  });
}

function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** "## 5. Delivery and refunds" → "s5", so the checkout can link to a numbered section in any language. */
function headingId(text: string): string {
  const number = /^(\d+)\./.exec(text);
  if (number) return `s${number[1]}`;
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const groups = source.replace(/\r\n/g, "\n").trim().split(/\n\s*\n/);
  for (const group of groups) {
    const lines = group.split("\n").map((l) => l.trimEnd());
    const first = lines[0];
    if (first.startsWith("# ")) {
      blocks.push({ kind: "title", text: first.slice(2).trim() });
    } else if (first.startsWith("## ")) {
      const text = first.slice(3).trim();
      blocks.push({ kind: "heading", id: headingId(text), text });
    } else if (lines.every((l) => l.startsWith("- "))) {
      blocks.push({ kind: "list", items: lines.map((l) => inline(l.slice(2).trim())) });
    } else if (lines.every((l) => l.startsWith("|"))) {
      const [head, , ...rows] = lines;
      blocks.push({ kind: "table", head: cells(head), rows: rows.map(cells) });
    } else if (lines.length > 1 && /^\*\*[^*]+\*\*$/.test(first)) {
      blocks.push({ kind: "question", question: inline(first), answer: inline(lines.slice(1).join(" ")) });
    } else {
      blocks.push({ kind: "paragraph", content: inline(lines.join(" ")) });
    }
  }
  return blocks;
}

/** Replaces `{{NAME}}` and `{name}` placeholders; unknown or empty ones stay as they are. */
export function fillPlaceholders(source: string, values: Record<string, string | null>): string {
  return source.replace(/\{\{([A-Z_]+)\}\}|\{([a-z_]+)\}/g, (match, upper: string | undefined, lower: string | undefined) => {
    const value = values[upper ?? lower ?? ""];
    return value ? value : match;
  });
}
