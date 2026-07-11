const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadCore() {
  const html = fs.readFileSync("index.html", "utf8");
  const match = html.match(/\/\* workflow-core:start \*\/([\s\S]*?)\/\* workflow-core:end \*\//);
  assert.ok(match, "workflow core markers must exist");
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${match[1]}\nthis.workflowCore={WORKFLOW_PRESETS,makeWorkflowPreset,validateWorkflow,normalizeStoredWorkflows,newRun,normalizeRunAfterReload};`,
    context
  );
  return context.workflowCore;
}

const agents = [
  { id: "a1", name: "One" },
  { id: "a2", name: "Two" },
  { id: "a3", name: "Three" },
  { id: "a4", name: "Four" },
];

function idFactory() {
  let n = 0;
  return () => `id${++n}`;
}

test("research preset creates independent ordered role objects", () => {
  const c = loadCore();
  const one = c.makeWorkflowPreset("research", agents, idFactory());
  const two = c.makeWorkflowPreset("research", agents, idFactory());
  assert.deepEqual(Array.from(one.roles, r => r.stage), ["work", "critique", "critique", "synthesis"]);
  one.roles[0].name = "Changed";
  assert.equal(two.roles[0].name, "Investigator");
});

test("validation enforces assignments, role count, and final synthesis", () => {
  const c = loadCore();
  const wf = c.makeWorkflowPreset("coding", agents, idFactory());
  assert.deepEqual(Array.from(c.validateWorkflow(wf, agents)), []);
  wf.roles[0].agentId = "missing";
  wf.roles[1].stage = "synthesis";
  assert.deepEqual(Array.from(c.validateWorkflow(wf, agents), e => e.code), ["missing-agent", "synthesis-count"]);
});

test("validation rejects work roles placed after critique roles", () => {
  const c = loadCore();
  const wf = c.makeWorkflowPreset("research", agents, idFactory());
  wf.roles[2].stage = "work";
  assert.ok(c.validateWorkflow(wf, agents).some(e => e.code === "stage-order"));
  wf.roles[2].stage = "unknown";
  assert.ok(c.validateWorkflow(wf, agents).some(e => e.code === "invalid-stage"));
});

test("run owns task and becomes stopped after reload", () => {
  const c = loadCore();
  const wf = c.makeWorkflowPreset("decision", agents, idFactory());
  const run = c.newRun(wf, "Choose one", 1000, idFactory());
  assert.equal(run.task, "Choose one");
  assert.deepEqual(Array.from(run.outputs), []);
  assert.equal(c.normalizeRunAfterReload({ ...run, status: "running" }).status, "stopped");
  assert.equal(c.normalizeRunAfterReload({ ...run, status: "review" }).status, "review");
});
