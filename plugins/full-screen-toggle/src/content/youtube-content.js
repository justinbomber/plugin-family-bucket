(() => {
  const FALLBACK_MSG = {
    ENTER_IMMERSIVE: "ytImmersive:enter",
    TOGGLE_IMMERSIVE: "ytImmersive:toggle",
    GET_STATUS: "ytImmersive:status",
    GET_SETTINGS: "ytImmersive:getSettings",
    SET_SETTINGS: "ytImmersive:setSettings",
    APPLY_LAYOUT: "ytImmersive:applyLayout",
  };

  const FALLBACK_SUITE = {
    PLUGIN_RUNTIME: "suite:pluginRuntime",
  };

  /** @type {typeof FALLBACK_SUITE} */
  let SUITE_PLATFORM = FALLBACK_SUITE;

  const DEFAULT_SETTINGS = {
    hideSecondary: true,
    showPlayerButton: true,
    autoToggleOnWatch: false,
    scrollingSupport: true,
    hideScrollbar: false,
    hidePaidPromotionOverlay: false,
    miniPlayerOnScroll: true,
    pipShortcutEnabled: true,
    alwaysShowSearchBar: false,
    showVideoTitleOnHover: true,
  };

  const BTN_CLASS = "yt-immersive-ext-btn";
  const SCROLL_BTN_CLASS = "yt-immersive-scroll-btn";
  const BACK_TO_TOP_FAB_CLASS = "yt-immersive-back-to-top-fab";
  const MINI_PLAYER_POS_KEY = "ytImmersive:miniPlayerPosition";
  const MINI_PLAYER_SKIP_DRAG_SELECTORS =
    ".ytp-chrome-bottom,.ytp-chrome-controls,.ytp-chrome-top,.ytp-progress-bar-container,.ytp-button,.ytp-panel,.ytp-popup,.ytp-settings-menu";
  /** @type {typeof FALLBACK_MSG} */
  let MSG = FALLBACK_MSG;
  /** 全家總開關：false 時不注入 UI、不切沉浸式版面 */
  let suiteYtPluginEnabled = true;
  let immersiveActive = false;
  let autoToggleInFlight = false;
  let titleHideTimer = 0;
  /** @type {HTMLDivElement | null} */
  let titleOverlay = null;
  let lastSettings = { ...DEFAULT_SETTINGS };
  /** @type {{left:number, top:number} | null} */
  let miniPlayerPosition = null;
  /** @type {HTMLElement | null} */
  let miniPlayerDragEl = null;
  /** @type {((e: PointerEvent) => void) | null} */
  let miniPlayerDragDownHandler = null;
  /** @type {((e: PointerEvent) => void) | null} */
  let miniPlayerDragMoveHandler = null;
  /** @type {((e: PointerEvent) => void) | null} */
  let miniPlayerDragUpHandler = null;

  /** @type {HTMLElement | null} */
  let scrollWheelBridgeEl = null;
  /** @type {((e: WheelEvent) => void) | null} */
  let scrollWheelBridgeHandler = null;

  /** 捲動觸發 mini-player 時用 FLIP 動畫（避免與上次動畫並行） */
  let miniPlayerFlipGen = 0;
  /** @type {HTMLElement | null} */
  let miniPlayerFlipEl = null;
  /** @type {((e: TransitionEvent) => void) | null} */
  let miniPlayerFlipTransitionEnd = null;
  /** 上次套用 mini-player 狀態（僅依 scroll 閾值），用於偵測跨過門檻時播放進／出動畫 */
  let lastMiniPlayerScrollState = false;

  const MINI_PLAYER_FLIP_MS = 300;

  function cleanupMiniPlayerFlipInline(mp) {
    if (!(mp instanceof HTMLElement)) return;
    mp.style.removeProperty("transition");
    mp.style.removeProperty("transform");
  }

  function cancelMiniPlayerFlipAnimation() {
    miniPlayerFlipGen++;
    if (miniPlayerFlipEl && miniPlayerFlipTransitionEnd) {
      miniPlayerFlipEl.removeEventListener("transitionend", miniPlayerFlipTransitionEnd);
    }
    if (miniPlayerFlipEl instanceof HTMLElement) {
      cleanupMiniPlayerFlipInline(miniPlayerFlipEl);
    }
    miniPlayerFlipEl = null;
    miniPlayerFlipTransitionEnd = null;
  }

  /**
   * @param {HTMLElement} mp
   * @param {() => void} applyDomChange 同步變更會影響 #movie_player 版位的 class／style
   * @param {() => void} [onDone]
   */
  function runMoviePlayerFlip(mp, applyDomChange, onDone) {
    cancelMiniPlayerFlipAnimation();
    const myGen = miniPlayerFlipGen;
    const first = mp.getBoundingClientRect();
    applyDomChange();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (myGen !== miniPlayerFlipGen) return;
        const last = mp.getBoundingClientRect();
        const dx = first.left - last.left;
        const dy = first.top - last.top;
        const sx = first.width / Math.max(1, last.width);
        const sy = first.height / Math.max(1, last.height);

        let settled = false;
        /** @type {ReturnType<typeof setTimeout> | undefined} */
        let fallbackTimer;
        /** @type {((e: TransitionEvent) => void) | null} */
        let transitionListener = null;

        const finalizeFlip = () => {
          if (myGen !== miniPlayerFlipGen || settled) return;
          settled = true;
          if (fallbackTimer !== undefined) clearTimeout(fallbackTimer);
          if (transitionListener) mp.removeEventListener("transitionend", transitionListener);
          cleanupMiniPlayerFlipInline(mp);
          miniPlayerFlipEl = null;
          miniPlayerFlipTransitionEnd = null;
          onDone?.();
        };

        const noopSkip =
          Math.abs(dx) < 0.5 &&
          Math.abs(dy) < 0.5 &&
          Math.abs(sx - 1) < 0.002 &&
          Math.abs(sy - 1) < 0.002;
        if (noopSkip) {
          finalizeFlip();
          return;
        }

        transitionListener = (e) => {
          if (e.propertyName !== "transform") return;
          finalizeFlip();
        };

        miniPlayerFlipEl = mp;
        miniPlayerFlipTransitionEnd = transitionListener;
        mp.addEventListener("transitionend", transitionListener);
        fallbackTimer = setTimeout(() => finalizeFlip(), MINI_PLAYER_FLIP_MS + 120);

        mp.style.setProperty("transition", "none", "important");
        mp.style.setProperty("transform", `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, "important");
        void mp.offsetWidth;
        if (myGen !== miniPlayerFlipGen) return;
        mp.style.setProperty(
          "transition",
          `transform ${MINI_PLAYER_FLIP_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
          "important"
        );
        mp.style.setProperty("transform", "translate(0px, 0px) scale(1)", "important");
      });
    });
  }

  function enterMiniPlayerWithFlip() {
    const mp = document.querySelector("#movie_player");
    if (!(mp instanceof HTMLElement)) {
      document.documentElement.classList.add("yt-immersive-mini-player");
      applyMiniPlayerPosition();
      ensureMiniPlayerDrag();
      ensureBackToTopFab();
      return;
    }
    runMoviePlayerFlip(
      mp,
      () => {
        document.documentElement.classList.add("yt-immersive-mini-player");
        if (miniPlayerPosition) {
          miniPlayerPosition = clampMiniPlayerPosition(miniPlayerPosition.left, miniPlayerPosition.top, mp);
        }
        applyMiniPlayerPosition();
      },
      () => {
        ensureMiniPlayerDrag();
        ensureBackToTopFab();
      }
    );
  }

  function exitMiniPlayerWithFlip() {
    teardownMiniPlayerDrag();
    const mp = document.querySelector("#movie_player");
    if (!(mp instanceof HTMLElement)) {
      document.documentElement.classList.remove("yt-immersive-mini-player");
      clearMiniPlayerPositionStyle();
      ensureBackToTopFab();
      syncImmersiveViewport();
      return;
    }
    runMoviePlayerFlip(
      mp,
      () => {
        document.documentElement.classList.remove("yt-immersive-mini-player");
        clearMiniPlayerPositionStyle();
      },
      () => {
        ensureBackToTopFab();
        syncImmersiveViewport();
      }
    );
  }
  /** 捲過這些區塊時不轉發捲軸（讓播放器自己處理音量／進度／選單等） */
  const SCROLL_WHEEL_SKIP_SELECTORS =
    ".ytp-chrome-bottom,.ytp-chrome-controls,.ytp-chrome-top,.ytp-progress-bar-container,.ytp-settings-menu,.ytp-panel,.ytp-popup,.ytp-contextmenu,.ytp-caption-window-container";

  function teardownScrollWheelBridge() {
    if (scrollWheelBridgeEl && scrollWheelBridgeHandler) {
      scrollWheelBridgeEl.removeEventListener("wheel", scrollWheelBridgeHandler, { passive: false });
    }
    scrollWheelBridgeEl = null;
    scrollWheelBridgeHandler = null;
  }

  function ensureScrollWheelBridge() {
    teardownScrollWheelBridge();
    if (!immersiveActive || !isWatchPage() || !lastSettings.scrollingSupport) return;
    const mp = document.querySelector("#movie_player");
    if (!(mp instanceof HTMLElement)) return;

    scrollWheelBridgeHandler = (e) => {
      if (!immersiveActive || !lastSettings.scrollingSupport) return;
      if (document.documentElement.classList.contains("yt-immersive-mini-player")) return;
      const tgt = e.target instanceof Element ? e.target : null;
      if (tgt && tgt.closest(SCROLL_WHEEL_SKIP_SELECTORS)) return;
      window.scrollBy({ top: e.deltaY, left: 0, behavior: "auto" });
      e.preventDefault();
    };

    mp.addEventListener("wheel", scrollWheelBridgeHandler, { passive: false });
    scrollWheelBridgeEl = mp;
  }

  function loadMiniPlayerPosition() {
    try {
      const raw = localStorage.getItem(MINI_PLAYER_POS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === "object" &&
        Number.isFinite(parsed.left) &&
        Number.isFinite(parsed.top)
      ) {
        miniPlayerPosition = { left: parsed.left, top: parsed.top };
      }
    } catch {
      miniPlayerPosition = null;
    }
  }

  function persistMiniPlayerPosition() {
    if (!miniPlayerPosition) return;
    try {
      localStorage.setItem(MINI_PLAYER_POS_KEY, JSON.stringify(miniPlayerPosition));
    } catch {
      /* quota / private mode */
    }
  }

  function clearMiniPlayerPositionStyle() {
    document.documentElement.classList.remove("yt-immersive-mini-player-custom-pos");
    document.documentElement.style.removeProperty("--yt-immersive-mini-left");
    document.documentElement.style.removeProperty("--yt-immersive-mini-top");
    document.documentElement.style.removeProperty("--yt-immersive-mini-right");
    document.documentElement.style.removeProperty("--yt-immersive-mini-bottom");
  }

  function applyMiniPlayerPosition() {
    const activeMini = document.documentElement.classList.contains("yt-immersive-mini-player");
    if (!immersiveActive || !activeMini || !miniPlayerPosition) {
      clearMiniPlayerPositionStyle();
      return;
    }
    document.documentElement.classList.add("yt-immersive-mini-player-custom-pos");
    document.documentElement.style.setProperty("--yt-immersive-mini-left", `${miniPlayerPosition.left}px`);
    document.documentElement.style.setProperty("--yt-immersive-mini-top", `${miniPlayerPosition.top}px`);
    document.documentElement.style.setProperty("--yt-immersive-mini-right", "auto");
    document.documentElement.style.setProperty("--yt-immersive-mini-bottom", "auto");
  }

  function clampMiniPlayerPosition(left, top, mp) {
    const rect = mp.getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    const maxTop = Math.max(0, window.innerHeight - rect.height);
    return {
      left: Math.min(Math.max(0, left), maxLeft),
      top: Math.min(Math.max(0, top), maxTop),
    };
  }

  function teardownMiniPlayerDrag() {
    if (miniPlayerDragEl && miniPlayerDragDownHandler) {
      miniPlayerDragEl.removeEventListener("pointerdown", miniPlayerDragDownHandler, true);
    }
    if (miniPlayerDragMoveHandler) {
      window.removeEventListener("pointermove", miniPlayerDragMoveHandler);
    }
    if (miniPlayerDragUpHandler) {
      window.removeEventListener("pointerup", miniPlayerDragUpHandler);
      window.removeEventListener("pointercancel", miniPlayerDragUpHandler);
    }
    miniPlayerDragEl = null;
    miniPlayerDragDownHandler = null;
    miniPlayerDragMoveHandler = null;
    miniPlayerDragUpHandler = null;
  }

  function ensureMiniPlayerDrag() {
    teardownMiniPlayerDrag();
    if (!immersiveActive || !document.documentElement.classList.contains("yt-immersive-mini-player")) return;

    const mp = document.querySelector("#movie_player");
    if (!(mp instanceof HTMLElement)) return;

    miniPlayerDragDownHandler = (e) => {
      if (e.button !== 0) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target && target.closest(MINI_PLAYER_SKIP_DRAG_SELECTORS)) return;
      e.preventDefault();
      const rect = mp.getBoundingClientRect();
      const startOffsetX = e.clientX - rect.left;
      const startOffsetY = e.clientY - rect.top;
      const pointerId = e.pointerId;

      try {
        mp.setPointerCapture(pointerId);
      } catch {
        /* ignore */
      }

      miniPlayerDragMoveHandler = (moveEvt) => {
        if (moveEvt.pointerId !== pointerId) return;
        const next = clampMiniPlayerPosition(
          moveEvt.clientX - startOffsetX,
          moveEvt.clientY - startOffsetY,
          mp
        );
        miniPlayerPosition = next;
        applyMiniPlayerPosition();
        moveEvt.preventDefault();
      };

      miniPlayerDragUpHandler = (upEvt) => {
        if (upEvt.pointerId !== pointerId) return;
        if (miniPlayerDragMoveHandler) window.removeEventListener("pointermove", miniPlayerDragMoveHandler);
        if (miniPlayerDragUpHandler) {
          window.removeEventListener("pointerup", miniPlayerDragUpHandler);
          window.removeEventListener("pointercancel", miniPlayerDragUpHandler);
        }
        miniPlayerDragMoveHandler = null;
        miniPlayerDragUpHandler = null;
        try {
          mp.releasePointerCapture(pointerId);
        } catch {
          /* ignore */
        }
        persistMiniPlayerPosition();
      };

      window.addEventListener("pointermove", miniPlayerDragMoveHandler, { passive: false });
      window.addEventListener("pointerup", miniPlayerDragUpHandler);
      window.addEventListener("pointercancel", miniPlayerDragUpHandler);
    };

    mp.addEventListener("pointerdown", miniPlayerDragDownHandler, true);
    miniPlayerDragEl = mp;
  }

  function isWatchPage() {
    return /youtube\.com\/watch/i.test(location.href);
  }

  function isSubscriptionsPage() {
    return /youtube\.com\/feed\/subscriptions/i.test(location.href);
  }

  /** 擴充重新載入或更新後，舊 content script 的 runtime 會失效，需避免呼叫 Messaging API 以免 uncaught rejection。 */
  function isExtensionRuntimeAlive() {
    try {
      return Boolean(chrome?.runtime?.id);
    } catch {
      return false;
    }
  }

  /**
   * MV3 下 sendMessage 可能回 Promise；混用 callback 時未處理的 Promise 會在被拒絕時變成
   * Uncaught Error: Extension context invalidated.
   */
  function send(type, payload = {}) {
    try {
      if (!isExtensionRuntimeAlive()) return Promise.resolve(null);
      const pending = chrome.runtime.sendMessage({ type, ...payload });
      if (pending && typeof pending.then === "function") {
        return pending.then((res) => res).catch(() => null);
      }
      return new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ type, ...payload }, (res) => {
            let failed = false;
            try {
              failed = Boolean(chrome.runtime.lastError);
            } catch {
              failed = true;
            }
            resolve(failed ? null : res);
          });
        } catch {
          resolve(null);
        }
      });
    } catch {
      /* invalidated */
    }
    return Promise.resolve(null);
  }

  function requestSettings(cb) {
    send(MSG.GET_SETTINGS)
      .then((r) => {
        if (r && typeof r === "object" && r.suitePluginDisabled) {
          suiteYtPluginEnabled = false;
          applyLayout({ settings: lastSettings, restore: true });
          cb(lastSettings);
          return;
        }
        suiteYtPluginEnabled = true;
        if (r && typeof r === "object") {
          lastSettings = { ...lastSettings, ...r };
        }
        cb(lastSettings);
      })
      .catch(() => {
        cb(lastSettings);
      });
  }

  async function toggleScrollingMode() {
    const next = await send(MSG.SET_SETTINGS, {
      patch: { scrollingSupport: !lastSettings.scrollingSupport },
    });
    if (!next || typeof next !== "object") return;
    applyLayout({ settings: next });
  }

  function removeInjectedButton() {
    document
      .querySelectorAll(`.${BTN_CLASS}, .${SCROLL_BTN_CLASS}`)
      .forEach((el) => el.remove());
  }

  /**
   * 取得播放器右側控制列；支援 ytd-player 內的 Shadow DOM。
   * @returns {HTMLElement | null}
   */
  function getPlayerRightControls() {
    const direct = document.querySelector(".ytp-right-controls");
    if (direct) return direct;

    const inMovie = document.querySelector("#movie_player .ytp-right-controls");
    if (inMovie) return inMovie;

    function findInShadowRoots(root, selector) {
      if (!root || !root.querySelector) return null;
      try {
        const hit = root.querySelector(selector);
        if (hit) return hit;
        const nodes = root.querySelectorAll("*");
        for (let i = 0; i < nodes.length; i++) {
          const el = nodes[i];
          if (el.shadowRoot) {
            const inner = findInShadowRoots(el.shadowRoot, selector);
            if (inner) return inner;
          }
        }
      } catch {
        /* 跨網域 shadow 等 */
      }
      return null;
    }

    const ytd = document.querySelector("ytd-player");
    if (ytd?.shadowRoot) {
      const inYtd = findInShadowRoots(ytd.shadowRoot, ".ytp-right-controls");
      if (inYtd) return inYtd;
    }
    return findInShadowRoots(document.body, ".ytp-right-controls");
  }

  function updateScrollButtonState() {
    const button = document.querySelector(`.${SCROLL_BTN_CLASS}`);
    if (!button) return;
    if (lastSettings.scrollingSupport) {
      button.title = "關閉可捲動模式";
      button.setAttribute("aria-label", "關閉可捲動模式");
      button.classList.add("yt-immersive-scroll-btn-active");
    } else {
      button.title = "開啟可捲動模式";
      button.setAttribute("aria-label", "開啟可捲動模式");
      button.classList.remove("yt-immersive-scroll-btn-active");
    }
  }

  function injectPlayerButton() {
    if (!suiteYtPluginEnabled) {
      removeInjectedButton();
      return;
    }
    if (!isWatchPage() || !lastSettings.showPlayerButton) {
      removeInjectedButton();
      return;
    }

    const right = getPlayerRightControls();
    if (!right) return;

    document.querySelectorAll(`.${BTN_CLASS}, .${SCROLL_BTN_CLASS}`).forEach((el) => {
      if (!right.contains(el)) el.remove();
    });

    const fs = right.querySelector(".ytp-fullscreen-button");
    const parent = fs?.parentNode;

    /** @type {HTMLButtonElement | null} */
    let immersiveBtn = /** @type {HTMLButtonElement | null} */ (right.querySelector(`.${BTN_CLASS}`));

    if (!immersiveBtn) {
      immersiveBtn = document.createElement("button");
      immersiveBtn.type = "button";
      immersiveBtn.className = `ytp-button ${BTN_CLASS}`;
      immersiveBtn.innerHTML =
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff" aria-hidden="true"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h6v2H8v2h8v-2h-1v-2h6c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12zM7 8h2v6H7V8zm4-2h2v8h-2V6zm4 3h2v5h-2V9z"/></svg>';
      immersiveBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        send(MSG.TOGGLE_IMMERSIVE);
      });
      let placed = false;
      if (parent && fs && parent.contains(fs)) {
        try {
          parent.insertBefore(immersiveBtn, fs ?? null);
          placed = true;
        } catch {
          /* ignore */
        }
      }
      if (!placed) right.appendChild(immersiveBtn);
    }

    /** @type {HTMLButtonElement | null} */
    let scrollBtn = /** @type {HTMLButtonElement | null} */ (right.querySelector(`.${SCROLL_BTN_CLASS}`));
    const anchorBeforeImm = immersiveBtn;

    if (!scrollBtn) {
      scrollBtn = document.createElement("button");
      scrollBtn.type = "button";
      scrollBtn.className = `ytp-button ${SCROLL_BTN_CLASS}`;
      scrollBtn.innerHTML =
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff" aria-hidden="true"><path d="M7 4h2v2H7V4zm0 4h2v2H7V8zm0 4h2v2H7v-2zm0 4h2v2H7v-2zm4-10h10v2H11V6zm0 4h10v2H11v-2zm0 4h10v2H11v-2zm0 4h10v2H11v-2z"/></svg>';
      scrollBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggleScrollingMode();
      });
      let placedT = false;
      if (parent && anchorBeforeImm && parent.contains(anchorBeforeImm)) {
        try {
          parent.insertBefore(scrollBtn, anchorBeforeImm);
          placedT = true;
        } catch {
          /* ignore */
        }
      }
      if (!placedT && parent && fs && parent.contains(fs)) {
        try {
          parent.insertBefore(scrollBtn, fs);
          placedT = true;
        } catch {
          /* ignore */
        }
      }
      if (!placedT && immersiveBtn.parentNode === right) {
        try {
          right.insertBefore(scrollBtn, immersiveBtn);
          placedT = true;
        } catch {
          /* ignore */
        }
      }
      if (!placedT) right.appendChild(scrollBtn);
    }

    updateInjectedButtonState();
    updateScrollButtonState();
  }

  function updateInjectedButtonState() {
    const button = document.querySelector(`.${BTN_CLASS}`);
    if (!button) return;
    if (immersiveActive) {
      button.title = "還原為一般分頁";
      button.setAttribute("aria-label", "還原為一般分頁");
      button.classList.add("yt-immersive-ext-btn-active");
      return;
    }
    button.title = "視窗化滿版";
    button.setAttribute("aria-label", "進入視窗化滿版");
    button.classList.remove("yt-immersive-ext-btn-active");
  }

  function refreshButtonState() {
    if (!isWatchPage() || !lastSettings.showPlayerButton) {
      removeInjectedButton();
      return;
    }
    injectPlayerButton();
    updateInjectedButtonState();
    updateScrollButtonState();
  }

  function getVideoTitle() {
    const nodes = [
      "ytd-watch-metadata h1 yt-formatted-string",
      "ytd-video-primary-info-renderer h1 yt-formatted-string",
      "h1.title yt-formatted-string",
    ];
    for (const sel of nodes) {
      const text = document.querySelector(sel)?.textContent?.trim();
      if (text) return text;
    }
    return document.title.replace(/\s*-\s*YouTube\s*$/i, "").trim();
  }

  function ensureTitleOverlay() {
    if (!isWatchPage() || !immersiveActive || !lastSettings.showVideoTitleOnHover) {
      if (titleOverlay) titleOverlay.classList.remove("yt-immersive-visible");
      return;
    }
    const moviePlayer = document.querySelector("#movie_player");
    if (!moviePlayer) return;
    if (!titleOverlay || !moviePlayer.contains(titleOverlay)) {
      titleOverlay = document.createElement("div");
      titleOverlay.className = "yt-immersive-title-overlay";
      moviePlayer.appendChild(titleOverlay);
      moviePlayer.addEventListener("mousemove", () => {
        if (!lastSettings.showVideoTitleOnHover || !immersiveActive) return;
        titleOverlay.textContent = getVideoTitle();
        titleOverlay.classList.add("yt-immersive-visible");
        clearTimeout(titleHideTimer);
        titleHideTimer = window.setTimeout(() => {
          titleOverlay?.classList.remove("yt-immersive-visible");
        }, 1200);
      });
      moviePlayer.addEventListener("mouseleave", () => {
        titleOverlay?.classList.remove("yt-immersive-visible");
      });
    }
  }

  function hidePaidPromotionOverlay() {
    if (!isSubscriptionsPage() || !lastSettings.hidePaidPromotionOverlay) return;
    const keys = ["includes paid promotion", "包含付費宣傳", "含付費宣傳"];
    const labels = document.querySelectorAll(
      "ytd-badge-supported-renderer yt-formatted-string, ytd-thumbnail-overlay-badge-view-model yt-formatted-string"
    );
    labels.forEach((node) => {
      const text = (node.textContent || "").trim().toLowerCase();
      if (!text) return;
      if (!keys.some((k) => text.includes(k))) return;
      const container =
        node.closest("ytd-badge-supported-renderer") ||
        node.closest("ytd-thumbnail-overlay-badge-view-model");
      if (container instanceof HTMLElement) container.style.display = "none";
      else if (node instanceof HTMLElement) node.style.display = "none";
    });
  }

  function teardownBackToTopFab() {
    document.querySelectorAll(`.${BACK_TO_TOP_FAB_CLASS}`).forEach((el) => el.remove());
  }

  /** 小播放器（捲動縮窗）生效時顯示「回到頂部」浮動按鈕 */
  function ensureBackToTopFab() {
    const show =
      immersiveActive &&
      isWatchPage() &&
      lastSettings.scrollingSupport &&
      lastSettings.miniPlayerOnScroll &&
      document.documentElement.classList.contains("yt-immersive-mini-player");

    if (!show) {
      teardownBackToTopFab();
      return;
    }

    if (document.querySelector(`.${BACK_TO_TOP_FAB_CLASS}`)) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = BACK_TO_TOP_FAB_CLASS;
    btn.title = "回到頂部";
    btn.setAttribute("aria-label", "回到頂部");
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M7 14l5-5 5 5H7z"/></svg>';
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    document.body.appendChild(btn);
  }

  function updateMiniPlayerByScroll() {
    if (!isWatchPage() || !immersiveActive || !lastSettings.scrollingSupport || !lastSettings.miniPlayerOnScroll) {
      cancelMiniPlayerFlipAnimation();
      lastMiniPlayerScrollState = false;
      document.documentElement.classList.remove("yt-immersive-mini-player");
      teardownMiniPlayerDrag();
      clearMiniPlayerPositionStyle();
      ensureBackToTopFab();
      return;
    }
    const nextMini = window.scrollY > 280;
    const crossed = nextMini !== lastMiniPlayerScrollState;

    if (crossed) {
      lastMiniPlayerScrollState = nextMini;
      if (nextMini) {
        enterMiniPlayerWithFlip();
      } else {
        exitMiniPlayerWithFlip();
      }
      return;
    }

    document.documentElement.classList.toggle("yt-immersive-mini-player", nextMini);
    if (nextMini) {
      const mp = document.querySelector("#movie_player");
      if (mp instanceof HTMLElement && miniPlayerPosition) {
        miniPlayerPosition = clampMiniPlayerPosition(miniPlayerPosition.left, miniPlayerPosition.top, mp);
      }
      applyMiniPlayerPosition();
      ensureMiniPlayerDrag();
      ensureBackToTopFab();
      return;
    }
    teardownMiniPlayerDrag();
    clearMiniPlayerPositionStyle();
    ensureBackToTopFab();
  }

  /** @type {number} */
  let immersiveViewportSyncRaf = 0;

  /**
   * 沉浸式時強制播放器與影像節點重算版面，緩解 resize / visualViewport / SPA 換節點後的偏移。
   * 迷你播放器模式下由獨立 CSS 控制區塊尺寸，這裡略過以避免干擾。
   */
  function syncImmersiveViewport() {
    if (!immersiveActive || !isWatchPage()) return;
    if (document.documentElement.classList.contains("yt-immersive-mini-player")) return;

    const moviePlayer = document.querySelector("#movie_player");
    const videoEl = /** @type {HTMLElement | SVGElement | null} */ (
      document.querySelector(".html5-main-video")
    );

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void moviePlayer?.offsetHeight;
        void moviePlayer?.getBoundingClientRect();
        void videoEl?.getBoundingClientRect?.();
      });
    });
  }

  function scheduleImmersiveViewportSync() {
    if (!immersiveActive || !isWatchPage()) return;
    if (immersiveViewportSyncRaf) return;
    immersiveViewportSyncRaf = requestAnimationFrame(() => {
      immersiveViewportSyncRaf = 0;
      updateMiniPlayerByScroll();
      syncImmersiveViewport();
    });
  }

  async function togglePictureInPicture() {
    const video = document.querySelector("video");
    if (!(video instanceof HTMLVideoElement)) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled && video.readyState > 1) {
        await video.requestPictureInPicture();
      }
    } catch {
      /* 使用者手勢或頁面限制 */
    }
  }

  function applyLayout(payload) {
    if (!suiteYtPluginEnabled && !payload?.restore) {
      if (payload?.settings) lastSettings = { ...lastSettings, ...payload.settings };
      applyLayout({ settings: lastSettings, restore: true });
      return;
    }

    const settings = payload?.settings || lastSettings;
    const restore = !!payload?.restore;
    lastSettings = { ...lastSettings, ...settings };

    if (restore || !isWatchPage()) {
      cancelMiniPlayerFlipAnimation();
      lastMiniPlayerScrollState = false;
      teardownScrollWheelBridge();
      teardownMiniPlayerDrag();
      teardownBackToTopFab();
      clearMiniPlayerPositionStyle();
      immersiveActive = false;
      document.documentElement.classList.remove(
        "yt-immersive-ext",
        "yt-immersive-hide-secondary",
        "yt-immersive-scroll-enabled",
        "yt-immersive-hide-scrollbar",
        "yt-immersive-always-search",
        "yt-immersive-mini-player"
      );
      refreshButtonState();
      return;
    }

    teardownScrollWheelBridge();
    teardownMiniPlayerDrag();
    immersiveActive = true;
    document.documentElement.classList.add("yt-immersive-ext");
    document.documentElement.classList.toggle("yt-immersive-hide-secondary", !!lastSettings.hideSecondary);
    document.documentElement.classList.toggle("yt-immersive-scroll-enabled", !!lastSettings.scrollingSupport);
    document.documentElement.classList.toggle(
      "yt-immersive-hide-scrollbar",
      !!(lastSettings.scrollingSupport && lastSettings.hideScrollbar)
    );
    document.documentElement.classList.toggle("yt-immersive-always-search", !!lastSettings.alwaysShowSearchBar);

    ensureTitleOverlay();
    ensureScrollWheelBridge();
    updateMiniPlayerByScroll();
    refreshButtonState();

    syncImmersiveViewport();
    [120, 400, 900].forEach((ms) => setTimeout(syncImmersiveViewport, ms));
  }

  async function maybeAutoToggle() {
    if (!suiteYtPluginEnabled) return;
    if (!isWatchPage() || !lastSettings.autoToggleOnWatch || autoToggleInFlight) return;
    autoToggleInFlight = true;
    try {
      const status = await send(MSG.GET_STATUS);
      if (status?.canEnter) await send(MSG.ENTER_IMMERSIVE);
    } finally {
      setTimeout(() => {
        autoToggleInFlight = false;
      }, 1600);
    }
  }

  function onNavigate() {
    requestSettings(() => {
      if (!isWatchPage()) {
        cancelMiniPlayerFlipAnimation();
        lastMiniPlayerScrollState = false;
        teardownScrollWheelBridge();
        teardownMiniPlayerDrag();
        teardownBackToTopFab();
        clearMiniPlayerPositionStyle();
        immersiveActive = false;
        document.documentElement.classList.remove(
          "yt-immersive-ext",
          "yt-immersive-hide-secondary",
          "yt-immersive-scroll-enabled",
          "yt-immersive-hide-scrollbar",
          "yt-immersive-always-search",
          "yt-immersive-mini-player"
        );
      } else if (immersiveActive) {
        applyLayout({ settings: lastSettings });
      }

      refreshButtonState();
      ensureTitleOverlay();
      hidePaidPromotionOverlay();
      void maybeAutoToggle().catch(() => {});

      [400, 1200, 2500].forEach((ms) => {
        setTimeout(() => {
          if (isWatchPage() && lastSettings.showPlayerButton) injectPlayerButton();
          if (isWatchPage() && immersiveActive) syncImmersiveViewport();
          if (isSubscriptionsPage() && lastSettings.hidePaidPromotionOverlay) hidePaidPromotionOverlay();
        }, ms);
      });
    });
  }

  try {
    chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
      if (!isExtensionRuntimeAlive()) return false;

      if (
        msg?.type === SUITE_PLATFORM.PLUGIN_RUNTIME &&
        msg.pluginId === "full-screen-toggle"
      ) {
        suiteYtPluginEnabled = Boolean(msg.enabled);
        if (!suiteYtPluginEnabled) {
          applyLayout({ settings: msg.settings || {}, restore: true });
        } else if (msg.settings && typeof msg.settings === "object") {
          lastSettings = { ...lastSettings, ...msg.settings };
          requestSettings(() => onNavigate());
        } else {
          requestSettings(() => onNavigate());
        }
        try {
          sendResponse({ ok: true });
        } catch {
          /* ignore */
        }
        return false;
      }

      if (msg?.type === MSG.APPLY_LAYOUT) {
        applyLayout(msg);
        try {
          sendResponse({ ok: true });
        } catch {
          /* 背景或 context 已失效 */
        }
      }
      return false;
    });
  } catch {
    /* 載入後擴充被卸載／重載時可能無法註冊 */
  }

  document.addEventListener("keydown", (e) => {
    if (!suiteYtPluginEnabled) return;
    const key = e.key?.toLowerCase();
    if (!lastSettings.pipShortcutEnabled) return;
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && key === "o") {
      e.preventDefault();
      togglePictureInPicture();
    }
  });

  window.addEventListener(
    "scroll",
    () => {
      updateMiniPlayerByScroll();
    },
    { passive: true }
  );

  window.addEventListener(
    "resize",
    () => {
      if (miniPlayerPosition && document.documentElement.classList.contains("yt-immersive-mini-player")) {
        const mp = document.querySelector("#movie_player");
        if (mp instanceof HTMLElement) {
          miniPlayerPosition = clampMiniPlayerPosition(miniPlayerPosition.left, miniPlayerPosition.top, mp);
          applyMiniPlayerPosition();
          persistMiniPlayerPosition();
        }
      }
      scheduleImmersiveViewportSync();
    },
    { passive: true }
  );

  const vv = window.visualViewport;
  if (vv && typeof vv.addEventListener === "function") {
    vv.addEventListener(
      "resize",
      () => {
        scheduleImmersiveViewportSync();
      },
      { passive: true }
    );
  }

  const obs = new MutationObserver(() => {
    if (!suiteYtPluginEnabled) return;
    if (isWatchPage() && lastSettings.showPlayerButton) injectPlayerButton();
    if (isWatchPage() && immersiveActive) ensureTitleOverlay();
    if (isSubscriptionsPage() && lastSettings.hidePaidPromotionOverlay) hidePaidPromotionOverlay();
  });
  if (document.body) obs.observe(document.body, { childList: true, subtree: true });

  (async () => {
    loadMiniPlayerPosition();
    try {
      if (!isExtensionRuntimeAlive()) MSG = FALLBACK_MSG;
      else {
        /** 獨立載入 manifest 路徑為 `src/shared/...`；全家桶根 manifest 可能為 `plugins/<模組>/src/...`。 */
        try {
          const mPlat = await import(chrome.runtime.getURL("src/shared/message-types.js"));
          if (mPlat?.PLATFORM_MSG) SUITE_PLATFORM = mPlat.PLATFORM_MSG;
        } catch {
          SUITE_PLATFORM = FALLBACK_SUITE;
        }
        let c = null;
        for (const url of [
          chrome.runtime.getURL("plugins/full-screen-toggle/src/shared/constants.js"),
          chrome.runtime.getURL("src/shared/constants.js"),
        ]) {
          try {
            c = await import(url);
            if (c?.MSG) break;
          } catch {
            c = null;
          }
        }
        if (c?.MSG) MSG = c.MSG;
      }
    } catch {
      MSG = FALLBACK_MSG;
      SUITE_PLATFORM = FALLBACK_SUITE;
    }
    requestSettings(() => onNavigate());
  })();

  document.addEventListener("yt-navigate-finish", () => {
    setTimeout(onNavigate, 0);
  });
})();
