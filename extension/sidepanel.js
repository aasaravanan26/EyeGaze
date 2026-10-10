// The side panel: Glance's screens of big buttons.

const NETFLIX = "https://www.netflix.com";

// Everything Glance keeps in chrome.storage.local on this device:
//   "setupDone": first-time setup has been finished
//   "connections": which apps are on, e.g. { netflix: true }
//   "netflix.connectedAt": when the adapter last saw Netflix's home page
//   "netflix.continueWatching": read from Netflix's own row by the adapter
//   "lastWatched": the last thing Glance started playing
let stored = {};

const screenEl = document.getElementById("screen");
const backBtn = document.getElementById("back");
const elseBtn = document.getElementById("else");
let statusEl;
let currentScreen;

// The best guess for "Continue": Netflix's own row first, then our fallback.
function nextUp() {
  return stored["netflix.continueWatching"]?.items[0] ?? stored.lastWatched ?? null;
}

const screens = {
  // ---------- First-time setup ----------

  welcome: () => ({
    heading: "Welcome to Glance",
    intro: "First, let's connect the apps you use. You only need to do this once.",
    buttons: [{ label: "Set up", primary: true, onSelect: () => go("connections") }],
  }),

  connections: () => {
    const on = Boolean(stored.connections?.netflix);
    let sub = "Look here to turn on";
    if (on) {
      sub = stored["netflix.connectedAt"]
        ? "✓ Connected"
        : "Sign in and pick your profile in the Netflix tab";
    }
    return {
      heading: "Which apps do you use?",
      intro: "Look at an app to turn it on or off.",
      buttons: [
        {
          label: "Netflix",
          sub,
          badge: on ? "On" : "Off",
          on,
          onSelect: () => toggleConnection("netflix", on),
        },
        { label: "YouTube", sub: "Coming soon", badge: "Soon", disabled: true },
        { label: "Done", onSelect: () => go(stored.setupDone ? "home" : "ready") },
      ],
      onBack: () => go(stored.setupDone ? "home" : "welcome"),
    };
  },

  ready: () => ({
    heading: "You're all set",
    intro: "Your choices will appear here as big buttons. Look at one to pick it.",
    buttons: [{ label: "Start", primary: true, onSelect: finishSetup }],
    onBack: () => go("connections"),
  }),

  // ---------- Everyday ----------

  home: () => {
    const netflixOn = Boolean(stored.connections?.netflix);
    const item = netflixOn ? nextUp() : null;
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
      note: netflixOn ? "" : "No apps are on yet. Look at Something else to add one.",
      onElse: () => go("connections"),
    };
  },

  playing: (item) => ({
    heading: `Watching ${item.title}`,
    buttons: [{ label: "Pause / Play", onSelect: () => tellAdapter("togglePause") }],
    onBack: () => go("home"),
  }),
};

// Screens that redraw themselves when stored data changes (e.g. a
// connection's status, or a freshly read Continue Watching row).
const LIVE_SCREENS = ["home", "connections"];

function go(name, arg) {
  currentScreen = name;
  const screen = screens[name](arg);

  const heading = document.createElement("h1");
  heading.textContent = screen.heading;
  const top = [heading];
  if (screen.intro) {
    const intro = document.createElement("p");
    intro.className = "intro";
    intro.textContent = screen.intro;
    top.push(intro);
  }

  const buttons = screen.buttons.map(({ label, sub, badge, primary, on, disabled, onSelect }) => {
    const button = document.createElement("button");
    button.className = ["btn", primary && "primary", on && "on"].filter(Boolean).join(" ");
    button.textContent = label;
    if (sub) {
      const subEl = document.createElement("span");
      subEl.className = "sub";
      subEl.textContent = sub;
      button.append(subEl);
    }
    if (badge) {
      const badgeEl = document.createElement("span");
      badgeEl.className = "badge";
      badgeEl.textContent = badge;
      button.append(badgeEl);
    }
    button.disabled = Boolean(disabled);
    if (onSelect) button.addEventListener("click", onSelect);
    return button;
  });

  statusEl = document.createElement("div");
  statusEl.id = "status";
  statusEl.textContent = screen.note ?? "";

  screenEl.replaceChildren(...top, ...buttons, statusEl);

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

async function toggleConnection(id, isOn) {
  const { name, home } = CONNECTIONS[id];
  if (isOn) {
    await disconnect(id);
    return;
  }
  // connect() must run first, straight from the click, so Chrome can ask
  // for permission.
  if (!(await connect(id))) {
    show(`Glance needs Chrome's permission to work with ${name}.`);
    return;
  }
  await chrome.tabs.create({ url: home });
}

async function finishSetup() {
  await chrome.storage.local.set({ setupDone: true });
  go("home");
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

chrome.storage.onChanged.addListener(async (_changes, area) => {
  if (area !== "local") return;
  stored = await chrome.storage.local.get();
  if (LIVE_SCREENS.includes(currentScreen)) go(currentScreen);
});

chrome.storage.local.get().then((data) => {
  stored = data;
  go(stored.setupDone ? "home" : "welcome");
});
