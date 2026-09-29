import { describe, expect, it } from "vitest";
import designEn from "@/design/i18n/en.json";
import designEs from "@/design/i18n/es.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";

type Tree = { [key: string]: Tree | Tree[] | string };

function flatten(tree: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof tree === "string") {
    out.set(prefix, tree);
    return out;
  }
  if (tree && typeof tree === "object") {
    for (const [key, value] of Object.entries(tree as Tree)) {
      for (const [k, v] of flatten(value, prefix ? `${prefix}.${key}` : key)) out.set(k, v);
    }
  }
  return out;
}

// Top-level ICU argument names, e.g. "{n, plural, one {# day}}" -> ["n"].
function icuArgs(message: string): string[] {
  const args = new Set<string>();
  let depth = 0;
  for (let i = 0; i < message.length; i++) {
    const ch = message[i];
    if (ch === "{") {
      if (depth === 0) {
        const match = /^\{\s*([A-Za-z0-9_]+)/.exec(message.slice(i));
        if (match) args.add(match[1]);
      }
      depth++;
    } else if (ch === "}") {
      depth--;
    }
  }
  return [...args].sort();
}

const locales = { en: flatten(en), es: flatten(es) };

/**
 * Design strings replaced on purpose: values from app_config or the database become placeholders,
 * the brand becomes {brand}, and share.chaLabel uses neutral copy (see docs/PROGRESS.md decisions).
 */
const CHANGED_FROM_DESIGN = new Set([
  "common.dropping",
  "common.floor",
  "homeStates.takeFirst",
  "homeStates.empty2",
  "homeStates.exp2",
  "editProfile.bRejWhy",
  "editProfile.priceNote",
  "share.mFoot",
  "share.chaLabel",
  "share.mNote",
  "season.nextDesc.1",
  "season.nextDesc.2",
  "payment.nameHelp",
  "profile.allReigns",
  "editProfile.alHelp",
  "editProfile.priceErr",
  "editProfile.avAlt",
]);

describe("messages", () => {
  it("has the same keys in every locale", () => {
    expect([...locales.es.keys()].sort()).toEqual([...locales.en.keys()].sort());
  });

  it("uses the same ICU arguments in every locale", () => {
    for (const [key, value] of locales.en) {
      expect(icuArgs(locales.es.get(key) ?? ""), key).toEqual(icuArgs(value));
    }
  });

  it("contains every string from the design handoff, changed only where decided", () => {
    for (const [locale, design] of [
      ["en", designEn],
      ["es", designEs],
    ] as const) {
      for (const [key, value] of flatten(design)) {
        const current = locales[locale].get(key);
        if (CHANGED_FROM_DESIGN.has(key)) {
          expect(current, `${locale}: ${key} should differ from the design`).not.toBe(value);
        } else {
          expect(current, `${locale}: ${key}`).toBe(value);
        }
      }
    }
  });

  it("never hardcodes the brand name", () => {
    for (const [locale, messages] of Object.entries(locales)) {
      for (const [key, value] of messages) {
        // "cr" is the avatar crown layer, not the brand.
        if (key === "editProfile.parts.cr") continue;
        expect(value, `${locale}: ${key}`).not.toMatch(/\bCrown\b/);
      }
    }
  });

  it("has no empty strings outside the design handoff", () => {
    const design = flatten(designEn);
    for (const [key, value] of locales.en) {
      if (!design.has(key)) expect(value, key).not.toBe("");
    }
  });
});
