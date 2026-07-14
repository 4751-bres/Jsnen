# Roleplay in Groups — Design

## Goal

Extend existing group chats with an optional roleplay mode. The user plays a character alongside the group's AI agents. The app adds no content filter or prompt censorship; requests remain subject to the configured API provider.

## Product behavior

- Any existing or new group can enable **Roleplay mode**.
- A roleplay group stores a setting, an opening scene, the user's character, and one character sheet for each member agent.
- The user always speaks and acts as their configured character.
- After a user message, they can select one character for a focused response or tap **Continue scene** to let every available character respond sequentially.
- Normal groups keep their current behavior and data unchanged.
- Conversations remain saved locally per group. The setting and character sheets form a persistent scene bible that is included with every roleplay request.

## Group editor

The group editor gains a **Roleplay mode** toggle. When enabled, it reveals:

1. **Setting / scenario** — the world, tone, premise, and important facts.
2. **Opening scene** — optional starting text shown when a new roleplay has no messages.
3. **Your character** — name and free-form character description.
4. **Mature roleplay** — an opt-in adult confirmation stored only in this browser. It does not rewrite, block, or classify messages.
5. **AI characters** — one character sheet per selected member, containing character name and free-form role/personality/instructions.

Changing group membership preserves character sheets for members who remain. New members receive a default sheet based on the underlying agent. Deleted agents are shown as unavailable until removed or replaced, matching workflow repair behavior.

## Chat experience

The header identifies roleplay groups with a theatre-mask badge. The empty state displays the opening scene and the user's character name.

The existing responder bar remains familiar:

- Tapping a character makes only that character reply.
- **Continue scene** replaces **Everyone** in roleplay mode and runs all available characters in group order.
- Stop behavior remains unchanged and stops the current API request plus the remaining automatic sequence.

Each assistant message is labelled with the roleplay character name and the backing agent. This keeps fictional identity separate from model configuration.

## Data model

Group objects remain backward compatible:

```js
{
  id,
  emoji,
  name,
  members: [agentId],
  roleplay: {
    enabled: true,
    mature: true,
    setting: "...",
    opening: "...",
    user: { name: "...", description: "..." },
    characters: {
      [agentId]: { name: "...", description: "..." }
    }
  }
}
```

Groups without `roleplay.enabled === true` behave exactly as before. A normalization helper supplies safe defaults for missing or older fields.

## Prompt and context construction

Roleplay requests use the selected agent's normal system prompt and model settings, then add a roleplay contract containing:

- the shared setting;
- the user's character sheet;
- the selected AI character sheet;
- a compact cast list for the other group members;
- instructions to remain in character, preserve continuity, avoid controlling the user's character, and continue naturally from the conversation;
- the mature-mode preference as tone metadata, without app-side filtering or content transformation.

Conversation conversion remains group-aware: the selected character's prior messages are assistant-role messages, while the user and other characters are labelled user-role context. The app sends conversation content as written and does not add a moderation endpoint.

## Boundaries and safety

- No app-side keyword blacklist, content classifier, moderation request, or automatic prompt refusal is added.
- The UI does not promise that any API provider will accept every request.
- Mature mode requires an explicit local adult confirmation before it can be saved.
- API keys, character sheets, settings, and conversations stay in localStorage and are never committed.

## Error handling

- A roleplay group cannot be saved without at least one member, a user-character name, and a character name for every selected member.
- Missing/deleted agents are skipped during **Continue scene** and surfaced in the editor for repair.
- Empty setting and opening scene are allowed.
- If an API call fails or is stopped, existing retry/stop behavior is used and the remaining character sequence does not continue automatically.

## Testing

Automated tests will cover:

- backward-compatible group normalization;
- roleplay prompt construction and speaker-role mapping;
- preservation of normal group prompts;
- member changes and missing-agent behavior;
- presence of roleplay editor controls and Continue scene UI;
- no app-side moderation/filter request path.

Manual verification will create one roleplay group, assign multiple characters, send a user-character message, test one-character reply and Continue scene, stop a sequence, reload, and confirm local persistence. The published GitHub Pages build will then be tested in Chrome with the configured DeepSeek API.

## Out of scope

- Image generation, voices, avatars, dice systems, branching save slots, and automatic long-term summarization.
- Server-side accounts or sync.
- Provider-specific attempts to bypass API enforcement.
