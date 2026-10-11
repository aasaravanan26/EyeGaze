# How does Glance memory work?

Every look takes effort. Glance's memory exists to save looks: it learns what you tend to enjoy so the option you most likely want is already first on the screen.

It follows one rule above all: **memory helps, but you decide.**

## What memory does

- **It reorders, never decides.** Likely choices come first, but every option stays on screen. Glance never skips a step or hides a choice because it thinks it knows better.
- **It picks up where you left off.** "Continue" shows the show you were last watching, so starting it again takes a single look.
- **It stays quiet.** There are no "because you…" messages while you're choosing. If you want to know why Glance suggests something, it's all on the Settings page.

## What Glance remembers

| What | Example | Why it helps |
|---|---|---|
| What you're watching | Your place in a show | "Continue" is one look away |
| Shows you like | "I like this" while watching | Suggestions lean the same way |
| Your mood picks | Funny more often than gripping | Funny options appear first |
| Time of day | Comedy in the evening | Suggestions fit the moment |
| Your favorite apps | Netflix more than YouTube | The app you use most comes first |
| Shows you passed on | Skipped with "Something else" | They don't keep coming back |

Glance remembers **patterns, not a diary**. It keeps tendencies like "usually picks funny in the evening," not a log of everything you've watched.

Time of day is split into four parts: **morning, afternoon, evening and night**.

## How it learns

- **It takes a few picks to get started.** Glance waits for about three choices before it starts reordering, so one random pick doesn't reshape everything.
- **Recent choices count more.** Tastes change, so what you picked last week matters more than what you picked months ago. Old habits fade gradually.
- **Passing on a show means "not right now."** A show you skip stays away for a few weeks, then may come back.
- **"Continue" comes from the app itself.** Netflix already knows where you left off, so Glance reads its "Continue Watching" row instead of guessing. If that isn't available, Glance uses the last thing it played for you.

## You're in control

- **Glance's memory belongs to one person**, the person using the device.
- **See what Glance has learned.** Settings describes it in plain, friendly sentences, like *"You usually like funny shows in the evening"* or *"You watch Netflix most."*
- **Clear it whenever you like.** Settings works fully by eye. Because clearing can't be undone, Glance asks you to confirm first.
- **Watch without being remembered.** A "don't remember" option lets you watch something without it affecting future suggestions.

## Privacy

- **Your memory stays on your device.** It's stored locally in Chrome, on the device you use. Your viewing history is never uploaded.
- **The AI only sees a short summary.** Help me pick asks an AI model, through the **OpenRouter** service, for suggestions. It sends only the mood you picked, which apps you use, high-level tendencies like "usually funny things in the evening," the few shows you've said you like, and suggestions you recently passed on. It never sees the shows you've watched or started: Glance leaves those out of the suggestions itself, on your device.
- **Uninstalling Glance erases its memory.**

## Where things stand

Glance is early, and memory is being built step by step.

| Feature | Status |
|---|---|
| "Continue" from Netflix's Continue Watching row | ✅ Built |
| Remembering the last thing Glance played | ✅ Built, being tested |
| Mood and time-of-day preferences | ✅ Built, being tested |
| Shows you like ("I like this" while watching) | ✅ Built, being tested |
| Passed-on shows | ✅ Built, being tested |
| Settings: see what Glance remembers | ✅ Built |
| Settings: clear what Glance learned | ✅ Built, being tested |
| Settings: "don't remember" | Planned |
| App preferences | Planned |
| Short summary for the AI | ✅ Built, being tested |
