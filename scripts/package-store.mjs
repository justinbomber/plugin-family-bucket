/**
 * 產出 Chrome Web Store 用 ZIP：根目錄僅一個 manifest.json，不含 fragment／建置腳本。
 * 執行：node plugin-family-bucket/scripts/package-store.mjs
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const EXCLUDE_NAMES = new Set([
  "manifest.base.json",
  "manifest.fragment.json",
  ".git",
  ".gitignore",
  ".cursor",
  "dist",
  "scripts",
]);

function shouldExclude(relPath, name) {
  if (EXCLUDE_NAMES.has(name)) return true;
  if (name.startsWith(".git")) return true;
  if (name.endsWith(".mdc")) return true;
  const parts = relPath.split(path.sep);
  if (parts.includes(".cursor")) return true;
  if (parts.includes("scripts")) return true;
  if (parts.includes("dist")) return true;
  return false;
}

async function runMergeManifest() {
  const mergeScript = path.join(ROOT, "scripts", "merge-manifest.mjs");
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [mergeScript], { cwd: ROOT, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("merge-manifest exit " + code)),
    );
  });
}

async function copyDir(src, dest, relBase = "") {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const rel = relBase ? path.join(relBase, e.name) : e.name;
    if (shouldExclude(rel, e.name)) continue;
    const from = path.join(src, e.name);
    const to = path.join(dest, e.name);
    if (e.isDirectory()) {
      await copyDir(from, to, rel);
    } else if (e.isFile()) {
      await fs.copyFile(from, to);
    }
  }
}

function runTarZip(staging, zipPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["-a", "-c", "-f", zipPath, "-C", staging, "."], {
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("tar zip failed with code " + code)),
    );
  });
}

function listManifestsInZip(zipPath) {
  const r = spawnSync("tar", ["-tf", zipPath], { encoding: "utf8" });
  if (r.status !== 0) return null;
  return r.stdout
    .split(/\r?\n/)
    .map((l) => l.replace(/\\/g, "/").replace(/^\.\//, ""))
    .filter((l) => l === "manifest.json" || l.endsWith("/manifest.json"));
}

async function packageStore() {
  await runMergeManifest();

  const manifest = JSON.parse(await fs.readFile(path.join(ROOT, "manifest.json"), "utf8"));
  const version = typeof manifest.version === "string" ? manifest.version : "0.0.0";

  const distDir = path.join(ROOT, "dist");
  const staging = path.join(os.tmpdir(), `plugin-family-bucket-store-${process.pid}`);
  const zipPath = path.join(distDir, `plugin-family-bucket-${version}.zip`);

  await fs.rm(staging, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });
  try {
    await fs.rm(zipPath, { force: true });
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code !== "EBUSY") throw err;
    console.warn("[package-store] existing zip locked, overwriting in place via tar");
  }

  await copyDir(ROOT, staging);
  await runTarZip(staging, zipPath);
  await fs.rm(staging, { recursive: true, force: true });

  const manifests = listManifestsInZip(zipPath);
  console.log("[package-store] wrote " + zipPath);
  if (manifests) {
    console.log("[package-store] manifest.json entries in ZIP:", manifests.length);
    for (const m of manifests) console.log("  - " + m);
    if (manifests.length !== 1) {
      throw new Error("ZIP must contain exactly one manifest.json");
    }
    if (manifests[0] !== "manifest.json") {
      throw new Error("manifest.json must be at ZIP root, got: " + manifests[0]);
    }
  }
}

packageStore().catch((e) => {
  console.error(e);
  process.exit(1);
});
