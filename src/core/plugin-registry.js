import { FullScreenTogglePlugin } from "../../plugins/full-screen-toggle/src/plugin.js";
import { MarkdownViewerPlugin } from "../../plugins/markdown-viewer/src/plugin.js";

/**
 * 目前註冊之 Plugin 實例（新增模組時於此建立並回傳）。
 * @returns {import("./base-plugin.js").BasePlugin[]}
 */
export function createRegisteredPlugins() {
  return [new FullScreenTogglePlugin(), new MarkdownViewerPlugin()];
}
