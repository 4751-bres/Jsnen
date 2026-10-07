# DeepSeek Agents 📱🤖

A tiny, mobile-first web app that connects **your DeepSeek API key** to any number of
custom **agents**, group chats, and reusable multi-agent workflows. Chat with one agent,
let several agents respond together, or run a structured work-and-critique pipeline from
your **phone's browser** — installable to the home screen.

No server, no build step, no dependencies. It's a static page (`index.html` with `styles.css`,
`core.js`, and `app.js`) that talks to the DeepSeek API directly from your browser (DeepSeek's API
allows browser/CORS requests). Once opened, it also works offline.

---

## How to use it on your phone (2 minutes)

You need to host the page somewhere public over HTTPS. The easiest free option is
**GitHub Pages**, which serves this repo directly.

### 1. Turn on GitHub Pages
1. Go to this repo on GitHub → **Settings** → **Pages**.
2. Under *Build and deployment* → *Source*, choose **Deploy from a branch**.
3. Branch: pick this branch (`claude/deepseek-api-agents-pjh5x7`) — or merge it into
   `main` and pick `main` — folder `/ (root)`. Click **Save**.
4. Wait ~1 minute. GitHub shows a URL like
   `https://<your-username>.github.io/Jsnen/`.

### 2. Open it on your phone
- Open that URL in Safari (iPhone) or Chrome (Android).
- Tap **⚙️ Settings** → paste your **DeepSeek API key** → **Save**.
  - Get a key at <https://platform.deepseek.com/api_keys>.
- Tap **☰** to pick an agent, group, or workflow, then start chatting.

### 3. (Optional) Install it like an app
- **iPhone:** Share button → *Add to Home Screen*.
- **Android:** Chrome menu → *Add to Home screen / Install app*.

That's it — it now behaves like a native app with its own icon.

---

## Features
- **Image understanding** — attach up to four images with 📎, or paste a screenshot, in an agent or group chat. Send an image alone or add a question; in groups, choose a responder after sending. Use `deepseek-flash` (V4.1 Flash) for vision. Images are sent as actual image inputs, not filenames. JPEG, PNG, WebP, and GIF are accepted (GIF uses a still frame); images are resized to at most 1600 pixels and saved with the conversation in this browser. When the latest user turn includes an image, a short image-context instruction accepts fictional casting while keeping visible details distinct from story context. It does not demand an inventory or a lecture, and is not repeated on later text-only turns. Workflow attachments are not yet supported. Browser storage limits apply; a full-storage error preserves the draft.
- **Multiple agents** — ships with General Assistant, Coder, Deep Reasoner, Writer,
  Translator, and Sexual-health Therapist. The therapist is a fictional adult AI character for sexual-health and relationship conversations, not a licensed clinician. It is also added once for existing users without replacing their agents or chats. Like other agents, it can be edited or deleted. Add/edit/delete your own (icon, name, system prompt, model, thinking,
  temperature).
- **Character narration** — single-agent and roleplay-group requests label the responding speaker `[char]` and the user `[user]`; other group characters have named labels. These are added to the API context, leaving saved messages and copied text unchanged. Character instructions encourage a direct first-person voice. Single-asterisk `*actions*` are scene events, displayed in italics: characters react to what happened without silently rewriting the user's actions. Character reactions can still include disagreement. The configured API controls its responses.
- **Group chats** — select several agents, ask a question, then choose one responder or
  tap **Everyone** to hear from every member in order. Other ways to choose who speaks:
  - **@mentions** — write `@Name` (or `@NameWithoutSpaces`) and the mentioned members reply in
    the order you mentioned them.
  - **🎯 Auto** — one small extra request picks the most fitting next speaker.
  - **💬 Discuss ×N** — members reply to each other for N rounds (set per group, 1–10), starting
    after whoever spoke last and never repeating a speaker back to back.
  - **⏭ Skip** — while several members reply in turn, skip only the current speaker; the
    chips show who is replying and who is next.
  - **Speaking order** — in the group editor, ↑ / ↓ set the order used by Everyone and Discuss.
- **Roleplay groups** — turn any group into a persistent scene with your character, one
  character sheet per AI agent, an optional opening scene, and **Continue scene** for
  sequential character replies. Mature roleplay is an explicit browser-local preference;
  the app sends no separate moderation request and the configured API controls its responses.
- **Multi-agent workflows** — build a 2–5-role pipeline from Research, Coding, or
  Decision templates and assign any existing agent to each editable role.
- **Human review checkpoint** — work and critique roles run automatically, then pause so
  you can inspect results, retry a role, add guidance, cancel, or approve final synthesis.
- **Safe recovery** — stop and resume the current role; interrupted runs recover as
  stopped after reload instead of silently restarting API requests.
- **Model per agent** — `deepseek-flash` (fast, cheap, sees images) or `deepseek-v4-pro`
  (flagship reasoning, text only).
  Type any model name your key can access.
- **Thinking mode per agent** — Off / Low / Medium / High. Reasoning streams into a
  collapsed **Reasoning** disclosure above the answer; open it only when you want to see it.
  The built-in therapist defaults to Off, including a one-time update for existing installs; subsequent manual changes are preserved. Fictional scene replies target 80–120 words, with at most one brief action and one question unless more detail is requested. Simple replies need not be padded to reach the target.
- **Streaming replies** with a stop button.
- **Responsive long chats** — streaming refreshes only the active reply, with batched screen updates. Scroll up freely while a reply arrives; **↓ Latest** returns to the bottom. The screen initially shows the latest 40 messages, with **Load earlier messages** to display more. This display batching does not shorten saved conversations or the history sent to the AI. Collapsed reasoning is rendered only when opened, and images load lazily.
- **Copy any message** — use the small bottom-right copy button on your messages or the AI's replies. Copies the original text, including `*actions*` and code, without reasoning or speaker labels. Image-only messages have no text to copy.
- **Calmer reading** — message buttons appear on the latest message, or on the one you tap (hover with a
  mouse); in roleplay, token counts show only on the tapped message. The reply bar starts with Continue
  scene in roleplay and fades at the edge when more buttons are off-screen.
- **Chat list as an inbox** — each chat shows its last message, who sent it, and when; Recent order by
  default; groups first, workflows last; characters that only belong to a scene are folded under
  "Scene characters". Pin and edit buttons show on the open chat (or on hover).
- **Delete messages** — the 🗑 button under any message in single-agent, group and roleplay chats removes
  it (with all its versions) immediately; **Undo** in the toast brings it back for a few seconds.
- **Edit and reply versions** — in single-agent and group chats, use ✎ to edit either side and ↻ to request another AI reply (one API request). Use ‹ / › to switch saved versions. Regenerating an earlier reply starts a new branch; the old version retains its later conversation, restored when you switch back. Manual edits keep later messages and save the original version too. Versions survive reloads in browser storage. Workflow messages instead use their existing role-retry controls.
- **Duplicate agents** to create quick prompt/model variants.
- **Duplicate chats** — the header's ⧉ button creates and opens an independent copy of the current chat, including attachments and reply versions. Single-agent copies also copy the agent settings; group copies keep the same member agents with separate group settings and history. Completed workflow transcripts can be copied into a fresh workflow. Copies remain in this browser and use additional storage.
- **Full conversations saved** per agent, group, and workflow (in your browser), without a message-count cutoff. Single-agent and group requests include the entire active conversation, including attached images; inactive reply versions remain saved but are not sent. The provider's context limit and browser storage quota still apply. History is never silently shortened to fit either limit. Previously discarded messages cannot be recovered from storage.
- **Reasoning floor for new agents** — new and duplicated agents start at Low thinking (Off is not offered when creating); existing agents can still be switched to Off.
- **Clean context** — failed, stopped-before-output, and empty replies stay visible but are never sent back to the model.
- **Token usage** — each reply shows input/output tokens and the header shows the chat's running
  total. Replies cut off by the length limit are flagged; ⏵ continues the latest one in place.
- **History limits** — ⚙️ Settings → *History sent to the AI* sets the default: **Unlimited —
  entire conversation** (the default) or the last 20/50/100 messages, optionally with a running
  summary of older ones (one short extra request about every 10 messages). Each agent, group, and
  workflow editor can override it, so a big chat can stay Unlimited while others send less.
  Workflows give each role the earlier conversation under the same setting. Saved chats are never
  shortened; the model's context window still applies.
- **Search, pins, and sorting** — the ☰ drawer searches names and message text (tap a result to jump
  to the message), 📌 pins items to the top, and sorts by Manual, Recent, or A–Z.
- **Undo clear** — 🧹 clears immediately and offers **Undo** for a few seconds.
- **Reply length per agent** — Provider default (DeepSeek: 8K tokens, 64K with thinking), Long
  (32K), Very long (128K), or Maximum (384K). Only an upper bound; you pay for what is written.
- **Thinking levels** — exactly DeepSeek's official modes: Off (non-thinking), Low, High (DeepSeek's
  default), and Max. Agents previously set to Medium were already running as High and are now shown as High. Temperature is
  only sent with thinking off, since DeepSeek's thinking mode does not support it.
- **Safer replies** — busy/overloaded errors (429/5xx) retry twice automatically; if the connection
  drops mid-reply, the text written so far is kept and ⏵ finishes it; provider stops (content filter,
  capacity) are labelled; errors say what to do (wrong key, empty balance, chat too long).
- **Import character cards** — the ⬆ button beside Single agents reads Tavern/SillyTavern cards (PNG with
  embedded data, or JSON; V1, V2, V3 and older Pygmalion fields). A preview shows the picture, creator, tags
  and greetings; choose the greeting, start as a roleplay scene or single chat, enter your name for
  `{{user}}`, and confirm you are an adult for mature cards. The agent gets the card's picture, a prompt
  built from its system prompt, description, personality, scenario, always-on lore and example dialogue,
  and mood tracking; the chat opens with the greeting. Keyword lore entries are stored for later use.
  Any agent can also get a picture in its editor. One-character scenes reply automatically.
- **Scenario library** — the 📖 button beside Group chats in the drawer offers ready-made mature roleplay
  scenes (Last Call, Overnight Deadline, The Masquerade, Snowed In, The Arrangement, Neon Rain). Enter your
  character name and confirm you are an adult; adding one creates its characters as agents (temperature
  1.3, mood tracking with mature moods) and a roleplay group with the setting, opening scene, mature mode,
  and moods on. All characters are adult women; everything stays editable.
- **Character moods** — in roleplay groups (on by default) and single agents that opt in, each reply
  ends with a hidden `[mood: name N]` tag that the app removes and shows as a coloured chip with an
  intensity bar (calm, happy, playful, affectionate, shy, curious, confident, jealous, sad, anxious,
  angry, cold; 1–10). Mature moods (flirty, teasing, passionate, horny, needy, dominant, submissive,
  satisfied) are added only for roleplay groups with Mature roleplay
  on (adult-confirmed) or single agents with "Include mature moods"; elsewhere they fall back to the nearest
  general mood. **Moods** (the
  reply bar in roleplay, the heart in a single agent's header) shows each character's recent moods and
  lets you set a mood for their next reply. No extra requests; the mood is the model's own reading.
- **Message times** on every new message, and **Copy** buttons on code blocks.
- **Per-chat drafts** — unsent text stays with its own chat and survives reloads.
- **Roleplay opening scene** is sent to the characters and stays pinned at the top of the chat.
- **Delete confirmations** show how many messages would be lost.
- **Multiple tabs** — the installed app and a browser tab stay in sync instead of overwriting each other.
- **Settings extras** — storage used, last backup date, *Check key & balance*, export the current
  chat as Markdown, and a gentle reminder when there is no recent backup.
- **Formatting** — headings, bullet lists, quotes, and pipe tables render in replies.
- **Midnight Ink design** — calm dark theme with a matching light theme (⚙️ Settings → Theme:
  match the device, dark, or light); AI replies read like a document, your turns are bubbles; speaker
  names are blue for work, teal in groups, amber in roleplay; line icons throughout; on screens
  ≥ 900 px the chat list becomes a permanent sidebar and sheets open as centred panels. Design
  canvas and brief: `docs/design-brief.md`.
- **Backup** — ⚙️ Settings → Export/Import saves or restores agents, groups, workflows, and all chats as JSON. The API key is never exported; import keeps the current key.
- **Everything local** — your API key and settings live in your browser's `localStorage`;
  conversations live in its IndexedDB (much larger than `localStorage`; existing chats move there
  automatically on first load, and the browser is asked to keep the data persistent). Nothing is
  sent anywhere except the configured DeepSeek-compatible API.

## How workflows run

1. Choose **Research**, **Coding**, or **Decision**, then edit the 2–5 role assignments
   if needed.
2. Submit one task. Work roles respond first, followed by critique roles, sequentially.
3. At the review checkpoint, inspect every labeled output. You can retry any earlier role
   (which clears stale downstream outputs), add synthesis guidance, or cancel.
4. Tap **Approve & synthesize** to run the final role and produce one corrected answer.

Each role response is one API request, and final synthesis is one additional request. The
review screen shows that next-request cost in plain language; the app does not guess a
currency price. Workflow definitions, structured run state, outputs, and recovery status
remain in this browser's `localStorage`.

## Models (as of July 2026)
DeepSeek **V4** is the current generation (released 24 Apr 2026), both with a **1M-token
context**:

| Model | Use for |
|---|---|
| **`deepseek-flash`** | fast, cheap everyday chat, and the only model that reads images |
| **`deepseek-v4-pro`** | flagship reasoning/coding/agents, text only |

**Thinking mode** is toggled per agent in the app. Under the hood it sends
`"thinking": {"type": "enabled"}` + `"reasoning_effort"` on the request; the
chain-of-thought comes back in `reasoning_content`.

> ⚠️ The older **`deepseek-chat`** and **`deepseek-reasoner`** names are **retired after
> 24 Jul 2026** (they just route to `deepseek-flash`). `deepseek-v4-flash` still works as an
> alias for `deepseek-flash`, but the app ships the current name. Any future model your key gets access to also works — just type its id into
> the agent's **Model** field.

## Security note
Because the page calls DeepSeek directly from the browser, your API key is stored on the
device. That's fine for personal use on your own phone. Don't publish the page with your
key baked in, and don't share the device. If you'd prefer the key to never touch the
browser, host a tiny proxy (e.g. a Cloudflare Worker / Vercel function) that holds the
key server-side and point **Settings → API base URL** at it — the app speaks the standard
OpenAI-compatible `/chat/completions` protocol.

## Local preview (optional)
Workflow tasks support uploaded or pasted images, including image-only tasks. Images travel to every role and survive retry/resume. Choose an image-capable model (such as `deepseek-flash`) for every role before attaching images; the existing Pro guard remains in place.

In the workflow editor, expand **Independent agent settings** on a role to edit its name, system prompt, model, temperature, and thinking. Existing workflows snapshot their assigned agents; subsequent changes to ordinary chat agents do not alter those snapshots. **Copy settings from chat agent** explicitly replaces a role's snapshot. Settings remain browser-local, like conversations.

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```
