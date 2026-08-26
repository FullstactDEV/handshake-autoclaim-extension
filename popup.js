const STATUS_LABELS = {
  active: { text: "Active — clicking", cls: "active" },
  "paused-hidden": { text: "Paused — tab hidden", cls: "paused" },
  "paused-wrong-page": { text: "Paused — wrong page", cls: "paused" },
  unbound: { text: "Waiting — no button bound", cls: "paused" },
  "button-not-found": { text: "Button not found on page", cls: "error" },
  ambiguous: { text: "Multiple matches — rebind", cls: "error" },
  disabled: { text: "Disabled", cls: "" }
};

let activeTabId = null;
let tickHandle = null;

function timeAgo(iso) {
  if (!iso) return "—";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const sec = Math.round(diff / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
}

function render(state) {
  document.getElementById("enabledToggle").checked = !!state.enabled;

  const statusInfo = STATUS_LABELS[state.status] || STATUS_LABELS.disabled;
  const statusEl = document.getElementById("statusText");
  statusEl.textContent = statusInfo.text;
  statusEl.className = "sublabel " + statusInfo.cls;

  const bound = !!state.boundText;
  document.getElementById("boundEmpty").classList.toggle("hidden", bound);
  document.getElementById("boundFilled").classList.toggle("hidden", !bound);
  document.getElementById("clearBtn").classList.toggle("hidden", !bound);
  document.getElementById("bindBtn").textContent = bound ? "Rebind" : "Bind button";

  if (bound) {
    document.getElementById("boundTextEl").textContent = `"${state.boundText}"`;
    document.getElementById("boundContextEl").textContent = state.boundContext
      ? `under ${state.boundContext}`
      : "";
  }

  document.getElementById("clickCount").textContent = state.sessionClicks || 0;
  document.getElementById("lastClick").textContent = timeAgo(state.lastClickAt);

  document.getElementById("minInterval").value = state.minIntervalSec ?? 15;
  document.getElementById("maxInterval").value = state.maxIntervalSec ?? 45;
}

async function refresh() {
  const state = await chrome.storage.local.get(null);
  render(state);
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const onRightSite = !!tab && !!tab.url && tab.url.startsWith("https://ai.joinhandshake.com/");

  if (!onRightSite) {
    document.getElementById("wrongPage").classList.remove("hidden");
    document.getElementById("mainPanel").classList.add("hidden");
    return;
  }

  activeTabId = tab.id;
  await refresh();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") refresh();
  });

  tickHandle = setInterval(refresh, 1000);

  document.getElementById("enabledToggle").addEventListener("change", (e) => {
    chrome.storage.local.set({ enabled: e.target.checked });
  });

  document.getElementById("bindBtn").addEventListener("click", async () => {
    await chrome.tabs.sendMessage(activeTabId, { type: "START_PICKER" });
    window.close();
  });

  document.getElementById("clearBtn").addEventListener("click", () => {
    chrome.storage.local.set({ boundText: null, boundContext: null, boundSelector: null });
  });

  const commitIntervals = () => {
    let min = parseInt(document.getElementById("minInterval").value, 10) || 15;
    let max = parseInt(document.getElementById("maxInterval").value, 10) || 45;
    min = Math.max(1, min);
    max = Math.max(min, max);
    chrome.storage.local.set({ minIntervalSec: min, maxIntervalSec: max });
  };
  document.getElementById("minInterval").addEventListener("change", commitIntervals);
  document.getElementById("maxInterval").addEventListener("change", commitIntervals);
}

window.addEventListener("unload", () => {
  if (tickHandle) clearInterval(tickHandle);
});

init();
