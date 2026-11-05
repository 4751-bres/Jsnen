# DeepSeek Agents: project handoff

Read this first, then continue the work. It describes the project as of 2026-11-05.

## Current state

- **What it is:** a personal, phone-first PWA for chatting with custom AI agents, roleplay group chats and multi-agent workflows. The owner is the only user and mostly uses it for long roleplay stories on their phone.
- **Repo and branch:** `4751-bres/Jsnen`, branch `claude/deepseek-api-agents-pjh5x7`. Work directly on this branch.
- **Live site:** https://4751-bres.github.io/Jsnen/. GitHub Pages serves the branch root, about a minute after a push.
- **Last code commit:** `87b6e9a`. Live asset version: `?v=20261023b`.
- **Tests:** 256 of 256 pass (`node --test tests/*.test.js`).
- **Open bugs:** none reported. Nothing is half-finished.

## How to work with the owner

- Commit, push and ship without asking first. Only ask about real product decisions.
- Keep replies short and in plain language. The owner often dictates, so read messages for intent.
- Fix what is reported, then say plainly what changed and how you checked it.
- The owner enters API keys and tokens themselves. Never type them in.
- If a fix for one phone would change another, scope it to that phone's profile. An earlier Honor fix broke the Samsung layout and had to be reverted.

## Stack

Vanilla JS with no build step and no dependencies.

| File | Role |
|---|---|
| `index.html` | Markup. All panels are `<section class="sheet bottom">`. Loads the assets with `?v=` |
| `styles.css` | Styles |
| `core.js` | Pure logic in `/* name:start */ ... /* name:end */` blocks. Loaded before `app.js` |
| `app.js` | UI and streaming, in `/* ---------- Section ---------- */` sections |
| `sw.js` | Network-first offline shell (cache `ds-agents-shell-v6`), background reply jobs, share target, notifications |
| `manifest.json` | PWA manifest, icons, shortcuts, share target |
| `tests/` | `node:test` files. `tests/source.js` gives `loadCore()` (new tests) and `source()` (old tests slice the reassembled page) |
| `docs/` | Older design brief and specs |

## Shipping checklist

1. Write the change and its test. Put logic in a `core.js` block where possible.
2. Run `node --test tests/*.test.js`.
3. Load the app and **check the browser console**. Unit tests only parse `app.js`, so they miss start-up crashes such as using a `const` before it is defined.
4. Check phone layouts at 384×832, and at about 384×400 for keyboard-up.
5. Bump `?v=YYYYMMDDx` on all three assets in `index.html` for any UI change. Otherwise phones can mix a new page with a cached script.
6. Commit with the same author as recent commits (`git log -1 --format='%an <%ae>'`). The repo's local git config says `Codex`, which is out of date, so pass `-c user.name=... -c user.email=...`.
7. Push, then confirm with `git ls-remote origin claude/deepseek-api-agents-pjh5x7`. On the owner's PC, Git Credential Manager prints a crash stack trace even when the push works, and one push has also failed without any visible error.
8. Wait for the live page to serve the new `?v=`, reload it, and check the console there too.

## Live testing

- Test on the live site with the real DeepSeek API, not mocks. The owner's keys are stored in the browser for that site.
- Reload first, because changes don't appear until you do.
- Use at most 3 messages per test unless the owner allows more.
- Test on the owner's browser or a device they've set up. A clean environment has no keys, so say what you couldn't test.
- A local-only mock SSE server (`.design/mock-api.js`, port 8090) and a preview config (`dzb/.claude/launch.json`, entries `oks` on 8080 and `mock-api`) exist on the owner's PC. `.design/` is excluded from git, so a fresh clone doesn't have them.

## Devices

| Device | Browser and keyboard | Notes |
|---|---|---|
| Samsung Galaxy S25+ (about 384×832 CSS px) | Samsung Internet beta, Samsung Keyboard (tall, with a toolbar) | Main phone. Wants the message box as wide as possible |
| Honor Magic 8 Lite | Samsung Internet beta, Gboard | Its keyboard resize mode is unreliable |
| Laptop | Samsung Internet | |

**Settings → Phone** (`auto`, `samsung`, `honor`, `other`) picks the layout mode. Honor and Other add `:root.dev-safe` and use a different viewport meta (`applyDeviceProfile` in `app.js`). Automatic and Samsung keep the original behaviour.

## Data

- **Settings** live in `localStorage` with the prefix `ds_`.
- **Chats, runs and summaries** live in IndexedDB `ds-agents`, mirrored in `store.records`. Use `store.raw`, `setRaw` and `removeRaw`. `isBigKey` matches `ds_(conv|run|sum|bg)_`.
- **Secrets** (`SECRET_KEYS`) are left out of backups.
- **One-time migrations** are guarded by version keys such as `ds_effort_levels_v1`. Follow that pattern when stored data has to change.

## How replies work

- `streamCompletion(agent, apiMessages, meta)` in `app.js` does the streaming. `meta` flags include `noSearch`, `forceSearch`, `workflowRoleId`, `proactive`, `whisperTo`, `opener`, and `thoughtsTracked`, `bondTracked`, `sceneTracked`, `moodTracked`.
- **Hidden tags:** the model appends `[thoughts: …]`, `[bond: N]`, `[scene: …]` and `[mood: X N]`. Partial tags are stripped during streaming. The `apply*Tag` functions run when the reply ends and again in `adoptJob`, which recovers replies finished in the background.
- **Group context:** `buildGroupApiMessages` uses `visibleTo(m, agentId)` so whispers stay private. The auto speaker picker now filters whispers too.
- **Providers:** `provider-core` supports DeepSeek plus any OpenAI-compatible API, chosen per agent. DeepSeek agents use `deepseek-flash`.
- **Web search:** Exa. The direct API is blocked by CORS on github.io, so the app falls back to `mcp.exa.ai/mcp` and remembers the working route in `ds_exa_mcp`. The MCP tool requires an `objective` field.
- **Sync:** PBKDF2 and AES-GCM, gzipped, stored in a private GitHub Gist. The newer copy of each chat wins.

## Features to know about

Most features are described in `README.md`. These are the newest, and the README doesn't cover the first two yet:

- **Paste a setup** (`setup-core`, sheet `#setupSheet`). Library → Paste a setup, or the clipboard icon under Single agents. One JSON block creates characters, a group or one-on-one chats, a persona, story memory and world info, with no API call. `looseSetupJson` repairs phone copy damage: non-breaking spaces, curly quotes, dropped `\"` backslashes, trailing commas. `tests/paste-setup.test.js` shows the format.
- **Who replies** (`reply-mode-core`, `group.replyMode`). Set per group in the ⋯ menu: buttons, everyone, auto, discuss or `agent:<id>`. Any choice except buttons hides the bottom bar. Sending replies automatically, and sending an empty box lets the characters carry on.
- **First message** from an agent (`opener-core`): an AI-written or fixed greeting in a new chat.
- **Characters message first, and whisper** (`initiative-core`, `#whisperBar`).
- **"Previously…" recap, Find in chat, message queue during streaming, story clock, chapters, bookmarks, branching, stats, app lock, sync.** Each has its own section in `app.js`.

## Pitfalls that have already caused bugs

- **Reproduce before guessing at device quirks.** The "Honor layout bugs" (italic text, shrunken header, zoomed-out page) were a `.typing` style colliding with `body.typing`, not the phone. The indicator is now `.typing-dots`. Check for class-name collisions.
- **No `backdrop-filter`, and avoid `will-change` on repeated elements.** Per-bubble blur plus always-rendered sheets ran phones out of graphics memory (flicker, black areas). Closed `.sheet.bottom`, `.drawer` and `.scrim` become `visibility:hidden` after sliding out, so new panels should be `.sheet.bottom`.
- **Files use CRLF.** Write multi-line patches as a Python script (open with `newline=""`) created with a file-writing tool. Never put code containing backslashes in a bash heredoc: `\\b` and `\\n` turn into raw control characters. `tests/no-control-chars.test.js` catches leftovers.
- **Moving code between `core.js` and `app.js`** can break old tests that slice the page source.
- **The service worker routes chat fetches,** so mocking `window.fetch` in the page won't intercept them. Inspect the built messages or use a mock provider. Clear the service worker and caches when checking changes locally.
- **Phone Link can't paste text into the phone.** It pastes the phone's old clipboard. If you drive the phone through it, send single key presses and swipe instead of using the mouse wheel.

## What to do next

Nothing is required. These are open, in the order I'd do them:

1. **Check on real phones:** Who replies has only been tested locally against the mock server, and the 2026-10-23 keyboard scroll fix (`87b6e9a`) has no owner confirmation on record. Run a short live test or ask the owner.
2. **Update `README.md`** with Paste a setup and Who replies.
3. **Offered, no answer yet:**
   - A texting chat style option.
   - Showing names instead of `[user]` and `[char]` labels.
4. **Probably not wanted:** a DeepSeek search option next to Exa (`POST api.deepseek.com/v1/tools/search`, allowed from github.io). The owner is happy with Exa, so don't build it unless asked.
5. **Possible separate project:** the owner's notes on an AI social-network game called Status are in `dzb/status-app-notes.md` on their PC. They mentioned reverse engineering it later. It isn't started, so wait for them to ask.
