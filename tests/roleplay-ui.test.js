const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function html() {
  return fs.readFileSync("index.html", "utf8");
}

function loadCore() {
  const source = html();
  const match = source.match(/\/\* roleplay-core:start \*\/([\s\S]*?)\/\* roleplay-core:end \*\//);
  assert.ok(match, "roleplay core markers must exist");
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${match[1]}\nthis.validateRoleplay=validateRoleplay;`, context);
  return context;
}

test("group editor exposes roleplay scene and character controls", () => {
  const source = html();
  for (const id of [
    "grRoleplay",
    "grRpFields",
    "grRpSetting",
    "grRpOpening",
    "grRpUserName",
    "grRpUserDescription",
    "grRpMature",
    "grRpAdult",
    "grRpCharacters",
  ]) assert.match(source, new RegExp(`id=["']${id}["']`), `missing ${id}`);
});

test("enabled roleplay validates user, characters, and adult confirmation", () => {
  const core = loadCore();
  const roleplay = {
    enabled: true,
    mature: true,
    user: { name: "Rin", description: "" },
    characters: { a: { name: "", description: "" } },
  };
  assert.deepEqual(Array.from(core.validateRoleplay(roleplay, ["a"], false)), [
    "character-name:a",
    "adult-confirmation",
  ]);
  assert.ok(core.validateRoleplay({ ...roleplay, mature: false, user: { name: "" } }, ["a"], true).includes("user-name"));
});

test("normal groups do not require roleplay fields", () => {
  const core = loadCore();
  assert.deepEqual(Array.from(core.validateRoleplay({ enabled: false }, ["a"], false)), []);
});
