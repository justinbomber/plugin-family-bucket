import { MSG } from "../../plugins/full-screen-toggle/src/shared/constants.js";
import {
  mountFileSchemeBanner,
  MARKDOWN_VIEWER_ID,
} from "../../plugins/markdown-viewer/src/popup/file-scheme-banner.js";
import { mountMarkdownFileAccessRow } from "../../plugins/markdown-viewer/src/popup/markdown-file-access.js";
import { PLATFORM_MSG } from "../shared/message-types.js";
import { runtimeSend } from "../shared/runtime-send.js";
import { getQuickSettingFields } from "./quick-settings-registry.js";
import {
  createSecondaryCtx,
  getSecondaryEntry,
} from "./secondary-settings-registry.js";

/** @type {Set<() => void>} */
const fileBannerRefreshes = new Set();
/** @type {Set<() => void>} */
const fileAccessRefreshes = new Set();
let fileBannerGlobalWired = false;

function wireFileBannerGlobalListeners() {
  if (fileBannerGlobalWired) return;
  fileBannerGlobalWired = true;
  const runAll = () => {
    for (const fn of fileBannerRefreshes) fn();
    for (const fn of fileAccessRefreshes) fn();
  };
  window.addEventListener("focus", runAll);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") runAll();
  });
}

function qs(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error("missing #" + id);
  return el;
}

async function send(type, payload = {}) {
  return runtimeSend({ type, ...payload });
}

function setHint(text) {
  qs("hint").textContent = text;
}

async function tryApplyLayoutToActiveTab(settings) {
  if (!settings || typeof settings !== "object") return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: MSG.APPLY_LAYOUT, settings });
  } catch {
    /* skip */
  }
}

async function readPluginSettings(pluginId) {
  const r = await send(PLATFORM_MSG.GET_FULL_STATE);
  if (!r || !r.ok || !r.suite || !r.suite.plugins || !r.suite.plugins[pluginId]) return null;
  const s = r.suite.plugins[pluginId].settings;
  if (typeof s !== "object" || s === null || Array.isArray(s)) return null;
  return s;
}

function updateSecondaryOpenClass() {
  const anyOpen = document.querySelector(
    ".plugin-card__secondary-panel:not([hidden])"
  );
  const on = Boolean(anyOpen);
  document.body.classList.toggle("popup--secondary-open", on);
  document.documentElement.classList.toggle("popup--secondary-open", on);
}

function createSecondarySection(pluginId, getMasterChecked) {
  const entry = getSecondaryEntry(pluginId);
  if (!entry) {
    return {
      host: null,
      initGetter() {},
      setEnabled() {},
      syncMasterGetter() {},
      onDetailsClose() {},
    };
  }

  const host = document.createElement("div");
  host.className = "plugin-card__secondary-root";

  const row = document.createElement("div");
  row.className = "plugin-card__secondary-controls";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "plugin-card__secondary-trigger";
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-label", entry.ariaLabel || `${pluginId} 二級設定`);
  btn.innerHTML =
    '<span class="plugin-card__secondary-trigger-icon" aria-hidden="true">⚙</span><span class="plugin-card__secondary-trigger-text">細部設定</span>';

  const panel = document.createElement("div");
  panel.className = "plugin-card__secondary-panel";
  panel.hidden = true;

  /** @type {ReturnType<typeof createSecondaryCtx>} */
  const sctx = createSecondaryCtx(pluginId);
  /** @type {boolean} */
  let mounted = false;

  btn.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    if (!getMasterChecked()) return;
    const open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open) {
      updateSecondaryOpenClass();
      return;
    }
    if (!mounted && entry.mountSecondary) {
      mounted = true;
      await Promise.resolve(entry.mountSecondary(panel, sctx));
    }
    updateSecondaryOpenClass();
  });

  row.appendChild(btn);
  host.appendChild(row);
  host.appendChild(panel);

  return {
    host,
    setEnabled(enabled) {
      btn.disabled = !enabled;
      sctx.setMasterGetter(() => getMasterChecked());
      if (!enabled) {
        panel.hidden = true;
        btn.setAttribute("aria-expanded", "false");
        updateSecondaryOpenClass();
      }
    },
    syncMasterGetter() {
      sctx.setMasterGetter(() => getMasterChecked());
    },
    onDetailsClose() {
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      updateSecondaryOpenClass();
    },
    initGetter() {
      sctx.setMasterGetter(() => getMasterChecked());
    },
  };
}

function createQuickSection(pluginId) {
  const body = document.createElement("div");
  body.className = "plugin-card__body";

  const qt = document.createElement("div");
  qt.className = "quick-title";
  qt.textContent = "初步設定";
  body.appendChild(qt);

  const disabledHint = document.createElement("p");
  disabledHint.className = "quick-hint";
  disabledHint.hidden = true;
  disabledHint.textContent = "請先開啟上方總開關後，才能調整這裡的項目。";
  body.appendChild(disabledHint);

  const fields = getQuickSettingFields(pluginId);
  const inputs = [];

  if (!fields || fields.length === 0) {
    const empty = document.createElement("p");
    empty.className = "quick-empty";
    empty.textContent = "此模組暫無 Popup 快速設定，請使用「進階設定」。";
    body.appendChild(empty);
    return {
      body,
      setEnabled() {},
      hydrate: async () => {},
    };
  }

  for (const f of fields) {
    const row = document.createElement("label");
    row.className = "quick-row";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.key = f.key;

    const span = document.createElement("span");
    span.textContent = f.label;

    row.appendChild(input);
    row.appendChild(span);
    body.appendChild(row);
    inputs.push(input);
  }

  function setEnabled(enabled) {
    disabledHint.hidden = enabled;
    for (const input of inputs) {
      input.disabled = !enabled;
      const row = input.closest("label.quick-row");
      if (row instanceof HTMLLabelElement) {
        if (!enabled) row.setAttribute("disabled", "true");
        else row.removeAttribute("disabled");
      }
    }
  }

  async function hydrate() {
    const st = await readPluginSettings(pluginId);
    if (!st) return;
    for (const input of inputs) {
      const key = input.dataset.key;
      if (!key) continue;
      if (!Object.prototype.hasOwnProperty.call(st, key)) continue;
      input.checked = Boolean(st[key]);
    }
  }

  function wireSave() {
    for (const input of inputs) {
      input.addEventListener("change", async () => {
        const key = input.dataset.key;
        if (!key) return;
        try {
          const resp = await send(PLATFORM_MSG.PATCH_PLUGIN_SETTINGS, {
            pluginId,
            patch: { [key]: input.checked },
          });
          if (resp && resp.ok && resp.settings) {
            await tryApplyLayoutToActiveTab(resp.settings);
          }
        } catch {
          input.checked = !input.checked;
          setHint("無法更新設定，請重試。");
        }
      });
    }
  }

  wireSave();

  return { body, setEnabled, hydrate };
}

function renderPlugins(plugins) {
  wireFileBannerGlobalListeners();
  fileBannerRefreshes.clear();
  fileAccessRefreshes.clear();

  const ul = qs("toggleList");
  ul.innerHTML = "";
  if (!plugins.length) {
    setHint("尚未註冊子外掛。");
    return;
  }
  setHint(
    "點列左側箭頭展開區塊；部分模組可按「⚙ 細部設定」開第二層；總開關停用後相關網頁會停止套用。"
  );

  for (const p of plugins) {
    const li = document.createElement("li");

    const details = document.createElement("details");
    details.className = "plugin-card";

    const summary = document.createElement("summary");
    summary.className = "plugin-card__summary";

    const caret = document.createElement("span");
    caret.className = "plugin-card__caret";
    caret.setAttribute("aria-hidden", "true");

    const textWrap = document.createElement("div");
    textWrap.className = "plugin-card__text";
    const title = document.createElement("div");
    title.className = "plugin-card__title";
    title.textContent = p.label || p.id;
    const desc = document.createElement("div");
    desc.className = "plugin-card__desc";
    desc.textContent = p.description || "";

    textWrap.appendChild(title);
    textWrap.appendChild(desc);

    const masterLabel = document.createElement("label");
    masterLabel.className = "switch plugin-card__master";
    masterLabel.addEventListener("click", (ev) => ev.stopPropagation());

    const masterInp = document.createElement("input");
    masterInp.type = "checkbox";
    masterInp.checked = Boolean(p.enabled);
    masterInp.dataset.pluginId = p.id;
    const masterSlider = document.createElement("span");
    masterSlider.className = "slider";
    masterLabel.appendChild(masterInp);
    masterLabel.appendChild(masterSlider);

    summary.appendChild(caret);
    summary.appendChild(textWrap);
    summary.appendChild(masterLabel);

    const quick = createQuickSection(p.id);
    quick.setEnabled(Boolean(p.enabled));

    let fileBannerRefresh = null;
    let fileAccessRefresh = null;
    if (p.id === MARKDOWN_VIEWER_ID) {
      fileAccessRefresh = mountMarkdownFileAccessRow(quick.body);
      fileAccessRefreshes.add(fileAccessRefresh);
      fileBannerRefresh = mountFileSchemeBanner(quick.body);
      fileBannerRefreshes.add(fileBannerRefresh);
    }

    const secondary = createSecondarySection(p.id, () => masterInp.checked);
    secondary.initGetter();

    masterInp.addEventListener("change", async () => {
      const id = masterInp.dataset.pluginId;
      if (!id) return;
      try {
        await send(PLATFORM_MSG.SET_PLUGIN_ENABLED, {
          pluginId: id,
          enabled: masterInp.checked,
        });
        quick.setEnabled(masterInp.checked);
        secondary.syncMasterGetter();
        secondary.setEnabled(masterInp.checked);
      } catch {
        masterInp.checked = !masterInp.checked;
        setHint("無法更新開關，請重試。");
      }
    });

    details.addEventListener("toggle", () => {
      if (details.open) {
        void quick.hydrate();
        if (fileAccessRefresh) void fileAccessRefresh();
        if (fileBannerRefresh) void fileBannerRefresh();
      } else {
        secondary.onDetailsClose();
      }
    });

    details.appendChild(summary);
    details.appendChild(quick.body);
    if (secondary.host instanceof HTMLElement) {
      quick.body.appendChild(secondary.host);
    }
    secondary.setEnabled(Boolean(p.enabled));

    li.appendChild(details);
    ul.appendChild(li);
  }
}

async function refresh() {
  try {
    const r = await send(PLATFORM_MSG.LIST_PLUGINS_META);
    if (r && r.ok && Array.isArray(r.plugins)) {
      renderPlugins(r.plugins);
    } else {
      setHint("無法載入插件清單。");
    }
  } catch (e) {
    setHint(String((e && e.message) || e));
  }
}

qs("btnOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

refresh();
