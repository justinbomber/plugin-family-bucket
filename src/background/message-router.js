import { PLATFORM_MSG } from "../shared/message-types.js";
import { dispatchYtImmersiveMessage } from "../../plugins/full-screen-toggle/src/background/immersive-runtime.js";

let routingAttached = false;

/**
 * @param {import("./plugin-manager.js").PluginManager} manager
 */
export function attachMessageRouting(manager) {
  if (routingAttached) return;
  routingAttached = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message?.type) {
      case PLATFORM_MSG.LIST_PLUGINS_META: {
        (async () => {
          await manager.init();
          sendResponse({ ok: true, plugins: manager.pluginsMetaPayload() });
        })();
        return true;
      }
      case PLATFORM_MSG.GET_FULL_STATE: {
        (async () => {
          await manager.init();
          sendResponse({ ok: true, suite: manager.suite });
        })();
        return true;
      }
      case PLATFORM_MSG.SET_PLUGIN_ENABLED: {
        const pluginId = message.pluginId;
        const enabled = Boolean(message.enabled);
        (async () => {
          await manager.init();
          await manager.setPluginEnabled(pluginId, enabled);
          sendResponse({ ok: true, suite: manager.suite });
        })();
        return true;
      }
      case PLATFORM_MSG.PATCH_PLUGIN_SETTINGS: {
        const pluginId = message.pluginId;
        const patch = message.patch || {};
        (async () => {
          await manager.init();
          const next = await manager.patchPluginSettings(pluginId, patch);
          sendResponse({ ok: true, settings: next });
        })();
        return true;
      }
      default:
        break;
    }

    if (dispatchYtImmersiveMessage(message, sender, sendResponse)) {
      return true;
    }

    return false;
  });
}
