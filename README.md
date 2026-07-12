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
- **Multiple agents** — ships with General Assistant, Coder, Deep Reasoner, Writer,
  Translator. Add/edit/delete your own (icon, name, system prompt, model, thinking,
  temperature).
- **Group chats** — select several agents, ask a question, then choose one responder or
  tap **Everyone** to hear from every member in order.
- **Multi-agent workflows** — build a 2–5-role pipeline from Research, Coding, or
  Decision templates and assign any existing agent to each editable role.
- **Human review checkpoint** — work and critique roles run automatically, then pause so
  you can inspect results, retry a role, add guidance, cancel, or approve final synthesis.
- **Safe recovery** — stop and resume the current role; interrupted runs recover as
  stopped after reload instead of silently restarting API requests.
- **Model per agent** — `deepseek-v4-pro` (flagship) or `deepseek-v4-flash` (fast/cheap).
  Type any model name your key can access.
- **Thinking mode per agent** — Off / Low / Medium / High. On makes DeepSeek V4 reason
  step-by-step; the reasoning is streamed into a dimmed block above the answer.
- **Streaming replies** with a stop button.
- **Duplicate agents** to create quick prompt/model variants.
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
| **`deepseek-v4-pro`** | flagship reasoning/coding/agents (1.6T params) |
| **`deepseek-v4-flash`** | fast, cheap everyday chat (284B params) |

**Thinking mode** is toggled per agent in the app. Under the hood it sends
`"thinking": {"type": "enabled"}` + `"reasoning_effort"` on the request; the
chain-of-thought comes back in `reasoning_content`.

> ⚠️ The older **`deepseek-chat`** and **`deepseek-reasoner`** names are **retired after
> 24 Jul 2026** (they just route to `deepseek-v4-flash`). This app already defaults to the
> V4 names. Any future model your key gets access to also works — just type its id into
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
