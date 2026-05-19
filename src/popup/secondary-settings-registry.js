/** @typedef {{ pluginId: string, getMasterEnabled: () => boolean, readPluginSettings: () => Promise<Record<string, unknown>|null>, patchSettings: (patch: Record<string, unknown>) => Promise<unknown>, sendPlatform: (type: string, payload?: Record<string, unknown>) => Promise<unknown> }} SecondaryCtx */

/** @typedef {{ ariaLabel?: string; mountSecondary: (container: HTMLElement, ctx: SecondaryCtx) => Promise<void>|void }} SecondaryEntry */

import { PLATFORM_MSG } from "../shared/message-types.js";
import {
  MARKDOWN_SECONDARY_MOUNT,
  secondaryAriaLabel,
} from "../../plugins/markdown-viewer/src/settings/secondary-panel.js";

/** @type {Readonly<Record<string, SecondaryEntry>>} */
const REGISTRY = Object.freeze({
  "markdown-viewer": {
    ariaLabel: secondaryAriaLabel,
    mountSecondary: MARKDOWN_SECONDARY_MOUNT,
  },
});

/**
 * @param {string} pluginId
 * @returns {SecondaryEntry | null}
 */
export function getSecondaryEntry(pluginId) {
  return REGISTRY[pluginId] || null;
}

/**
 * @param {string} pluginId
 * @returns {Promise<Record<string, unknown>|null>}
 */
async function readPluginSettings(pluginId) {
  const r = await chrome.runtime.sendMessage({ type: PLATFORM_MSG.GET_FULL_STATE });
  if (!r || !r.ok || !r.suite || !r.suite.plugins || !r.suite.plugins[pluginId]) return null;
  const s = r.suite.plugins[pluginId].settings;
  if (typeof s !== "object" || s === null || Array.isArray(s)) return null;
  /** @type {Record<string, unknown>} */
  const out = s;
  return out;
}

/**
 * @param {string} pluginId
 */
export function createSecondaryCtx(pluginId) {
  /** @type {(() => boolean) | null} */
  let masterGetter = () => true;
  return {
    pluginId,
    setMasterGetter(fn) {
      masterGetter = fn;
    },
    getMasterEnabled() {
      return masterGetter ? masterGetter() : true;
    },
    async readPluginSettings() {
      return readPluginSettings(pluginId);
    },
    async patchSettings(patch) {
      return chrome.runtime.sendMessage({
        type: PLATFORM_MSG.PATCH_PLUGIN_SETTINGS,
        pluginId,
        patch,
      });
    },
    async sendPlatform(type, payload = {}) {
      return chrome.runtime.sendMessage({ type, ...payload });
    },
  };
}
