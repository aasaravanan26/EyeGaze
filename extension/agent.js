// The agent: Glance's one piece of AI. It suggests titles for "Help me pick"
// and nothing else; every other screen is fixed. This file knows nothing
// about the DOM, Chrome APIs, or any app's pages.

const AGENT_API = "https://openrouter.ai/api/v1/chat/completions";
const AGENT_MODEL = "google/gemma-4-31b-it";

const SYSTEM_PROMPT = `You are Glance, a suggestion engine for people who browse by eye gaze.
Your ONLY job is to suggest things to watch. Playback and navigation are handled by the app.

Rules:
- Return EXACTLY 3 suggestions, each a real, well-known title on one of the person's apps
- Fit the mood you're given; vary the suggestions (no two alike in genre or tone)
- Never repeat anything already suggested in this conversation, and never suggest a show the person has already started
- "title": the exact title as the app lists it, so a search for it finds it; max 4 words
- "why": one short reason, max 6 words, lowercase, no trailing period
- "app": which of the person's apps has it (use the app name you were given)

Return ONLY valid JSON, no markdown fences:
{"suggestions":[{"title":"Ted Lasso","why":"warm and very funny","app":"Netflix"},{"title":"Kitchen Nightmares","why":"loud, silly, easy to watch","app":"YouTube"},{"title":"Derry Girls","why":"sharp teen comedy","app":"Netflix"}]}`;

// What the agent is told when a mood is picked. Apps and started shows are
// passed in by the side panel; the agent never reads storage itself.
function buildPickPrompt(mood, { apps, started }) {
  const lines = [`I'm in the mood for something ${mood.toLowerCase()}.`, `My apps: ${apps.join(", ")}.`];
  if (started.length) lines.push(`Shows I've already started (don't suggest these): ${started.join(", ")}.`);
  lines.push("Suggest 3 things to watch.");
  return lines.join("\n");
}

class Agent {
  #history = [];
  #apiKey = "";

  setApiKey(key) {
    this.#apiKey = key;
  }

  get hasKey() {
    return Boolean(this.#apiKey);
  }

  // Append a user message; returns this for chaining.
  push(userContent) {
    this.#history.push({ role: "user", content: userContent });
    return this;
  }

  // Clear history and optionally seed it with a first user message.
  reset(userContent) {
    this.#history = userContent ? [{ role: "user", content: userContent }] : [];
    return this;
  }

  // Ask for 3 completely different suggestions.
  more() {
    return this.push("Suggest 3 completely different things. Don't repeat anything you already suggested.");
  }

  // Drop a user message that got no answer (after an error) so it can be
  // sent again.
  retry() {
    if (this.#history.at(-1)?.role === "user") this.#history.pop();
    return this.push("Something went wrong. Please suggest 3 things to watch again.");
  }

  // Call the model with the recent history. Returns an array of
  // { title, why, app }. Full history is kept locally so More never repeats;
  // only the last 3 turns are sent to keep requests small.
  async step() {
    const messages = this.#history.slice(-6);
    const body = JSON.stringify({
      model: AGENT_MODEL,
      max_tokens: 400,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    });

    let res;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(AGENT_API, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.#apiKey}`, "content-type": "application/json" },
        body,
      });
      if (res.status !== 429) break;
      // Rate limited: wait before trying again (2s, then 4s).
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${res.status}: ${text.slice(0, 120)}`);
    }

    const data = await res.json();
    const raw = data.choices[0].message.content
      .trim()
      .replace(/^```[a-z]*\n?/, "")
      .replace(/```$/, "")
      .trim();
    const result = JSON.parse(raw);
    const suggestions = (result.suggestions ?? []).filter((s) => s?.title).slice(0, 3);
    if (!suggestions.length) throw new Error("No suggestions in reply");

    this.#history.push({ role: "assistant", content: JSON.stringify({ suggestions }) });
    return suggestions;
  }
}
