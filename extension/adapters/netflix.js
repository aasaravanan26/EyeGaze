// Netflix adapter: runs inside netflix.com, performs actions on the page, and
// saves what it reads (Continue Watching, search results) for the side panel.

const actions = {
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

// ---------- Continue Watching (home page) ----------

// Netflix marks Continue Watching cards as "progress-card". Each one links to
// /browse?jbv=<show id>, carries the show's name as its aria-label, and
// contains the show's artwork.
function readContinueWatching() {
  const items = [];
  const seen = new Set();
  for (const card of document.querySelectorAll('a[data-uia="progress-card"]')) {
    const id = new URL(card.href).searchParams.get("jbv");
    const title = card.getAttribute("aria-label");
    const image = card.querySelector("img")?.src || null;
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    items.push({ id, title, image });
  }
  return items.slice(0, 5);
}

let lastSavedContinue = "";
let markedConnected = false;

function rememberContinueWatching() {
  // Rows only appear once someone is signed in and has picked a profile,
  // so seeing them means Netflix is connected.
  if (!document.querySelector("section.carousel-row")) return;
  if (!markedConnected) {
    markedConnected = true;
    chrome.storage.local.set({ "netflix.connectedAt": Date.now() });
  }

  const items = readContinueWatching();
  const json = JSON.stringify(items);
  if (!items.length || json === lastSavedContinue) return;
  lastSavedContinue = json;
  chrome.storage.local.set({
    "netflix.continueWatching": { items, updatedAt: Date.now() },
  });
}

// ---------- Search results (search page) ----------

// Show links look like /watch/<id>, /title/<id> or ...?jbv=<id>. Skip the
// header's menus (e.g. notifications), which also link to shows.
const SHOW_ID = /(?:\/(?:watch|title)\/|[?&]jbv=)(\d+)/;

function readSearchResults() {
  const items = [];
  const seen = new Set();
  for (const link of document.querySelectorAll('a[href]:not([data-uia^="navigation"])')) {
    const match = link.getAttribute("href").match(SHOW_ID);
    const img = link.querySelector("img");
    const title = link.getAttribute("aria-label") || img?.alt || link.textContent.trim();
    if (!match || !title || seen.has(match[1])) continue;
    seen.add(match[1]);
    items.push({ id: match[1], title, image: img?.src || null });
    if (items.length === 9) break;
  }
  return items;
}

let lastSavedSearch = "";

function rememberSearchResults() {
  const query = new URLSearchParams(location.search).get("q");
  if (!query) return;
  const items = readSearchResults();
  const json = JSON.stringify({ query, items });
  if (json === lastSavedSearch) return;
  lastSavedSearch = json;
  chrome.storage.local.set({ "netflix.search": { query, items, at: Date.now() } });
}

// ---------- Watching for changes ----------

// Netflix loads its content after the page itself, so read again whenever
// the page changes (waiting a moment for it to settle).
function readCurrentPage() {
  if (location.pathname.startsWith("/browse")) rememberContinueWatching();
  else if (location.pathname.startsWith("/search")) rememberSearchResults();
}

let settleTimer;
new MutationObserver(() => {
  if (!/^\/(browse|search)/.test(location.pathname)) return;
  clearTimeout(settleTimer);
  settleTimer = setTimeout(readCurrentPage, 800);
}).observe(document.body, { childList: true, subtree: true });

readCurrentPage();
