# Workflow Pipelines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable 2–5-role DeepSeek workflows that automatically run work and critique stages, pause for human review, and synthesize only after approval.

**Architecture:** Keep the deployed app in `index.html` and add pure workflow-core functions inside a marked script block so Node tests can extract and evaluate them without a browser. Build workflow persistence, editor UI, structured prompt construction, and a deterministic run-state machine around the existing sequential streaming transport. Store active task/output data separately from rendered conversation history for safe reload and retry behavior.

**Tech Stack:** HTML5, CSS, browser JavaScript, `localStorage`, Fetch streaming/SSE, Node.js built-in `node:test`, `assert`, `fs`, and `vm`.

## Global Constraints

- The deployed app remains one static `index.html` with no runtime dependencies or backend.
- Existing `manifest.json` and GitHub Pages deployment continue to work.
- API credentials, agents, groups, workflows, runs, and conversations remain browser-local.
- Workflows contain 2–5 roles, at least one work role, at least one critique role, and exactly one final synthesis role.
- Roles run sequentially; version 1 has one work pass, one critique pass, one required review pause, and one synthesis pass.
- Reload never automatically restarts a network request.
- Existing agent chats, groups, Everyone mode, settings, and agent duplication must remain functional.
- Do not add autonomous turn selection, recursive debates, parallel requests, tools, attachments, sharing, or token-price estimates.

---

### Task 1: Preserve the inherited group-chat baseline

**Files:**
- Modify: `index.html:119-661`
- Create: `tests/index-smoke.test.js`

**Interfaces:**
- Consumes: current uncommitted group chats and agent duplication implementation.
- Produces: a committed baseline plus `extractInlineScript(html: string): string` for syntax checks.

- [ ] **Step 1: Write the failing smoke test**

```js
// tests/index-smoke.test.js
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
```

- [ ] **Step 2: Run the smoke test**

Run: `node --test tests/index-smoke.test.js`

Expected: PASS. If parsing fails, correct only syntax defects in the inherited implementation before committing; do not redesign it.

- [ ] **Step 3: Inspect and stage only the inherited baseline**

Run: `git diff --check && git diff -- index.html`

Expected: no whitespace errors; diff contains group chats and Duplicate Agent only.

- [ ] **Step 4: Commit the inherited feature baseline**

```bash
git add index.html tests/index-smoke.test.js
git commit -m "Add group chats and agent duplication"
```

Expected: one commit, leaving the working tree clean except for this plan/spec history.

---

### Task 2: Add pure workflow models, presets, and validation

**Files:**
- Modify: `index.html:279-320`
- Create: `tests/workflow-core.test.js`

**Interfaces:**
- Consumes: `uid(): string`, agent objects `{id, emoji, name, prompt, model, temp, think}`.
- Produces: `makeWorkflowPreset(template, agents, idFactory)`, `validateWorkflow(workflow, agents)`, `normalizeStoredWorkflows(value)`, `newRun(workflow, task, now, idFactory)`, `normalizeRunAfterReload(run)`.

- [ ] **Step 1: Write failing model and validation tests**

```js
// tests/workflow-core.test.js
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
  vm.runInContext(`${match[1]}\nthis.workflowCore={WORKFLOW_PRESETS,makeWorkflowPreset,validateWorkflow,normalizeStoredWorkflows,newRun,normalizeRunAfterReload};`, context);
  return context.workflowCore;
}

const agents = [
  {id:"a1",name:"One"},{id:"a2",name:"Two"},{id:"a3",name:"Three"},{id:"a4",name:"Four"}
];
const ids = (()=>{let n=0;return()=>`id${++n}`;})();

test("research preset creates independent ordered role objects", () => {
  const c=loadCore();
  const one=c.makeWorkflowPreset("research",agents,ids);
  const two=c.makeWorkflowPreset("research",agents,ids);
  assert.deepEqual(one.roles.map(r=>r.stage),["work","critique","critique","synthesis"]);
  one.roles[0].name="Changed";
  assert.equal(two.roles[0].name,"Investigator");
});

test("validation enforces assignments, role count, stages, and final synthesis", () => {
  const c=loadCore();
  const wf=c.makeWorkflowPreset("coding",agents,ids);
  assert.deepEqual(c.validateWorkflow(wf,agents),[]);
  wf.roles[0].agentId="missing";
  wf.roles[1].stage="synthesis";
  assert.deepEqual(c.validateWorkflow(wf,agents).map(e=>e.code),["missing-agent","synthesis-count"]);
});

test("validation rejects work roles placed after critique roles", () => {
  const c=loadCore();
  const wf=c.makeWorkflowPreset("research",agents,ids);
  wf.roles[1].stage="critique";
  wf.roles[2].stage="work";
  assert.ok(c.validateWorkflow(wf,agents).some(e=>e.code==="stage-order"));
  wf.roles[2].stage="unknown";
  assert.ok(c.validateWorkflow(wf,agents).some(e=>e.code==="invalid-stage"));
});

test("run owns task and becomes stopped after reload", () => {
  const c=loadCore();
  const wf=c.makeWorkflowPreset("decision",agents,ids);
  const run=c.newRun(wf,"Choose one",1000,ids);
  assert.equal(run.task,"Choose one");
  assert.deepEqual(run.outputs,[]);
  assert.equal(c.normalizeRunAfterReload({...run,status:"running"}).status,"stopped");
  assert.equal(c.normalizeRunAfterReload({...run,status:"review"}).status,"review");
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/workflow-core.test.js`

Expected: FAIL with `workflow core markers must exist`.

- [ ] **Step 3: Implement the marked pure core**

Add this before mutable app state:

```js
/* workflow-core:start */
const WORKFLOW_PRESETS={
  research:{emoji:"🔎",name:"Research",roles:[
    ["Investigator","Develop the strongest initial findings and expose assumptions.","work"],
    ["Skeptic","Challenge claims, assumptions, and missing alternatives.","critique"],
    ["Fact Checker","Identify unsupported facts, contradictions, and verification gaps.","critique"],
    ["Synthesizer","Resolve disagreements and produce one supported final answer.","synthesis"]]},
  coding:{emoji:"💻",name:"Coding",roles:[
    ["Architect","Define the approach, interfaces, constraints, and edge cases.","work"],
    ["Implementer","Produce the concrete runnable solution.","work"],
    ["Reviewer","Find correctness, security, edge-case, and maintainability defects.","critique"],
    ["Synthesizer","Apply valid review corrections and return the final solution.","synthesis"]]},
  decision:{emoji:"⚖️",name:"Decision",roles:[
    ["Advocate","Develop the strongest case for the leading option.","work"],
    ["Challenger","Argue against it and present the strongest alternatives.","critique"],
    ["Risk Analyst","Evaluate failure modes, reversibility, and trade-offs.","critique"],
    ["Synthesizer","Give one clear recommendation with its decisive reasons.","synthesis"]]}
};
function makeWorkflowPreset(template,agents,idFactory){
  const p=WORKFLOW_PRESETS[template]||WORKFLOW_PRESETS.research;
  return {id:idFactory(),emoji:p.emoji,name:p.name,template:WORKFLOW_PRESETS[template]?template:"research",
    roles:p.roles.map((r,i)=>({id:idFactory(),name:r[0],instruction:r[1],stage:r[2],agentId:agents[i%Math.max(agents.length,1)]?.id||""}))};
}
function validateWorkflow(wf,agents){
  const errors=[],roles=Array.isArray(wf?.roles)?wf.roles:[],known=new Set(agents.map(a=>a.id));
  if(roles.length<2||roles.length>5)errors.push({code:"role-count",roleId:null});
  for(const r of roles){
    if(!String(r.name||"").trim())errors.push({code:"role-name",roleId:r.id});
    if(!known.has(r.agentId))errors.push({code:"missing-agent",roleId:r.id});
    if(!["work","critique","synthesis"].includes(r.stage))errors.push({code:"invalid-stage",roleId:r.id});
  }
  if(!roles.some(r=>r.stage==="work"))errors.push({code:"missing-work",roleId:null});
  if(!roles.some(r=>r.stage==="critique"))errors.push({code:"missing-critique",roleId:null});
  const synth=roles.filter(r=>r.stage==="synthesis");
  if(synth.length!==1||roles.at(-1)?.stage!=="synthesis")errors.push({code:"synthesis-count",roleId:synth[0]?.id||null});
  let sawCritique=false;
  for(const r of roles.slice(0,-1)){
    if(r.stage==="critique")sawCritique=true;
    if(r.stage==="work"&&sawCritique){errors.push({code:"stage-order",roleId:r.id});break;}
  }
  return errors;
}
function normalizeStoredWorkflows(value){return Array.isArray(value)?value.filter(w=>w&&typeof w.id==="string"&&Array.isArray(w.roles)):[];}
function newRun(workflow,task,now,idFactory){return {id:idFactory(),workflowId:workflow.id,task,status:"running",nextRoleIndex:0,completedRoleIds:[],outputs:[],guidance:"",startedAt:now,updatedAt:now};}
function normalizeRunAfterReload(run){return run&&["running","synthesizing"].includes(run.status)?{...run,status:"stopped"}:run;}
/* workflow-core:end */
```

- [ ] **Step 4: Add storage accessors and state initialization**

```js
get workflows(){try{return normalizeStoredWorkflows(JSON.parse(localStorage.getItem("ds_workflows")))}catch(e){return []}},
set workflows(v){localStorage.setItem("ds_workflows",JSON.stringify(v))},
run(id){try{return normalizeRunAfterReload(JSON.parse(localStorage.getItem("ds_run_"+id)))}catch(e){return null}},
saveRun(id,v){v?localStorage.setItem("ds_run_"+id,JSON.stringify(v)):localStorage.removeItem("ds_run_"+id)},
```

Initialize `workflows=store.workflows`, accept `currentKind==="workflow"`, and fall back to the first agent when the stored workflow no longer exists.

- [ ] **Step 5: Run focused and smoke tests**

Run: `node --test tests/workflow-core.test.js tests/index-smoke.test.js`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/workflow-core.test.js
git commit -m "Add workflow models and validation"
```

---

### Task 3: Add workflow drawer and editor UI

**Files:**
- Modify: `index.html:1-539`
- Modify: `tests/index-smoke.test.js`

**Interfaces:**
- Consumes: `workflows`, `agents`, `makeWorkflowPreset`, `validateWorkflow`, `store.workflows`.
- Produces: `curWorkflow()`, `isWorkflow()`, `selectWorkflow(id)`, `renderWorkflows()`, `openWorkflowEditor(id)`, `collectWorkflowForm()`.

- [ ] **Step 1: Add failing structural assertions**

```js
test("workflow navigation and editor controls are present", () => {
  const html = fs.readFileSync("index.html", "utf8");
  for (const id of ["workflowList","addWorkflow","workflowEditor","wfTemplate","wfRoles","saveWorkflow","delWorkflow"])
    assert.match(html,new RegExp(`id=["']${id}["']`));
});
```

- [ ] **Step 2: Run the structural test**

Run: `node --test tests/index-smoke.test.js`

Expected: FAIL on `workflowList`.

- [ ] **Step 3: Add the drawer section and editor sheet**

Insert a Workflows section before Groups and a bottom sheet with icon, name, template selector, role-card container, add/save/delete/close buttons. Use existing `.agent-row`, `.field`, `.btn`, `.sheet`, `.mem`, and `.chip-btn` patterns; add only `.role-card`, `.role-head`, `.role-actions`, `.stage-badge`, and invalid-state CSS needed for compact mobile layout.

Required markup IDs:

```html
<div class="section-label">Workflows</div>
<div id="workflowList"></div>
<button class="add-agent" id="addWorkflow">＋ New workflow</button>

<section class="sheet bottom" id="workflowEditor">
  <h3 id="wfTitle">New workflow</h3>
  <div class="row"><div class="field"><label>Icon</label><input id="wfEmoji"></div><div class="field"><label>Name</label><input id="wfName"></div></div>
  <div class="field"><label>Template</label><select id="wfTemplate"><option value="research">Research</option><option value="coding">Coding</option><option value="decision">Decision</option><option value="custom">Custom</option></select></div>
  <div id="wfRoles"></div>
  <button class="btn" id="addWfRole">＋ Add role</button>
  <div class="sheet-actions"><button class="btn danger" id="delWorkflow">Delete</button><button class="btn ghost" data-close>Close</button><button class="btn primary" id="saveWorkflow">Save workflow</button></div>
</section>
```

- [ ] **Step 4: Implement editor rendering and validation**

Render each role card with inputs carrying `data-field="name|instruction|agentId|stage"` and `data-role-id`. Restrict synthesis to the final card when saving. Reorder with Up/Down buttons, remove only when more than two cards remain, and cap Add at five. Switching from a modified form to a preset uses `confirm("Replace the current roles with the selected template?")`; choosing Custom preserves roles.

On save, call `validateWorkflow`. Map the first error to a toast, add `.invalid` to its role card, and do not mutate storage. On success, persist, select the workflow, render, and close. On agent deletion, keep workflow role references unchanged so validation exposes the missing assignment.

- [ ] **Step 5: Run tests and inspect mobile-safe markup**

Run: `node --test tests/index-smoke.test.js tests/workflow-core.test.js`

Expected: all PASS.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/index-smoke.test.js
git commit -m "Add workflow navigation and editor"
```

---

### Task 4: Build structured workflow prompts and generic streaming

**Files:**
- Modify: `index.html:539-636`
- Modify: `tests/workflow-core.test.js`

**Interfaces:**
- Consumes: workflow, run, role, agent, and earlier structured outputs.
- Produces: `buildWorkflowMessages(workflow, run, role, agent)`, `streamCompletion(agent, apiMessages, outputMeta)`, compatible `runAgent(agent)`.

- [ ] **Step 1: Add failing prompt tests**

```js
test("critique prompt labels prior outputs and asks for corrections", () => {
  const c=loadCore();
  const wf=c.makeWorkflowPreset("coding",agents,ids);
  const run={task:"Build parser",guidance:"",outputs:[{roleId:wf.roles[0].id,content:"Use regex",reasoning:""}]};
  const msgs=c.buildWorkflowMessages(wf,run,wf.roles[2],agents[2]);
  assert.match(msgs[0].content,/Reviewer/);
  assert.match(msgs.at(-1).content,/\[Architect\]: Use regex/);
  assert.match(msgs.at(-1).content,/concrete errors/i);
});

test("synthesis prompt includes guidance and every labeled output", () => {
  const c=loadCore();
  const wf=c.makeWorkflowPreset("decision",agents,ids);
  const run={task:"Pick A or B",guidance:"Prefer reversible choices",outputs:wf.roles.slice(0,3).map((r,i)=>({roleId:r.id,content:`out${i}`,reasoning:""}))};
  const msgs=c.buildWorkflowMessages(wf,run,wf.roles[3],agents[3]);
  assert.match(msgs.at(-1).content,/Prefer reversible choices/);
  assert.match(msgs.at(-1).content,/\[Risk Analyst\]: out2/);
  assert.match(msgs.at(-1).content,/self-contained final answer/i);
});
```

Expose `buildWorkflowMessages` from `loadCore()`.

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/workflow-core.test.js`

Expected: FAIL because `buildWorkflowMessages` is undefined.

- [ ] **Step 3: Implement structured prompt construction inside the core markers**

```js
function buildWorkflowMessages(workflow,run,role,agent){
  const labels=new Map(workflow.roles.map(r=>[r.id,r.name]));
  const prior=(run.outputs||[]).filter(o=>o.content).map(o=>`[${labels.get(o.roleId)||"Role"}]: ${o.content}`).join("\n\n");
  const stageRule=role.stage==="critique"
    ? "Identify concrete errors, unsupported assumptions, missing alternatives, risks, and recommended corrections. Do not merely write a fresh answer."
    : role.stage==="synthesis"
      ? "Resolve disagreements, apply valid corrections, and return one self-contained final answer."
      : "Produce your assigned contribution. Be concrete and do not impersonate other roles.";
  const system=[agent.prompt||"",`You are the ${role.name} role in a multi-agent workflow.`,role.instruction,stageRule,"Do not prefix your answer with your role or agent name."].filter(Boolean).join("\n\n");
  const body=[`Original task:\n${run.task}`,prior&&`Earlier role outputs:\n${prior}`,run.guidance&&role.stage==="synthesis"&&`User review guidance:\n${run.guidance}`,role.stage==="critique"&&"Return the critique with concrete errors and corrections.",role.stage==="synthesis"&&"Return the self-contained final answer now."].filter(Boolean).join("\n\n");
  return [{role:"system",content:system},{role:"user",content:body}];
}
```

- [ ] **Step 4: Extract generic streaming transport**

Change `runAgent` so it builds its existing agent/group messages and delegates to:

```js
async function streamCompletion(agent,apiMessages,meta={}) {
  // Create the same assistant message and payload used today.
  // Copy meta fields onto the message before pushing it.
  // Preserve AbortController, SSE parsing, reasoning_content, errors,
  // conversation-id capture, rendering, and boolean completion result.
}
```

`runAgent(agent)` must remain a thin compatibility wrapper. Workflow execution passes role metadata and supplies `buildWorkflowMessages(...)`. Do not change endpoint, authorization, model, temperature, thinking, or SSE semantics.

- [ ] **Step 5: Run all tests**

Run: `node --test tests/*.test.js`

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/workflow-core.test.js
git commit -m "Add workflow prompts and reusable streaming"
```

---

### Task 5: Implement deterministic run transitions, retry, and recovery

**Files:**
- Modify: `index.html:300-680`
- Modify: `tests/workflow-core.test.js`

**Interfaces:**
- Consumes: `newRun`, workflow role order, `buildWorkflowMessages`, `streamCompletion`, `store.run/saveRun`.
- Produces: `nextWorkflowAction(workflow, run)`, `recordRoleOutput(run, role, output, now)`, `retryWorkflowRole(workflow, run, roleId, now)`, `startWorkflowRun(task)`, `continueWorkflowRun()`, `approveWorkflowSynthesis(guidance)`.

- [ ] **Step 1: Add failing transition tests**

```js
test("action sequence pauses after critique and before synthesis", () => {
  const c=loadCore(),wf=c.makeWorkflowPreset("research",agents,ids);
  let run=c.newRun(wf,"Investigate",1,ids);
  assert.equal(c.nextWorkflowAction(wf,run).role.stage,"work");
  for(const role of wf.roles.slice(0,-1)) run=c.recordRoleOutput(run,role,{content:role.name,reasoning:""},2);
  const action=c.nextWorkflowAction(wf,run);
  assert.equal(action.type,"review");
  assert.equal(action.run.status,"review");
});

test("approval enables exactly the synthesis role", () => {
  const c=loadCore(),wf=c.makeWorkflowPreset("research",agents,ids);
  let run=c.newRun(wf,"Investigate",1,ids);
  for(const role of wf.roles.slice(0,-1)) run=c.recordRoleOutput(run,role,{content:"ok",reasoning:""},2);
  run={...c.nextWorkflowAction(wf,run).run,status:"synthesizing",guidance:"Focus on uncertainty"};
  assert.equal(c.nextWorkflowAction(wf,run).role.stage,"synthesis");
});

test("retry clears target and every downstream output", () => {
  const c=loadCore(),wf=c.makeWorkflowPreset("coding",agents,ids);
  let run=c.newRun(wf,"Code",1,ids);
  for(const role of wf.roles)run=c.recordRoleOutput(run,role,{content:role.name,reasoning:""},2);
  run=c.retryWorkflowRole(wf,run,wf.roles[1].id,3);
  assert.deepEqual(run.outputs.map(o=>o.roleId),[wf.roles[0].id]);
  assert.equal(run.nextRoleIndex,1);
  assert.equal(run.status,"stopped");
});
```

Expose all three transition functions from `loadCore()`.

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/workflow-core.test.js`

Expected: FAIL because transition functions are undefined.

- [ ] **Step 3: Implement immutable transition functions in the core block**

```js
function recordRoleOutput(run,role,output,now){
  const outputs=(run.outputs||[]).filter(o=>o.roleId!==role.id).concat({roleId:role.id,content:output.content||"",reasoning:output.reasoning||"",error:!!output.error,completedAt:now});
  return {...run,outputs,completedRoleIds:[...new Set([...(run.completedRoleIds||[]),role.id])],nextRoleIndex:run.nextRoleIndex+1,updatedAt:now};
}
function nextWorkflowAction(workflow,run){
  const synthIndex=workflow.roles.findIndex(r=>r.stage==="synthesis");
  if(run.nextRoleIndex<synthIndex)return {type:"role",role:workflow.roles[run.nextRoleIndex],run};
  if(run.status!=="synthesizing"&&run.nextRoleIndex===synthIndex)return {type:"review",run:{...run,status:"review"}};
  if(run.status==="synthesizing"&&run.nextRoleIndex===synthIndex)return {type:"role",role:workflow.roles[synthIndex],run};
  return {type:"complete",run:{...run,status:"complete"}};
}
function retryWorkflowRole(workflow,run,roleId,now){
  const index=workflow.roles.findIndex(r=>r.id===roleId);
  if(index<0)return run;
  const keep=new Set(workflow.roles.slice(0,index).map(r=>r.id));
  return {...run,status:"stopped",nextRoleIndex:index,outputs:(run.outputs||[]).filter(o=>keep.has(o.roleId)),completedRoleIds:(run.completedRoleIds||[]).filter(id=>keep.has(id)),updatedAt:now};
}
```

- [ ] **Step 4: Implement orchestration and persistence**

`startWorkflowRun` validates configuration before creating or rendering a run. `continueWorkflowRun` loops over `nextWorkflowAction`, persists before and after every request, and stops at review, error, abort, or completion. Capture the just-finished assistant message and copy its content/reasoning/error into the structured output record. `approveWorkflowSynthesis` stores trimmed guidance, sets `synthesizing`, and calls continue. Stop marks the run `stopped`; Resume retries `nextRoleIndex`.

During boot or workflow selection, load `store.run(id)`. Persist normalized stopped state immediately when reload converted an in-flight state.

- [ ] **Step 5: Run all tests**

Run: `node --test tests/*.test.js`

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/workflow-core.test.js
git commit -m "Add resumable workflow execution"
```

---

### Task 6: Add workflow run UI, review controls, and error actions

**Files:**
- Modify: `index.html:1-680`
- Modify: `tests/index-smoke.test.js`

**Interfaces:**
- Consumes: current workflow/run, transition/orchestration functions.
- Produces: `renderWorkflowActions()`, `renderWorkflowProgress()`, `retryRoleFromUi(roleId)`, review guidance and approve/cancel/resume controls.

- [ ] **Step 1: Add failing UI assertions**

```js
test("workflow progress and review controls are present", () => {
  const html=fs.readFileSync("index.html","utf8");
  for(const id of ["workflowProgress","workflowActions","reviewGuidance","approveSynthesis","resumeWorkflow","cancelWorkflow"])
    assert.match(html,new RegExp(`id=["']${id}["']`));
});
```

- [ ] **Step 2: Run smoke test to verify failure**

Run: `node --test tests/index-smoke.test.js`

Expected: FAIL on `workflowProgress`.

- [ ] **Step 3: Add progress and action containers**

Place `#workflowProgress` above chat and `#workflowActions` between chat and composer. The action container includes `#reviewGuidance`, `#approveSynthesis`, `#resumeWorkflow`, and `#cancelWorkflow`; use display toggles rather than creating duplicate controls dynamically.

- [ ] **Step 4: Render all workflow states**

- Idle/complete: hide progress/actions; show composer.
- Running/synthesizing: show `current role · N of total`; disable composer; Send remains Stop.
- Review: label the stage, show completed role cards, guidance, `Approve & synthesize`, per-card Retry, and `Cancel run`; display `1 more API response`.
- Stopped/error: show Resume, Retry for the current failed role, and Cancel.
- Complete: mark the synthesis message as `Final synthesis` and restore composer.

Workflow messages show `workflowRoleName` plus agent icon/name. `renderChat` must not depend on the currently selected kind to retain labels when histories are reloaded.

- [ ] **Step 5: Wire recovery actions**

Approve calls `approveWorkflowSynthesis(reviewGuidance.value)`. Retry calls `retryWorkflowRole`, removes matching/downstream rendered messages for the same `runId`, persists both state and conversation, then resumes. Cancel marks the run complete with a cancelled flag and restores the composer without deleting prior outputs. Clear deletes both `ds_conv_<id>` and `ds_run_<id>`.

- [ ] **Step 6: Run tests and static checks**

Run: `node --test tests/*.test.js`

Expected: all PASS.

Run: `git diff --check`

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add index.html tests/index-smoke.test.js
git commit -m "Add workflow review and recovery UI"
```

---

### Task 7: Documentation and complete regression verification

**Files:**
- Modify: `README.md:1-78`
- Modify: `tests/index-smoke.test.js`
- Modify: `tests/workflow-core.test.js`

**Interfaces:**
- Consumes: completed workflow UI and core.
- Produces: user documentation and final regression evidence.

- [ ] **Step 1: Add final regression assertions**

```js
// tests/workflow-core.test.js
test("malformed storage and deleted agents fail safely", () => {
  const c=loadCore();
  assert.deepEqual(c.normalizeStoredWorkflows({bad:true}),[]);
  const wf=c.makeWorkflowPreset("research",agents,ids);
  const remaining=agents.filter(a=>a.id!==wf.roles[0].agentId);
  assert.ok(c.validateWorkflow(wf,remaining).some(e=>e.code==="missing-agent"));
});

test("retrying the first role clears every structured output", () => {
  const c=loadCore(),wf=c.makeWorkflowPreset("coding",agents,ids);
  let run=c.newRun(wf,"Code",1,ids);
  for(const role of wf.roles)run=c.recordRoleOutput(run,role,{content:"done",reasoning:""},2);
  run=c.retryWorkflowRole(wf,run,wf.roles[0].id,3);
  assert.deepEqual(run.outputs,[]);
  assert.deepEqual(run.completedRoleIds,[]);
});

// tests/index-smoke.test.js
test("workflow persistence keys remain browser local", () => {
  const html=fs.readFileSync("index.html","utf8");
  for(const key of ["ds_workflows","ds_run_","ds_conv_","ds_key"])
    assert.ok(html.includes(key),`missing ${key}`);
});

test("legacy agent and group entry points remain defined", () => {
  const html=fs.readFileSync("index.html","utf8");
  for(const name of ["buildApiMessages","runAgent","groupRespond","everyoneRespond","dupAgent"])
    assert.ok(html.includes(name),`missing legacy entry point ${name}`);
});
```

- [ ] **Step 2: Run full tests before documentation edits**

Run: `node --test tests/*.test.js`

Expected: all PASS.

- [ ] **Step 3: Update README**

Add concise sections covering:

- Workflows in the Features list.
- Research, Coding, and Decision templates.
- The automatic work/critique sequence and mandatory review pause.
- Approve, guidance, retry, stop/resume, cancel, and reload recovery.
- The fact that each role response and final synthesis consumes an API request.
- Browser-only persistence and the unchanged security model.

Also update the opening description from only chat agents to agents, groups, and multi-agent workflows.

- [ ] **Step 4: Run complete verification**

Run: `node --test tests/*.test.js`

Expected: all tests PASS with zero failures.

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only intended `README.md` and test changes before commit.

- [ ] **Step 5: Commit**

```bash
git add README.md tests/index-smoke.test.js tests/workflow-core.test.js
git commit -m "Document multi-agent workflows"
```

- [ ] **Step 6: Verify the final branch**

Run: `node --test tests/*.test.js && git status --short --branch && git log -8 --oneline`

Expected: all tests PASS; branch contains the separated spec, plan, inherited baseline, workflow-core, UI, execution, and documentation commits; no uncommitted files remain.
