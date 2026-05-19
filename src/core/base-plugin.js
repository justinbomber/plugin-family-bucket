/** @typedef {import("./types.js").PluginMeta} PluginMeta */

/** @typedef {import("../background/plugin-manager.js").PluginRuntimeContext} PluginRuntimeContext */

/**
 * Plugin 基底：由各子模組繼承，提供 metadata 與預設設定。
 * background 細節由各 Plugin `register()` 對 PluginManager 註冊處理。
 */
export class BasePlugin {
  /**
   * @param {string} id kebab-case
   * @param {Pick<PluginMeta, "label" | "description"> & { id?: never }} meta
   */
  constructor(id, meta) {
    this.id = id;
    /** @type {PluginMeta} */
    this.meta = { id, label: meta.label, description: meta.description };
  }

  /** @returns {PluginMeta} */
  getMeta() {
    return this.meta;
  }

  /**
   * 合併儲存的物件與布林欄位的預設值（子類可覆寫預設表）。
   * @returns {Record<string, unknown>}
   */
  getDefaultSettings() {
    return {};
  }


  normalizeSettings(raw) {
    const defaults = this.getDefaultSettings();
    const src = raw && typeof raw === "object" ? raw : {};
    const out = {};
    for (const [key, fallback] of Object.entries(defaults)) {
      const v = src[key];
      if (typeof fallback === "boolean") {
        out[key] = typeof v === "boolean" ? v : fallback;
      } else {
        out[key] = Object.prototype.hasOwnProperty.call(src, key) ? v : fallback;
      }
    }
    return out;
  }

  /**
   * Plugin 將自身 background 監聽註冊於 Service Worker。
   * @param {PluginRuntimeContext} ctx
   */
  // eslint-disable-next-line no-unused-vars
  mount(ctx) {}
}
