/** @typedef {{ key: string, title: string, desc: string }} SettingDef */

/** @typedef {{ id: string, title: string, defs: SettingDef[], defaultOpen?: boolean }} OptionSection */

/** @type {OptionSection[]} */
export const FULL_SCREEN_TOGGLE_SECTIONS = [
  {
    id: "window-player",
    title: "視窗化滿版與播放器",
    defaultOpen: true,
    defs: [
      { key: "hideSecondary", title: "隱藏側欄與建議", desc: "沉浸式下隱藏右側建議區塊。" },
      {
        key: "showPlayerButton",
        title: "顯示播放器按鈕",
        desc: "在播放器控制列顯示「視窗化滿版」與「可捲動模式」按鈕。",
      },
      {
        key: "autoToggleOnWatch",
        title: "自動進入視窗化模式",
        desc: "開啟後，進入 YouTube /watch 頁會自動切到沉浸式視窗。",
      },
    ],
  },
  {
    id: "immersive-scroll",
    title: "沉浸式版面與捲動",
    defaultOpen: true,
    defs: [
      { key: "scrollingSupport", title: "可捲動模式", desc: "沉浸式視窗下仍可捲動頁面內容（留言、推薦等）。" },
      { key: "hideScrollbar", title: "隱藏捲軸", desc: "在可捲動模式中隱藏可視捲軸（不影響滑動）。" },
      { key: "alwaysShowSearchBar", title: "總是顯示搜尋列", desc: "沉浸式視窗下固定顯示 YouTube 頂部搜尋列。" },
      {
        key: "showVideoTitleOnHover",
        title: "滑鼠移動時顯示標題",
        desc: "播放器上移動滑鼠時顯示當前影片標題。",
      },
      {
        key: "miniPlayerOnScroll",
        title: "向下捲動時顯示小播放器",
        desc: "捲動超過閾值後，把播放器縮到右下角。",
      },
    ],
  },
  {
    id: "other",
    title: "其他",
    defaultOpen: false,
    defs: [
      {
        key: "pipShortcutEnabled",
        title: "啟用 PiP 快捷鍵 Alt/Option + O",
        desc: "快速切換 Picture-in-Picture。",
      },
      {
        key: "hidePaidPromotionOverlay",
        title: "隱藏訂閱頁 paid promotion 標籤",
        desc: "在 subscriptions 頁隱藏 Includes paid promotion 標示。",
      },
    ],
  },
];
