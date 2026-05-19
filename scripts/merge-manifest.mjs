/**
 * 合併 manifest.base.json 與 plugins/<name>/manifest.fragment.json，寫入根 manifest.json。
 * Chrome 仍以 plugin-family-bucket/manifest.json 為唯一載入口；來源由各 plugin 內宣告。
 */
import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function uniq(arr) {
  return [...new Set(arr)];
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

async function pluginManifestPaths() {
  const dir = path.join(ROOT, "plugins");
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const paths = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const fragment = path.join(dir, e.name, "manifest.fragment.json");
    const legacy = path.join(dir, e.name, "manifest.json");
    try {
      await fs.access(fragment);
      paths.push(fragment);
    } catch {
      try {
        await fs.access(legacy);
        console.warn(
          "[merge-manifest] deprecated plugins/" + e.name + "/manifest.json — rename to manifest.fragment.json",
        );
        paths.push(legacy);
      } catch {
        /* 無 fragment 則跳過 */
      }
    }
  }
  paths.sort();
  return paths;
}

async function bundleMarkdownSw() {
  const bundleScript = path.join(ROOT, "scripts", "bundle-markdown-sw.mjs");
  try {
    await fs.access(bundleScript);
    const { spawn } = await import("node:child_process");
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [bundleScript], {
        cwd: ROOT,
        stdio: "inherit",
      });
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error("bundle-markdown-sw exit " + code)),
      );
    });
  } catch (e) {
    console.warn("[merge-manifest] bundle-markdown-sw skipped:", e.message || e);
  }
}

async function merge() {
  await bundleMarkdownSw();
  const out = JSON.parse(await fs.readFile(path.join(ROOT, "manifest.base.json"), "utf8"));

  for (const pluginPath of await pluginManifestPaths()) {
    const frag = JSON.parse(await fs.readFile(pluginPath, "utf8"));
    delete frag._comment;

    if (frag.permissions != null && !Array.isArray(frag.permissions)) {
      throw new Error("permissions must be array: " + pluginPath);
    }
    if (frag.host_permissions != null && !Array.isArray(frag.host_permissions)) {
      throw new Error("host_permissions must be array: " + pluginPath);
    }
    if (frag.content_scripts != null && !Array.isArray(frag.content_scripts)) {
      throw new Error("content_scripts must be array: " + pluginPath);
    }
    if (frag.web_accessible_resources != null && !Array.isArray(frag.web_accessible_resources)) {
      throw new Error("web_accessible_resources must be array: " + pluginPath);
    }
    if (frag.commands != null && !isPlainObject(frag.commands)) {
      throw new Error("commands must be object: " + pluginPath);
    }
    if (frag.icons != null && !isPlainObject(frag.icons)) {
      throw new Error("icons must be object: " + pluginPath);
    }
    if (frag.optional_permissions != null && !Array.isArray(frag.optional_permissions)) {
      throw new Error("optional_permissions must be array: " + pluginPath);
    }
    if (frag.optional_host_permissions != null && !Array.isArray(frag.optional_host_permissions)) {
      throw new Error("optional_host_permissions must be array: " + pluginPath);
    }

    const basePerm = Array.isArray(out.permissions) ? out.permissions : [];
    if (frag.permissions?.length) {
      out.permissions = uniq([...basePerm, ...frag.permissions]);
    }

    const baseHost = Array.isArray(out.host_permissions) ? out.host_permissions : [];
    if (frag.host_permissions?.length) {
      out.host_permissions = uniq([...baseHost, ...frag.host_permissions]);
    }

    const baseOptHost = Array.isArray(out.optional_host_permissions) ? out.optional_host_permissions : [];
    if (frag.optional_host_permissions?.length) {
      out.optional_host_permissions = uniq([...baseOptHost, ...frag.optional_host_permissions]);
    }

    const baseOptPerm = Array.isArray(out.optional_permissions) ? out.optional_permissions : [];
    if (frag.optional_permissions?.length) {
      out.optional_permissions = uniq([...baseOptPerm, ...frag.optional_permissions]);
    }

    const baseCs = Array.isArray(out.content_scripts) ? out.content_scripts : [];
    if (frag.content_scripts?.length) {
      out.content_scripts = [...baseCs, ...frag.content_scripts];
    }

    const baseWar = Array.isArray(out.web_accessible_resources) ? out.web_accessible_resources : [];
    if (frag.web_accessible_resources?.length) {
      out.web_accessible_resources = [...baseWar, ...frag.web_accessible_resources];
    }

    const baseCmd = isPlainObject(out.commands) ? out.commands : {};
    if (frag.commands && Object.keys(frag.commands).length) {
      for (const k of Object.keys(frag.commands)) {
        if (Object.prototype.hasOwnProperty.call(baseCmd, k)) {
          throw new Error('[merge-manifest] duplicate command "' + k + '" in ' + pluginPath);
        }
        baseCmd[k] = frag.commands[k];
      }
      out.commands = { ...baseCmd };
    }

    if (frag.icons && Object.keys(frag.icons).length) {
      out.icons = {
        ...(isPlainObject(out.icons) ? out.icons : {}),
        ...frag.icons,
      };
    }
  }

  if (Array.isArray(out.optional_host_permissions) && out.optional_host_permissions.length === 0) {
    delete out.optional_host_permissions;
  }
  if (Array.isArray(out.optional_permissions) && out.optional_permissions.length === 0) {
    delete out.optional_permissions;
  }

  if (Array.isArray(out.host_permissions) && out.host_permissions.length === 0) {
    delete out.host_permissions;
  }
  if (Array.isArray(out.content_scripts) && out.content_scripts.length === 0) {
    delete out.content_scripts;
  }
  if (Array.isArray(out.web_accessible_resources) && out.web_accessible_resources.length === 0) {
    delete out.web_accessible_resources;
  }
  if (isPlainObject(out.commands) && Object.keys(out.commands).length === 0) {
    delete out.commands;
  }
  if (isPlainObject(out.icons) && Object.keys(out.icons).length === 0) {
    delete out.icons;
  }

  const target = path.join(ROOT, "manifest.json");
  await fs.writeFile(target, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log("[merge-manifest] wrote " + target);
}

merge().catch((e) => {
  console.error(e);
  process.exit(1);
});
