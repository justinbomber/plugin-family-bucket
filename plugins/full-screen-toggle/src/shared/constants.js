/** Message types between SW, popup, and content scripts */
export const MSG = {
  ENTER_IMMERSIVE: "ytImmersive:enter",
  RESTORE_TAB: "ytImmersive:restore",
  TOGGLE_IMMERSIVE: "ytImmersive:toggle",
  GET_STATUS: "ytImmersive:status",
  GET_SETTINGS: "ytImmersive:getSettings",
  SET_SETTINGS: "ytImmersive:setSettings",
  APPLY_LAYOUT: "ytImmersive:applyLayout",
  OPEN_OPTIONS: "ytImmersive:openOptions",
};

export const COMMAND = {
  TOGGLE_IMMERSIVE: "toggle-windowed-fullscreen",
};

export const STORAGE_KEY = "ytImmersiveSettings";

/** Default user settings */
export const DEFAULT_SETTINGS = {
  hideSecondary: true,
  showPlayerButton: true,
  autoToggleOnWatch: false,
  scrollingSupport: true,
  hideScrollbar: false,
  hidePaidPromotionOverlay: false,
  miniPlayerOnScroll: true,
  pipShortcutEnabled: true,
  alwaysShowSearchBar: false,
  showVideoTitleOnHover: true,
};
