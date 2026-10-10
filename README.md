# EyeGaze

Let people with ALS use apps through Eyegaze in about **3 selections instead of about 25**.

## Screen layout

- 2–4 huge buttons per screen, with lots of spacing between them.
- "Back" and "Something else" stay in the same corners on every screen.
- A rest zone where looking never triggers anything.
- A big selection counter at the top: "3 selections · regular app: ~25."

## Dwell to select

- A fill animation shows on the button you're looking at; looking away cancels it.
- Dwell time is adjustable, defaulting to about 1 second.

## Flow

1. Home: Continue (based on memory), Watch, YouTube, plus settings.
2. One question, e.g. "Funny or gripping?"
3. Three posters, large with titles.
4. Playing, with gaze controls for pause, back 10s, next episode, and exit.

## Agent rules

- Ask at most one question before showing real options.
- Memory skips steps whenever it can.
- Confirm before anything irreversible.

## Build order

1. Dwell buttons plus the flow with hard-coded options.
2. Netflix adapter (search and play).
3. Agent generating the questions and options.
4. Memory and the YouTube adapter.
5. Final testing on Eyegaze.

## Demo

Home → Funny → poster → playing, with the counter showing 3, then the same flow on YouTube.
