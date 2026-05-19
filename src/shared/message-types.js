/**
 * 全家桶平台對外／對內訊息類型。
 * Popup、Options、Service Worker 使用相對於擴充根目錄的 ESM 匯入。
 * Content scripts 請以 `chrome.runtime.getURL("src/shared/message-types.js")` 載入以保持字串一致。
 */
export const PLATFORM_MSG = Object.freeze({
  LIST_PLUGINS_META: "suite:listPluginsMeta",
  GET_FULL_STATE: "suite:getFullState",
  SET_PLUGIN_ENABLED: "suite:setPluginEnabled",
  PATCH_PLUGIN_SETTINGS: "suite:patchPluginSettings",
  /** 推播至符合條件分頁，Content 端應套用或卸載對應 Plugin */
  PLUGIN_RUNTIME: "suite:pluginRuntime",
});
