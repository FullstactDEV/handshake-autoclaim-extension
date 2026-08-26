(() => {
  const TARGET_PATH_PREFIX = "/fellow/projects";
  const CLICKABLE_SELECTOR = 'button, [role="button"], a';

  let state = null;
  let pickerActive = false;
  let clickTimer = null;
  let overlayEl = null;
  let bannerEl = null;
  let hoverTarget = null;

  const nowIso = () => new Date().toISOString();

  function onRightPage() {
    return location.pathname.startsWith(TARGET_PATH_PREFIX);
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isEnabledEl(el) {
    return !(el.disabled || el.getAttribute("aria-disabled") === "true");
  }

  // ---------- Selector generation (cache hint only, not source of truth) ----------
  function cssPath(el) {
    const path = [];
    let node = el;
    let depth = 0;
    while (node && node.nodeType === Node.ELEMENT_NODE && depth < 6) {
      let selector = node.nodeName.toLowerCase();
      if (node.id) {
        selector += "#" + CSS.escape(node.id);
        path.unshift(selector);
        break;
      } else {
        let sib = node;
        let nth = 1;
        while (sib.previousElementSibling) {
          sib = sib.previousElementSibling;
          if (sib.nodeName.toLowerCase() === node.nodeName.toLowerCase()) nth++;
        }
        if (nth !== 1) selector += `:nth-of-type(${nth})`;
      }
      path.unshift(selector);
      node = node.parentElement;
      depth++;
    }
    return path.join(" > ");
  }

  // Find the nearest "card" ancestor: one whose text content is meaningfully
  // longer than the button's own text (i.e. it has a title/description around it).
  function findCardContext(buttonEl) {
    const buttonText = (buttonEl.innerText || "").trim();
    let node = buttonEl.parentElement;
    let depth = 0;
    while (node && depth < 6) {
      const nodeText = (node.innerText || "").trim();
      if (nodeText.length > buttonText.length + 8) {
        const firstLine = nodeText.split("\n").map((l) => l.trim()).find((l) => l.length > 0);
        return firstLine || null;
      }
      node = node.parentElement;
      depth++;
    }
    return null;
  }

  function nearestClickable(el) {
    let node = el;
    let depth = 0;
    while (node && depth < 4) {
      if (node.matches && node.matches(CLICKABLE_SELECTOR)) return node;
      node = node.parentElement;
      depth++;
    }
    return el;
  }

  // ---------- Resolution: text + context first, selector as a fast-path hint ----------
  function resolveBoundElement() {
    if (!state.boundText) return { el: null, reason: "unbound" };

    if (state.boundSelector) {
      try {
        const hinted = document.querySelector(state.boundSelector);
        if (hinted && (hinted.innerText || "").trim() === state.boundText) {
          return { el: hinted, reason: "ok" };
        }
      } catch (e) {
        // stale/invalid selector, fall through to text search
      }
    }

    const candidates = Array.from(document.querySelectorAll(CLICKABLE_SELECTOR)).filter(
      (el) => (el.innerText || "").trim() === state.boundText
    );

    if (candidates.length === 0) return { el: null, reason: "button-not-found" };
    if (candidates.length === 1) return { el: candidates[0], reason: "ok" };

    if (state.boundContext) {
      const withContext = candidates.filter((el) => findCardContext(el) === state.boundContext);
      if (withContext.length === 1) return { el: withContext[0], reason: "ok" };
    }

    return { el: null, reason: "ambiguous" };
  }

  // ---------- Storage ----------
  async function loadState() {
    state = await chrome.storage.local.get({
      enabled: false,
      minIntervalSec: 15,
      maxIntervalSec: 45,
      boundText: null,
      boundContext: null,
      boundSelector: null,
      sessionClicks: 0,
      lastClickAt: null,
      status: "disabled"
    });
  }

  async function saveState(patch) {
    Object.assign(state, patch);
    await chrome.storage.local.set(patch);
  }

  function reportStatus(status) {
    if (state.status === status) return;
    state.status = status;
    chrome.storage.local.set({ status });
    chrome.runtime.sendMessage({ type: "STATUS_UPDATE", status }).catch(() => {});
  }

  // ---------- Click loop ----------
  function randomDelayMs() {
    const min = Math.max(1, state.minIntervalSec || 15);
    const max = Math.max(min, state.maxIntervalSec || 45);
    const sec = min + Math.random() * (max - min);
    return sec * 1000;
  }

  function clearClickTimer() {
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
  }

  // Window focus is deliberately ignored: the loop keeps clicking while the
  // browser window sits in the background behind another app or window. Only a
  // genuinely hidden tab (background tab / minimized window) pauses it, since
  // Chrome heavily throttles timers there anyway.
  function pageVisible() {
    return document.visibilityState === "visible";
  }

  function tick() {
    clickTimer = null;
    if (!state.enabled) {
      reportStatus("disabled");
      return;
    }
    if (!onRightPage()) {
      reportStatus("paused-wrong-page");
      scheduleNext();
      return;
    }
    if (!pageVisible()) {
      reportStatus("paused-hidden");
      scheduleNext();
      return;
    }
    if (!state.boundText) {
      reportStatus("unbound");
      scheduleNext();
      return;
    }

    const { el, reason } = resolveBoundElement();
    if (!el || !isVisible(el) || !isEnabledEl(el)) {
      reportStatus(reason === "ok" ? "button-not-found" : reason);
      scheduleNext();
      return;
    }

    el.click();
    const sessionClicks = (state.sessionClicks || 0) + 1;
    saveState({ sessionClicks, lastClickAt: nowIso() });
    reportStatus("active");
    chrome.runtime.sendMessage({ type: "CLICK_PERFORMED", sessionClicks }).catch(() => {});

    scheduleNext();
  }

  function scheduleNext() {
    clearClickTimer();
    clickTimer = setTimeout(tick, randomDelayMs());
  }

  function evaluateStatusNow() {
    if (!state.enabled) return reportStatus("disabled");
    if (!onRightPage()) return reportStatus("paused-wrong-page");
    if (!pageVisible()) return reportStatus("paused-hidden");
    if (!state.boundText) return reportStatus("unbound");
    const { el, reason } = resolveBoundElement();
    if (!el) return reportStatus(reason === "ok" ? "button-not-found" : reason);
    reportStatus("active");
  }

  function ensureLoopRunning() {
    evaluateStatusNow();
    if (state.enabled && !clickTimer) {
      scheduleNext();
    }
    if (!state.enabled) {
      clearClickTimer();
    }
  }

  // React to tab visibility changes immediately (don't wait for a
  // possibly-throttled background timer to catch up). Focus/blur are not
  // wired up on purpose - losing window focus must not interrupt the loop.
  function onBecameVisible() {
    evaluateStatusNow();
    if (pageVisible() && state.enabled) {
      clearClickTimer();
      scheduleNext();
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (pageVisible()) onBecameVisible();
    else evaluateStatusNow();
  });

  // SPA route changes (React Router etc. use pushState/replaceState, no full reload)
  (function watchUrlChanges() {
    let lastPath = location.pathname;
    const check = () => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        evaluateStatusNow();
      }
    };
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function (...args) {
      origPush.apply(this, args);
      check();
    };
    history.replaceState = function (...args) {
      origReplace.apply(this, args);
      check();
    };
    window.addEventListener("popstate", check);
  })();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      state[key] = newValue;
    }
    if ("enabled" in changes || "boundText" in changes || "minIntervalSec" in changes || "maxIntervalSec" in changes) {
      ensureLoopRunning();
    }
  });

  // ---------- Picker mode ----------
  function ensureOverlay() {
    if (overlayEl) return overlayEl;
    overlayEl = document.createElement("div");
    overlayEl.id = "hs-autoclaim-overlay";
    document.documentElement.appendChild(overlayEl);
    return overlayEl;
  }

  function showBanner(text) {
    if (!bannerEl) {
      bannerEl = document.createElement("div");
      bannerEl.id = "hs-autoclaim-banner";
      document.documentElement.appendChild(bannerEl);
    }
    bannerEl.textContent = text;
  }

  function hideBanner() {
    if (bannerEl) {
      bannerEl.remove();
      bannerEl = null;
    }
  }

  function showToast(text) {
    const toast = document.createElement("div");
    toast.id = "hs-autoclaim-toast";
    toast.textContent = text;
    document.documentElement.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
  }

  function onPickerMouseMove(e) {
    const target = nearestClickable(e.target);
    hoverTarget = target;
    const rect = target.getBoundingClientRect();
    const overlay = ensureOverlay();
    overlay.style.left = rect.left + window.scrollX + "px";
    overlay.style.top = rect.top + window.scrollY + "px";
    overlay.style.width = rect.width + "px";
    overlay.style.height = rect.height + "px";
    overlay.style.display = "block";
  }

  function onPickerClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const target = hoverTarget || nearestClickable(e.target);
    finishPicker(target);
    return false;
  }

  function onPickerKeydown(e) {
    if (e.key === "Escape") {
      stopPicker();
    }
  }

  function startPicker() {
    if (pickerActive) return;
    pickerActive = true;
    showBanner("Click the button you want auto-clicked (Esc to cancel)");
    document.addEventListener("mousemove", onPickerMouseMove, true);
    document.addEventListener("click", onPickerClick, true);
    document.addEventListener("keydown", onPickerKeydown, true);
  }

  function stopPicker() {
    pickerActive = false;
    hideBanner();
    if (overlayEl) overlayEl.style.display = "none";
    document.removeEventListener("mousemove", onPickerMouseMove, true);
    document.removeEventListener("click", onPickerClick, true);
    document.removeEventListener("keydown", onPickerKeydown, true);
  }

  async function finishPicker(target) {
    stopPicker();
    const text = (target.innerText || "").trim();
    if (!text) {
      showToast("That element has no text — pick a labeled button.");
      return;
    }
    const selector = cssPath(target);
    const context = findCardContext(target);
    await saveState({
      boundText: text,
      boundContext: context,
      boundSelector: selector
    });
    showToast(`Bound to "${text}"${context ? " under " + context : ""}`);
    ensureLoopRunning();
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "START_PICKER") {
      startPicker();
      sendResponse({ ok: true });
    } else if (msg.type === "PING") {
      sendResponse({ ok: true, onRightPage: onRightPage() });
    }
    return true;
  });

  (async function init() {
    await loadState();
    ensureLoopRunning();
  })();
})();
