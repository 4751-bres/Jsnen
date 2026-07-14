# Roleplay in Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional roleplay mode to group chats where the user and multiple AI characters share a persistent scene.

**Architecture:** Keep the single-file application and existing group type. Add pure roleplay normalization and message-building helpers, extend the group editor with an opt-in scene bible and per-member character sheets, and adapt the existing responder flow without changing normal groups.

**Tech Stack:** Static HTML/CSS/JavaScript, localStorage, OpenAI-compatible streaming chat completions, Node built-in test runner.

## Global Constraints

- Keep the app static, dependency-free, mobile-first, and installable.
- Add no app-side keyword blacklist, content classifier, moderation request, or automatic prompt refusal.
- Mature mode is an explicit adult confirmation stored only in the browser.
- Preserve all existing groups and conversations through backward-compatible normalization.
- API keys and conversations remain browser-local and are never committed.
- Use TDD: each production change follows a failing regression test.

---

### Task 1: Roleplay Data and Prompt Core

**Files:**
- Modify: `index.html` near the storage helpers and `buildApiMessages`
- Create: `tests/roleplay-core.test.js`

**Interfaces:**
- Produces: `normalizeRoleplay(value, members, agents) -> RoleplayConfig`
- Produces: `normalizeStoredGroups(value, agents) -> Group[]`
- Produces: `isRoleplayGroup(group) -> boolean`
- Produces: `roleplayCharacter(group, agent) -> {name, description}`
- Produces: `buildGroupApiMessages(group, agent, messages) -> ApiMessage[]`

- [ ] **Step 1: Write the failing core tests**

Create `tests/roleplay-core.test.js` with the same VM extraction pattern as `workflow-core.test.js`. Inject and export the functions between `/* roleplay-core:start */` and `/* roleplay-core:end */`, then assert:

```js
test("legacy groups normalize without enabling roleplay", () => {
  const [group] = core.normalizeStoredGroups([{id:"g",name:"Friends",members:["a"]}], agents);
  assert.equal(group.roleplay.enabled, false);
  assert.equal(group.members[0], "a");
});

test("roleplay normalization preserves sheets and defaults new members", () => {
  const value={enabled:true,mature:true,setting:"A city",opening:"Rain falls.",
    user:{name:"Rin",description:"A detective"},
    characters:{a:{name:"Mara",description:"A fixer"}}};
  const rp=core.normalizeRoleplay(value,["a","b"],agents);
  assert.deepEqual(rp.characters.a,{name:"Mara",description:"A fixer"});
  assert.equal(rp.characters.b.name,"Basil");
  assert.equal(rp.mature,true);
});

test("roleplay prompt separates user, selected character, and cast turns", () => {
  const group={id:"g",members:["a","b"],roleplay:{enabled:true,mature:true,
    setting:"A city",opening:"",user:{name:"Rin",description:"Detective"},
    characters:{a:{name:"Mara",description:"Fixer"},b:{name:"Basil",description:"Doctor"}}}};
  const messages=[{role:"user",content:"I enter."},
    {role:"assistant",agentId:"b",agentName:"Basil",content:"I look up."},
    {role:"assistant",agentId:"a",agentName:"Mara",content:"You're late."}];
  const out=core.buildGroupApiMessages(group,agents[0],messages);
  assert.match(out[0].content,/play Mara/);
  assert.match(out[0].content,/User character: Rin/);
  assert.equal(out[1].content,"[Rin]: I enter.");
  assert.equal(out[2].content,"[Basil]: I look up.");
  assert.equal(out[3].role,"assistant");
});

test("normal group prompts retain current behavior", () => {
  const group={id:"g",members:["a"],roleplay:{enabled:false}};
  const out=core.buildGroupApiMessages(group,agents[0],[{role:"user",content:"Hi"}]);
  assert.match(out[0].content,/group chat/);
  assert.equal(out[1].content,"Hi");
});
```

- [ ] **Step 2: Run the core test and verify RED**

Run: `node --test --test-isolation=none tests/roleplay-core.test.js`

Expected: FAIL because the `roleplay-core` block and exported functions do not exist.

- [ ] **Step 3: Implement the pure helpers**

Add a marked core block in `index.html`:

```js
/* roleplay-core:start */
function normalizeRoleplay(value,members,agents){
  const source=value&&typeof value==="object"?value:{};
  const old=source.characters&&typeof source.characters==="object"?source.characters:{};
  const characters={};
  for(const id of members||[]){
    const agent=agents.find(a=>a.id===id),sheet=old[id]||{};
    characters[id]={name:String(sheet.name||agent?.name||"Character"),description:String(sheet.description||"")};
  }
  return {enabled:source.enabled===true,mature:source.mature===true,
    setting:String(source.setting||""),opening:String(source.opening||""),
    user:{name:String(source.user?.name||""),description:String(source.user?.description||"")},characters};
}
function normalizeStoredGroups(value,agents){
  return Array.isArray(value)?value.filter(g=>g&&typeof g.id==="string").map(g=>{
    const members=Array.isArray(g.members)?g.members.filter(id=>typeof id==="string"):[];
    return {...g,members,roleplay:normalizeRoleplay(g.roleplay,members,agents)};
  }):[];
}
function isRoleplayGroup(group){return group?.roleplay?.enabled===true;}
function roleplayCharacter(group,agent){
  const sheet=group?.roleplay?.characters?.[agent.id]||{};
  return {name:String(sheet.name||agent.name||"Character"),description:String(sheet.description||"")};
}
function buildGroupApiMessages(group,agent,messages){
  if(!isRoleplayGroup(group)){
    const base=agent.prompt?agent.prompt+"\n\n":"";
    const system=base+"You are \""+agent.name+"\" in a group chat with a human user and other AI agents. Messages from other participants are prefixed with their name in square brackets. Reply in your own voice as "+agent.name+". Do NOT prefix your reply with your own name.";
    const history=messages.filter(m=>!m.streaming&&m.content).map(m=>m.role==="user"?{role:"user",content:m.content}:m.agentId===agent.id?{role:"assistant",content:m.content}:{role:"user",content:"["+(m.agentName||"Agent")+"]: "+m.content});
    return [{role:"system",content:system},...history];
  }
  const rp=group.roleplay,character=roleplayCharacter(group,agent);
  const cast=(group.members||[]).filter(id=>id!==agent.id).map(id=>rp.characters[id]).filter(Boolean).map(c=>c.name+": "+c.description).join("\n");
  const system=[agent.prompt,"For this roleplay group, play "+character.name+".","Character: "+character.description,"User character: "+rp.user.name+" — "+rp.user.description,"Setting: "+rp.setting,cast&&"Other characters:\n"+cast,rp.mature&&"Mature-mode preference: enabled.","Remain in character, preserve continuity, never control the user's character, and do not prefix the reply with your name."].filter(Boolean).join("\n\n");
  const history=messages.filter(m=>!m.streaming&&m.content).map(m=>{
    if(m.role==="user")return {role:"user",content:"["+(rp.user.name||"User")+"]: "+m.content};
    if(m.agentId===agent.id)return {role:"assistant",content:m.content};
    return {role:"user",content:"["+(m.characterName||m.agentName||"Character")+"]: "+m.content};
  });
  return [{role:"system",content:system},...history];
}
/* roleplay-core:end */
```

Normalize stored groups after agents load and delegate the group branch of `buildApiMessages` to `buildGroupApiMessages(curGroup(),agent,messages)`.

- [ ] **Step 4: Run the core and existing tests and verify GREEN**

Run: `node --test --test-isolation=none tests/roleplay-core.test.js tests/index-smoke.test.js tests/workflow-core.test.js`

Expected: all tests PASS.

- [ ] **Step 5: Commit the core**

```powershell
git add index.html tests/roleplay-core.test.js
git commit -m "Add roleplay group data and prompts"
```

### Task 2: Group Editor and Validation

**Files:**
- Modify: `index.html` group editor markup, CSS, `openGroupEditor`, and `saveGroup`
- Modify: `tests/index-smoke.test.js`
- Modify: `tests/roleplay-core.test.js`

**Interfaces:**
- Consumes: `normalizeRoleplay`, `roleplayCharacter`
- Produces: `renderRoleplayEditor()`, `collectRoleplayEditor(members)`, `validateRoleplay(roleplay, members)`

- [ ] **Step 1: Add failing UI and validation tests**

Add IDs to the smoke-test list:

```js
for (const id of ["grRoleplay","grRpFields","grRpSetting","grRpOpening","grRpUserName","grRpUserDescription","grRpMature","grRpAdult","grRpCharacters"])
  assert.match(html,new RegExp(`id=["']${id}["']`));
```

Add core assertions:

```js
test("enabled roleplay requires adult confirmation and character names", () => {
  const rp=core.normalizeRoleplay({enabled:true,mature:true,user:{name:"Rin"},characters:{a:{name:""}}},["a"],agents);
  assert.deepEqual(core.validateRoleplay(rp,["a"],false),["adult-confirmation"]);
  assert.ok(core.validateRoleplay({...rp,mature:false,user:{name:""}},["a"],true).includes("user-name"));
});
```

- [ ] **Step 2: Run targeted tests and verify RED**

Run: `node --test --test-isolation=none tests/roleplay-core.test.js tests/index-smoke.test.js`

Expected: FAIL for missing controls and `validateRoleplay`.

- [ ] **Step 3: Add editor controls and behavior**

Insert beneath `#grMembers`:

```html
<label class="toggle-row"><input id="grRoleplay" type="checkbox"> <span>🎭 Roleplay mode</span></label>
<div id="grRpFields" style="display:none">
  <label>Setting / scenario</label><textarea class="field" id="grRpSetting"></textarea>
  <label>Opening scene</label><textarea class="field" id="grRpOpening"></textarea>
  <label>Your character name</label><input class="field" id="grRpUserName">
  <label>Your character</label><textarea class="field" id="grRpUserDescription"></textarea>
  <label class="toggle-row"><input id="grRpMature" type="checkbox"> <span>Mature roleplay</span></label>
  <label class="toggle-row" id="grRpAdultRow"><input id="grRpAdult" type="checkbox"> <span>I confirm I am an adult</span></label>
  <div class="sect-label">AI characters</div><div id="grRpCharacters"></div>
</div>
```

Implement `validateRoleplay` in the core block:

```js
function validateRoleplay(roleplay,members,adultConfirmed){
  if(!roleplay.enabled)return [];
  const errors=[];
  if(!roleplay.user.name.trim())errors.push("user-name");
  for(const id of members)if(!roleplay.characters[id]?.name?.trim())errors.push("character-name:"+id);
  if(roleplay.mature&&!adultConfirmed)errors.push("adult-confirmation");
  return errors;
}
```

Use one in-memory `groupRoleplayDraft` while the sheet is open. Render one `.roleplay-character` card for every selected `.mem.sel` row, preserve existing descriptions when membership changes, show/hide `#grRpFields` from `#grRoleplay`, and serialize normalized roleplay data into the existing group object. On validation failure, keep the sheet open and show `toast("Complete the roleplay character details")` or `toast("Confirm that you are an adult")`.

- [ ] **Step 4: Run targeted and full tests**

Run: `node --test --test-isolation=none tests/roleplay-core.test.js tests/index-smoke.test.js tests/workflow-core.test.js`

Expected: all tests PASS; normal-group tests remain unchanged.

- [ ] **Step 5: Commit the editor**

```powershell
git add index.html tests/index-smoke.test.js tests/roleplay-core.test.js
git commit -m "Add roleplay settings to group editor"
```

### Task 3: Roleplay Chat and Character Responses

**Files:**
- Modify: `index.html` header, empty state, responder bar, message rendering, `runAgent`
- Modify: `tests/index-smoke.test.js`
- Modify: `tests/roleplay-core.test.js`

**Interfaces:**
- Consumes: `isRoleplayGroup`, `roleplayCharacter`, `buildGroupApiMessages`
- Produces: assistant message metadata `{agentId, agentName, agentEmoji, characterName}`

- [ ] **Step 1: Add failing chat integration assertions**

```js
test("roleplay responder and message metadata paths remain present", () => {
  const html=fs.readFileSync("index.html","utf8");
  assert.ok(html.includes("Continue scene"));
  assert.ok(html.includes("characterName"));
  assert.ok(html.includes("Opening scene"));
  assert.ok(!html.includes('"/moderations"'));
});
```

- [ ] **Step 2: Run the smoke test and verify RED**

Run: `node --test --test-isolation=none tests/index-smoke.test.js`

Expected: FAIL because the roleplay response labels do not exist.

- [ ] **Step 3: Adapt the existing group flow**

Apply these exact behavior changes:

```js
// refreshHeader group branch
const rp=isRoleplayGroup(g);
$("#hSub").textContent=rp?"🎭 You are "+(g.roleplay.user.name||"your character")+" · choose who replies":n+" agent"+(n===1?"":"s")+" · tap a name below to reply";

// renderResponders labels
const character=isRoleplayGroup(curGroup())?roleplayCharacter(curGroup(),a):null;
b.innerHTML='<span>'+esc(a.emoji)+'</span><span>'+esc(character?.name||a.name)+'</span>';
all.innerHTML=isRoleplayGroup(curGroup())?'<span>🎭</span><span>Continue scene</span>':'<span>🔁</span><span>Everyone</span>';

// runAgent metadata
const character=isGroup()&&isRoleplayGroup(curGroup())?roleplayCharacter(curGroup(),agent):null;
const meta=isGroup()?{agentId:agent.id,agentName:agent.name,agentEmoji:agent.emoji,...(character?{characterName:character.name}:{} )}:{};
```

In `renderChat`, label roleplay assistant messages as `characterName + " · " + agentEmoji + " " + agentName`. In the empty state, show the opening scene plus `You play as <name>` when configured. Keep `everyoneRespond` sequential and stop immediately when `runAgent` returns false.

- [ ] **Step 4: Run all automated tests**

Run: `node --test --test-isolation=none tests/index-smoke.test.js tests/roleplay-core.test.js tests/workflow-core.test.js`

Expected: all tests PASS with no warnings from application code.

- [ ] **Step 5: Commit chat integration**

```powershell
git add index.html tests/index-smoke.test.js tests/roleplay-core.test.js
git commit -m "Add roleplay group chat experience"
```

### Task 4: Documentation, Regression Review, and Publication

**Files:**
- Modify: `README.md`
- Verify: `index.html`, all tests, GitHub Pages URL

**Interfaces:**
- Consumes: completed Roleplay-in-Groups feature
- Produces: documented, published, browser-verified build

- [ ] **Step 1: Document roleplay groups**

Add a feature bullet explaining Roleplay mode, user/AI character sheets, Continue scene, browser-local mature preference, and that the app adds no moderation request while the configured API controls its own responses.

- [ ] **Step 2: Run static and regression verification**

Run:

```powershell
node --test --test-isolation=none tests/index-smoke.test.js tests/roleplay-core.test.js tests/workflow-core.test.js
git diff --check
git status --short
```

Expected: every test passes, `git diff --check` prints nothing, and only intended files are modified.

- [ ] **Step 3: Commit documentation**

```powershell
git add README.md
git commit -m "Document roleplay group chats"
```

- [ ] **Step 4: Request code review and address only verified findings**

Use `superpowers:requesting-code-review`, inspect the complete branch diff, and rerun the full test command after any correction.

- [ ] **Step 5: Push and verify deployment**

Run `git push`, wait for GitHub Pages to serve the new commit, and verify `https://4751-bres.github.io/Jsnen/` returns HTTP 200 and contains `grRoleplay` plus `Continue scene`.

- [ ] **Step 6: Run the Chrome acceptance test**

Create a roleplay group with two agents, set a user character and two AI character sheets, enable Mature roleplay with adult confirmation, save, send a user-character message, test one selected reply, test Continue scene, stop one sequence, reload the page, and confirm the scene bible and conversation persist. Confirm zero application console errors and leave the tested group open.
