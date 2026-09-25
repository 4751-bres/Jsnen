# DeepSeek Agents 📱🤖

A tiny, mobile-first web app that connects **your DeepSeek API key** to any number of
custom **agents**, group chats, and reusable multi-agent workflows. Chat with one agent,
let several agents respond together, or run a structured work-and-critique pipeline from
your **phone's browser** — installable to the home screen.

No server, no build step, no dependencies. It's a single static HTML page that talks to
the DeepSeek API directly from your browser (DeepSeek's API allows browser/CORS requests).

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
  tap **Everyone** to hear from every member in order.
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
- **Copy any message** — use the small bottom-right copy button on your messages or the AI's replies. Copies the original text, including `*actions*` and code, without reasoning or speaker labels. Image-only messages have no text to copy.
- **Edit and reply versions** — in single-agent and group chats, use ✎ to edit either side and ↻ to request another AI reply (one API request). Use ‹ / › to switch saved versions. Regenerating an earlier reply starts a new branch; the old version retains its later conversation, restored when you switch back. Manual edits keep later messages and save the original version too. Versions survive reloads in browser storage. Workflow messages instead use their existing role-retry controls.
- **Duplicate agents** to create quick prompt/model variants.
- **Duplicate chats** — the header's ⧉ button creates and opens an independent copy of the current chat, including attachments and reply versions. Single-agent copies also copy the agent settings; group copies keep the same member agents with separate group settings and history. Completed workflow transcripts can be copied into a fresh workflow. Copies remain in this browser and use additional storage.
- **Conversations saved** per agent, group, and workflow (in your browser).
- **Everything local** — your API key and chats live only in your browser's
  `localStorage`; nothing is sent anywhere except the configured DeepSeek-compatible API.

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
```bash
python3 -m http.server 8080
# then open http://localhost:8080
```
