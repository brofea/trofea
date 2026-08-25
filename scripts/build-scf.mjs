import archiver from "archiver";
import { build } from "esbuild";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(root, "dist-scf");
const bundlePath = resolve(outputDir, "index.bundle.cjs");
const zipPath = resolve(outputDir, "qqbot-scf.zip");

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

await build({
  entryPoints: [resolve(root, "scf/index.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: bundlePath,
  sourcemap: false,
  minify: false,
});

await new Promise((resolvePromise, reject) => {
  const output = createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  output.on("close", resolvePromise);
  output.on("error", reject);
  archive.on("error", reject);
  archive.pipe(output);
  archive.file(bundlePath, { name: "index.js" });
  void archive.finalize();
});

await rm(bundlePath, { force: true });
console.log(`SCF ZIP generated: ${zipPath}`);
