const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function source() {
  return fs.readFileSync("index.html", "utf8");
}

function loadCore() {
  const match = source().match(/\/\* roleplay-core:start \*\/([\s\S]*?)\/\* roleplay-core:end \*\//);
  assert.ok(match);
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${match[1]}\nthis.core={normalizeRoleplay,buildGroupApiMessages,didResponseComplete,groupAfterAgentDelete};`, context);
  return context.core;
}

const agents = [
  { id: "a", name: "Agent A", prompt: "Prompt A" },
  { id: "b", name: "Agent B", prompt: "Prompt B" },
];

test("explicitly blank character names stay blank for validation", () => {
  const core = loadCore();
  const roleplay = core.normalizeRoleplay({ characters: { a: { name: "", description: "x" } } }, ["a"], agents);
  assert.equal(roleplay.characters.a.name, "");
});

test("failed or aborted responses stop a sequential scene", () => {
  const core = loadCore();
  assert.equal(core.didResponseComplete(false), false);
  assert.equal(core.didResponseComplete({ ok: false, aborted: false }), false);
  assert.equal(core.didResponseComplete({ ok: false, aborted: true }), false);
  assert.equal(core.didResponseComplete({ ok: true, aborted: false }), true);
});

test("normal group system prompt remains byte-for-byte compatible", () => {
  const core = loadCore();
  const output = core.buildGroupApiMessages({ id: "g", roleplay: { enabled: false } }, agents[0], []);
  assert.equal(output[0].content,
    'Prompt A\n\nYou are "Agent A" in a group chat with a human user and other AI agents. Messages from other participants are prefixed with their name in square brackets, e.g. "[Coder]: ...". Reply in your own voice as Agent A. Do NOT prefix your reply with your own name.');
});

test("deleting an agent preserves roleplay membership for repair", () => {
  const core = loadCore();
  const roleplay = core.groupAfterAgentDelete({ id: "r", members: ["a", "b"], roleplay: { enabled: true } }, "a");
  const normal = core.groupAfterAgentDelete({ id: "n", members: ["a", "b"], roleplay: { enabled: false } }, "a");
  assert.deepEqual(Array.from(roleplay.members), ["a", "b"]);
  assert.deepEqual(Array.from(normal.members), ["b"]);
});

test("character editor avoids attribute interpolation and exposes missing agents", () => {
  const html = source();
  assert.ok(!html.includes(`value="'+esc(character.name)+'"`));
  assert.ok(html.includes("nameInput.value=character.name"));
  assert.ok(html.includes("Unavailable — deleted agent"));
});
