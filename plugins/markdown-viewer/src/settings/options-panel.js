const OPTIONS_PAGE = "plugins/markdown-viewer/options/index.html";

/**
 * @param {HTMLElement} shell
 */
export async function mountMarkdownViewerOptions(shell) {
  shell.innerHTML = "";
  const frame = document.createElement("iframe");
  frame.className = "suite-mv-options-frame";
  frame.title = "Markdown Viewer 進階設定";
  frame.src = chrome.runtime.getURL(OPTIONS_PAGE) + "?embed=1";
  shell.appendChild(frame);
}

export const MARKDOWN_VIEWER_OPTIONS_PANEL = {
  pluginId: "markdown-viewer",
  label: "Markdown 檢視（Origins / 自訂）",
  mount: mountMarkdownViewerOptions,
};
