// The side panel: Glance's screens of big buttons.

const NETFLIX = "https://www.netflix.com";

// What Glance remembers, kept in chrome.storage.local on this device.
//   "netflix.continueWatching": read from Netflix's own row by the adapter
//   "lastWatched": the last thing Glance started playing
const MEMORY_KEYS = ["netflix.continueWatching", "lastWatched"];
let memory = {};

const screenEl = document.getElementById("screen");
const backBtn = document.getElementById("back");
const elseBtn = document.getElementById("else");
let statusEl;
let currentScreen = "home";

// The best guess for "Continue": Netflix's own row first, then our fallback.
function nextUp() {
  return memory["netflix.continueWatching"]?.items[0] ?? memory.lastWatched ?? null;
}

const screens = {
  home: () => {
    const item = nextUp();
    const buttons = [];
    if (item) {
      buttons.push({
        label: `Continue ${item.title}`,
        sub: "Pick up where you left off",
        primary: true,
        onSelect: () => continueWatching(item),
      });
    }
    buttons.push(
      {
        label: "A show or movie",
        onSelect: () => show("Coming next: one question, then three posters."),
      },
      {
        label: "Videos",
        sub: "YouTube",
        onSelect: () => show("YouTube is coming soon."),
      }
    );
    return {
      heading: "What are you in the mood for?",
      buttons,
      note: item ? "" : "Open Netflix's home page once so Glance can see what you're watching.",
      onElse: () => show("More options are coming soon."),
    };
  },

  playing: (item) => ({
    heading: `Watching ${item.title}`,
    buttons: [{ label: "Pause / Play", onSelect: () => tellAdapter("togglePause") }],
    onBack: () => go("home"),
  }),
};

function go(name, arg) {
  currentScreen = name;
  const screen = screens[name](arg);

  const heading = document.createElement("h1");
  heading.textContent = screen.heading;

  const buttons = screen.buttons.map(({ label, sub, primary, onSelect }) => {
    const button = document.createElement("button");
    button.className = primary ? "btn primary" : "btn";
    button.textContent = label;
    if (sub) {
      const subEl = document.createElement("span");
      subEl.className = "sub";
      subEl.textContent = sub;
      button.append(subEl);
    }
    button.addEventListener("click", onSelect);
    return button;
  });

  statusEl = document.createElement("div");
  statusEl.id = "status";
  statusEl.textContent = screen.note ?? "";

  screenEl.replaceChildren(heading, ...buttons, statusEl);

  // Back and Something else stay in the same corners on every screen;
  // they're dimmed when a screen has nothing for them to do.
  backBtn.disabled = !screen.onBack;
  backBtn.onclick = screen.onBack ?? null;
  elseBtn.disabled = !screen.onElse;
  elseBtn.onclick = screen.onElse ?? null;
}

function show(message) {
  statusEl.textContent = message;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function continueWatching(item) {
  const tab = await activeTab();
  await chrome.tabs.update(tab.id, { url: `${NETFLIX}/watch/${item.id}` });
  chrome.storage.local.set({
    lastWatched: { service: "netflix", id: item.id, title: item.title, at: Date.now() },
  });
  go("playing", item);
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

// Keep memory fresh: when the adapter saves something new, update the home screen.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" || !MEMORY_KEYS.some((key) => key in changes)) return;
  memory = await chrome.storage.local.get(MEMORY_KEYS);
  if (currentScreen === "home") go("home");
});

chrome.storage.local.get(MEMORY_KEYS).then((stored) => {
  memory = stored;
  go("home");
});
