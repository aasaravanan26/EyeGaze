// Connections: the apps Glance works with. Each one needs Chrome's permission
// for its site, plus its adapter script registered to run there.
// Shared by the side panel and the background service worker.
//
// Adding an app means adding an entry here and writing its adapter. The
// adapter saves what it reads under keys named after the app's id:
//   "<id>.connectedAt", "<id>.continueWatching", "<id>.search"
// An app with fetchResults searches without a tab; the side panel saves its
// results under "<id>.search" itself.
//
// "controls" are playback actions (pause, seek). Each one is run inside the
// app's page (not in the adapter's isolated world), so it can use the page's
// own player when that's the only safe way, as on Netflix. They must be
// self-contained: Chrome copies the function into the page.

const CONNECTIONS = {
  netflix: {
    name: "Netflix",
    icon: "tv",
    site: "https://www.netflix.com",
    origins: ["https://www.netflix.com/*"],
    home: "https://www.netflix.com/browse",
    script: "adapters/netflix.js",
    // "shows" (streaming apps) or "videos" (YouTube): search lists shows first.
    kind: "shows",
    // Shown in setup until the adapter first sees the app's home page.
    setupHint: "Sign in and pick your profile in the Netflix tab",
    // Opening a show's watch page makes Netflix resume where you left off.
    watchUrl: ({ id }) => `https://www.netflix.com/watch/${id}`,
    isWatching: (url) => new URL(url).pathname.startsWith("/watch"),
    searchUrl: (query) => `https://www.netflix.com/search?q=${encodeURIComponent(query)}`,
    controls: {
      togglePause: () => {
        const video = document.querySelector("video");
        if (!video) return "Nothing is playing yet.";
        if (video.paused) video.play();
        else video.pause();
        return video.paused ? "Paused." : "Playing.";
      },
      // Changing the video's position directly makes Netflix show an error,
      // so seek through Netflix's own player.
      seek: (seconds) => {
        const videoPlayer = window.netflix?.appContext?.state?.playerApp?.getAPI?.().videoPlayer;
        const sessions = videoPlayer?.getAllPlayerSessionIds?.() ?? [];
        const session = sessions.find((id) => id.startsWith("watch")) ?? sessions.at(-1);
        const player = session && videoPlayer.getVideoPlayerBySessionId(session);
        if (!player) return "Nothing is playing yet.";
        player.seek(Math.max(0, player.getCurrentTime() + seconds * 1000));
        return seconds < 0 ? `Back ${-seconds} seconds.` : `Forward ${seconds} seconds.`;
      },
    },
  },
  youtube: {
    name: "YouTube",
    icon: "play",
    site: "https://www.youtube.com",
    origins: ["https://www.youtube.com/*"],
    home: "https://www.youtube.com/",
    script: "adapters/youtube.js",
    kind: "videos",
    setupHint: "Opening YouTube…",
    // Resume from where you left off, if the adapter noted it.
    watchUrl: ({ id, position }) =>
      `https://www.youtube.com/watch?v=${id}` + (position ? `&t=${position}s` : ""),
    isWatching: (url) => new URL(url).pathname === "/watch",
    searchUrl: (query) =>
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    // Searches without opening a tab (see adapters/youtube-search.js).
    fetchResults: (query) => searchYouTube(query),
    controls: {
      togglePause: () => {
        const video = document.querySelector("video");
        if (!video) return "Nothing is playing yet.";
        if (video.paused) video.play();
        else video.pause();
        return video.paused ? "Paused." : "Playing.";
      },
      seek: (seconds) => {
        const video = document.querySelector("video");
        if (!video) return "Nothing is playing yet.";
        video.currentTime = Math.max(0, video.currentTime + seconds);
        return seconds < 0 ? `Back ${-seconds} seconds.` : `Forward ${seconds} seconds.`;
      },
    },
  },
};

async function isAdapterRegistered(id) {
  const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  return scripts.length > 0;
}

async function registerAdapter(id) {
  if (await isAdapterRegistered(id)) return;
  const { origins, script } = CONNECTIONS[id];
  await chrome.scripting.registerContentScripts([{ id, matches: origins, js: [script] }]);
}

async function unregisterAdapter(id) {
  if (!(await isAdapterRegistered(id))) return;
  await chrome.scripting.unregisterContentScripts({ ids: [id] });
}

// Turn an app on. Call this straight from a click: Chrome only shows its
// permission prompt in response to something the user did.
async function connect(id) {
  const granted = await chrome.permissions.request({ origins: CONNECTIONS[id].origins });
  if (!granted) return false;
  const { connections = {} } = await chrome.storage.local.get("connections");
  await chrome.storage.local.set({ connections: { ...connections, [id]: true } });
  await registerAdapter(id);
  return true;
}

// Turn an app off: stop its adapter and give its site permission back.
async function disconnect(id) {
  const { connections = {} } = await chrome.storage.local.get("connections");
  await chrome.storage.local.set({ connections: { ...connections, [id]: false } });
  await chrome.storage.local.remove(`${id}.connectedAt`);
  await unregisterAdapter(id);
  await chrome.permissions.remove({ origins: CONNECTIONS[id].origins });
}

// Make the registered adapters match the apps that are on and still permitted.
async function syncAdapters() {
  const { connections = {} } = await chrome.storage.local.get("connections");
  for (const id of Object.keys(CONNECTIONS)) {
    const permitted = await chrome.permissions.contains({ origins: CONNECTIONS[id].origins });
    if (connections[id] && permitted) await registerAdapter(id);
    else await unregisterAdapter(id);
  }
}
