import { COMMAND, DEFAULT_SETTINGS } from "../shared/constants.js";
import { PLATFORM_MSG } from "../../../../src/shared/message-types.js";
import { FULL_SCREEN_TOGGLE_SECTIONS } from "./sections.js";

const SECTION_STORAGE_PREFIX = "pluginFamilyBucket_fst_optionsSection:";
const LEGACY_SECTION_STORAGE_PREFIX = "pluginSuite_fst_optionsSection:";
const PLUGIN_ID = "full-screen-toggle";

function $(id) {
  const n = document.getElementById(id);
  if (!n) throw new Error(`missing #${id}`);
  return n;
}

function readSectionOpen(sectionId, fallbackOpen) {
  try {
    const key = SECTION_STORAGE_PREFIX + sectionId;
    let raw = localStorage.getItem(key);
    if (raw == null) {
      raw = localStorage.getItem(LEGACY_SECTION_STORAGE_PREFIX + sectionId);
      if (raw != null) {
        localStorage.setItem(key, raw);
      }
    }
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch { /* ignore */ }
  return fallbackOpen;
}

function wireSectionPersistence(details) {
  const id = details.dataset.sectionId;
  if (!id) return;
  details.addEventListener("toggle", () => {
    try {
      localStorage.setItem(SECTION_STORAGE_PREFIX + id, details.open ? "1" : "0");
    } catch { /* ignore */ }
  });
}

async function suiteSend(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

async function fetchPluginSettings() {
  const r = await suiteSend(PLATFORM_MSG.GET_FULL_STATE);
  if (!(r && typeof r === "object")) return { ...DEFAULT_SETTINGS };
  const suite = r.suite;
  const blob = suite && suite.plugins && suite.plugins[PLUGIN_ID];
  const settingsRaw = blob && blob.settings;
  if (typeof settingsRaw === "object" && settingsRaw !== null && !Array.isArray(settingsRaw)) {
    return { ...DEFAULT_SETTINGS, ...settingsRaw };
  }
  return { ...DEFAULT_SETTINGS };
}

async function renderShortcutInfo() {
  const text = $("fstShortcutText");
  try {
    const commands = await chrome.commands.getAll();
    const toggle = commands.find((item) => item.name === COMMAND.TOGGLE_IMMERSIVE);
    const shortcut = toggle && toggle.shortcut ? toggle.shortcut.trim() : "";
    text.textContent = shortcut ? `目前快捷鍵：${shortcut}` : "目前尚未設定快捷鍵，請在下方按鈕開啟頁面自行設定。";
  } catch {
    text.textContent = "無法讀取快捷鍵狀態，請手動前往 chrome://extensions/shortcuts 設定。";
  }
}

function renderForm(settings) {
  const host = $("fstSettingsHost");
  host.innerHTML = "";
  for (const section of FULL_SCREEN_TOGGLE_SECTIONS) {
    const details = document.createElement("details");
    details.className = "fst-options-section";
    details.dataset.sectionId = section.id;
    details.open = readSectionOpen(section.id, Boolean(section.defaultOpen));

    const summary = document.createElement("summary");
    summary.className = "fst-options-section__summary";
    summary.textContent = section.title;

    const body = document.createElement("div");
    body.className = "fst-options-section__body";

    const grid = document.createElement("div");
    grid.className = "fst-settings";

    for (const def of section.defs) {
      const row = document.createElement("label");
      row.className = "fst-row";

      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = Boolean(settings[def.key]);
      check.dataset.key = def.key;

      const textWrap = document.createElement("div");
      const title = document.createElement("div");
      title.className = "fst-row-main";
      title.textContent = def.title;
      const desc = document.createElement("div");
      desc.className = "fst-row-sub";
      desc.textContent = def.desc;
      textWrap.appendChild(title);
      textWrap.appendChild(desc);

      row.appendChild(check);
      row.appendChild(textWrap);
      grid.appendChild(row);
    }

    body.appendChild(grid);
    details.appendChild(summary);
    details.appendChild(body);
    host.appendChild(details);
    wireSectionPersistence(details);
  }
}

async function persistCheckboxChange(key, checked, setHint, allDefsTitles) {
  const resp = await suiteSend(PLATFORM_MSG.PATCH_PLUGIN_SETTINGS, {
    pluginId: PLUGIN_ID,
    patch: { [key]: checked },
  });

  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab && tab.id && resp && typeof resp.settings === "object") {
      const { MSG } = await import("../shared/constants.js");
      await chrome.tabs.sendMessage(tab.id, {
        type: MSG.APPLY_LAYOUT,
        settings: resp.settings,
      });
    }
  } catch {
    /* 非 YouTube 頁略過 */
  }

  const titleHit = allDefsTitles.find((d) => d.key === key);
  setHint(`已更新：${titleHit ? titleHit.title : key}`);
}

/** @param {HTMLElement} shell */
export async function mountFullScreenToggleOptions(shell) {
  shell.innerHTML = `
    <div class="fst-wrap-inner">
      <details class="fst-section" id="fstSectionShortcuts" open>
        <summary class="fst-section__summary">快捷鍵設定</summary>
        <div class="fst-section__body fst-section__body--flush">
          <p id="fstShortcutText" class="fst-muted">讀取中…</p>
          <button type="button" id="fstBtnShortcuts" class="fst-btn fst-btn-outline">前往 chrome://extensions/shortcuts</button>
        </div>
      </details>
      <div id="fstSettingsHost" class="fst-settings-host"></div>
      <p id="fstSaveHint" class="fst-muted">讀取中…</p>
    </div>
  `.trim();

  const setHint = (t) => {
    $("fstSaveHint").textContent = t;
  };

  const allDefsTitles = FULL_SCREEN_TOGGLE_SECTIONS.flatMap((s) => s.defs);

  $("fstBtnShortcuts").addEventListener("click", async () => {
    await chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  });

  $("fstSettingsHost").addEventListener("change", async (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== "checkbox") return;
    const key = input.dataset.key;
    if (!key) return;
    await persistCheckboxChange(key, input.checked, setHint, allDefsTitles);
  });

  const root = $("fstSectionShortcuts");
  root.addEventListener("toggle", () => {
    try {
      localStorage.setItem(SECTION_STORAGE_PREFIX + "shortcuts", root.open ? "1" : "0");
    } catch {
      /* ignore */
    }
  });
  root.open = readSectionOpen("shortcuts", true);

  const settings = await fetchPluginSettings();
  renderForm(settings);
  await renderShortcutInfo();
  setHint("設定會立即儲存；區塊展開狀態記住於本機。");
}

export const FULL_SCREEN_TOGGLE_OPTIONS_PANEL = {
  pluginId: PLUGIN_ID,
  label: "YouTube 視窗化滿版",
  mount: mountFullScreenToggleOptions,
};
