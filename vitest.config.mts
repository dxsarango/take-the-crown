import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL(".", import.meta.url)) };

/** Variables starting with `prefix` from .env then .env.local (later files win), then the shell (wins over both). */
function envWithPrefix(prefix: string): Record<string, string> {
  const files = [".env", ".env.local"].filter((f) => existsSync(f)).map((f) => parseEnv(readFileSync(f, "utf8")));
  return Object.fromEntries(
    Object.entries(Object.assign({}, ...files, process.env)).filter((e): e is [string, string] => e[0].startsWith(prefix) && typeof e[1] === "string"),
  );
}

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        resolve: { alias },
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          environment: "node",
          // One shared local database: files and tests run one at a time.
          fileParallelism: false,
          sequence: { concurrent: false },
          testTimeout: 30_000,
          hookTimeout: 60_000,
          globalSetup: ["tests/db/global-setup.ts"],
        },
      },
      // Real model calls cost money: only `pnpm test:moderation` runs them. Vitest does not read
      // .env files into process.env, so the live project loads ANTHROPIC_* itself.
      ...(process.env.npm_lifecycle_event === "test:moderation"
        ? [
            {
              resolve: { alias },
              test: {
                name: "live",
                include: ["tests/live/**/*.test.ts"],
                environment: "node",
                env: envWithPrefix("ANTHROPIC_"),
              },
            },
          ]
        : []),
    ],
  },
});
