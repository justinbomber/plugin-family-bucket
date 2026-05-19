import { COMMAND, MSG } from "../shared/constants.js";

/**
 * @typedef {{
 *   isEnabled(): boolean;
 *   getSettings(): Promise<Record<string, unknown>>;
 *   setSettings(patch: Record<string, unknown>): Promise<Record<string, unknown>>;
 * }} FullScreenToggleBridge
 */

/** @type {FullScreenToggleBridge | null} */
let bridge = null;

let chromeListenersInstalled = false;

/** @param {FullScreenToggleBridge} b */
export function configureFullScreenToggleBridge(b) {
  bridge = b;
}

const SESSION_KEY = "ytImmersiveSession";

/** @type {object | null} */
let sessionMem = null;

async function loadSession() {
  const d = await chrome.storage.session.get(SESSION_KEY);
  const s = d[SESSION_KEY];
  sessionMem = s && typeof s === "object" ? s : null;
  return sessionMem;
}

/** @param {object | null} s */
async function saveSession(s) {
  sessionMem = s;
  if (s) await chrome.storage.session.set({ [SESSION_KEY]: s });
  else await chrome.storage.session.remove(SESSION_KEY);
}

async function readSettingsThroughBridge() {
  if (!bridge) throw new Error("full-screen-toggle bridge unset");
  return bridge.getSettings();
}

async function writeSettingsThroughBridge(patch) {
  if (!bridge) throw new Error("full-screen-toggle bridge unset");
  return bridge.setSettings(patch);
}

function isWatchUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("youtube.com")) return false;
    return u.pathname === "/watch" || u.pathname.startsWith("/watch");
  } catch {
    return false;
  }
}

function isAutoSpawnedEmptyTabUrl(url) {
  if (url == null || url === "") return true;
  const s = url.split("#")[0].toLowerCase();
  if (s === "about:blank") return true;
  if (s.startsWith("chrome://new-tab-page")) return true;
  if (s.startsWith("chrome://newtab")) return true;
  if (s.startsWith("edge://newtab")) return true;
  if (s.startsWith("brave://new-tab")) return true;
  return false;
}

async function pruneAutoOpenedNewTabs(sourceWindowId, tabCountBeforeMove) {
  const expected = Math.max(0, tabCountBeforeMove - 1);
  await new Promise((r) => setTimeout(r, 40));
  let tabs;
  try {
    tabs = await chrome.tabs.query({ windowId: sourceWindowId });
  } catch {
    return;
  }
  if (tabs.length <= expected) return;
  let excess = tabs.length - expected;
  const disposable = tabs.filter((t) => isAutoSpawnedEmptyTabUrl(t.pendingUrl || t.url || ""));
  for (const t of disposable) {
    if (excess <= 0) break;
    try {
      await chrome.tabs.remove(t.id);
      excess--;
    } catch {
      /* 可能已被使用者關閉 */
    }
  }
}

async function sendLayoutToTab(tabId) {
  const settings = await readSettingsThroughBridge();
  try {
    await chrome.tabs.sendMessage(tabId, { type: MSG.APPLY_LAYOUT, settings });
  } catch {
    setTimeout(async () => {
      try {
        await chrome.tabs.sendMessage(tabId, { type: MSG.APPLY_LAYOUT, settings });
      } catch {
        /* content 可能尚未注入 */
      }
    }, 600);
  }
}

/**
 * @param {number} tabId
 */
async function enterImmersive(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!isWatchUrl(tab.url ?? "")) {
    throw new Error("僅能在 YouTube 影片頁（watch）使用");
  }

  let sess = await loadSession();
  if (sess && sess.tabId === tabId) {
    if (tab.windowId === sess.immersiveWindowId) {
      const r = await restoreTabInner();
      if (!r?.ok) {
        throw new Error(r?.reason || "還原失敗");
      }
      return;
    }
    await saveSession(null);
    sess = null;
  }

  if (sess && sess.tabId !== tabId) {
    try {
      await restoreTabInner();
    } catch {
      await saveSession(null);
    }
  }

  const sourceWindowId = tab.windowId;
  const sourceTabIndex = tab.index ?? 0;

  let tabCountBeforeMove = 1;
  try {
    const inSource = await chrome.tabs.query({ windowId: sourceWindowId });
    tabCountBeforeMove = inSource.length;
  } catch {
    tabCountBeforeMove = 1;
  }

  let srcWin;
  try {
    srcWin = await chrome.windows.get(sourceWindowId);
  } catch {
    srcWin = null;
  }
  const w = srcWin?.width ?? 1280;
  const h = srcWin?.height ?? 720;

  const win = await chrome.windows.create({
    tabId,
    type: "popup",
    state: "normal",
    focused: true,
    width: Math.min(Math.round(w * 0.92), 1920),
    height: Math.min(Math.round(h * 0.92), 1080),
  });

  if (!win.id) throw new Error("無法建立視窗");

  try {
    await pruneAutoOpenedNewTabs(sourceWindowId, tabCountBeforeMove);
  } catch {
    /* 原視窗可能已關閉 */
  }

  const newSess = {
    sourceWindowId,
    sourceTabIndex,
    tabId,
    immersiveWindowId: win.id,
  };
  await saveSession(newSess);
  await sendLayoutToTab(tabId);
  return newSess;
}

async function restoreTabInner() {
  const sess = sessionMem || (await loadSession());
  if (!sess) return { ok: false, reason: "no_session" };

  const { tabId, sourceWindowId, sourceTabIndex, immersiveWindowId } = sess;

  let srcOk = false;
  try {
    await chrome.windows.get(sourceWindowId);
    srcOk = true;
  } catch {
    srcOk = false;
  }

  if (srcOk) {
    await chrome.tabs.move(tabId, {
      windowId: sourceWindowId,
      index: sourceTabIndex,
    });
    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(sourceWindowId, { focused: true });
  } else {
    const w = await chrome.windows.create({ type: "normal", focused: true });
    if (!w.id) throw new Error("無法建立視窗");
    const initialTabs = await chrome.tabs.query({ windowId: w.id });
    const placeholder = initialTabs[0];
    await chrome.tabs.move(tabId, { windowId: w.id, index: 0 });
    await chrome.tabs.update(tabId, { active: true });
    if (
      placeholder &&
      placeholder.id !== tabId &&
      isAutoSpawnedEmptyTabUrl(placeholder.pendingUrl || placeholder.url || "")
    ) {
      try {
        await chrome.tabs.remove(placeholder.id);
      } catch {
        /* 可能已隨視窗重建而消失 */
      }
    }
  }

  if (immersiveWindowId) {
    try {
      await chrome.windows.remove(immersiveWindowId);
    } catch {
      /* 可能已無分頁而自動關閉 */
    }
  }

  await saveSession(null);
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: MSG.APPLY_LAYOUT,
      settings: await readSettingsThroughBridge(),
      restore: true,
    });
  } catch {
    /* 可忽略 */
  }
  return { ok: true };
}

async function toggleImmersiveForTab(tabId) {
  if (!tabId) return { ok: false, error: "no_tab" };
  const tab = await chrome.tabs.get(tabId);
  if (!isWatchUrl(tab.url ?? "")) {
    return { ok: false, error: "請先開啟 YouTube 影片頁（網址含 /watch）" };
  }

  const sess = await loadSession();
  const inImmersive = !!(sess && sess.tabId === tabId && tab.windowId === sess.immersiveWindowId);

  if (inImmersive) {
    const restored = await restoreTabInner();
    if (!restored?.ok) {
      return { ok: false, error: restored?.reason || "還原失敗" };
    }
    return { ok: true, mode: "restored" };
  }

  await enterImmersive(tabId);
  return { ok: true, mode: "immersive" };
}

/** @returns {boolean} */

export function dispatchYtImmersiveMessage(message, sender, sendResponse) {
  if (!bridge || typeof message?.type !== "string") return false;
  const known = new Set(Object.values(MSG));
  if (!known.has(message.type)) return false;

  if (!bridge.isEnabled()) {
    (async () => {
      switch (message.type) {
        case MSG.GET_SETTINGS:
          sendResponse({ suitePluginDisabled: true });
          break;
        case MSG.GET_STATUS: {
          let tabId = sender.tab?.id ?? message.tabId;
          if (!tabId) {
            const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
            tabId = t?.id;
          }
          if (!tabId) {
            sendResponse({ inImmersive: false, canRestore: false, canEnter: false, onWatch: false });
            break;
          }
          const tab = await chrome.tabs.get(tabId);
          const onWatch = isWatchUrl(tab.url ?? "");
          sendResponse({
            inImmersive: false,
            canRestore: false,
            canEnter: false,
            onWatch,
          });
          break;
        }
        case MSG.SET_SETTINGS:
          sendResponse(null);
          break;
        default:
          sendResponse({ ok: false, error: "plugin_disabled" });
      }
    })();
    return true;
  }

  (async () => {
    switch (message?.type) {
      case MSG.GET_STATUS: {
        let tabId = sender.tab?.id ?? message.tabId;
        if (!tabId) {
          const [t] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          tabId = t?.id;
        }
        if (!tabId) {
          sendResponse({
            inImmersive: false,
            canRestore: false,
            canEnter: false,
            onWatch: false,
          });
          return;
        }
        const tab = await chrome.tabs.get(tabId);
        const onWatch = isWatchUrl(tab.url ?? "");
        const sess = await loadSession();
        const inImmersive = !!(sess && sess.tabId === tabId && tab.windowId === sess.immersiveWindowId);
        sendResponse({
          inImmersive,
          canRestore: inImmersive,
          canEnter: onWatch && !inImmersive,
          onWatch,
        });
        break;
      }
      case MSG.ENTER_IMMERSIVE: {
        const tabId = sender.tab?.id ?? message.tabId;
        if (!tabId) {
          sendResponse({ ok: false, error: "no_tab" });
          return;
        }
        try {
          await enterImmersive(tabId);
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
        break;
      }
      case MSG.TOGGLE_IMMERSIVE: {
        const tabId = sender.tab?.id ?? message.tabId;
        try {
          sendResponse(await toggleImmersiveForTab(tabId));
        } catch (e) {
          sendResponse({
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
        break;
      }
      case MSG.RESTORE_TAB: {
        try {
          const r = await restoreTabInner();
          sendResponse(r);
        } catch (e) {
          sendResponse({
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
        break;
      }
      case MSG.GET_SETTINGS:
        sendResponse(await readSettingsThroughBridge());
        break;
      case MSG.SET_SETTINGS:
        sendResponse(await writeSettingsThroughBridge(message.patch || {}));
        break;
      default:
        sendResponse(null);
    }
  })();

  return true;
}

export function attachYtChromeHooksOnce() {
  if (chromeListenersInstalled) return;
  chromeListenersInstalled = true;

  chrome.windows.onRemoved.addListener(async (windowId) => {
    const sess = await loadSession();
    if (sess && sess.immersiveWindowId === windowId) {
      await saveSession(null);
    }
  });

  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== COMMAND.TOGGLE_IMMERSIVE) return;
    if (!bridge?.isEnabled()) return;
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      const result = await toggleImmersiveForTab(tab?.id);
      if (!result?.ok) {
        console.warn("[yt-immersive] command ignored:", result?.error || "unknown");
      }
    } catch (error) {
      console.error("[yt-immersive] command failed:", error);
    }
  });
}
