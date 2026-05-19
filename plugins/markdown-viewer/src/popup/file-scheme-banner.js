const MARKDOWN_VIEWER_ID = "markdown-viewer";

/**
 * @returns {Promise<boolean>}
 */
export function checkFileSchemeAccess() {
  return new Promise((resolve) => {
    if (/Firefox/i.test(navigator.userAgent)) {
      resolve(true);
      return;
    }
    const check =
      typeof chrome.extension?.isAllowedFileSchemeAccess === "function"
        ? chrome.extension.isAllowedFileSchemeAccess.bind(chrome.extension)
        : typeof chrome.isAllowedFileSchemeAccess === "function"
          ? chrome.isAllowedFileSchemeAccess.bind(chrome)
          : null;
    if (!check) {
      resolve(true);
      return;
    }
    check((allowed) => {
      resolve(Boolean(allowed));
    });
  });
}

/**
 * @param {HTMLElement} container
 * @returns {() => void} refresh — 重新檢查並更新橫幅
 */
export function mountFileSchemeBanner(container) {
  if (container.dataset.mdFileBanner === "1") {
    return container._mdFileBannerRefresh || (() => {});
  }
  container.dataset.mdFileBanner = "1";

  const banner = document.createElement("p");
  banner.className = "plugin-card__file-warn";
  banner.hidden = true;

  const link = document.createElement("a");
  link.href = "#";
  link.textContent = "開啟擴充功能設定";
  link.addEventListener("click", (ev) => {
    ev.preventDefault();
    chrome.tabs.create({
      url: `chrome://extensions/?id=${chrome.runtime.id}`,
    });
  });

  banner.append(
    document.createTextNode(
      "尚未允許讀取本機檔案（file://）。請在擴充功能頁開啟「允許存取檔案網址」。",
    ),
    document.createTextNode(" "),
    link,
  );

  container.insertBefore(banner, container.firstChild);

  async function refresh() {
    const allowed = await checkFileSchemeAccess();
    banner.hidden = allowed;
  }

  container._mdFileBannerRefresh = refresh;
  void refresh();

  return refresh;
}

export { MARKDOWN_VIEWER_ID };
