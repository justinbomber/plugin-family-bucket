import { createEventBus } from "../core/event-bus.js";
import { createStateStore } from "../core/state-store.js";
import { createRegisteredPlugins } from "../core/plugin-registry.js";
import { PLATFORM_MSG } from "../shared/message-types.js";
import { STORAGE_STATE_KEY } from "../shared/storage-keys.js";

/** @typedef {import("../core/types.js").PluginSuiteStateV1} PluginSuiteStateV1 */

/** @typedef {{ manager: PluginManager }} PluginRuntimeContext */

export class PluginManager {
  constructor() {
    this.store = createStateStore(chrome.storage);
    this.bus = createEventBus();
    this.plugins = [];
    this.suite = null;
    this._initPromise = null;
    this._storageHooked = false;
  }

  async init() {
    if (!this._initPromise) {
      this._initPromise = this.bootstrap();
    }
    return this._initPromise;
  }

  async bootstrap() {
    this.plugins = createRegisteredPlugins();
    const seeds = this.plugins.map((p) => ({
      id: p.id,
      getDefaults: () => p.getDefaultSettings(),
    }));
    this.suite = await this.store.ensureInitialized(seeds);

    const ctx = /** @type {PluginRuntimeContext} */ ({ manager: this });
    for (const p of this.plugins) {
      await Promise.resolve(p.mount(ctx));
    }

    if (!this._storageHooked) {
      this._storageHooked = true;
      chrome.storage.onChanged.addListener(async (changes, area) => {
        if (area !== "local" || !changes[STORAGE_STATE_KEY]) return;
        this.suite = await this.store.reload();
        await this.broadcastAllMatchingTabs();
      });
    }

    await this.broadcastAllMatchingTabs();
    return /** @type {PluginSuiteStateV1} */ (this.suite);
  }

  async reloadSuite() {
    this.suite = await this.store.reload();
    return /** @type {PluginSuiteStateV1} */ (this.suite);
  }

  getPlugin(id) {
    return this.plugins.find((p) => p.id === id) || null;
  }

  isPluginEnabled(id) {
    const rec = this.suite?.plugins?.[id];
    return Boolean(rec?.enabled);
  }

  getNormalizedPluginSettings(id) {
    const p = this.getPlugin(id);
    if (!this.suite?.plugins[id] || !p) return {};
    return p.normalizeSettings(this.suite.plugins[id].settings);
  }

  async setPluginEnabled(id, enabled) {
    if (!this.suite?.plugins[id]) return null;
    this.suite.plugins[id] = {
      ...this.suite.plugins[id],
      enabled: Boolean(enabled),
    };
    this.suite = await this.store.persist(this.suite);
    this.bus.emit("suite:changed", { reason: "enabled", id });
    await this.broadcastPluginRuntime(id);
    return /** @type {PluginSuiteStateV1} */ (this.suite);
  }

  async patchPluginSettings(id, patch) {
    const p = this.getPlugin(id);
    if (!this.suite?.plugins[id] || !p) return {};

    const cur = p.normalizeSettings(this.suite.plugins[id].settings);
    const merged = p.normalizeSettings({ ...cur, ...patch });
    if (JSON.stringify(merged) === JSON.stringify(cur)) {
      return merged;
    }
    this.suite.plugins[id] = {
      ...this.suite.plugins[id],
      settings: merged,
    };
    this.suite = await this.store.persist(this.suite);
    this.bus.emit("suite:changed", { reason: "settings", id });
    await this.broadcastPluginRuntime(id);
    return merged;
  }

  pluginsMetaPayload() {
    return this.plugins.map((p) => {
      const meta = p.getMeta();
      const enabled = this.isPluginEnabled(p.id);
      return { ...meta, enabled };
    });
  }

  async broadcastPluginRuntime(pluginId) {
    if (pluginId === "full-screen-toggle") {
      const tabs = await chrome.tabs.query({ url: "*://*.youtube.com/*" });
      const enabled = this.isPluginEnabled(pluginId);
      const settings =
        pluginId === "full-screen-toggle" ? this.getNormalizedPluginSettings(pluginId) : {};
      const payload = { type: PLATFORM_MSG.PLUGIN_RUNTIME, pluginId, enabled, settings };

      for (const tab of tabs) {
        if (!tab.id) continue;
        try {
          await chrome.tabs.sendMessage(tab.id, payload);
        } catch (_e) {
          /* Content 尚未就緒 */
        }
      }
      return;
    }

    if (pluginId === "markdown-viewer") {
      const tabs = await chrome.tabs.query({});
      const enabled = this.isPluginEnabled(pluginId);
      const settings = this.getNormalizedPluginSettings(pluginId);
      const payload = { type: PLATFORM_MSG.PLUGIN_RUNTIME, pluginId, enabled, settings };
      for (const tab of tabs) {
        if (!tab.id) continue;
        try {
          await chrome.tabs.sendMessage(tab.id, payload);
        } catch (_e) {
          /* 非 markdown 分頁或未注入 */
        }
      }
      if (enabled && typeof globalThis.__mdMarkdownScanTabs === "function") {
        globalThis.__mdMarkdownScanTabs();
      }
      return;
    }
  }

  async broadcastAllMatchingTabs() {
    await this.broadcastPluginRuntime("full-screen-toggle");
    await this.broadcastPluginRuntime("markdown-viewer");
  }
}

export function createPluginManager() {
  return new PluginManager();
}
