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
    `${match[1]}\nthis.workflowCore={WORKFLOW_PRESETS,makeWorkflowPreset,validateWorkflow,normalizeStoredWorkflows,newRun,normalizeRunAfterReload,buildWorkflowMessages,nextWorkflowAction,recordRoleOutput,recordRoleFailure,retryWorkflowRole,prepareRunResume,canEditWorkflowRun};`,
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

test("critique prompt labels prior outputs and asks for corrections", () => {
  const c = loadCore();
  const wf = c.makeWorkflowPreset("coding", agents, idFactory());
  const run = { task: "Build parser", guidance: "", outputs: [{ roleId: wf.roles[0].id, content: "Use regex", reasoning: "" }] };
  const msgs = c.buildWorkflowMessages(wf, run, wf.roles[2], agents[2]);
  assert.match(msgs[0].content, /Reviewer/);
  assert.match(msgs.at(-1).content, /\[Architect\]: Use regex/);
  assert.match(msgs.at(-1).content, /concrete errors/i);
});

test("synthesis prompt includes guidance and every labeled output", () => {
  const c = loadCore();
  const wf = c.makeWorkflowPreset("decision", agents, idFactory());
  const run = {
    task: "Pick A or B",
    guidance: "Prefer reversible choices",
    outputs: wf.roles.slice(0, 3).map((r, i) => ({ roleId: r.id, content: `out${i}`, reasoning: "" })),
  };
  const msgs = c.buildWorkflowMessages(wf, run, wf.roles[3], agents[3]);
  assert.match(msgs.at(-1).content, /Prefer reversible choices/);
  assert.match(msgs.at(-1).content, /\[Risk Analyst\]: out2/);
  assert.match(msgs.at(-1).content, /self-contained final answer/i);
});

test("action sequence pauses after critique and before synthesis", () => {
  const c = loadCore();
  const wf = c.makeWorkflowPreset("research", agents, idFactory());
  let run = c.newRun(wf, "Investigate", 1, idFactory());
  assert.equal(c.nextWorkflowAction(wf, run).role.stage, "work");
  for (const role of wf.roles.slice(0, -1))
    run = c.recordRoleOutput(run, role, { content: role.name, reasoning: "" }, 2);
  const action = c.nextWorkflowAction(wf, run);
  assert.equal(action.type, "review");
  assert.equal(action.run.status, "review");
});

test("approval enables exactly the synthesis role", () => {
  const c = loadCore();
  const wf = c.makeWorkflowPreset("research", agents, idFactory());
  let run = c.newRun(wf, "Investigate", 1, idFactory());
  for (const role of wf.roles.slice(0, -1))
    run = c.recordRoleOutput(run, role, { content: "ok", reasoning: "" }, 2);
  run = { ...c.nextWorkflowAction(wf, run).run, status: "synthesizing", guidance: "Focus on uncertainty" };
  assert.equal(c.nextWorkflowAction(wf, run).role.stage, "synthesis");
});

test("failure stays on the same role for resume", () => {
  const c = loadCore();
  const wf = c.makeWorkflowPreset("coding", agents, idFactory());
  const run = c.recordRoleFailure(c.newRun(wf, "Code", 1, idFactory()), wf.roles[0], { content: "HTTP 500", reasoning: "" }, 2);
  assert.equal(run.status, "stopped");
  assert.equal(run.nextRoleIndex, 0);
  assert.equal(run.outputs[0].error, true);
});

test("retry clears target and every downstream output", () => {
  const c = loadCore();
  const wf = c.makeWorkflowPreset("coding", agents, idFactory());
  let run = c.newRun(wf, "Code", 1, idFactory());
  for (const role of wf.roles)
    run = c.recordRoleOutput(run, role, { content: role.name, reasoning: "" }, 2);
  run = c.retryWorkflowRole(wf, run, wf.roles[1].id, 3);
  assert.deepEqual(Array.from(run.outputs, o => o.roleId), [wf.roles[0].id]);
  assert.equal(run.nextRoleIndex, 1);
  assert.equal(run.status, "stopped");
});

test("malformed storage and deleted agents fail safely", () => {
  const c = loadCore();
  assert.deepEqual(Array.from(c.normalizeStoredWorkflows({ bad: true })), []);
  const wf = c.makeWorkflowPreset("research", agents, idFactory());
  const remaining = agents.filter(a => a.id !== wf.roles[0].agentId);
  assert.ok(c.validateWorkflow(wf, remaining).some(e => e.code === "missing-agent"));
});

test("retrying the first role clears every structured output", () => {
  const c = loadCore();
  const wf = c.makeWorkflowPreset("coding", agents, idFactory());
  let run = c.newRun(wf, "Code", 1, idFactory());
  for (const role of wf.roles)
    run = c.recordRoleOutput(run, role, { content: "done", reasoning: "" }, 2);
  run = c.retryWorkflowRole(wf, run, wf.roles[0].id, 3);
  assert.deepEqual(Array.from(run.outputs), []);
  assert.deepEqual(Array.from(run.completedRoleIds), []);
});

test("resume at the synthesis role retries synthesis instead of returning to review", () => {
  const c = loadCore();
  const wf = c.makeWorkflowPreset("research", agents, idFactory());
  let run = c.newRun(wf, "Investigate", 1, idFactory());
  for (const role of wf.roles.slice(0, -1))
    run = c.recordRoleOutput(run, role, { content: "ok", reasoning: "" }, 2);
  run = { ...run, status: "stopped" };
  run = c.prepareRunResume(wf, run, 3);
  const action = c.nextWorkflowAction(wf, run);
  assert.equal(action.type, "role");
  assert.equal(action.role.stage, "synthesis");
});

test("workflow editing is blocked only while a run is unfinished", () => {
  const c = loadCore();
  assert.equal(c.canEditWorkflowRun(null), true);
  assert.equal(c.canEditWorkflowRun({ status: "complete" }), true);
  for (const status of ["running", "review", "stopped", "synthesizing"])
    assert.equal(c.canEditWorkflowRun({ status }), false);
});

test("initial work prompt includes bounded completed conversation context", () => {
  const c = loadCore();
  const wf = c.makeWorkflowPreset("research", agents, idFactory());
  const run = c.newRun(wf, "Continue", 1, idFactory());
  run.history = [{ role: "user", content: "Earlier question" }, { role: "assistant", content: "Earlier answer" }];
  const msgs = c.buildWorkflowMessages(wf, run, wf.roles[0], agents[0]);
  assert.match(msgs.at(-1).content, /Relevant completed conversation/);
  assert.match(msgs.at(-1).content, /Earlier answer/);
});
