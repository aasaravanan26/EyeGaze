// Netflix adapter: runs inside netflix.com and performs actions on the page.

const actions = {
  playFirstResult() {
    // Show links look like /watch/<id>, /title/<id> or /browse?jbv=<id>.
    // Skip the header's menus (e.g. notifications), which also link to shows.
    const SHOW_ID = /(?:\/(?:watch|title)\/|[?&]jbv=)(\d+)/;
    const links = document.querySelectorAll('a[href]:not([data-uia^="navigation"])');
    const link = [...links].find((a) =>
      SHOW_ID.test(a.getAttribute("href"))
    );
    if (!link) {
      return { ok: false, message: "No search results found on this page." };
    }
    const id = link.getAttribute("href").match(SHOW_ID)[1];
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

let lastSaved = "";
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
