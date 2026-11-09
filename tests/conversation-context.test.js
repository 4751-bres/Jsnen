const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadCore,read}=require('./source');

test('real clock uses the requested local timezone and separates story time',()=>{
  const core=loadCore();
  const block=core.realClockInstruction(Date.UTC(2026,10,9,0,15),'Europe/Bucharest');
  assert.match(block,/Monday, 9 November 2026/);
  assert.match(block,/02:15/);
  assert.match(block,/Europe\/Bucharest/);
  assert.match(block,/Keep fictional story time as established/);
});

test('clock control is between Duplicate and Clear and is scoped to its owner',()=>{
  const page=read('index.html');
  assert.ok(page.indexOf('id="duplicateChatBtn"')<page.indexOf('id="clockMenu"'));
  assert.ok(page.indexOf('id="clockMenu"')<page.indexOf('id="clearBtn"'));
  const code=read('app.js');
  const start=code.indexOf('function saveChatOption('),end=code.indexOf('function renderContextMenu(');
  const first={id:'a'},second={id:'b'},writes=[];
  const ctx=vm.createContext({chatOwner:()=>first,isWorkflow:()=>false,isGroup:()=>false,agents:[first,second],store:{set agents(value){writes.push(value);}},toast(){}});
  vm.runInContext(code.slice(start,end),ctx);
  assert.equal(ctx.saveChatOption({realClock:true}),true);
  assert.equal(ctx.agents[0].realClock,true);
  assert.equal(ctx.agents[1],second);
  assert.equal(first.realClock,undefined);
});

test('presence defaults to everyone and snapshots protect unseen messages after rejoining',()=>{
  const core=loadCore(),group={members:['a','b']};
  assert.deepEqual([...core.presentIds(group)],['a','b']);
  group.present=['a','deleted'];
  const event={role:'user',content:'The vault code is 7931.',seenBy:[...core.presentIds(group)]};
  group.present=['a','b'];
  assert.equal(core.visibleTo(event,'a'),true);
  assert.equal(core.visibleTo(event,'b'),false);
  assert.equal(core.visibleTo({content:'Legacy public message'},'b'),true);
  assert.equal(core.visibleTo({...event,whisperTo:'b'},'b'),false);
  const note={...event,learnedMemory:['The vault code is 7931.']};
  assert.equal(core.learnedMemoryEntries([note],'b').length,0);
  assert.equal(core.learnedMemoryEntries([note],'a').length,1);
  const bot={role:'assistant',agentId:'a',content:'I recall it.\n[remember: The vault code is 7931.]'};
  core.applyLearnedMemory(bot,true,[note]);
  assert.equal(bot.learnedMemory,undefined);
});

test('a returning character gets only witnessed history and their own whispers',()=>{
  const core=loadCore(),group={members:['a','b'],present:['a','b']};
  const history=[{role:'user',content:'Shared welcome',seenBy:['a','b']},
    {role:'user',content:'Offscreen secret',seenBy:['a']},
    {role:'user',content:'Whisper secret',seenBy:['a','b'],whisperTo:'a'}];
  const request=core.buildGroupApiMessages(group,{id:'b',name:'B'},history);
  assert.match(JSON.stringify(request),/Shared welcome/);
  assert.doesNotMatch(JSON.stringify(request),/Offscreen secret|Whisper secret/);
});

test('local retrieval finds a specific event hundreds of messages ago with its answer',()=>{
  const core=loadCore();
  const history=[{role:'user',content:'Where did we store the Lantern-47 backup keys?'},
    {role:'assistant',content:'The Lantern-47 backup keys are inside a blue tin.'},
    ...Array.from({length:300},(_,i)=>({role:i%2?'user':'assistant',content:'A routine conversation about dinner '+i})),
    {role:'user',content:'Where are the Lantern-47 backup keys?'}];
  const found=core.retrieveOldMessages(history,'Lantern-47 backup keys',20);
  assert.ok(found.some(entry=>entry.text.includes('inside a blue tin')));
  assert.ok(found.length<=4);
  assert.match(core.retrievedHistoryBlock(found,'Rin','Mara'),/Historical records/);
  assert.equal(core.retrieveOldMessages(history,'Lantern-47 backup keys',0).length,0);
  assert.equal(core.retrieveOldMessages(history,'An unrelated telescope',20).length,0);
});

test('retrieval excludes invisible history, inactive versions, and failures and refreshes edited text',()=>{
  const core=loadCore(),first={role:'assistant',content:'The opal telescope is upstairs.',seenBy:['a']};
  const history=[first,{role:'user',content:'The opal telescope is broken.',whisperTo:'a'},
    {role:'assistant',error:true,content:'The opal telescope exploded.'},
    {role:'assistant',content:'A normal answer.',versions:[{content:'The opal telescope is hidden.'}]},
    {role:'user',content:'A recent question.'}];
  assert.equal(core.retrieveOldMessages(history,'opal telescope',1,'b').length,0);
  assert.equal(core.retrieveOldMessages(history,'opal telescope',1,'a')[0].text,first.content);
  first.content='The opal telescope is downstairs.';
  assert.equal(core.retrieveOldMessages(history,'opal telescope',1,'a')[0].text,first.content);
});

test('repetition checks each character separately and ignores code',()=>{
  const core=loadCore();
  const replies=Array.from({length:3},()=>({role:'assistant',agentId:'a',content:'*I tilt my head slightly.* Tell me more.'}));
  const instruction=core.repetitionInstruction(replies,'a');
  assert.match(instruction,/i tilt my head slightly/);
  assert.equal(core.repetitionInstruction(replies,'b'),'');
  assert.equal(core.repetitionInstruction(replies.slice(0,2),'a'),'');
  assert.equal(core.repetitionInstruction(replies.map(m=>({...m,content:'```\nI tilt my head slightly\n```'})),'a'),'');
});

test('background recovery preserves the original witnesses',()=>{
  const core=loadCore(),saved=[];
  core.store={conv:()=>[],saveConv:(id,list)=>saved.push(list)};
  const code=read('app.js');
  vm.runInContext(code.slice(code.indexOf('function adoptJob('),code.indexOf('function refreshIfShowing(')),core);
  const job={status:'done',httpStatus:200,meta:{convId:'group',at:123,fields:{agentId:'a',seenBy:['a']}},raw:'data: '+JSON.stringify({choices:[{delta:{content:'A hidden event.'},finish_reason:'stop'}]})+'\n'};
  assert.equal(core.adoptJob(job,false),'group');
  assert.deepEqual([...saved[0][0].seenBy],['a']);
  assert.equal(core.visibleTo(saved[0][0],'b'),false);
});
