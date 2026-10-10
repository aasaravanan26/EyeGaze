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

// Simple line icons, drawn in the current text color.
const ICONS = {
  play: '<path d="M7 4v16l13-8z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  movie:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  tv: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 3l4 4 4-4"/>',
  next: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
};

function iconEl(name) {
  const span = document.createElement("span");
  span.innerHTML =
    `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ` +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  return span.firstChild;
}

function subEl(text) {
  const span = document.createElement("span");
  span.className = "sub";
  span.textContent = text;
  return span;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

// The best guess for "Continue": Netflix's own row first, then our fallback.
function nextUp() {
  return stored["netflix.continueWatching"]?.items[0] ?? stored.lastWatched ?? null;
}

const screens = {
  // ---------- First-time setup ----------

  welcome: () => ({
    heading: "Welcome to Glance",
    intro: "First, let's connect the apps you use. You only need to do this once.",
    buttons: [{ label: "Set up", icon: "next", primary: true, onSelect: () => go("connections") }],
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
          icon: "tv",
          badge: on ? "On" : "Off",
          on,
          onSelect: () => toggleConnection("netflix", on),
        },
        { label: "YouTube", sub: "Coming soon", icon: "play", badge: "Soon", disabled: true },
        { label: "Done", icon: "check", onSelect: () => go(stored.setupDone ? "home" : "ready") },
      ],
      onBack: () => go(stored.setupDone ? "home" : "welcome"),
    };
  },

  ready: () => ({
    heading: "You're all set",
    intro: "Your choices will appear here as big buttons. Look at one to pick it.",
    buttons: [{ label: "Start", icon: "next", primary: true, onSelect: finishSetup }],
    onBack: () => go("connections"),
  }),

  // ---------- Everyday ----------

  home: () => {
    const netflixOn = Boolean(stored.connections?.netflix);
    const item = netflixOn ? nextUp() : null;
    const buttons = [];
    if (item) {
      buttons.push({
        label: item.title,
        sub: "Continue watching",
        art: item.image,
        icon: "play",
        primary: true,
        onSelect: () => continueWatching(item),
      });
    }
    buttons.push(
      {
        label: "A show or movie",
        icon: "movie",
        onSelect: () => show("Coming next: one question, then three posters."),
      },
      {
        label: "Videos",
        icon: "play",
        onSelect: () => show("Videos are coming soon."),
      }
    );
    return {
      greeting: greeting(),
      heading: "What are you in the mood for?",
      buttons,
      note: netflixOn ? "" : "No apps are on yet. Look at Something else to add one.",
      onElse: () => go("connections"),
    };
  },

  playing: (item) => ({
    heading: `Watching ${item.title}`,
    buttons: [{ label: "Pause / Play", icon: "pause", onSelect: () => tellAdapter("togglePause") }],
    onBack: () => go("home"),
  }),
};

// Screens that redraw themselves when stored data changes (e.g. a
// connection's status, or a freshly read Continue Watching row).
const LIVE_SCREENS = ["home", "connections"];

function go(name, arg) {
  currentScreen = name;
  const screen = screens[name](arg);

  const top = [];
  if (screen.greeting) {
    const greetingEl = document.createElement("p");
    greetingEl.className = "greeting";
    greetingEl.textContent = screen.greeting;
    top.push(greetingEl);
  }
  const heading = document.createElement("h1");
  heading.textContent = screen.heading;
  top.push(heading);
  if (screen.intro) {
    const intro = document.createElement("p");
    intro.className = "intro";
    intro.textContent = screen.intro;
    top.push(intro);
  }

  const buttons = screen.buttons.map((spec) => {
    const { label, sub, icon, art, badge, primary, on, disabled, onSelect } = spec;
    const button = document.createElement("button");
    button.className = ["btn", primary && "primary", on && "on"].filter(Boolean).join(" ");

    // Artwork when we have it (falling back to the icon if it fails to load).
    const iconNode = icon ? iconEl(icon) : null;
    if (art) {
      const img = document.createElement("img");
      img.className = "art";
      img.src = art;
      img.alt = "";
      img.addEventListener("error", () => img.replaceWith(iconNode ?? ""));
      button.append(img);
    } else if (iconNode) {
      button.append(iconNode);
    }

    const text = document.createElement("span");
    text.className = "text";
    if (sub && primary) text.append(subEl(sub));
    text.append(label);
    if (sub && !primary) text.append(subEl(sub));
    button.append(text);

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
    lastWatched: {
      service: "netflix",
      id: item.id,
      title: item.title,
      image: item.image ?? null,
      at: Date.now(),
    },
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
