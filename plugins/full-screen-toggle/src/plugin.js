import { BasePlugin } from "../../../src/core/base-plugin.js";
import {
  attachYtChromeHooksOnce,
  configureFullScreenToggleBridge,
} from "./background/immersive-runtime.js";
import { DEFAULT_SETTINGS } from "./shared/constants.js";

export const FULL_SCREEN_TOGGLE_ID = "full-screen-toggle";

export class FullScreenTogglePlugin extends BasePlugin {
  constructor() {
    super(FULL_SCREEN_TOGGLE_ID, {
      label: "YouTube 視窗化滿版",
      description: "YouTube watch 沉浸式視窗、版面與快捷操作",
    });
  }

  getDefaultSettings() {
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * @param {{ manager: import("../../../src/background/plugin-manager.js").PluginManager }} ctx
   */
  mount(ctx) {
    const { manager } = ctx;
    configureFullScreenToggleBridge({
      isEnabled: () => manager.isPluginEnabled(this.id),
      getSettings: async () => manager.getNormalizedPluginSettings(this.id),
      setSettings: async (patch) => manager.patchPluginSettings(this.id, patch),
    });
    attachYtChromeHooksOnce();
  }
}
