# Workflow Pipelines Design

## Goal

Add reusable multi-agent workflows to the existing static DeepSeek Agents app. A workflow assigns existing agents to 2–5 ordered roles, runs an initial work and critique pipeline automatically, pauses for human review, and performs final synthesis only after approval.

The feature must preserve the app's current constraints: one static `index.html`, no dependencies or backend, mobile-first interaction, streaming DeepSeek responses, and browser-only persistence.

## Product Decisions

- Workflows become a third conversation type beside agents and groups.
- Version 1 uses deterministic template pipelines rather than autonomous speaker selection or a node editor.
- Each workflow contains 2–5 ordered role slots. Multiple slots may reference the same agent, though the editor warns when this happens.
- A run has one initial-work stage, one critique stage, a required review pause, and one final-synthesis stage.
- Roles execute sequentially to reuse the existing streaming interface and keep API use predictable.
- Users may stop a run, retry one failed role, add review guidance, approve synthesis, or cancel the run.
- A stopped or interrupted run remains resumable after reload.
- No automatic recursive debate, web research, tool execution, or parallel API requests are included in version 1.

## Templates

The app ships with three template presets. Presets populate editable role slots; they are not hard-coded execution modes.

### Research

1. Investigator — develops the initial findings.
2. Skeptic — challenges assumptions and unsupported claims.
3. Fact Checker — identifies verification gaps and contradictions.
4. Synthesizer — produces the final answer after approval.

### Coding

1. Architect — proposes the approach and constraints.
2. Implementer — produces the concrete solution.
3. Reviewer — checks correctness, edge cases, and maintainability.
4. Synthesizer — returns the corrected final solution after approval.

### Decision

1. Advocate — develops the strongest case for the leading option.
2. Challenger — argues against it and presents alternatives.
3. Risk Analyst — weighs failure modes and trade-offs.
4. Synthesizer — gives a final recommendation after approval.

Users can rename a workflow, choose its icon, switch presets, change role names and instructions, select a different existing agent for each role, and add or remove slots while keeping 2–5 roles. Exactly one role must be the synthesizer; by default it is the final slot.

## Data Model and Persistence

Add `ds_workflows` and allow `ds_kind` to be `"workflow"`.

```js
{
  id,
  emoji,
  name,
  template: "research" | "coding" | "decision" | "custom",
  roles: [
    { id, name, instruction, agentId, stage: "work" | "critique" | "synthesis" }
  ]
}
```

Workflow conversation history continues to use `ds_conv_<workflowId>`. Each workflow assistant message adds metadata:

```js
{
  role: "assistant",
  content,
  reasoning,
  agentId,
  agentName,
  agentEmoji,
  workflowRoleId,
  workflowRoleName,
  workflowStage,
  runId,
  error
}
```

Active execution state uses `ds_run_<workflowId>`:

```js
{
  id,
  task,
  status: "running" | "review" | "synthesizing" | "complete" | "stopped",
  nextRoleIndex,
  completedRoleIds,
  outputs: [
    { roleId, content, reasoning, error, completedAt }
  ],
  guidance,
  startedAt,
  updatedAt
}
```

Only one run may be active per workflow. Starting a new task after a completed run creates a new run. The run record owns the original task and structured outputs needed for deterministic retries and synthesis; rendered conversation messages are its display history. Clearing the workflow conversation also clears its run state.

If an agent referenced by a workflow is deleted, that slot becomes unassigned instead of silently disappearing. The workflow remains editable but cannot run until every slot is assigned.

## Execution and Prompt Construction

Extract the API message construction and streaming transport so a caller can supply a system prompt, message list, and output metadata without depending on `currentKind`. Existing agent and group behavior remains unchanged.

For every workflow role, construct a role-specific system message from:

1. The selected agent's normal system prompt.
2. The workflow role name and instruction.
3. The current stage rules.
4. A requirement not to impersonate other roles or prefix its own name.

The initial work role receives the user's task plus relevant completed conversation context. Later work or critique roles receive the task and labeled outputs produced earlier in the same run. Critique instructions explicitly ask for concrete errors, missing evidence, risks, and recommended corrections rather than a fresh standalone answer.

At the review pause, the user can inspect every role card. Optional guidance is appended as a labeled user instruction to the synthesis context. The synthesizer receives the original task, all completed role outputs, all critiques, and the user's guidance. It is instructed to resolve disagreements explicitly, apply valid corrections, and return one self-contained final answer.

Workflow prompts are built from structured run data, not by replaying every rendered message indiscriminately. This prevents prior runs or UI status messages from contaminating the current run.

## User Interface

### Drawer

Add a Workflows section above Groups with workflow rows and a `New workflow` action. A workflow row shows its icon, name, template, and role count. Selecting it sets `currentKind="workflow"`; editing it opens a bottom sheet.

### Workflow Editor

The editor contains:

- icon and workflow name;
- template selector;
- 2–5 ordered role cards;
- role name and instruction;
- agent selector populated from existing agents;
- stage selector constrained to work, critique, or synthesis;
- add, remove, and reorder controls;
- save and delete actions.

Changing the template asks for confirmation only when the user has modified role definitions, because applying a preset replaces them. Save validation requires 2–5 roles, assigned agents, non-empty role names, at least one work role, at least one critique role, and exactly one synthesis role placed last.

### Workflow Conversation

When idle, the composer accepts a task and the send button starts the run. During automatic stages, the header shows the current role and progress such as `2 of 3 · Reviewer`; the send button becomes Stop and the composer is disabled.

Each output is displayed with both role and agent labels. Stage markers separate initial work, critique, review, and synthesis. Streaming remains visible one role at a time.

At the review pause, a fixed action panel replaces the normal composer and provides:

- `Approve & synthesize` as the primary action;
- an optional guidance field;
- `Retry` on each completed role card;
- `Cancel run` as a secondary action.

The action panel includes a plain-language estimate of the next action, for example `1 more API response`, rather than a monetary estimate the client cannot calculate reliably.

After synthesis, the normal composer returns. A later user task begins a separate run in the same workflow conversation.

## Failure, Stop, and Recovery Behavior

- Missing API key opens Settings before a run is created.
- Invalid workflow configuration opens the editor and highlights the first invalid role.
- An HTTP or stream error stops the pipeline at that role, preserves the error card, and shows Retry and Cancel actions.
- Stop aborts only the current request and marks the run stopped. Resume retries the interrupted role rather than skipping it.
- Reload reconstructs the UI from the saved run. A persisted `running` or `synthesizing` state is converted to `stopped`, because the original fetch cannot survive reload.
- Retry removes the failed or partial output for that role and reruns it with the same prior context. Successful downstream outputs are cleared if an earlier role is retried, preventing stale critiques or synthesis.
- Deleting a workflow clears its conversation and run state after confirmation.
- The existing 200-message conversation cap remains. Task and role outputs for the active run are stored in its run record, so history truncation cannot break an unfinished run.

## Code Boundaries

The app remains a single file, but the script gains explicit functional sections:

- workflow storage and validation;
- workflow/editor rendering;
- run-state transitions;
- structured workflow prompt construction;
- generic streaming request execution;
- workflow action handlers.

The state-transition functions must remain independent of DOM rendering where practical. This allows browserless tests to exercise validation, prompt construction, and run progression without mocking the full UI.

## Verification

Create a lightweight browserless JavaScript test harness using Node's built-in `node:test` and `assert` modules; no package installation is required. Extract or expose pure functions in a way that the harness can evaluate without starting the app.

Tests cover:

- workflow validation for role count, assignment, stage ordering, and exactly one synthesizer;
- preset generation without shared mutable objects;
- prompt construction for work, critique, guidance, and synthesis stages;
- run transitions through running, review, synthesizing, complete, stopped, resume, and retry;
- clearing downstream outputs after an earlier retry;
- missing-agent behavior after agent deletion;
- migration when stored data lacks workflow keys;
- preservation of existing agent and group message-role behavior.

Manual verification covers mobile-width layout, workflow creation and editing, sequential streaming, stopping, reload recovery, role retry, review guidance, final synthesis, clearing, and deletion. Existing agent chats, group responder chips, Everyone mode, settings, and agent duplication must also receive regression checks.

## Acceptance Criteria

- A user can create or customize a 2–5-role workflow from any shipped template.
- Starting a task automatically runs work and critique roles sequentially.
- The app always pauses before synthesis and clearly shows what has completed.
- The user can add guidance, retry a role, stop/resume, cancel, or approve synthesis.
- Synthesis uses the original task plus labeled role outputs and guidance, without unrelated prior-run contamination.
- Run state survives reload safely and never resumes a nonexistent network request automatically.
- API credentials, workflows, runs, and conversations remain browser-local.
- No backend, build system, external dependency, or parallel request is introduced.
- Existing agent and group chat functionality continues to work.

## Out of Scope

- Autonomous agent-selected turn order or termination.
- Multiple debate rounds.
- Parallel role execution.
- Tool use, browsing, file attachments, or external memory.
- Sharing workflows between browsers.
- Accurate monetary/token cost calculation.
- A visual node-based workflow editor.
