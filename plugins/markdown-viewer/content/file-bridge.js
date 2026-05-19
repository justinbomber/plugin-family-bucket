/**
 * 於 file:// 頁面由 manifest content_scripts 載入，通知背景注入 Markdown 檢視器。
 * 需在使用者於 chrome://extensions 開啟「允許存取檔案網址」。
 */
(function () {
  if (window.__mdViewerMounted) return;

  function isRuntimeAlive() {
    try {
      return Boolean(chrome && chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  if (!isRuntimeAlive()) return;

  var payload = {
    message: "md:pageReady",
    url: location.href,
    header: document.contentType || "",
  };

  try {
    var pending = chrome.runtime.sendMessage(payload);
    if (pending && typeof pending.then === "function") {
      pending.catch(function () {
        /* 擴充重新載入後 context 失效 */
      });
    }
  } catch (_) {
    /* 擴充未就緒 */
  }
})();
