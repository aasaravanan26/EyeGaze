// The side panel: Glance's screens of big buttons. Every screen works across
// all connected apps; each app's details live in connections.js.

// Everything Glance keeps in chrome.storage.local on this device:
//   "setupDone": first-time setup has been finished
//   "connections": which apps are on, e.g. { netflix: true }
//   "<app>.connectedAt": when the app's adapter last saw its home page
//   "<app>.continueWatching": the app's own "continue" list, read by its adapter
//   "<app>.search": the app's latest search results, read by its adapter
//   "lastWatched": the last thing Glance started playing, e.g. { service, id, ... }
//   "apiKey": the OpenRouter key that powers Help me pick (see agent.js)
//   "memory": what Glance has learned (see docs/memory.md):
//     { likes: [{ title, service, at }], moods: [{ mood, part, at }], passed: [{ title, at }] }
let stored = {};

// The agent suggests titles for Help me pick. Everything else is fixed.
const agent = new Agent();
// Each mood has its own wording, so sentences read naturally:
//   ask: what the agent is told ("I'm in the mood for something funny")
//   habit: how a habit is described ("you usually pick funny things")
//   heading: the suggestions screen's heading
const MOODS = [
  { label: "Funny", ask: "something funny", habit: "funny things", heading: "Something funny" },
  { label: "Gripping", ask: "something gripping", habit: "gripping things", heading: "Something gripping" },
  { label: "Relaxing", ask: "something relaxing", habit: "relaxing things", heading: "Something relaxing" },
  { label: "Surprise me", ask: "anything, so surprise me", habit: "surprises", heading: "Three surprises" },
];
const moodByLabel = (label) => MOODS.find((mood) => mood.label === label);
// The suggestions on show, so Back can return to them without asking again.
// phase: "thinking" (asking the AI) or "finding" (checking the apps).
// retryWith: how Try again asks: resend ("retry") or ask for new titles ("more").
const suggest = {
  mood: null,
  items: [],
  loading: false,
  phase: "thinking",
  error: "",
  retryWith: "retry",
  request: 0,
};

const screenEl = document.getElementById("screen");
const backBtn = document.getElementById("back");
const homeBtn = document.getElementById("home");
const elseBtn = document.getElementById("else");
let statusEl;
let fieldEl;

// Navigation: the screen on show, plus the trail of screens that led here.
// Back always returns along the trail.
let current = null;
const trail = [];

// Search by name: letters are picked in two looks (a group, then a letter).
// Four groups plus Space and Delete make six big keys.
const LETTER_GROUPS = ["ABCDEF", "GHIJKL", "MNOPQR", "STUVWXYZ"];
const search = {
  query: "",
  group: null,
  startedAt: 0,
  page: 0,
  // The results on screen for a spelling, kept stable as late matches arrive.
  shown: { query: null, items: [] },
};

// Results are shown three at a time; Something else shows the next three.
const PAGE_SIZE = 3;

// Results from several apps arrive at different times. Wait for all of them
// (but no longer than this) before showing the list, so one fast app doesn't
// claim the screen and the list doesn't reshuffle under the person's eyes.
const SETTLE_MS = 4000;

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
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  settings:
    '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  backspace: '<path d="M21 5H9l-6 7 6 7h12z"/><path d="M13 10l4 4M17 10l-4 4"/>',
  space: '<path d="M4 10v4h16v-4"/>',
  rewind: '<path d="M11 7l-6 5 6 5z"/><path d="M19 7l-6 5 6 5z"/>',
  forward: '<path d="M13 7l6 5-6 5z"/><path d="M5 7l6 5-6 5z"/>',
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

// ---------- Memory ----------

// Patterns, not a diary: a few liked shows, which moods get picked when, and
// shows passed on lately. Everything stays in chrome.storage.local.
const MEMORY_LIMIT = { likes: 30, moods: 60, passed: 30 };
const PASSED_FOR_MS = 21 * 24 * 60 * 60 * 1000;

const memory = () => ({ likes: [], moods: [], passed: [], ...stored.memory });

// Add an entry to one of memory's lists, keeping the newest. Updates
// "stored" right away so the screen can redraw without waiting.
function remember(list, entry) {
  const next = memory();
  next[list] = [...next[list], { ...entry, at: Date.now() }].slice(-MEMORY_LIMIT[list]);
  stored.memory = next;
  return chrome.storage.local.set({ memory: next });
}

function dayPart(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

const likedTitles = () => memory().likes.map((like) => like.title);
const isLiked = (item) => memory().likes.some((like) => like.title === item.title && like.service === item.service);
const passedTitles = () =>
  memory()
    .passed.filter((entry) => Date.now() - entry.at < PASSED_FOR_MS)
    .map((entry) => entry.title);

// The mood (from MOODS) picked most at this time of day, once there are a
// few picks to go on (one random pick shouldn't reshape everything).
function usualMood(part = dayPart()) {
  const picks = memory().moods.filter((pick) => pick.part === part);
  if (picks.length < 3) return null;
  const counts = {};
  for (const pick of picks) counts[pick.mood] = (counts[pick.mood] ?? 0) + 1;
  return moodByLabel(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) ?? null;
}

// "in the morning", ..., "at night"
const duringPart = (part) => (part === "night" ? "at night" : `in the ${part}`);

// Plain sentences for Settings, so the person can see what Glance has learned.
function memorySentences() {
  const lines = [];
  const likes = likedTitles();
  if (likes.length) lines.push(`You like ${likes.slice(-3).reverse().join(", ")}${likes.length > 3 ? " and more" : ""}.`);
  for (const part of ["morning", "afternoon", "evening", "night"]) {
    const mood = usualMood(part);
    if (mood) lines.push(`You usually pick ${mood.habit} ${duringPart(part)}.`);
  }
  const passed = passedTitles();
  if (passed.length) lines.push(`You passed on ${passed.length} suggestion${passed.length > 1 ? "s" : ""} lately.`);
  return lines;
}

// ---------- Data across connected apps ----------

// The apps that are on, in preference order. (For now that's the order in
// connections.js; later, memory can put the most-used app first.)
const connectedApps = () => Object.keys(CONNECTIONS).filter((id) => stored.connections?.[id]);
const anyConnected = () => connectedApps().length > 0;
const appName = (id) => CONNECTIONS[id]?.name ?? id;

// "Netflix", "Netflix and YouTube", "A, B, and C"
function listJoin(items) {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

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

// Search results from every connected app, merged for "Find a show":
// - Shows (streaming apps) come before videos (YouTube), which always has
//   something for any spelling and would otherwise crowd shows out. Each page
//   of three holds two shows and one video, topping up from the other kind
//   when one runs out.
// - Within each kind, apps take turns (each app's #1, then each #2, ...), and
//   titles that start with what's been spelled come first.
// - A title already found in a preferred app is skipped.
function mergeResults(query, ready) {
  const startsWithQuery = (item) => item.title.toLowerCase().startsWith(query.toLowerCase());
  const ofKind = (kind) => {
    const lists = ready
      .filter(({ service }) => (CONNECTIONS[service].kind ?? "shows") === kind)
      .map(({ service, saved }) => saved.items.map((item) => ({ ...item, service })));
    const turns = [];
    const longest = Math.max(0, ...lists.map((list) => list.length));
    for (let rank = 0; rank < longest; rank++) {
      for (const list of lists) if (list[rank]) turns.push(list[rank]);
    }
    return turns.sort((a, b) => startsWithQuery(b) - startsWithQuery(a));
  };
  const shows = ofKind("shows");
  const videos = ofKind("videos");

  const merged = [];
  const titles = new Set();
  const take = (list) => {
    while (list.length) {
      const item = list.shift();
      const key = item.title.toLowerCase();
      if (titles.has(key)) continue;
      titles.add(key);
      return item;
    }
    return null;
  };
  while (shows.length || videos.length) {
    for (const [first, fallback] of [[shows, videos], [shows, videos], [videos, shows]]) {
      const item = take(first) ?? take(fallback);
      if (item) merged.push(item);
    }
  }
  return merged;
}

// What the search screen shows: the results for this page, or a short
// message for the results area when there are none. Once results are on
// screen they stay put: matches that arrive later (if an app answers after
// the wait is over) are slotted in right after the page being looked at, so
// the next Something else shows them, instead of replacing or reshuffling
// what the person is looking at.
function searchResults() {
  const query = search.query.trim();
  if (!query) return { items: [], message: "" };

  const apps = connectedApps();
  const ready = apps
    .map((service) => ({ service, saved: stored[`${service}.search`] }))
    .filter(({ saved }) => saved?.query === query);
  const waiting = apps.length - ready.length;
  if (waiting && Date.now() - search.startedAt < SETTLE_MS) return { items: [], message: "Searching…" };

  const merged = mergeResults(query, ready);
  const shown = search.shown;
  if (shown.query !== query) {
    if (merged.length) search.shown = { query, items: merged };
  } else {
    const keys = new Set(shown.items.map((item) => `${item.service}:${item.id}`));
    const titles = new Set(shown.items.map((item) => item.title.toLowerCase()));
    const late = merged.filter(
      (item) => !keys.has(`${item.service}:${item.id}`) && !titles.has(item.title.toLowerCase())
    );
    if (late.length) {
      const visibleEnd = ((search.page % Math.ceil(shown.items.length / PAGE_SIZE)) + 1) * PAGE_SIZE;
      shown.items.splice(visibleEnd, 0, ...late);
    }
  }

  const items = search.shown.query === query ? search.shown.items : [];
  if (!items.length) {
    return { items: [], pages: 0, message: waiting ? "Searching…" : "No matches yet" };
  }
  const pages = Math.ceil(items.length / PAGE_SIZE);
  const page = search.page % pages;
  return { items: items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), pages };
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

  // The Continue card shows the most recent started show; Something else
  // swaps it for the next one.
  home: (offset = 0) => {
    const shows = startedShows();
    const item = shows.length ? shows[offset % shows.length] : null;
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
        onSelect: () => (agent.hasKey ? go("pick") : go("aiKey")),
      },
      {
        label: "Find a show",
        icon: "search",
        disabled: !anyConnected(),
        onSelect: () => go("find"),
      },
      // Quieter than the main choices, but always visible.
      { label: "Settings", icon: "settings", minor: true, onSelect: () => go("settings") }
    );
    return {
      greeting: greeting(),
      // Help me pick asks about mood next, so home asks something else.
      heading: "What would you like to watch?",
      buttons,
      note: anyConnected() ? "" : "No apps are on yet. Look at Settings to add one.",
      onElse: shows.length > 1 ? () => replace("home", offset + 1) : null,
    };
  },

  settings: () => ({
    heading: "Settings",
    buttons: [
      {
        label: "Your apps",
        sub: anyConnected() ? `On: ${listJoin(connectedApps().map(appName))}` : "No apps on yet",
        icon: "tv",
        onSelect: () => go("connections"),
      },
      {
        label: "Help me pick",
        sub: agent.hasKey ? "✓ AI key saved" : "Needs an AI key",
        icon: "sparkle",
        onSelect: () => go("aiKey"),
      },
      { label: "What Glance remembers", icon: "clock", onSelect: () => go("memory") },
    ],
  }),

  // What Glance remembers, in plain sentences: where you are in your shows,
  // and what Help me pick has learned. ("Don't remember" comes later; see
  // docs/memory.md.)
  memory: () => {
    const shows = startedShows();
    const facts = [];
    if (shows.length) {
      const latest = shows[0];
      const where = `${latest.title} on ${appName(latest.service)}`;
      const noun = shows.some((show) => CONNECTIONS[show.service]?.kind === "videos")
        ? "shows and videos"
        : "shows";
      facts.push(
        shows.length === 1
          ? `You're partway through ${where}.`
          : `You're partway through ${shows.length} ${noun}. The most recent is ${where}.`
      );
    } else {
      facts.push("You haven't started anything yet.");
    }
    facts.push(
      anyConnected() ? `You watch on ${listJoin(connectedApps().map(appName))}.` : "No apps are on yet."
    );
    const learned = memorySentences();
    if (learned.length) facts.push(...learned);
    else facts.push("As you choose, Glance will learn what you enjoy, like funny shows in the evening.");
    facts.push("All of this stays on this device.");
    return {
      heading: "What Glance remembers",
      intro: "Glance remembers a little, so what you want is usually the first thing you see.",
      facts,
      buttons: [
        {
          label: "Forget what Glance learned",
          icon: "backspace",
          disabled: !learned.length,
          onSelect: () =>
            go("confirm", {
              heading: "Forget what Glance learned?",
              intro: "Your likes, mood picks and passed-on shows are cleared. This can't be undone.",
              no: "Keep it",
              yes: "Forget",
              onYes: () => {
                delete stored.memory;
                return chrome.storage.local.remove("memory");
              },
            }),
        },
      ],
    };
  },

  // Help me pick needs a key for the AI service. This is typed once, by
  // whoever sets Glance up; everything after that works by eye.
  aiKey: () => ({
    heading: "Help me pick",
    intro: agent.hasKey
      ? "Your AI key is saved. Paste a new one to replace it."
      : "Help me pick uses an AI service to suggest shows. Paste an OpenRouter key to turn it on.",
    field: { placeholder: "sk-or-…" },
    buttons: [
      { label: "Save key", icon: "check", primary: true, onSelect: saveApiKey },
      { label: "Remove key", disabled: !agent.hasKey, onSelect: clearApiKey },
    ],
  }),

  // Help me pick: one question, then three suggestions. Picking a suggestion
  // plays it straight away when the app has that exact title (Home → mood →
  // suggestion → playing: three looks); otherwise the search results show.
  pick: () => ({
    heading: "What are you in the mood for?",
    buttons: MOODS.map((mood) => ({
      label: mood.label,
      icon: "sparkle",
      onSelect: () => startSuggestions(mood),
    })),
  }),

  // Suggestions are only shown once they've been found on the person's apps,
  // so picking one plays it straight away.
  suggest: () => {
    let message = "";
    if (suggest.loading) {
      message =
        suggest.phase === "finding"
          ? `Finding them on ${listJoin(connectedApps().map(appName))}…`
          : "Thinking of ideas…";
    } else if (suggest.error) {
      message = suggest.error;
    }
    const retry = () => fetchSuggestions(suggest.retryWith === "more" ? agent.more() : agent.retry());
    const buttons = suggest.error
      ? [{ label: "Try again", icon: "next", onSelect: retry }]
      : suggest.loading
        ? []
        : suggest.items.map((item) => ({
            label: item.title,
            sub: [item.why, appName(item.service)].filter(Boolean).join(" · "),
            art: item.image,
            icon: "play",
            onSelect: () => play(item),
          }));
    return {
      heading: suggest.mood?.heading ?? "",
      message,
      buttons,
      onElse:
        suggest.loading || suggest.error
          ? null
          : () => {
              // Passing on three suggestions means "not right now".
              for (const item of suggest.items) remember("passed", { title: item.title });
              fetchSuggestions(agent.more());
            },
    };
  },

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
      // No heading here: the query bar says what to do, and the keys get the room.
      query: search.query,
      buttons: [],
      // The results area is always the same size, so the keys never move.
      results: { items: results.items.map(showButton), message: results.message },
      keys,
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
        primary: true,
        onSelect: () => control(item.service, "togglePause"),
      },
      // Saying you like a show teaches Help me pick what to suggest next.
      isLiked(item)
        ? { label: "You like this", icon: "heart", on: true, disabled: true }
        : {
            label: "I like this",
            icon: "heart",
            onSelect: async () => {
              await remember("likes", { title: item.title, service: item.service });
              render();
            },
          },
    ],
    keys: [
      { label: "Rewind 10s", icon: "rewind", onSelect: () => control(item.service, "seek", -10) },
      { label: "Forward 10s", icon: "forward", onSelect: () => control(item.service, "seek", 10) },
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

function makeButton({ label, sub, icon, art, badge, primary, minor, on, disabled, immediate, onSelect }) {
  const button = document.createElement("button");
  button.className = ["btn", primary && "primary", minor && "minor", on && "on"]
    .filter(Boolean)
    .join(" ");

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
  if (screen.heading) {
    const heading = document.createElement("h1");
    heading.textContent = screen.heading;
    parts.push(heading);
  }
  if (screen.intro) {
    const intro = document.createElement("p");
    intro.className = "intro";
    intro.textContent = screen.intro;
    parts.push(intro);
  }

  if (screen.field) {
    fieldEl = document.createElement("input");
    fieldEl.className = "field";
    fieldEl.type = "password";
    fieldEl.placeholder = screen.field.placeholder ?? "";
    fieldEl.autocomplete = "off";
    parts.push(fieldEl);
  } else {
    fieldEl = null;
  }

  if (screen.query !== undefined) {
    const query = document.createElement("div");
    query.className = "query";
    query.append(iconEl("search"), screen.query);
    parts.push(query);
  }

  // A message in the middle of the screen, for while something is loading
  // (or didn't work).
  if (screen.message) {
    const message = document.createElement("div");
    message.className = "message-box";
    message.textContent = screen.message;
    parts.push(message);
  }

  if (screen.facts) {
    const facts = document.createElement("ul");
    facts.className = "facts";
    for (const fact of screen.facts) {
      const li = document.createElement("li");
      li.textContent = fact;
      facts.append(li);
    }
    parts.push(facts);
  }

  parts.push(...screen.buttons.map(makeButton));

  if (screen.results) {
    const results = document.createElement("div");
    results.className = "results";
    if (screen.results.items.length) {
      results.append(...screen.results.items.map(makeButton));
    } else {
      const message = document.createElement("div");
      message.className = "message";
      message.textContent = screen.results.message;
      results.append(message);
    }
    parts.push(results);
  }

  if (screen.keys) {
    const keys = document.createElement("div");
    // Longer letter groups use three columns, keeping keys closer to square.
    keys.className = screen.keys.length > 6 ? "keys wide" : "keys";
    keys.append(...screen.keys.map(makeButton));
    parts.push(keys);
  }

  statusEl = document.createElement("div");
  statusEl.id = "status";
  statusEl.textContent = screen.note ?? "";
  parts.push(statusEl);

  screenEl.dataset.screen = current.name;
  screenEl.replaceChildren(...parts);

  // Back, Home and Something else stay in the same place on every screen;
  // they're dimmed when a screen has nothing for them to do. Home keeps the
  // trail, so Back after an accidental Home returns to where you were.
  const onBack = screen.onBack ?? (trail.length ? back : null);
  const onHome = stored.setupDone && current.name !== "home" ? () => go("home") : null;
  const onElse = screen.onElse ?? null;
  for (const [button, action] of [[backBtn, onBack], [homeBtn, onHome], [elseBtn, onElse]]) {
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

// ---------- Help me pick ----------

async function saveApiKey() {
  const key = fieldEl?.value.trim();
  if (!key) {
    show("Paste a key first.");
    return;
  }
  agent.setApiKey(key);
  await chrome.storage.local.set({ apiKey: key });
  back();
}

async function clearApiKey() {
  agent.setApiKey("");
  await chrome.storage.local.remove("apiKey");
  render();
}

function startSuggestions(mood) {
  suggest.mood = mood;
  suggest.items = [];
  suggest.error = "";
  remember("moods", { mood: mood.label, part: dayPart() });
  // The agent sees a short summary of memory: liked shows, the usual mood
  // at this time of day, and suggestions passed on. Never a viewing history:
  // shows already started are filtered out here, on the device.
  const context = {
    ask: mood.ask,
    apps: connectedApps().map(appName),
    likes: likedTitles().slice(-8).reverse(),
    usual: usualMood()?.habit,
    part: dayPart(),
    avoid: passedTitles(),
  };
  go("suggest");
  fetchSuggestions(agent.reset(buildPickPrompt(context)));
}

// Titles compared loosely: case, accents, punctuation and bracketed notes
// like "(U.S.)" don't matter.
const normalizeTitle = (title) =>
  title
    .replace(/\([^)]*\)/g, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// ---------- Checking suggestions against the real apps ----------

// The AI suggests from general knowledge, so it can be wrong about what an
// app has today. Before a suggestion is shown, Glance looks it up on the app
// the AI named; only titles that are really there are shown, with the app's
// own artwork and ID, so picking one plays it straight away.

// Apps that search in a helper tab (like Netflix) have one tab, so their
// lookups take turns.
const lookupQueue = {};
function inTurn(service, task) {
  const turn = (lookupQueue[service] ?? Promise.resolve()).then(task, task);
  lookupQueue[service] = turn.catch(() => {});
  return turn;
}

// Wait for an app's adapter to save search results for this query. The
// adapter may save an empty list before the page has loaded its results, so
// an empty list only counts once it has stayed empty for a moment (that's
// how a title the app doesn't have looks). Gives up after a while regardless.
const LOOKUP_TIMEOUT_MS = 8000;
const EMPTY_GRACE_MS = 2500;
function waitForResults(service, query) {
  const key = `${service}.search`;
  return new Promise((resolve) => {
    let latest = null;
    let emptyTimer = null;
    const done = () => {
      clearTimeout(timer);
      clearTimeout(emptyTimer);
      resolve(latest ?? []);
      chrome.storage.onChanged.removeListener(listener);
    };
    const timer = setTimeout(done, LOOKUP_TIMEOUT_MS);
    function listener(changes, area) {
      const saved = changes[key]?.newValue;
      if (area !== "local" || saved?.query !== query) return;
      latest = saved.items;
      if (latest.length) done();
      else emptyTimer ??= setTimeout(done, EMPTY_GRACE_MS);
    }
    chrome.storage.onChanged.addListener(listener);
  });
}

// Look a title up on one app. Shows must match exactly; for videos, the top
// result that contains the title counts (YouTube rarely has an exact match).
async function findOnApp(service, title) {
  const connection = CONNECTIONS[service];
  const results = connection.fetchResults
    ? await connection.fetchResults(title).catch(() => [])
    : await inTurn(service, async () => {
        const arrived = waitForResults(service, title);
        await searchInHelperTab(service, connection.searchUrl(title));
        return arrived;
      });
  const wanted = normalizeTitle(title);
  const matches = (result) =>
    connection.kind === "videos"
      ? normalizeTitle(result.title).includes(wanted)
      : normalizeTitle(result.title) === wanted;
  const found = results.find(matches);
  return found ? { ...found, service } : null;
}

// Check one suggestion on the app the AI named (or, if it named an app that
// isn't on, each app in turn). Returns a playable item, or null.
async function verify(suggestion) {
  const named = connectedApps().find((id) => appName(id).toLowerCase() === suggestion.app?.toLowerCase());
  for (const service of named ? [named] : connectedApps()) {
    const found = await findOnApp(service, suggestion.title);
    if (found) return { ...found, why: suggestion.why };
  }
  return null;
}

// How many extra times to ask when filtering and checking leave fewer than three.
const TOP_UP_ATTEMPTS = 2;

// Ask the agent (whose next message has already been queued), then keep only
// suggestions that are new to the person and really on their apps, asking
// for more if that leaves fewer than three. Shows the person has started or
// said they like are dropped here rather than sent to the AI. Nothing is
// shown until all three are ready, so the screen doesn't change under them.
// A reply for a screen the person has left is dropped.
async function fetchSuggestions() {
  const request = ++suggest.request;
  const stale = () => request !== suggest.request;
  suggest.loading = true;
  suggest.phase = "thinking";
  suggest.error = "";
  suggest.retryWith = "retry";
  render();
  try {
    const skip = new Set([...startedShows().map((show) => show.title), ...likedTitles()].map(normalizeTitle));
    const items = [];
    for (let attempt = 0; ; attempt++) {
      suggest.phase = "thinking";
      if (current.name === "suggest") render();
      const reply = await agent.step();
      if (stale()) return;

      const fresh = reply.filter((item) => {
        const key = normalizeTitle(item.title);
        if (skip.has(key)) return false;
        skip.add(key);
        return true;
      });
      suggest.phase = "finding";
      if (current.name === "suggest") render();
      const checked = await Promise.all(fresh.map(verify));
      if (stale()) return;
      items.push(...checked.filter(Boolean));

      if (items.length >= 3 || attempt === TOP_UP_ATTEMPTS) break;
      agent.more();
    }
    if (!items.length) {
      // The AI answered, but none of it is on the person's apps: ask again
      // for different titles rather than resending the same request.
      suggest.retryWith = "more";
      throw new Error("None of the suggestions were found on the apps");
    }
    suggest.items = items.slice(0, 3);
  } catch (error) {
    if (stale()) return;
    suggest.items = [];
    if (/API 401/.test(error.message)) suggest.error = "That AI key didn't work. Check it in Settings.";
    else if (suggest.retryWith === "more") suggest.error = "Couldn't find those on your apps.";
    else suggest.error = "Couldn't get suggestions right now.";
    console.error("[Glance] suggestions failed", error);
  } finally {
    if (!stale()) {
      suggest.loading = false;
      if (current.name === "suggest") render();
    }
  }
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

// Run one of an app's playback controls (see connections.js) inside the page
// playing in the current tab.
async function control(service, action, ...args) {
  const { name, site, controls } = CONNECTIONS[service];
  const tab = await activeTab();
  if (!tab?.url?.startsWith(site)) {
    show(`Open ${name} in this tab first.`);
    return;
  }
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: controls[action],
      args,
    });
    show(result);
  } catch {
    show(`That didn't work on ${name}. Try again in a moment.`);
  }
}

// ---------- Start ----------

// Redraw when stored data changes (a connection's status, a freshly read row,
// new search results), except while watching, to keep its status message.
chrome.storage.onChanged.addListener(async (_changes, area) => {
  if (area !== "local") return;
  stored = await chrome.storage.local.get();
  if (current && !["playing", "aiKey"].includes(current.name)) render();
});

chrome.storage.local.get().then((data) => {
  stored = data;
  if (stored.apiKey) agent.setApiKey(stored.apiKey);
  replace(stored.setupDone ? "home" : "welcome");
});
