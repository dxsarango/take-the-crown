// `pnpm build && pnpm check:bundle`: looks through the local build's client JavaScript for server
// secrets, including the actual values from .env and .env.local. Prints names, never values.

import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { SERVER_SECRETS, findSecrets } from "./bundle-secrets.mjs";

const dir = path.join(process.cwd(), ".next", "static");
if (!existsSync(dir)) {
  console.error("No .next/static: run `pnpm build` first.");
  process.exit(2);
}

const env = Object.assign({}, ...[".env", ".env.local"].filter((f) => existsSync(f)).map((f) => parseEnv(readFileSync(f, "utf8"))));
const values = Object.fromEntries(SERVER_SECRETS.filter((name) => env[name]).map((name) => [name, env[name]]));

const files = (await readdir(dir, { recursive: true })).filter((f) => f.endsWith(".js"));
let problems = 0;
for (const file of files) {
  for (const finding of findSecrets(await readFile(path.join(dir, file), "utf8"), values)) {
    console.log(`FAIL  ${file}: ${finding}`);
    problems++;
  }
}
console.log(problems ? `\n${problems} problems` : `PASS  ${files.length} client chunks, no server secrets (${Object.keys(values).length} values checked)`);
process.exit(problems ? 1 : 0);
