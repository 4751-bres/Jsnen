# DeepSeek Agents 📱🤖

A tiny, mobile-first web app that connects **your DeepSeek API key** to any number of
custom **agents** (each with its own name, system prompt, model, and temperature), and
lets you chat with them from your **phone's browser** — installable to the home screen.

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
- Tap **☰** to pick an agent, then start chatting.

### 3. (Optional) Install it like an app
- **iPhone:** Share button → *Add to Home Screen*.
- **Android:** Chrome menu → *Add to Home screen / Install app*.

That's it — it now behaves like a native app with its own icon.

---

## Features
- **Multiple agents** — ships with General Assistant, Coder, Deep Reasoner, Writer,
  Translator. Add/edit/delete your own (icon, name, system prompt, model, temperature).
- **Model per agent** — `deepseek-chat` (DeepSeek‑V3, fast) or `deepseek-reasoner`
  (R1, shows step‑by‑step reasoning). Type any model name your key can access.
- **Streaming replies** with a stop button; reasoning shown in a dimmed block.
- **Conversations saved** per agent (in your browser).
- **Everything local** — your API key and chats live only in your browser's
  `localStorage`; nothing is sent anywhere except DeepSeek's API.

## About the model name
DeepSeek's public API currently exposes **`deepseek-chat`** and **`deepseek-reasoner`**.
If/when your account has access to a newer model (e.g. a "V4 / pro" tier), just type its
exact model id into the agent's **Model** field or Settings → *Default model* — the app
sends whatever name you enter, so it works the moment DeepSeek enables it for your key.

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
