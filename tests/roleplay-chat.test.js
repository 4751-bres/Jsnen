const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

function html() {
  return fs.readFileSync("index.html", "utf8");
}

test("roleplay groups expose Continue scene and character message metadata", () => {
  const source = html();
  assert.ok(source.includes("Continue scene"));
  assert.ok(source.includes("characterName"));
  assert.match(source, /roleplayCharacter\(curGroup\(\),agent\)/);
});

test("roleplay empty state uses opening scene and user character", () => {
  const source = html();
  assert.ok(source.includes("You play as"));
  assert.ok(source.includes("roleplay.opening"));
});

test("application has no moderation endpoint", () => {
  const source = html();
  assert.ok(!source.includes('"/moderations"'));
  assert.ok(!source.includes("'/moderations'"));
});
