// YouTube adapter: runs inside youtube.com, performs actions on the page, and
// saves the videos you're partway through for the side panel.

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

// Every YouTube video has a thumbnail at a predictable address.
const thumbnail = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

// YouTube works without signing in, so any YouTube page means it's connected.
chrome.storage.local.set({ "youtube.connectedAt": Date.now() });

// ---------- Videos you're partway through (watch page) ----------

// YouTube has no "Continue Watching" row for everyone, so the adapter keeps
// its own short list: the last few videos watched here and not yet finished.
const KEEP = 5;
const FINISHED = 0.9;
// Save when the video changes, otherwise at most this often (each save
// redraws the side panel).
const SAVE_EVERY = 30_000;
let lastSave = { id: null, at: 0 };

async function rememberWatching() {
  const id = new URLSearchParams(location.search).get("v");
  const video = document.querySelector("video");
  // Ads play in the same player; don't mistake them for the video.
  if (!id || !video || !video.duration || document.querySelector(".ad-showing")) return;
  if (id === lastSave.id && Date.now() - lastSave.at < SAVE_EVERY) return;
  lastSave = { id, at: Date.now() };

  const title =
    document.querySelector("ytd-watch-metadata h1")?.textContent.trim() ||
    document.title.replace(/^\(\d+\)\s*/, "").replace(/ - YouTube$/, "");
  const position = Math.floor(video.currentTime);
  const progress = video.currentTime / video.duration;

  const key = "youtube.continueWatching";
  const { [key]: saved } = await chrome.storage.local.get(key);
  const others = (saved?.items ?? []).filter((item) => item.id !== id);
  const items = progress < FINISHED
    ? [{ id, title, image: thumbnail(id), position }, ...others]
    : others;
  chrome.storage.local.set({ [key]: { items: items.slice(0, KEEP), updatedAt: Date.now() } });
}

// (Search doesn't happen here: the side panel searches YouTube without a tab.
// See adapters/youtube-search.js.)

// While a video plays, note how far along it is every few seconds.
setInterval(() => {
  if (location.pathname === "/watch") rememberWatching();
}, 5000);
