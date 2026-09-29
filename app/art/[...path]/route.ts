import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

// Serves the design handoff's pixel assets (flags, icons, seals, frames, medals…) as static files.
const ASSETS = path.join(process.cwd(), "design", "assets");

export const dynamicParams = false;

export async function generateStaticParams() {
  const entries = await readdir(ASSETS, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".svg"))
    .map((entry) => ({
      path: path.relative(ASSETS, path.join(entry.parentPath, entry.name)).split(path.sep),
    }));
}

export async function GET(_request: Request, { params }: RouteContext<"/art/[...path]">) {
  const segments = (await params).path;
  const file = path.join(ASSETS, ...segments);
  if (!file.startsWith(ASSETS + path.sep) || !file.endsWith(".svg")) {
    return new Response("Not found", { status: 404 });
  }
  const svg = await readFile(file, "utf8").catch(() => null);
  if (svg === null) return new Response("Not found", { status: 404 });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
