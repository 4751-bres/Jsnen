const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadCore,source,read}=require('./source');
const core=loadCore();
const plain=v=>JSON.parse(JSON.stringify(v));

test('a group remembers who replies; unknown or removed choices fall back to the buttons',()=>{
  assert.deepEqual(plain(core.replyModeOf({},['a','b'])),{kind:'buttons'});
  assert.deepEqual(plain(core.replyModeOf({replyMode:'everyone'},['a','b'])),{kind:'everyone'});
  assert.deepEqual(plain(core.replyModeOf({replyMode:'auto'},['a','b'])),{kind:'auto'});
  assert.deepEqual(plain(core.replyModeOf({replyMode:'agent:b'},['a','b'])),{kind:'agent',id:'b'});
  assert.deepEqual(plain(core.replyModeOf({replyMode:'agent:gone'},['a','b'])),{kind:'buttons'});
  assert.deepEqual(plain(core.replyModeOf({replyMode:'weird'},['a','b'])),{kind:'buttons'});
  assert.deepEqual(plain(core.replyModeOf({replyMode:'discuss'},['a'])),{kind:'agent',id:'a'});
});
test('the chat menu has the Who replies choice; a saved choice hides the bar and replies after send',()=>{
  const page=source();
  assert.match(page,/id="replyMode"/);assert.match(page,/id="moodMenu"/);
  assert.match(page,/if\(!sequence&&replyModeOf\(group,mems\.map\(a=>a\.id\)\)\.kind!=="buttons"\)\{bar\.style\.display="none";return;\}/);
  assert.match(page,/if\(replyAsChosen\(\)\)return;/);
  assert.match(page,/group\.replyMode=e\.target\.value==="buttons"\?undefined:e\.target\.value;/);
});

test('empty Send takes a new agent turn without saving a user message',()=>{
  const app=read('app.js');
  const composer=app.slice(app.indexOf('const CONTINUE_TURN='),app.indexOf('function renderReplyMode'));
  const agents=[{id:'a'},{id:'b'}],runs=[];
  const context=vm.createContext({
    controller:null,readingImages:false,sequence:null,input:{value:'  '},pendingImages:[],messages:[],
    isWorkflow:()=>false,isGroup:()=>false,anyProviderReady:()=>true,curAgent:()=>agents[0],
    curGroup:()=>({}),groupMembers:()=>agents,whisperTarget:null,agents,
    replyModeOf:core.replyModeOf,isContextMessage:core.isContextMessage,
    runAgent:(agent,options)=>runs.push([agent.id,plain(options.extraMeta)]),
    commitComposer:()=>assert.fail('Empty Send must never commit a user message'),
  });
  vm.runInContext(composer,context);
  context.send(); // The agent can take the first turn in an entirely empty chat.
  assert.deepEqual(runs.pop(),['a',{continueTurn:true}]);
  context.isGroup=()=>true;
  context.messages=[{role:'assistant',agentId:'b',content:'Public reply.'},{role:'assistant',agentId:'a',whisperTo:'a',content:'Private reply.'}];
  context.send();
  assert.deepEqual(runs.pop(),['b',{continueTurn:true}]);
  context.whisperTarget='a';
  context.send();
  assert.deepEqual(runs.pop(),['a',{continueTurn:true,whisperTo:'a'}]);
  context.isWorkflow=()=>true;
  context.send();
  assert.equal(runs.length,0);
});
