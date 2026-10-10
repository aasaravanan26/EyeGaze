// The side panel: our big buttons. It tells the Netflix tab what to do.

const NETFLIX = "https://www.netflix.com";
const SEARCH_TERM = "Stranger Things";

const statusEl = document.getElementById("status");
const show = (message) => { statusEl.textContent = message; };

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Send an action to the Netflix adapter running inside the page.
async function tellAdapter(action) {
  const tab = await activeTab();
  if (!tab?.url?.startsWith(NETFLIX)) {
    show("Open Netflix in this tab first.");
    return;
  }
  try {
    const result = await chrome.tabs.sendMessage(tab.id, { action });
    show(result.message);
  } catch {
    show("Glance isn't connected to this tab yet. Reload the Netflix page and try again.");
  }
}

document.getElementById("search").addEventListener("click", async () => {
  const tab = await activeTab();
  await chrome.tabs.update(tab.id, {
    url: `${NETFLIX}/search?q=${encodeURIComponent(SEARCH_TERM)}`,
  });
  show(`Searching Netflix for ${SEARCH_TERM}…`);
});

document.getElementById("play").addEventListener("click", () => tellAdapter("playFirstResult"));
document.getElementById("pause").addEventListener("click", () => tellAdapter("togglePause"));
