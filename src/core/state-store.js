import {
  LEGACY_STORAGE_STATE_KEY,
  LEGACY_YT_IMMERSIVE_KEY,
  STORAGE_STATE_KEY,
} from "../shared/storage-keys.js";
import { SUITE_SCHEMA_VERSION } from "./constants.js";

/** @typedef {import("./types.js").PluginSuiteStateV1} PluginSuiteStateV1 */

/**
 * @param {Record<string, unknown>} defaults
 * @param {unknown} incoming
 */
function normalizeWithDefaults(defaults, incoming) {
  const src = incoming && typeof incoming === "object" && !Array.isArray(incoming) ? incoming : {};
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, dv] of Object.entries(defaults)) {
    const v = /** @type {Record<string, unknown>} */ (src)[key];
    if (typeof dv === "boolean") {
      out[key] = typeof v === "boolean" ? v : dv;
    } else {
      out[key] = Object.prototype.hasOwnProperty.call(src, key) ? v : dv;
    }
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {PluginSuiteStateV1}
 */
export function coerceSuiteState(raw) {
  const base =
    raw && typeof raw === "object" ? /** @type {{ version?: unknown, plugins?: unknown }} */ (raw) : {};

  const versionOk = typeof base.version === "number" ? base.version : SUITE_SCHEMA_VERSION;

  /** @type {Record<string, { enabled?: unknown, settings?: unknown }>} */
  const pluginsIn =
    base.plugins && typeof base.plugins === "object" && !Array.isArray(base.plugins)
      ? /** @type {Record<string, { enabled?: unknown, settings?: unknown }>} */ (base.plugins)
      : {};

  /** @type {Record<string, import("./types.js").PluginRecord>} */
  const plugins = {};

  for (const [id, rec] of Object.entries(pluginsIn)) {
    plugins[id] = {
      enabled: Boolean(rec.enabled),
      settings:
        rec.settings && typeof rec.settings === "object" && !Array.isArray(rec.settings)
          ? /** @type {Record<string, unknown>} */ (rec.settings)
          : {},
    };
  }

  return { version: versionOk, plugins };
}

/** @typedef {{ id: string, getDefaults: () => Record<string, unknown> }} PluginSeed */

/**
 * @param {typeof chrome.storage} storageApi
 */
export function createStateStore(storageApi) {
  const api = storageApi.local;

  /** @returns {Promise<PluginSuiteStateV1>} */
  async function ensureInitialized(pluginSeeds) {
    const data = await api.get([
      STORAGE_STATE_KEY,
      LEGACY_STORAGE_STATE_KEY,
      LEGACY_YT_IMMERSIVE_KEY,
    ]);

    let suite = data[STORAGE_STATE_KEY]
      ? coerceSuiteState(data[STORAGE_STATE_KEY])
      : { version: SUITE_SCHEMA_VERSION, plugins: {} };

    let dirty = !data[STORAGE_STATE_KEY];

    if (!data[STORAGE_STATE_KEY] && data[LEGACY_STORAGE_STATE_KEY]) {
      suite = coerceSuiteState(data[LEGACY_STORAGE_STATE_KEY]);
      dirty = true;
      try {
        await api.remove(LEGACY_STORAGE_STATE_KEY);
      } catch {
        /* ignore */
      }
    }

    for (const seed of pluginSeeds) {
      if (!suite.plugins[seed.id]) {
        suite.plugins[seed.id] = {
          enabled: true,
          settings: { ...seed.getDefaults() },
        };
        dirty = true;
      } else {
        const nextSettings = normalizeWithDefaults(seed.getDefaults(), suite.plugins[seed.id].settings);
        if (JSON.stringify(nextSettings) !== JSON.stringify(suite.plugins[seed.id].settings)) {
          suite.plugins[seed.id] = {
            enabled: !!suite.plugins[seed.id].enabled,
            settings: nextSettings,
          };
          dirty = true;
        }
      }
    }

    const legacy = data[LEGACY_YT_IMMERSIVE_KEY];

    if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
      const fstSeed = pluginSeeds.find((s) => s.id === "full-screen-toggle");
      if (fstSeed) {
        suite.plugins["full-screen-toggle"] = {
          ...(suite.plugins["full-screen-toggle"] || { enabled: true, settings: {} }),
          enabled: true,
          settings: normalizeWithDefaults(fstSeed.getDefaults(), legacy),
        };
        dirty = true;
        try {
          await api.remove(LEGACY_YT_IMMERSIVE_KEY);
        } catch {
          /* ignore */
        }
      }
    }

    if (dirty) {
      suite = { ...suite, version: SUITE_SCHEMA_VERSION };
      await api.set({ [STORAGE_STATE_KEY]: suite });
    }

    return suite;
  }

  /** @returns {Promise<PluginSuiteStateV1>} */
  async function reload() {
    const data = await api.get(STORAGE_STATE_KEY);
    return data[STORAGE_STATE_KEY]
      ? coerceSuiteState(data[STORAGE_STATE_KEY])
      : { version: SUITE_SCHEMA_VERSION, plugins: {} };
  }

  /** @returns {Promise<PluginSuiteStateV1>} */
  async function persist(next) {
    const prev = coerceSuiteState(next);
    prev.version = SUITE_SCHEMA_VERSION;
    await api.set({ [STORAGE_STATE_KEY]: prev });
    return prev;
  }

  return { ensureInitialized, reload, persist, coerceSuiteState };
}

