import { checkFileSchemeAccess } from "./file-scheme-banner.js";

/**
 * Popup 內「本機檔案 (file://)」權限列：狀態 + 前往 Chrome 擴充功能頁開關。
 * @param {HTMLElement} host
 * @returns {() => void} refresh
 */
export function mountMarkdownFileAccessRow(host) {
  const row = document.createElement("div");
  row.className = "md-file-access";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", "本機檔案存取");

  const head = document.createElement("div");
  head.className = "md-file-access__head";

  const label = document.createElement("span");
  label.className = "md-file-access__label";
  label.textContent = "本機檔案 (file://)";

  const status = document.createElement("span");
  status.className = "md-file-access__status";

  head.append(label, status);

  const hint = document.createElement("p");
  hint.className = "md-file-access__hint";
  hint.textContent =
    "在 Chrome 擴充功能「詳細資料」中開啟「允許存取檔案網址」，才能預覽本機 .md 檔。";

  const actions = document.createElement("div");
  actions.className = "md-file-access__actions";

  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "md-file-access__btn";
  openBtn.textContent = "開啟擴充功能設定";

  const rescanBtn = document.createElement("button");
  rescanBtn.type = "button";
  rescanBtn.className = "md-file-access__btn md-file-access__btn--secondary";
  rescanBtn.textContent = "重新套用目前分頁";

  openBtn.addEventListener("click", () => {
    chrome.tabs.create({
      url: `chrome://extensions/?id=${chrome.runtime.id}`,
    });
  });

  rescanBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ message: "md:rescanTabs" }, () => {
      void chrome.runtime.lastError;
    });
  });

  const permBtn = document.createElement("button");
  permBtn.type = "button";
  permBtn.className = "md-file-access__btn md-file-access__btn--secondary";
  permBtn.textContent = "加入 file:// 網站存取";
  permBtn.addEventListener("click", () => {
    chrome.permissions.request({ origins: ["file:///*"] }, (granted) => {
      void chrome.runtime.lastError;
      void refresh();
      if (granted) {
        chrome.runtime.sendMessage({ message: "md:rescanTabs" }, () => {
          void chrome.runtime.lastError;
        });
      }
    });
  });
  actions.appendChild(permBtn);

  actions.append(openBtn, rescanBtn);
  row.append(head, hint, actions);
  host.appendChild(row);

  async function refresh() {
    const allowed = await checkFileSchemeAccess();
    const hasOrigin = await new Promise((resolve) => {
      if (!chrome.permissions?.contains) {
        resolve(true);
        return;
      }
      chrome.permissions.contains({ origins: ["file:///*"] }, (ok) => {
        resolve(Boolean(ok));
      });
    });
    const ok = allowed && hasOrigin;
    status.textContent = ok ? "已允許" : allowed ? "已開檔案權限，請加入網站存取" : "尚未允許";
    status.classList.toggle("md-file-access__status--ok", ok);
    status.classList.toggle("md-file-access__status--warn", !ok);
    hint.hidden = ok;
    rescanBtn.disabled = !allowed;
    permBtn.hidden = hasOrigin;
  }

  void refresh();
  return refresh;
}
