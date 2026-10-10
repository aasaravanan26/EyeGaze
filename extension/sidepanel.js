// The side panel: Glance's screens of big buttons.

const NETFLIX = "https://www.netflix.com";

// Everything Glance keeps in chrome.storage.local on this device:
//   "setupDone": first-time setup has been finished
//   "connections": which apps are on, e.g. { netflix: true }
//   "netflix.connectedAt": when the adapter last saw Netflix's home page
//   "netflix.continueWatching": read from Netflix's own row by the adapter
//   "netflix.search": the latest search results read by the adapter
//   "lastWatched": the last thing Glance started playing
let stored = {};

const screenEl = document.getElementById("screen");
const backBtn = document.getElementById("back");
const elseBtn = document.getElementById("else");
let statusEl;

// Navigation: the screen on show, plus the trail of screens that led here.
// Back always returns along the trail.
let current = null;
const trail = [];

// Search by name: letters are picked in two looks (a group, then a letter).
const LETTER_GROUPS = ["ABCDE", "FGHIJ", "KLMNO", "PQRST", "UVWXYZ"];
const search = { query: "", group: null };

// ---------- Small helpers ----------

// Simple line icons, drawn in the current text color.
const ICONS = {
  play: '<path d="M7 4v16l13-8z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  movie:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  tv: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 3l4 4 4-4"/>',
  next: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  settings:
    '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  backspace: '<path d="M21 5H9l-6 7 6 7h12z"/><path d="M13 10l4 4M17 10l-4 4"/>',
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

const netflixOn = () => Boolean(stored.connections?.netflix);

// Shows the person has started: Netflix's own row first, then our fallback.
function startedShows() {
  const fromNetflix = stored["netflix.continueWatching"]?.items ?? [];
  if (fromNetflix.length) return fromNetflix;
  return stored.lastWatched ? [stored.lastWatched] : [];
}

function searchResults() {
  const query = search.query.trim();
  if (!query) return { items: [], note: "Spell the name one letter at a time. Matches appear here." };
  const saved = stored["netflix.search"];
  if (saved?.query !== query) return { items: [], note: "Searching Netflix…" };
  if (!saved.items.length) return { items: [], note: "No matches yet. Add another letter." };
  return { items: saved.items, note: "" };
}

const showButton = (item) => ({
  label: item.title,
  art: item.image,
  icon: "play",
  onSelect: () => play(item),
});

// ---------- Screens ----------

const screens = {
  // First-time setup

  welcome: () => ({
    heading: "Welcome to Glance",
    intro: "First, let's connect the apps you use. You only need to do this once.",
    buttons: [{ label: "Set up", icon: "next", primary: true, onSelect: () => go("connections") }],
  }),

  connections: () => {
    const on = netflixOn();
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
        {
          label: "Done",
          icon: "check",
          onSelect: () => (stored.setupDone ? back() : go("ready")),
        },
      ],
    };
  },

  ready: () => ({
    heading: "You're all set",
    intro: "Your choices will appear here as big buttons. Look at one to pick it.",
    buttons: [{ label: "Start", icon: "next", primary: true, onSelect: finishSetup }],
  }),

  // Everyday

  home: () => {
    const item = netflixOn() ? startedShows()[0] : null;
    const buttons = [];
    if (item) {
      buttons.push({ ...showButton(item), sub: "Continue watching", primary: true });
    }
    buttons.push(
      {
        label: "Help me pick",
        icon: "sparkle",
        disabled: !netflixOn(),
        onSelect: () => show("Coming next: one question, then three posters."),
      },
      {
        label: "Find a show",
        icon: "search",
        disabled: !netflixOn(),
        onSelect: () => go("find"),
      }
    );
    return {
      greeting: greeting(),
      heading: "What are you in the mood for?",
      buttons,
      note: netflixOn() ? "" : "No apps are on yet. Look at Something else, then Settings.",
      onElse: () => go("more"),
    };
  },

  more: () => ({
    heading: "More options",
    buttons: [
      { label: "Videos", sub: "Coming soon", icon: "play", disabled: true },
      { label: "Settings", icon: "settings", onSelect: () => go("settings") },
    ],
  }),

  settings: () => ({
    heading: "Settings",
    buttons: [
      {
        label: "Your apps",
        sub: netflixOn() ? "Netflix is on" : "No apps on yet",
        icon: "tv",
        onSelect: () => go("connections"),
      },
      { label: "What Glance remembers", sub: "Coming soon", icon: "clock", disabled: true },
    ],
  }),

  // Asks before doing something the person might not mean to do. The safe
  // choice comes first and is highlighted, so a stray look changes nothing.
  confirm: ({ heading, intro, yes, no, onYes }) => ({
    heading,
    intro,
    buttons: [
      { label: no, primary: true, onSelect: back },
      {
        label: yes,
        onSelect: async () => {
          await onYes();
          back();
        },
      },
    ],
  }),

  find: () => ({
    heading: "Find a show",
    buttons: [
      {
        label: "Search by name",
        icon: "search",
        onSelect: () => {
          search.query = "";
          search.group = null;
          go("search");
        },
      },
      {
        label: "Shows you've started",
        icon: "clock",
        disabled: !startedShows().length,
        onSelect: () => go("started", 0),
      },
    ],
  }),

  started: (page) => {
    const shows = startedShows();
    const pages = Math.ceil(shows.length / 3);
    return {
      heading: "Shows you've started",
      buttons: shows.slice(page * 3, page * 3 + 3).map(showButton),
      onElse: pages > 1 ? () => replace("started", (page + 1) % pages) : null,
    };
  },

  search: () => {
    const results = searchResults();
    let keys;
    if (search.group) {
      keys = [...search.group].map((letter) => ({ label: letter, onSelect: () => addLetter(letter) }));
      if (search.group === "UVWXYZ") keys.push({ label: "Space", onSelect: () => addLetter(" ") });
    } else {
      keys = LETTER_GROUPS.map((group) => ({
        label: `${group[0]}–${group.at(-1)}`,
        onSelect: () => {
          search.group = group;
          render();
        },
      }));
      keys.push({ label: "Delete", icon: "backspace", disabled: !search.query, onSelect: deleteLetter });
    }
    return {
      heading: "Search by name",
      query: search.query,
      buttons: results.items.map(showButton),
      keys,
      note: results.note,
      // While picking a letter, Back returns to the letter groups.
      onBack: search.group
        ? () => {
            search.group = null;
            render();
          }
        : undefined,
    };
  },

  playing: (item) => ({
    heading: `Watching ${item.title}`,
    buttons: [{ label: "Pause / Play", icon: "pause", onSelect: () => tellAdapter("togglePause") }],
  }),
};

// ---------- Navigation and drawing ----------

function go(name, arg) {
  if (current) trail.push(current);
  current = { name, arg };
  render();
}

function replace(name, arg) {
  current = { name, arg };
  render();
}

function back() {
  const previous = trail.pop();
  if (!previous) return;
  current = previous;
  render();
}

function goHome() {
  trail.length = 0;
  replace("home");
}

function makeButton({ label, sub, icon, art, badge, primary, on, disabled, onSelect }) {
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
}

function render() {
  const screen = screens[current.name](current.arg);
  const parts = [];

  if (screen.greeting) {
    const greetingEl = document.createElement("p");
    greetingEl.className = "greeting";
    greetingEl.textContent = screen.greeting;
    parts.push(greetingEl);
  }
  const heading = document.createElement("h1");
  heading.textContent = screen.heading;
  parts.push(heading);
  if (screen.intro) {
    const intro = document.createElement("p");
    intro.className = "intro";
    intro.textContent = screen.intro;
    parts.push(intro);
  }

  if (screen.query !== undefined) {
    const query = document.createElement("div");
    query.className = screen.query ? "query" : "query empty";
    query.textContent = screen.query || "Spell the name…";
    parts.push(query);
  }

  parts.push(...screen.buttons.map(makeButton));

  if (screen.keys) {
    const keys = document.createElement("div");
    keys.className = "keys";
    keys.append(...screen.keys.map(makeButton));
    parts.push(keys);
  }

  statusEl = document.createElement("div");
  statusEl.id = "status";
  statusEl.textContent = screen.note ?? "";
  parts.push(statusEl);

  screenEl.dataset.screen = current.name;
  screenEl.replaceChildren(...parts);

  // Back and Something else stay in the same corners on every screen;
  // they're dimmed when a screen has nothing for them to do.
  const onBack = screen.onBack ?? (trail.length ? back : null);
  backBtn.disabled = !onBack;
  backBtn.onclick = onBack;
  elseBtn.disabled = !screen.onElse;
  elseBtn.onclick = screen.onElse ?? null;
}

function show(message) {
  statusEl.textContent = message;
}

// ---------- Actions ----------

function toggleConnection(id, isOn) {
  const { name } = CONNECTIONS[id];
  if (isOn) {
    go("confirm", {
      heading: `Turn off ${name}?`,
      intro: `Glance will stop working with ${name} until you turn it back on.`,
      no: `Keep ${name} on`,
      yes: "Turn off",
      onYes: () => disconnect(id),
    });
    return;
  }
  turnOn(id);
}

async function turnOn(id) {
  const { name, home } = CONNECTIONS[id];
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
  goHome();
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function play(item) {
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

function addLetter(letter) {
  search.query += letter;
  search.group = null;
  render();
  runSearch();
}

function deleteLetter() {
  search.query = search.query.slice(0, -1);
  render();
  runSearch();
}

// Show Netflix's results for the query; the adapter reads them back to us.
async function runSearch() {
  const query = search.query.trim();
  if (!query) return;
  const tab = await activeTab();
  await chrome.tabs.update(tab.id, { url: `${NETFLIX}/search?q=${encodeURIComponent(query)}` });
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

// ---------- Start ----------

// Redraw when stored data changes (a connection's status, a freshly read row,
// new search results), except while watching, to keep its status message.
chrome.storage.onChanged.addListener(async (_changes, area) => {
  if (area !== "local") return;
  stored = await chrome.storage.local.get();
  if (current && current.name !== "playing") render();
});

chrome.storage.local.get().then((data) => {
  stored = data;
  replace(stored.setupDone ? "home" : "welcome");
});
