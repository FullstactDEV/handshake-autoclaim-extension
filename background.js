const DEFAULT_STATE = {
  enabled: false,
  minIntervalSec: 15,
  maxIntervalSec: 45,
  boundText: null,
  boundContext: null,
  boundSelector: null,
  sessionClicks: 0,
  lastClickAt: null,
  status: "disabled"
};

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(null);
  await chrome.storage.local.set({ ...DEFAULT_STATE, ...existing });
});

function setBadge(tabId, text, color) {
  if (tabId == null) return;
  chrome.action.setBadgeText({ tabId, text: text || "" });
  if (color) chrome.action.setBadgeBackgroundColor({ tabId, color });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab && sender.tab.id;

  // CLICK_PERFORMED is intentionally not badged: the click count belongs in the
  // popup, not on the toolbar icon. The badge only ever shows run status.
  if (msg.type === "STATUS_UPDATE") {
    const badges = {
      active: { text: "●", color: "#16a34a" },
      "paused-hidden": { text: "⏸", color: "#f59e0b" },
      "paused-wrong-page": { text: "⏸", color: "#f59e0b" },
      unbound: { text: "?", color: "#6b7280" },
      "button-not-found": { text: "!", color: "#dc2626" },
      disabled: { text: "", color: "#6b7280" }
    };
    const b = badges[msg.status] || badges.disabled;
    setBadge(tabId, b.text, b.color);
  }
  sendResponse({ ok: true });
  return true;
});
