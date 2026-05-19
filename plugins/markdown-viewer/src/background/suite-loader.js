/**
 * 載入 Markdown Viewer legacy 背景（MV3 module Service Worker 無法 importScripts，
 * 且禁止 dynamic import()；以靜態 import bundle 後呼叫 bootstrap）。
 */
import { bootstrapMarkdownSuiteBackground } from "../../background/markdown-sw.bundle.mjs";

const MARKDOWN_PLUGIN_ID = "markdown-viewer";

/**
 * @param {{ manager: import("../../../../src/background/plugin-manager.js").PluginManager }} ctx
 */
export async function attachMarkdownViewerFromSuite(ctx) {
  const ref = {
    isEnabled() {
      try {
        return ctx.manager.isPluginEnabled(MARKDOWN_PLUGIN_ID);
      } catch {
        return false;
      }
    },
    getSettingsSeed() {
      try {
        return ctx.manager.getNormalizedPluginSettings(MARKDOWN_PLUGIN_ID);
      } catch {
        return {};
      }
    },
    async persistPatch(patch) {
      await ctx.manager.patchPluginSettings(MARKDOWN_PLUGIN_ID, patch);
    },
  };

  globalThis.__mdMarkdownSuite = ref;

  if (globalThis.__mdMarkdownSuiteInit) {
    globalThis.__mdMarkdownReady = true;
    return;
  }

  try {
    if (typeof bootstrapMarkdownSuiteBackground !== "function") {
      throw new Error(
        "bundle 缺少 bootstrapMarkdownSuiteBackground（請執行 node plugin-family-bucket/scripts/bundle-markdown-sw.mjs）",
      );
    }
    bootstrapMarkdownSuiteBackground();
    globalThis.__mdMarkdownReady = true;
    const compilerCount =
      typeof globalThis.md !== "undefined" && globalThis.md.compilers
        ? Object.keys(globalThis.md.compilers).length
        : 0;
    console.info(
      "[markdown-viewer] 背景已就緒；編譯器數量:",
      compilerCount,
      compilerCount === 0 ? "（若為 0 請確認 vendor/*.min.js 已複製）" : "",
    );
  } catch (e) {
    globalThis.__mdMarkdownReady = false;
    const detail =
      e instanceof Error ? `${e.message}${e.stack ? `\n${e.stack}` : ""}` : String(e);
    console.error(
      "[markdown-viewer] 無法初始化背景 bundle。請執行:\n" +
        "  node plugin-family-bucket/scripts/bundle-markdown-sw.mjs\n" +
        "並確認 plugin-family-bucket/plugins/markdown-viewer/vendor/ 與 icons/ 已從上游建置複製。\n" +
        detail,
    );
    throw e;
  }
}
