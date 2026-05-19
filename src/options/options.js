import { PLATFORM_MSG } from "../shared/message-types.js";
import { runtimeSend } from "../shared/runtime-send.js";
import { FULL_SCREEN_TOGGLE_OPTIONS_PANEL } from "../../plugins/full-screen-toggle/src/settings/options-panel.js";
import { MARKDOWN_VIEWER_OPTIONS_PANEL } from "../../plugins/markdown-viewer/src/settings/options-panel.js";

const PANELS = {
  "full-screen-toggle": FULL_SCREEN_TOGGLE_OPTIONS_PANEL,
  "markdown-viewer": MARKDOWN_VIEWER_OPTIONS_PANEL,
};

function qs(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error("missing #" + id);
  return el;
}

async function send(type, payload = {}) {
  return runtimeSend({ type, ...payload });
}

async function loadPluginCatalog() {
  const r = await send(PLATFORM_MSG.LIST_PLUGINS_META);
  return r && r.ok ? r.plugins || [] : [];
}

async function mountPanel(pluginId) {
  const host = qs("panelHost");
  host.innerHTML = "";
  const meta = PANELS[pluginId];
  if (!meta) {
    host.textContent = "此模組尚未提供設定面板。";
    return;
  }
  const shell = document.createElement("div");
  shell.className = "plugin-panel-shell";
  host.appendChild(shell);
  await meta.mount(shell);
}

async function init() {
  const select = qs("pluginSelect");
  select.innerHTML = "";

  let plugins = await loadPluginCatalog();
  if (!plugins.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "（無資料）";
    select.appendChild(opt);
    qs("panelHost").textContent = "無法讀取外掛清單。";
    return;
  }

  const qp = new URLSearchParams(location.search);
  const fromUrl = qp.get("plugin");

  let preferredPanelId = "";
  if (fromUrl && PANELS[fromUrl]) {
    preferredPanelId = fromUrl;
  }

  plugins = plugins.slice().sort((a, b) => (a.label || a.id).localeCompare(b.label || b.id, "zh-Hant"));
  for (const p of plugins) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = (p.enabled ? "" : "[停用] ") + (p.label || p.id);
    select.appendChild(opt);
    if (!preferredPanelId && PANELS[p.id]) preferredPanelId = p.id;
  }

  select.addEventListener("change", async () => {
    const id = select.value;
    await mountPanel(id);
  });

  select.value = preferredPanelId || plugins[0]?.id || "";

  await mountPanel(select.value);
}

init().catch((e) => {
  qs("panelHost").textContent = "載入設定頁錯誤：" + String(e.message || e);
});

