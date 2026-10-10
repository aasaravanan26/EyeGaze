// The side panel: Glance's screens of big buttons. Every screen works across
// all connected apps; each app's details live in connections.js.

// Everything Glance keeps in chrome.storage.local on this device:
//   "setupDone": first-time setup has been finished
//   "connections": which apps are on, e.g. { netflix: true }
//   "<app>.connectedAt": when the app's adapter last saw its home page
//   "<app>.continueWatching": the app's own "continue" list, read by its adapter
//   "<app>.search": the app's latest search results, read by its adapter
//   "lastWatched": the last thing Glance started playing, e.g. { service, id, ... }
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
// Four groups plus Space and Delete make six big keys.
const LETTER_GROUPS = ["ABCDEF", "GHIJKL", "MNOPQR", "STUVWXYZ"];
const search = { query: "", group: null, startedAt: 0, page: 0 };

// Results are shown three at a time; Something else shows the next three.
const PAGE_SIZE = 3;

// Results from several apps arrive at different times. Wait this long for
// all of them before showing the list, so it doesn't reshuffle under the
// person's eyes.
const SETTLE_MS = 1500;

// A selection shows a brief confirmation fill before anything happens.
const CONFIRM_MS = 180;

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
  space: '<path d="M4 10v4h16v-4"/>',
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

// ---------- Data across connected apps ----------

// The apps that are on, in preference order. (For now that's the order in
// connections.js; later, memory can put the most-used app first.)
const connectedApps = () => Object.keys(CONNECTIONS).filter((id) => stored.connections?.[id]);
const anyConnected = () => connectedApps().length > 0;
const appName = (id) => CONNECTIONS[id]?.name ?? id;

// Shows the person has started, across every connected app, most recent
// first. Each app's list keeps its own order; Glance's last play counts too.
function startedShows() {
  const shows = [];
  for (const service of connectedApps()) {
    const list = stored[`${service}.continueWatching`];
    list?.items.forEach((item, index) => {
      shows.push({ ...item, service, seenAt: (list.updatedAt ?? 0) - index });
    });
  }
  const last = stored.lastWatched;
  if (last && stored.connections?.[last.service]) {
    const match = shows.find((show) => show.service === last.service && show.id === last.id);
    if (match) match.seenAt = Math.max(match.seenAt, last.at);
    else shows.push({ ...last, seenAt: last.at });
  }
  return shows.sort((a, b) => b.seenAt - a.seenAt);
}

// Search results from every connected app, merged: take each app's #1, then
// each app's #2, and so on; skip titles already found in a preferred app;
// and put titles that start with what's been spelled first.
function searchResults() {
  const query = search.query.trim();
  if (!query) return { items: [], note: "Spell the name one letter at a time. Matches appear here." };

  const apps = connectedApps();
  const ready = apps
    .map((service) => ({ service, saved: stored[`${service}.search`] }))
    .filter(({ saved }) => saved?.query === query);
  const waiting = apps.length - ready.length;
  const searchingNote = apps.length === 1 ? `Searching ${appName(apps[0])}…` : "Searching your apps…";
  if (waiting && Date.now() - search.startedAt < SETTLE_MS) return { items: [], note: searchingNote };

  const merged = [];
  const titles = new Set();
  const longest = Math.max(...ready.map(({ saved }) => saved.items.length), 0);
  for (let rank = 0; rank < longest; rank++) {
    for (const { service, saved } of ready) {
      const item = saved.items[rank];
      const key = item?.title.toLowerCase();
      if (!item || titles.has(key)) continue;
      titles.add(key);
      merged.push({ ...item, service });
    }
  }
  const startsWithQuery = (item) => item.title.toLowerCase().startsWith(query.toLowerCase());
  merged.sort((a, b) => startsWithQuery(b) - startsWithQuery(a));

  if (!merged.length) {
    return { items: [], pages: 0, note: waiting ? searchingNote : "No matches yet. Add another letter." };
  }
  const pages = Math.ceil(merged.length / PAGE_SIZE);
  const page = search.page % pages;
  let note = waiting ? "Still searching…" : "";
  if (pages > 1) note = `Page ${page + 1} of ${pages}. Something else shows more.`;
  return { items: merged.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), pages, note };
}

const showButton = (item) => ({
  label: item.title,
  sub: appName(item.service),
  art: item.image,
  icon: "play",
  onSelect: () => play(item),
});

// An app's card in setup: look at it to turn it on or off.
function connectionButton(id) {
  const { name, icon, setupHint } = CONNECTIONS[id];
  const on = Boolean(stored.connections?.[id]);
  let sub = "Look here to turn on";
  if (on) sub = stored[`${id}.connectedAt`] ? "✓ Connected" : setupHint;
  return {
    label: name,
    sub,
    icon,
    badge: on ? "On" : "Off",
    on,
    immediate: true,
    onSelect: () => toggleConnection(id, on),
  };
}

// ---------- Screens ----------

const screens = {
  // First-time setup

  welcome: () => ({
    heading: "Welcome to Glance",
    intro: "First, let's connect the apps you use. You only need to do this once.",
    buttons: [{ label: "Set up", icon: "next", primary: true, onSelect: () => go("connections") }],
  }),

  connections: () => ({
    heading: "Which apps do you use?",
    intro: "Look at an app to turn it on or off.",
    buttons: [
      ...Object.keys(CONNECTIONS).map(connectionButton),
      ...COMING_SOON.map(({ name, icon }) => ({
        label: name,
        sub: "Coming soon",
        icon,
        badge: "Soon",
        disabled: true,
      })),
      {
        label: "Done",
        icon: "check",
        onSelect: () => (stored.setupDone ? back() : go("ready")),
      },
    ],
  }),

  ready: () => ({
    heading: "You're all set",
    intro: "Your choices will appear here as big buttons. Look at one to pick it.",
    buttons: [{ label: "Start", icon: "next", primary: true, onSelect: finishSetup }],
  }),

  // Everyday

  home: () => {
    const item = startedShows()[0];
    const buttons = [];
    if (item) {
      buttons.push({
        ...showButton(item),
        sub: `Continue watching · ${appName(item.service)}`,
        primary: true,
      });
    }
    buttons.push(
      {
        label: "Help me pick",
        icon: "sparkle",
        disabled: !anyConnected(),
        onSelect: () => show("Coming next: one question, then three posters."),
      },
      {
        label: "Find a show",
        icon: "search",
        disabled: !anyConnected(),
        onSelect: () => go("find"),
      }
    );
    return {
      greeting: greeting(),
      heading: "What are you in the mood for?",
      buttons,
      note: anyConnected() ? "" : "No apps are on yet. Look at Something else, then Settings.",
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
        sub: anyConnected() ? `On: ${connectedApps().map(appName).join(", ")}` : "No apps on yet",
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
          search.page = 0;
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
    } else {
      keys = LETTER_GROUPS.map((group) => ({
        label: `${group[0]}–${group.at(-1)}`,
        onSelect: () => {
          search.group = group;
          render();
        },
      }));
      keys.push(
        { label: "Space", icon: "space", disabled: !search.query.trim(), onSelect: () => addLetter(" ") },
        { label: "Delete", icon: "backspace", disabled: !search.query, onSelect: deleteLetter }
      );
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
      // Something else shows the next three matches.
      onElse:
        results.pages > 1
          ? () => {
              search.page += 1;
              render();
            }
          : null,
    };
  },

  playing: (item) => ({
    heading: `Watching ${item.title}`,
    intro: `On ${appName(item.service)}`,
    buttons: [
      {
        label: "Pause / Play",
        icon: "pause",
        onSelect: () => tellAdapter(item.service, "togglePause"),
      },
    ],
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

// Selecting fills the button with the accent color for a moment before the
// action runs, so the person can see their look (or click) counted.
// "immediate" actions run straight away: Chrome only shows a permission
// prompt in direct response to the click.
let selecting = false;

function select(button, action, { immediate = false } = {}) {
  if (selecting) return;
  button.classList.add("selected");
  // Clear the fill afterwards, for actions that stay on the same screen.
  const run = async () => {
    try {
      await action();
    } finally {
      button.classList.remove("selected");
    }
  };
  if (immediate) {
    run();
    return;
  }
  selecting = true;
  setTimeout(() => {
    selecting = false;
    run();
  }, CONFIRM_MS);
}

function makeButton({ label, sub, icon, art, badge, primary, on, disabled, immediate, onSelect }) {
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
  const labelEl = document.createElement("span");
  labelEl.className = "label";
  labelEl.textContent = label;
  if (sub && primary) text.append(subEl(sub));
  text.append(labelEl);
  if (sub && !primary) text.append(subEl(sub));
  button.append(text);

  if (badge) {
    const badgeEl = document.createElement("span");
    badgeEl.className = "badge";
    badgeEl.textContent = badge;
    button.append(badgeEl);
  }
  button.disabled = Boolean(disabled);
  if (onSelect) button.addEventListener("click", () => select(button, onSelect, { immediate }));
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
  const onElse = screen.onElse ?? null;
  for (const [button, action] of [[backBtn, onBack], [elseBtn, onElse]]) {
    button.classList.remove("selected");
    button.disabled = !action;
    button.onclick = action ? () => select(button, action) : null;
  }
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

// Apps that need a tab to search (like Netflix) search in a helper tab that
// Glance keeps inside a collapsed "Glance" tab group: out of sight, and never
// the tab the person is watching.
const HELPER_GROUP = "Glance";

async function searchInHelperTab(service, url) {
  const windowId = (await chrome.windows.getCurrent()).id;
  const [group] = await chrome.tabGroups.query({ title: HELPER_GROUP, windowId });
  if (group) {
    const tabs = await chrome.tabs.query({ groupId: group.id, url: CONNECTIONS[service].origins });
    const helper = tabs.find((tab) => !tab.active);
    if (helper) {
      await chrome.tabs.update(helper.id, { url });
      return;
    }
  }
  const tab = await chrome.tabs.create({ url, active: false, windowId });
  const groupId = await chrome.tabs.group(
    group ? { tabIds: tab.id, groupId: group.id } : { tabIds: tab.id, createProperties: { windowId } }
  );
  await chrome.tabGroups.update(groupId, { title: HELPER_GROUP, color: "orange", collapsed: true });
}

async function play(item) {
  const tab = await activeTab();
  await chrome.tabs.update(tab.id, { url: CONNECTIONS[item.service].watchUrl(item) });
  chrome.storage.local.set({
    lastWatched: {
      service: item.service,
      id: item.id,
      title: item.title,
      image: item.image ?? null,
      position: item.position ?? null,
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

// Search every connected app at once.
async function runSearch() {
  search.page = 0;
  const query = search.query.trim();
  if (!query) return;
  search.startedAt = Date.now();
  // Show whatever has arrived once the settle time is up.
  setTimeout(() => current.name === "search" && render(), SETTLE_MS);

  const apps = connectedApps();

  // Apps that can search without a tab (like YouTube) do so directly; their
  // results are saved just as an adapter would save them. A slow answer for
  // an earlier spelling is dropped.
  for (const service of apps.filter((id) => CONNECTIONS[id].fetchResults)) {
    CONNECTIONS[service]
      .fetchResults(query)
      .catch(() => [])
      .then((items) => {
        if (search.query.trim() !== query) return;
        chrome.storage.local.set({ [`${service}.search`]: { query, items, at: Date.now() } });
      });
  }

  // The others open their search page in a tab, and their adapter reads the
  // results back. Searching never touches what's being watched: if the person
  // is already browsing that app, it searches right there (quick, and the
  // results are visible); otherwise it uses a hidden helper tab.
  const tabApps = apps.filter((id) => !CONNECTIONS[id].fetchResults);
  if (!tabApps.length) return;
  const active = await activeTab();
  await Promise.all(
    tabApps.map(async (service) => {
      const { site, isWatching, searchUrl } = CONNECTIONS[service];
      const url = searchUrl(query);
      if (active?.url?.startsWith(site) && !isWatching(active.url)) {
        await chrome.tabs.update(active.id, { url });
      } else {
        await searchInHelperTab(service, url);
      }
    })
  );
}

// Send an action to an app's adapter, running inside the current tab.
async function tellAdapter(service, action) {
  const { name, site } = CONNECTIONS[service];
  const tab = await activeTab();
  if (!tab?.url?.startsWith(site)) {
    show(`Open ${name} in this tab first.`);
    return;
  }
  try {
    const result = await chrome.tabs.sendMessage(tab.id, { action });
    show(result.message);
  } catch {
    show(`Glance isn't connected to this tab yet. Reload the ${name} page and try again.`);
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
