import { BasePlugin } from "../../../src/core/base-plugin.js";
import { attachMarkdownViewerFromSuite } from "./background/suite-loader.js";
import { getMarkdownViewerDefaultSettings } from "./default-settings.js";

const MARKDOWN_VIEWER_ID = "markdown-viewer";

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {unknown}
 */
function deepMergePlain(a, b) {
  if (
    b !== null &&
    typeof b === "object" &&
    !Array.isArray(b) &&
    a !== null &&
    typeof a === "object" &&
    !Array.isArray(a)
  ) {
    const out = { .../** @type {Record<string, unknown>} */ (a) };
    const bo = /** @type {Record<string, unknown>} */ (b);
    for (const key of Object.keys(bo)) {
      const bv = bo[key];
      const av = out[key];
      if (
        bv !== null &&
        typeof bv === "object" &&
        !Array.isArray(bv) &&
        av !== null &&
        typeof av === "object" &&
        !Array.isArray(av)
      ) {
        out[key] = deepMergePlain(av, bv);
      } else if (Object.prototype.hasOwnProperty.call(bo, key)) {
        out[key] = bv;
      }
    }
    return out;
  }
  return b === undefined ? a : b;
}

export class MarkdownViewerPlugin extends BasePlugin {
  constructor() {
    super(MARKDOWN_VIEWER_ID, {
      label: "Markdown 檢視",
      description: "將 .md／plain 網頁以主題預覽。展開卡片可設定本機 file:// 權限；遠端網址請用進階設定。",
    });
  }

  getDefaultSettings() {
    return getMarkdownViewerDefaultSettings();
  }

  normalizeSettings(raw) {
    const d = this.getDefaultSettings();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return JSON.parse(JSON.stringify(d));
    }
    return /** @type {ReturnType<MarkdownViewerPlugin['getDefaultSettings']>} */ (
      deepMergePlain(d, raw)
    );
  }

  async mount(ctx) {
    await attachMarkdownViewerFromSuite(ctx);
  }
}
