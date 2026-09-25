const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadCore() {
  const html = fs.readFileSync("index.html", "utf8");
  const match = html.match(/\/\* roleplay-core:start \*\/([\s\S]*?)\/\* roleplay-core:end \*\//);
  assert.ok(match, "roleplay core markers must exist");
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${match[1]}\nthis.roleplayCore={normalizeRoleplay,normalizeStoredGroups,isRoleplayGroup,roleplayCharacter,buildGroupApiMessages};`,
    context
  );
  return context.roleplayCore;
}

const agents = [
  { id: "a", emoji: "🕵️", name: "Mara", prompt: "Be observant." },
  { id: "b", emoji: "🩺", name: "Basil", prompt: "Be calm." },
];

test("legacy groups normalize without enabling roleplay", () => {
  const core = loadCore();
  const [group] = core.normalizeStoredGroups([{ id: "g", name: "Friends", members: ["a"] }], agents);
  assert.equal(group.roleplay.enabled, false);
  assert.equal(group.members[0], "a");
});

test("roleplay normalization preserves sheets and defaults new members", () => {
  const core = loadCore();
  const value = {
    enabled: true,
    mature: true,
    setting: "A city",
    opening: "Rain falls.",
    user: { name: "Rin", description: "A detective" },
    characters: { a: { name: "Mara Vale", description: "A fixer" } },
  };
  const roleplay = core.normalizeRoleplay(value, ["a", "b"], agents);
  assert.equal(roleplay.characters.a.name, "Mara Vale");
  assert.equal(roleplay.characters.a.description, "A fixer");
  assert.equal(roleplay.characters.b.name, "Basil");
  assert.equal(roleplay.mature, true);
});

test("roleplay prompt separates user, selected character, and cast turns", () => {
  const core = loadCore();
  const group = {
    id: "g",
    members: ["a", "b"],
    roleplay: {
      enabled: true,
      mature: true,
      setting: "A city",
      opening: "",
      user: { name: "Rin", description: "Detective" },
      characters: {
        a: { name: "Mara", description: "Fixer" },
        b: { name: "Basil", description: "Doctor" },
      },
    },
  };
  const messages = [
    { role: "user", content: "I enter." },
    { role: "assistant", agentId: "b", agentName: "Basil", content: "I look up." },
    { role: "assistant", agentId: "a", agentName: "Mara", content: "You're late." },
  ];
  const output = core.buildGroupApiMessages(group, agents[0], messages);
  assert.match(output[0].content, /you are Mara \(\[char\]\)/);
  assert.match(output[0].content, /User character: Rin/);
  assert.equal(output[1].content, "[user]: I enter.");
  assert.equal(output[2].content, "[character: Basil]: I look up.");
  assert.equal(output[3].role, "assistant");
  assert.equal(output[3].content,"[char]: You're late.");
});

test("normal group prompts retain current behavior", () => {
  const core = loadCore();
  const group = { id: "g", members: ["a"], roleplay: { enabled: false } };
  const output = core.buildGroupApiMessages(group, agents[0], [{ role: "user", content: "Hi" }]);
  assert.match(output[0].content, /group chat/);
  assert.equal(output[1].content, "Hi");
});
