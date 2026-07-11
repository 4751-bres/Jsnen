const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function extractInlineScript(html) {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length, "index.html must contain an inline script");
  return scripts.at(-1)[1];
}

test("inline application script parses", () => {
  const html = fs.readFileSync("index.html", "utf8");
  new vm.Script(extractInlineScript(html), { filename: "index-inline.js" });
});

test("group and duplicate controls are present", () => {
  const html = fs.readFileSync("index.html", "utf8");
  for (const id of ["groupList", "addGroup", "groupEditor", "dupAgent", "responders"])
    assert.match(html, new RegExp(`id=["']${id}["']`));
});

test("workflow navigation and editor controls are present", () => {
  const html = fs.readFileSync("index.html", "utf8");
  for (const id of ["workflowList", "addWorkflow", "workflowEditor", "wfTemplate", "wfRoles", "saveWorkflow", "delWorkflow"])
    assert.match(html, new RegExp(`id=["']${id}["']`));
});
