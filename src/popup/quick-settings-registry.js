/**
 * Popup「初步設定」欄位註冊表：僅為 UI／PATCH 鍵名，不向各 plugin 載入業務模組。
 * 新增插件時可在此列出常用 boolean 設定鍵（需與該插件 state settings 對齊）。
 */
export const POPUP_QUICK_SETTINGS = Object.freeze({
  "full-screen-toggle": [
    { key: "hideSecondary", label: "隱藏側欄與建議" },
    { key: "showPlayerButton", label: "在播放器顯示按鈕" },
  ],
});

export function getQuickSettingFields(pluginId) {
  return POPUP_QUICK_SETTINGS[pluginId] || null;
}
