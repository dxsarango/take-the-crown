// Frame capture through the DevTools screencast, encoded to constant-rate H.264. Playwright's own
// recordVideo renders at CSS pixels and ignores the device scale factor, so it comes out soft.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const FPS = 30;

/** FFMPEG_PATH, then ffmpeg on PATH, then the build bundled with Remotion in the sibling videos repo. */
export async function findFfmpeg(videosRepo) {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const onPath = await new Promise((resolve) => {
    const probe = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    probe.on("error", () => resolve(false));
    probe.on("exit", (code) => resolve(code === 0));
  });
  if (onPath) return "ffmpeg";
  const pnpmDir = path.join(videosRepo, "node_modules", ".pnpm");
  if (existsSync(pnpmDir)) {
    for (const entry of await readdir(pnpmDir)) {
      if (!entry.startsWith("@remotion+compositor-")) continue;
      const pkg = entry.slice("@remotion+".length).replace(/@[^@]*$/, "");
      const folder = path.join(pnpmDir, entry, "node_modules", "@remotion", pkg);
      const exe = ["ffmpeg.exe", "ffmpeg"].map((name) => path.join(folder, name)).find((file) => existsSync(file));
      if (exe) return exe;
    }
  }
  throw new Error("ffmpeg not found: install it or set FFMPEG_PATH");
}

/**
 * Starts capturing `page`. Frames carry the browser's wall-clock timestamp, so two recordings made
 * together share one timeline: `stop(from, to)` cuts both to the same window.
 */
export async function startRecording(page, { width, height }) {
  const dir = await mkdtemp(path.join(tmpdir(), "crown-record-"));
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  const writes = [];
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    // Acknowledge first: the browser sends nothing more until it does.
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => undefined);
    const file = path.join(dir, `${String(frames.length).padStart(6, "0")}.jpg`);
    frames.push({ at: metadata.timestamp ?? Date.now() / 1000, file });
    writes.push(writeFile(file, Buffer.from(data, "base64")));
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 100, maxWidth: width, maxHeight: height, everyNthFrame: 1 });

  return {
    /** Stops capturing; returns a function that encodes the window [from, to] (ms since epoch). */
    async stop() {
      await cdp.send("Page.stopScreencast").catch(() => undefined);
      await Promise.all(writes);
      return {
        frames: frames.length,
        async encode({ from, to, out, ffmpeg }) {
          await encode({ frames, from: from / 1000, to: to / 1000, out, ffmpeg, width, height });
          await rm(dir, { recursive: true, force: true });
        },
      };
    },
  };
}

async function encode({ frames, from, to, out, ffmpeg, width, height }) {
  if (!frames.length) throw new Error("The screencast produced no frames");
  // The window starts at `from`: the newest frame at that moment (or the first one) is held until the next frame.
  const list = [];
  const visible = frames.filter((f) => f.at < to);
  const start = Math.max(0, visible.findLastIndex((f) => f.at <= from));
  const used = visible.slice(start);
  used.forEach((frame, i) => {
    const shownFrom = i === 0 ? from : frame.at;
    const shownUntil = i + 1 < used.length ? used[i + 1].at : to;
    list.push(`file '${frame.file.replaceAll("\\", "/")}'`, `duration ${Math.max(shownUntil - shownFrom, 0.001).toFixed(6)}`);
  });
  // The concat demuxer ignores the last duration unless the file is repeated.
  list.push(list.at(-2));
  const listFile = path.join(path.dirname(used[0].file), "frames.txt");
  await writeFile(listFile, list.join("\n"));
  await mkdir(path.dirname(out), { recursive: true });
  const args = [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "concat", "-safe", "0", "-i", listFile,
    // Nearest-neighbor only matters if a frame ever differs from the target size; it never blurs pixel art.
    "-vf", `scale=${width}:${height}:flags=neighbor:in_range=full:out_range=limited:out_color_matrix=bt709,format=yuv420p`,
    // The bundled ffmpeg has no fps filter: -r with cfr resamples the variable-rate frames.
    "-r", String(FPS), "-fps_mode", "cfr",
    "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-movflags", "+faststart", out,
  ];
  await new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
  });
}
