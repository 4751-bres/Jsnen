# Design brief: DeepSeek Agents UI redesign

Use this as the prompt for a design session (Claude Design, Figma, or a design-focused chat). It is
self-contained: it describes the product, every screen and state that exists today, and the
constraints the result must fit so it can be implemented without changing app behaviour.

---

## Prompt

Design a polished, modern interface for **DeepSeek Agents**, a mobile-first web app (installable
PWA) where one person chats with custom AI agents, runs group chats in which several agents talk to
each other, plays roleplay scenes, and runs multi-step agent workflows. It runs entirely in the
browser with the user's own DeepSeek API key. The app already works; this is a visual and
interaction redesign, not a feature change.

### Who uses it and how

- One person, mostly on a **phone (375–430 px wide)**, often one-handed. Desktop is secondary but
  should feel intentional, not stretched.
- Very long conversations (thousands of messages) and long AI replies; reading comfort matters more
  than density.
- Three distinct moods share one app: **work** (coding, research workflows), **social** (group chats
  where agents debate), and **fiction** (roleplay scenes with characters, actions in *italics*).
  The design should support all three without feeling like three apps.

### Direction

- Calm, premium, legible. Think a refined messaging app, not a developer dashboard.
- Dark theme first (the current base is a near-black blue `#0b0f17` with a blue→violet accent
  `#4f7cff → #8b5cf6`); also deliver a **light theme** with the same token names.
- Keep emoji avatars (agents choose an emoji icon); design a container that makes them look
  deliberate.
- Clear hierarchy between *who is speaking*, *what they said*, and *meta* (time, tokens, warnings).
- Everything reachable by thumb on a phone; tap targets of at least 44 px.
- Motion should be subtle (sheet slides, streaming cursor, chip state changes). Respect
  `prefers-reduced-motion`.

### Screens and components to design

**1. Main chat screen**
- Header: menu button (opens the drawer), current chat title with emoji, a subtitle line
  (model · temperature · running token total, or group/roleplay status, or workflow progress),
  and three actions: duplicate chat, clear chat, settings.
- Message list:
  - User bubble; AI bubble; error bubble; "final answer" bubble (workflow synthesis, highlighted).
  - Speaker label above AI bubbles in groups ("🧑‍💻 Coder"), roleplay ("Elise · 🎭 Agent name"), and
    workflows ("Skeptic · 🤖 Agent", in a different colour).
  - Collapsible **Reasoning** section above an answer ("Thinking…" while streaming).
  - Rich content inside bubbles: paragraphs, **bold**, *italic scene actions*, inline `code`, code
    blocks with a **Copy** button, bullet lists, headings, block quotes, tables (horizontal scroll),
    links, up to 4 attached images.
  - Meta row under each bubble: time, warnings ("⚠ cut off at length limit", "⚠ connection lost —
    reply incomplete", "⚠ stopped by the provider's content filter"), and token usage
    ("1.8k in · 212 out").
  - Message actions (small, quiet until needed): version switcher ‹ 2 / 3 ›, regenerate ↻,
    continue ⏵ (only on a cut-off last reply), edit ✎, copy ⧉, and an "edited" label.
  - Streaming state: a blinking cursor at the end of the text.
  - "↑ Load earlier messages (N)" at the top of long chats; a floating "↓ Latest" button when
    scrolled up; a brief highlight when jumping to a search result.
  - Empty states: no API key yet; single agent ("Say hi"); group; roleplay (shows the opening
    scene and "You play as Rin"); workflow ("Describe a task…").
  - Roleplay chats show a pinned **Opening scene** card above the first message.
- Group responder bar (above the composer, horizontally scrollable chips):
  - One chip per member; disabled "⚠️ Riley (deleted)" chips; **🔁 Everyone** (or **🎭 Continue
    scene** in roleplay), **🎯 Auto**, **💬 Discuss ×N**.
  - While several members reply in turn, the bar becomes a progress strip: the current speaker
    ("replying"), the next one ("next"), the rest of the queue, and a **⏭ Skip** chip.
- Workflow strip and review panel: a progress line ("Skeptic · 2 of 4" / "Review checkpoint"); at
  review, a panel with summary text, a cost note ("Final synthesis uses 1 more API response."), an
  optional guidance textarea, and **Approve & synthesize** / **Resume workflow** / **Cancel run**.
  Workflow messages also have a "↻ Retry this role" button.
- Attachment tray (thumbnails with remove buttons) above the composer.
- Composer: attach 📎, auto-growing textarea (placeholder changes per mode, e.g. "Message the
  group… @name or tap who replies"), and a send button that turns into a red stop ■ while
  generating.
- Toast: short status messages, sometimes with an action button ("Chat cleared · Undo",
  "No backup in over 2 weeks · Back up").

**2. Drawer (left side sheet on phone, persistent sidebar on desktop ≥ 900 px)**
- Search field ("Search names and messages…") and a sort control (Manual / Recent / A–Z).
- Three sections: **Workflows**, **Group chats**, **Single agents**, each with "＋ New …".
- Rows: emoji avatar, name, a subtitle (model; member emojis and count; "🎭 roleplay"; template ·
  roles), a search snippet with the matched words highlighted, a pin toggle 📌, and an edit ✎.
  Active chat highlighted; pinned items first.

**3. Bottom sheets (full-height on phone, centred dialogs or side panels on desktop)**
- **Settings**: API key (with "key saved" pill), base URL, default model, "History sent to the AI"
  (Unlimited / last 100 / 50 / 20) + "Summarize older messages" toggle, Backup (Export / Import,
  Export current chat as Markdown), Storage used, Last backup, **Check key & balance** with a
  result line ("✓ Key works · Balance: 12.34 USD"), link to account usage. Save / Close.
- **Agent editor**: icon, name, system prompt (long text), model, thinking level (Off, Low,
  Medium, High, Max), temperature slider with value, reply length (Provider default / 32K / 128K /
  Maximum), history sent to the AI (Use Settings default / Unlimited / 100 / 50 / 20). Save,
  Duplicate, Delete, Close.
- **Group editor**: icon, name, member list (tap to add or remove; selected members show their
  speaking-order number and ↑ ↓ buttons), discussion rounds (1–10), history setting, roleplay
  toggle revealing: setting/scenario, opening scene, your character name and description, mature
  roleplay toggle with an adult confirmation, and one character card (name + description) per
  member. Save, Delete, Close.
- **Workflow editor**: icon, name, template (Research / Coding / Decision / Custom), history
  setting, 2–5 role cards (role number, stage badge Work/Critique/Final, move up/down/remove, role
  name, "copy settings from chat agent" picker, stage, instructions, and a collapsible
  "Independent agent settings" block with name, prompt, model, temperature, thinking), "＋ Add
  role", validation state (invalid card outlined). Save, Delete, Close.
- **Edit message**: one large textarea with an explanation line. Save / Cancel.
- Destructive confirmations ("Delete “Coder” and its conversation (2,341 messages)? This cannot be
  undone…").

### States to show

Streaming; stopped; error; cut-off with ⏵; connection lost; long code block; table; image message;
group with 6 members mid-Discuss; roleplay scene; workflow at review; empty drawer search result;
offline (installed app with no network); first run with no API key.

### Constraints (so the design can be implemented directly)

- Plain HTML/CSS/vanilla JS, no framework and no build step. One stylesheet (`styles.css`).
  Express the design as **CSS custom properties (design tokens)**: colours, radii, spacing scale,
  type scale, shadows, motion durations; for both dark and light themes.
- System font stack (no web-font download required; an optional single variable font is
  acceptable if it clearly earns it).
- Keep the existing structure: a header, a scrolling `main#chat`, a responder bar, a composer, a
  drawer, and bottom sheets. Element IDs used by the code must keep existing (they can be restyled
  and moved within their section): `menuBtn hAgent hSub duplicateChatBtn clearBtn setBtn chat
  jumpToLatest workflowProgress responders workflowActions attachments attachBtn input sendBtn toast
  drawer drawerSearch drawerSort settings editor groupEditor workflowEditor messageEditor` and the
  form field IDs inside the sheets.
- Messages are rendered with `white-space: pre-wrap`; avoid designs that need per-paragraph
  wrappers.
- Safe areas (iPhone notch / home indicator) must be respected; no horizontal page scrolling at
  320 px width.
- Accessible: WCAG AA contrast in both themes, visible focus rings, labels on icon buttons.

### Deliverables

1. Token sheet (dark + light) and type/spacing scales.
2. Phone mockups (390 px): single-agent chat with streaming + reasoning + code block; group chat
   mid-Discuss with the progress strip; roleplay scene with the opening card; workflow at review;
   drawer with search results; settings sheet; agent editor; group editor with roleplay on.
3. Desktop mockup (1280 px) with the persistent sidebar.
4. Component sheet: bubbles (all variants), meta row, action buttons, chips (all states), sheet
   header/footer, inputs, toggles, selects, buttons (primary / secondary / danger / ghost), toast.
5. Short notes on motion and on how the three moods (work / social / fiction) are differentiated,
   if at all.
