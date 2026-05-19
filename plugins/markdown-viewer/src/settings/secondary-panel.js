const EMBEDDED_POPUP_URL =
  "plugins/markdown-viewer/src/ui/embedded-popup.html";

export const secondaryAriaLabel = "開啟 Markdown 檢視完整設定面板";

/**
 * @param {HTMLIFrameElement} frame
 */
function applyIframeAutoHeight(frame) {
  const doc = frame.contentDocument;
  if (!doc?.body) return;

  const el = doc.getElementById("popup") || doc.body;

  const natural = Math.ceil(
    Math.max(
      el.scrollHeight,
      el.offsetHeight,
      doc.documentElement.scrollHeight,
      doc.body.scrollHeight,
    ),
  );

  const minH = 96;
  let maxH = 560;
  try {
    maxH = Math.min(560, Math.max(280, Math.round(window.innerHeight * 0.92)));
  } catch {
    /* */
  }

  frame.style.height = `${Math.min(Math.max(natural + 14, minH), maxH)}px`;
}

/**
 * @param {HTMLIFrameElement} frame
 */
function wireIframeResize(frame) {
  frame.addEventListener("load", () => {
    const doc = frame.contentDocument;
    if (!doc?.body) return;

    const schedule = () => {
      requestAnimationFrame(() => applyIframeAutoHeight(frame));
    };

    const ro = new ResizeObserver(schedule);
    ro.observe(doc.body);

    const popupRoot = doc.getElementById("popup");
    if (popupRoot) ro.observe(popupRoot);

    schedule();
    setTimeout(schedule, 50);
    setTimeout(schedule, 120);
    setTimeout(schedule, 320);
    setTimeout(schedule, 520);
    setTimeout(schedule, 900);
  });
}

/**
 * @param {HTMLElement} container
 * @param {*} ctx 由 `secondary-settings-registry.createSecondaryCtx` 提供（備用）
 */
export async function MARKDOWN_SECONDARY_MOUNT(container, ctx) {
  if (container.dataset.mdEmbedded === "1") return;
  container.dataset.mdEmbedded = "1";
  container.innerHTML = "";
  const frame = document.createElement("iframe");
  frame.className = "plugin-card__secondary-frame";
  frame.title = "Markdown Viewer 設定";
  frame.scrolling = "no";
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.src = chrome.runtime.getURL(EMBEDDED_POPUP_URL);
  wireIframeResize(frame);
  container.appendChild(frame);
}
