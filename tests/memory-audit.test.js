const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadCore,read}=require('./source');
const core=loadCore();
const plain=value=>JSON.parse(JSON.stringify(value));
const turn=(i,extra={})=>({role:i%2?'assistant':'user',content:'Turn '+i,at:i,...extra});
const history=()=>[{role:'assistant',content:'The shop is open.',at:1,learnedMemory:['Rina lives in Paris.','Rina resides in Paris.','Rina owns the bakery.']},
  {role:'user',content:'Correction: Rina moved permanently to Lyon last spring.',at:2}];
const output=edit=>'I understand.\n[memory-update: '+JSON.stringify(edit)+']\n[memory-reviewed]';

test('maintenance falls on message 24, counts both speakers, and ignores failed or incomplete replies',()=>{
  const list=Array.from({length:22},(_,i)=>turn(i));
  assert.equal(core.memoryAuditDue(list),false);
  for(const extra of [{error:true},{truncated:true},{streaming:true},{stopped:true},{interrupted:'connection'},{finish:'content_filter'}])assert.equal(core.memoryAuditDue([...list,turn(23,extra)]),false);
  assert.equal(core.memoryAuditDue([...list,turn(22)]),true);
  const review=turn(23,{memoryAuditReviewed:true});
  assert.equal(core.memoryAuditDue([...list,review,...list]),false);
  assert.equal(core.memoryAuditDue([review,...list,turn(24)]),true);
});

test('private reviews do not postpone public or another character’s reviews',()=>{
  const list=[turn(1,{memoryAuditReviewed:true,memoryForAgent:'a'}),...Array.from({length:22},(_,i)=>turn(i+2))];
  assert.equal(core.memoryAuditDue(list,'a'),false);
  assert.equal(core.memoryAuditDue(list,null),true);
  assert.equal(core.memoryAuditDue(list,'b'),true);
});

test('plans contain only visible memories in the reviewed scope and no private thoughts as evidence',()=>{
  const list=[...history(),turn(3,{whisperTo:'a',learnedMemory:['Private to A.'],thoughts:'Not evidence.'}),turn(4,{whisperTo:'b',learnedMemory:['Private to B.']}),turn(5,{seenBy:['b'],learnedMemory:['Only B witnessed this.']})];
  const plan=core.memoryAuditPlan(list,'a','a',['A pinned fact.']);
  assert.deepEqual(Array.from(plan.candidates,e=>e.fact),['Private to A.']);
  const instruction=core.memoryAuditInstruction(plan);
  assert.doesNotMatch(instruction,/Private to B|Only B witnessed|Not evidence/);
  assert.match(instruction,/Never edit pinned facts/);assert.match(instruction,/do not erase lasting facts/);
});

test('an evidenced correction replaces active memory without altering historical saved notes',()=>{
  const list=history(),plan=core.memoryAuditPlan(list,undefined,null,[]);
  const bot={role:'assistant',content:output({id:1,fact:'Rina lives in Lyon after moving from Paris last spring.',evidence:2,quote:'Rina moved permanently to Lyon last spring.'})};
  core.applyMemoryAudit(bot,true,plan,list);
  assert.equal(bot.content,'I understand.');assert.equal(bot.memoryAuditReviewed,true);
  assert.equal(bot.memoryUpdates.length,1);
  assert.equal(list[0].learnedMemory[0],'Rina lives in Paris.');
  const facts=Array.from(core.learnedMemoryEntries([...list,bot]),e=>e.fact);
  assert.ok(!facts.includes('Rina lives in Paris.'));assert.ok(facts.includes('Rina lives in Lyon after moving from Paris last spring.'));
  assert.equal(core.learnedMemoryEntries(list)[0].fact,'Rina lives in Paris.');
});

test('duplicates can merge into a retained learned fact or a still-current pinned fact',()=>{
  const list=history(),pinned=['Rina owns the bakery.'],plan=core.memoryAuditPlan(list,undefined,null,pinned);
  const bot={role:'assistant',content:'Okay.\n[memory-update: {"id":2,"duplicateOf":1}]\n[memory-update: {"id":3,"duplicateOf":"p1"}]\n[memory-reviewed]'};
  core.applyMemoryAudit(bot,true,plan,list,pinned);
  assert.equal(bot.memoryUpdates.length,2);assert.deepEqual([...pinned],['Rina owns the bakery.']);
  assert.deepEqual(Array.from(core.learnedMemoryEntries([...list,bot]),e=>e.fact),['Rina lives in Paris.']);
  const changedPin={role:'assistant',content:output({id:3,duplicateOf:'p1'})};core.applyMemoryAudit(changedPin,true,plan,list,[]);
  assert.equal(changedPin.memoryUpdates.length,0);
});

test('missing evidence, invented ids, empty facts, and edits to pinned facts are rejected',()=>{
  const list=history(),pinned=['Rina is 30.'],plan=core.memoryAuditPlan(list,undefined,null,pinned);
  for(const edit of [{id:'p1',fact:'Rina is 40.',evidence:2,quote:'Rina moved permanently to Lyon'},
    {id:99,fact:'Invented.',evidence:2,quote:'Rina moved permanently to Lyon'},
    {id:1,fact:'Rina is queen.',evidence:2,quote:'Rina became queen yesterday.'},
    {id:1,fact:'',evidence:2,quote:'Rina moved permanently to Lyon'},
    {id:1,fact:'Rina is queen.',evidence:99,quote:'Rina moved permanently to Lyon'},
    {id:1,duplicateOf:1},{id:1,duplicateOf:99}]){
    const bot={role:'assistant',content:output(edit)};core.applyMemoryAudit(bot,true,plan,list,pinned);assert.equal(bot.memoryUpdates.length,0);
  }
});

test('failed, cut-off and unfinished reviews never apply edits; a successful no-op resets cadence',()=>{
  const list=history(),plan=core.memoryAuditPlan(list,undefined,null,[]),content=output({id:2,duplicateOf:1});
  for(const complete of [false]){const bot={role:'assistant',content};core.applyMemoryAudit(bot,complete,plan,list);assert.equal(bot.memoryAuditReviewed,undefined);assert.equal(bot.content,'I understand.');}
  const unfinished={role:'assistant',content:content.replace('\n[memory-reviewed]','')};core.applyMemoryAudit(unfinished,true,plan,list);
  assert.equal(unfinished.memoryAuditReviewed,undefined);
  const noop={role:'assistant',content:'No change.\n[memory-reviewed]'};core.applyMemoryAudit(noop,true,plan,list);
  assert.equal(noop.memoryAuditReviewed,true);assert.equal(noop.memoryUpdates.length,0);
  const empty={role:'assistant',content:'Hello.'};core.applyMemoryAudit(empty,true,core.memoryAuditPlan([],undefined,null),[]);
  assert.equal(empty.memoryAuditReviewed,true);
});

test('stale evidence after a source edit and changed privacy scope cannot modify memory',()=>{
  const list=history(),plan=core.memoryAuditPlan(list,undefined,null,[]);
  const content=output({id:1,fact:'Rina lives in Lyon.',evidence:2,quote:'Rina moved permanently to Lyon last spring.'});
  const edited=[list[0],{...list[1],content:'Actually she did not move.'}];
  const bot={role:'assistant',content};core.applyMemoryAudit(bot,true,plan,edited);assert.equal(bot.memoryUpdates.length,0);
  const privateBot={role:'assistant',content,memoryForAgent:'a'};core.applyMemoryAudit(privateBot,true,plan,list);assert.equal(privateBot.memoryUpdates.length,0);
});

test('streaming hides audit tags and partial tags, including JSON containing square brackets',()=>{
  const tag='\n[memory-update: {"id":1,"fact":"A [blue] bakery"}]\n[memory-reviewed]';
  for(let i=2;i<=tag.length;i++)assert.equal(core.stripMemoryAudit('Hello.'+tag.slice(0,i)).trimEnd(),'Hello.');
  assert.equal(core.stripMemoryAudit('A normal [link](https://example.com).'),'A normal [link](https://example.com).');
});

test('forgetting an updated memory does not revive the stale fact',()=>{
  const list=history(),plan=core.memoryAuditPlan(list,undefined,null,[]),bot={role:'assistant',content:output({id:1,fact:'Rina lives in Lyon.',evidence:2,quote:'Rina moved permanently to Lyon last spring.'})};
  core.applyMemoryAudit(bot,true,plan,list);
  const entries=core.learnedMemoryEntries([...list,bot]),key=entries.find(e=>e.fact==='Rina lives in Lyon.').key;
  const forgotten=core.forgetLearnedFact([...list,bot],key),facts=Array.from(core.learnedMemoryEntries(forgotten),e=>e.fact);
  assert.ok(!facts.includes('Rina lives in Lyon.'));assert.ok(!facts.includes('Rina lives in Paris.'));
});

test('memory maintenance follows reply versions and is cleared by manual reply edits',()=>{
  const ctx=loadCore(),code=read('app.js').split('/* message-edit-core:start */')[1].split('/* message-edit-core:end */')[0];vm.runInContext(code,ctx);
  const list=history(),plan=ctx.memoryAuditPlan(list,undefined,null),bot={role:'assistant',content:output({id:2,duplicateOf:1})};ctx.applyMemoryAudit(bot,true,plan,list);
  const changed=ctx.editMessageVersion([...list,bot],2,'A different reply.');
  assert.equal(changed[2].memoryAuditReviewed,undefined);assert.equal(changed[2].memoryUpdates,undefined);
  const restored=ctx.switchMessageVersion(changed,2,0);assert.equal(restored[2].memoryAuditReviewed,true);assert.equal(restored[2].memoryUpdates.length,1);
  assert.equal(ctx.learnedMemoryEntries(restored).length,2);assert.equal(ctx.learnedMemoryEntries(changed).length,3);
});

test('a recovered background reply performs the same validated maintenance',()=>{
  const ctx=loadCore(),list=history(),owner={id:'chat',memory:[]},plan=ctx.memoryAuditPlan(list,undefined,null);
  let saved;ctx.agents=[owner];ctx.groups=[];ctx.store={conv:()=>list,saveConv:(id,next)=>{saved=next;}};
  const code=read('app.js');vm.runInContext(code.slice(code.indexOf('function adoptJob('),code.indexOf('function refreshIfShowing(')),ctx);
  const job={status:'done',httpStatus:200,meta:{convId:'chat',at:30,fields:{memoryAuditTracked:true},memoryAuditPlan:plan},raw:'data: '+JSON.stringify({choices:[{delta:{content:output({id:2,duplicateOf:1})},finish_reason:'stop'}]})+'\n'};
  ctx.adoptJob(job,false);assert.equal(saved.at(-1).memoryAuditReviewed,true);assert.equal(ctx.learnedMemoryEntries(saved).length,2);
  ctx.adoptJob(job,true);assert.equal(saved.at(-1).memoryAuditReviewed,undefined);
  owner.autoMemory=false;ctx.adoptJob(job,false);assert.equal(saved.at(-1).memoryAuditReviewed,undefined);
});

test('new group-message pins are read-only and cannot be rewritten by stale audit plans',()=>{
  const list=history(),plan=core.memoryAuditPlan(list,undefined,null,[]);
  list[0]={...list[0],pinnedMemory:['Rina lives in Paris.']};
  const currentPlan=core.memoryAuditPlan(list,undefined,null,[]);
  assert.ok(!currentPlan.candidates.some(entry=>entry.fact==='Rina lives in Paris.'));
  assert.ok(currentPlan.pinned.some(entry=>entry.fact==='Rina lives in Paris.'));
  const bot={role:'assistant',content:output({id:1,fact:'Rina lives in Lyon.',evidence:2,quote:'Rina moved permanently to Lyon last spring.'})};
  core.applyMemoryAudit(bot,true,plan,list);
  assert.equal(bot.memoryUpdates.length,0);
  const key=core.learnedMemoryEntries(list)[0].key,forgotten=core.forgetLearnedFact(list,key);
  assert.equal(forgotten[0].pinnedMemory.length,0);
});

test('at most six changes apply in one review and duplicate chains cannot erase every copy',()=>{
  const list=[turn(1,{learnedMemory:Array.from({length:10},(_,i)=>'Equivalent note '+i)})];
  const plan=core.memoryAuditPlan(list,undefined,null,[]);
  const bot={role:'assistant',content:'Okay.\n'+Array.from({length:9},(_,i)=>'[memory-update: '+JSON.stringify({id:i+2,duplicateOf:1})+']').join('\n')+'\n[memory-reviewed]'};
  core.applyMemoryAudit(bot,true,plan,list);assert.equal(bot.memoryUpdates.length,6);
  assert.equal(core.learnedMemoryEntries([...list,bot]).length,4);
  const chain={role:'assistant',content:'Okay.\n[memory-update: {"id":1,"duplicateOf":2}]\n[memory-update: {"id":2,"duplicateOf":1}]\n[memory-reviewed]'};
  core.applyMemoryAudit(chain,true,plan,list);assert.equal(chain.memoryUpdates.length,1);
});

test('the 24th message reviews memory within the same high-thinking request alongside other hidden tags',async()=>{
  const bodies=[],ctx=loadCore({AbortController,TextDecoder,Response,ReadableStream,setTimeout,clearTimeout});
  const turns=Array.from({length:23},(_,i)=>turn(i+1));
  turns[0]={...turns[0],learnedMemory:['Rina lives in Paris.']};
  turns[22]={role:'user',at:23,content:'Rina moved permanently to Lyon last spring.'};
  const owner={id:'chat',memory:[]};let saved;
  Object.assign(ctx,{currentId:'chat',messages:turns,controller:null,store:{k:'test',base:'https://api.deepseek.com',model:'deepseek-flash',saveConv:(id,list)=>{saved=list;}},
    memoryOwner:()=>owner,isGroup:()=>false,thoughtsWanted:()=>true,webSearchWanted:()=>false,directionFor:()=>({}),
    renderChat(){},scheduleStreamPaint(){},cancelStreamPaint(){},renderResponders(){},setSending(){},toast(){},$:()=>({click(){}}),
    fetch:async(url,init)=>{bodies.push(JSON.parse(init.body));return new Response('data: '+JSON.stringify({choices:[{delta:{content:'[thoughts: I will remember her move.]\nLyon it is.\n[mood: calm 3]\n[memory-update: {"id":1,"fact":"Rina lives in Lyon after moving from Paris last spring.","evidence":23,"quote":"Rina moved permanently to Lyon last spring."}]\n[memory-reviewed]'},finish_reason:'stop'}]})+'\n\n',{status:200});}});
  const app=read('app.js');vm.runInContext(app.match(/async function streamCompletion\(agent,apiMessages,meta=\{\}\)\{[\s\S]*?(?=\n\/\* ---------- Stream one response from a specific agent)/)[0],ctx);
  await ctx.streamCompletion({name:'Rina',think:'high',temp:1.2},[{role:'user',content:'Go on.'}],{moodTracked:true});
  assert.equal(bodies.length,1);assert.equal(bodies[0].thinking.type,'enabled');assert.equal(bodies[0].reasoning_effort,'high');
  assert.ok(!('temperature' in bodies[0]));assert.ok(bodies[0].messages.some(m=>m.content.includes('PERIODIC MEMORY MAINTENANCE')));
  const bot=saved.at(-1);assert.equal(bot.content,'Lyon it is.');assert.equal(bot.thoughts,'I will remember her move.');assert.equal(bot.mood.mood,'calm');
  assert.equal(bot.memoryAuditReviewed,true);assert.equal(bot.memoryUpdates.length,1);
  assert.ok(ctx.learnedMemoryEntries(saved).some(entry=>entry.fact.includes('lives in Lyon')));
  const offCtx=ctx;owner.autoMemory=false;offCtx.messages=turns.slice(0,23);await offCtx.streamCompletion({name:'Rina',think:'high'},[{role:'user',content:'Go on.'}]);
  assert.ok(!bodies[1].messages.some(m=>m.content.includes('PERIODIC MEMORY MAINTENANCE')));
});
