// Netflix adapter: runs inside netflix.com and performs actions on the page.

const actions = {
  playFirstResult() {
    const link = [...document.querySelectorAll("a[href]")].find((a) =>
      /\/(watch|title)\/\d+/.test(a.getAttribute("href"))
    );
    if (!link) {
      return { ok: false, message: "No search results found on this page." };
    }
    const id = link.getAttribute("href").match(/\/(?:watch|title)\/(\d+)/)[1];
    location.assign(`/watch/${id}`);
    return { ok: true, message: `Opening title ${id}…` };
  },

  togglePause() {
    const video = document.querySelector("video");
    if (!video) {
      return { ok: false, message: "Nothing is playing yet." };
    }
    if (video.paused) {
      video.play().catch(() => {});
      return { ok: true, message: "Playing." };
    }
    video.pause();
    return { ok: true, message: "Paused." };
  },
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const action = actions[message.action];
  sendResponse(action ? action() : { ok: false, message: `Unknown action: ${message.action}` });
});

// Memory: whenever the Netflix home page shows the "Continue Watching" row,
// save its first few titles so the side panel can offer them from any page.

function readContinueWatching() {
  const row = document.querySelector('[data-list-context="continueWatching"]');
  if (!row) return [];

  const items = [];
  const seen = new Set();
  for (const link of row.querySelectorAll("a[href]")) {
    const match = link.getAttribute("href").match(/\/(?:watch|title)\/(\d+)/);
    const title =
      link.getAttribute("aria-label") ||
      link.querySelector(".fallback-text")?.textContent.trim();
    if (!match || !title || seen.has(match[1])) continue;
    seen.add(match[1]);
    items.push({ id: match[1], title });
  }
  return items.slice(0, 5);
}

let lastSaved = "";

function rememberContinueWatching() {
  const items = readContinueWatching();
  const json = JSON.stringify(items);
  if (!items.length || json === lastSaved) return;
  lastSaved = json;
  chrome.storage.local.set({
    "netflix.continueWatching": { items, updatedAt: Date.now() },
  });
}

// Netflix loads rows after the page itself, so check again whenever the
// home page changes (waiting a moment for it to settle).
let settleTimer;
new MutationObserver(() => {
  if (!location.pathname.startsWith("/browse")) return;
  clearTimeout(settleTimer);
  settleTimer = setTimeout(rememberContinueWatching, 1000);
}).observe(document.body, { childList: true, subtree: true });

if (location.pathname.startsWith("/browse")) rememberContinueWatching();
