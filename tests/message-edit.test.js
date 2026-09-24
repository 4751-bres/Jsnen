const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('index.html','utf8');
const ctx=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('/* message-edit-core:start */'),source.indexOf('/* message-edit-core:end */')),ctx);
test('editing either role preserves metadata and images without modifying the original',()=>{
  for(const role of ['user','assistant']){
    const original={role,content:'Old',agentId:'a',characterName:'Elise',images:[{url:'image'}],reasoning:'Old reasoning'};
    const next=ctx.editedMessage(original,'*I wave* Hello');
    assert.equal(next.content,'*I wave* Hello');assert.equal(next.role,role);
    assert.equal(next.images,original.images);assert.equal(next.agentId,'a');
    assert.equal(next.reasoning,'');assert.equal(next.edited,true);assert.equal(original.content,'Old');
  }
});
test('empty edits require an existing image',()=>{
  assert.throws(()=>ctx.editedMessage({content:'hi'},'  '),/needs text/);
  assert.equal(ctx.editedMessage({content:'hi',images:[{}]},'').content,'');
});
test('edits create persistent versions, preserving later messages and original attachments',()=>{
  const messages=[{role:'user',content:'Hi',images:[{url:'image'}]},{role:'assistant',content:'Hello'}];
  const changed=ctx.editMessageVersion(messages,0,'Hey');
  assert.equal(changed.length,2);assert.equal(changed[1],messages[1]);
  assert.equal(changed[0].versions.length,2);assert.equal(changed[0].versionIndex,1);
  const restored=ctx.switchMessageVersion(JSON.parse(JSON.stringify(changed)),0,0);
  assert.equal(restored[0].content,'Hi');assert.equal(restored[1].content,'Hello');
  assert.equal(restored[0].images[0].url,'image');
  assert.equal(ctx.switchMessageVersion(restored,0,1)[0].content,'Hey');
});
test('regenerated versions retain separate later conversations through repeated switching',()=>{
  const original=[{role:'user',content:'Hi'},{role:'assistant',content:'A'},{role:'user',content:'Follow A'}];
  const branch=ctx.prepareRegeneration(original,1);
  assert.equal(branch.prefix.length,1);
  let current=[...branch.prefix,{role:'assistant',content:'B',versions:branch.versions,versionIndex:branch.versionIndex},{role:'user',content:'Follow B'}];
  current=ctx.switchMessageVersion(current,1,0);
  assert.equal(current[1].content,'A');assert.equal(current[2].content,'Follow A');
  current=ctx.switchMessageVersion(JSON.parse(JSON.stringify(current)),1,1);
  assert.equal(current[1].content,'B');assert.equal(current[2].content,'Follow B');
  assert.equal(original[1].content,'A');assert.equal(original.length,3);
});
test('nested versions serialize without cycles and each keeps its own continuation',()=>{
  let list=[{role:'user',content:'one'},{role:'assistant',content:'two'},{role:'user',content:'three'}];
  list=ctx.editMessageVersion(list,2,'THREE');
  list=ctx.editMessageVersion(list,0,'ONE');
  list=ctx.switchMessageVersion(list,0,0);
  list=ctx.switchMessageVersion(JSON.parse(JSON.stringify(list)),2,0);
  assert.equal(list[2].content,'three');
  list=ctx.switchMessageVersion(list,0,1);
  assert.equal(list[0].content,'ONE');assert.equal(list[2].content,'THREE');
});
test('invalid version indices fail without modifying the conversation',()=>{
  const list=[{role:'assistant',content:'original'}];
  assert.throws(()=>ctx.switchMessageVersion(list,0,9),/Version not found/);
  assert.equal(list[0].content,'original');assert.equal(list[0].versions,undefined);
});
function uiContext(options={}){
  const elements=new Map();
  const $=id=>{if(!elements.has(id))elements.set(id,{value:'',focus(){},click(){}});return elements.get(id);};
  const original=[{role:'user',content:'Hi'},{role:'assistant',content:'Original',agentId:'agent-a'},{role:'user',content:'Later'}];
  const state={saved:[],requests:[],toasts:[]};
  const c=vm.createContext({$,messages:original,currentId:'chat-a',controller:null,isWorkflow:()=>false,isGroup:()=>true,
    agents:[{id:'agent-a'}],curAgent:()=>({id:'single'}),closeAll(){},openSheet(){},renderChat(){},renderResponders(){},toast:t=>state.toasts.push(t),
    store:{k:'test-only',saveConv(id,list){if(options.full)throw Error('quota');state.saved.push({id,list});}},
    buildApiMessages:()=>c.messages.map(m=>({role:m.role,content:m.content})),
    streamCompletion:async(agent,payload,meta)=>{state.requests.push({agent,payload,meta});if(options.preflightFailure)return false;c.messages.push({role:'assistant',content:'New',...meta});return {ok:true};}
  });
  vm.runInContext(source.slice(source.indexOf('/* message-edit-core:start */'),source.indexOf('async function copyMessageText')),c);
  return {c,state,original,$};
}
test('save handler preserves later messages and saves edits to the originating chat',()=>{
  const {c,state,original,$}=uiContext();c.openMessageEditor(original[0]);$('#messageEditText').value='Edited';$('#saveMessageEdit').onclick();
  assert.equal(c.messages[0].content,'Edited');assert.equal(c.messages[2].content,'Later');
  assert.equal(state.saved[0].id,'chat-a');assert.equal(original[0].content,'Hi');
});
test('failed saves retain original messages and the editor draft',()=>{
  const {c,state,original,$}=uiContext({full:true});c.openMessageEditor(original[0]);$('#messageEditText').value='Edited';$('#saveMessageEdit').onclick();
  assert.equal(c.messages,original);assert.equal($('#messageEditText').value,'Edited');
  assert.match(state.toasts.at(-1),/not been applied/);
});
test('regeneration uses the original group agent and only the preceding context',async()=>{
  const {c,state,original}=uiContext();await c.regenerateMessage(original[1]);
  assert.equal(state.requests.length,1);assert.equal(state.requests[0].agent.id,'agent-a');
  assert.equal(state.requests[0].payload.length,1);assert.equal(state.requests[0].payload[0].content,'Hi');
  assert.equal(c.messages[1].content,'New');assert.equal(c.messages[1].versions[0].tail[0].content,'Later');
});
test('failed preflight restores the previous branch and busy conversations cannot regenerate',async()=>{
  const {c,state,original}=uiContext({preflightFailure:true});await c.regenerateMessage(original[1]);assert.equal(c.messages,original);
  c.controller={};await c.regenerateMessage(original[1]);assert.equal(state.requests.length,1);
});
test('version switching is atomic when storage is full',()=>{
  const {c,state}=uiContext({full:true});c.messages=c.editMessageVersion(c.messages,0,'Edited');const before=c.messages;
  c.selectMessageVersion(c.messages[0],0);assert.equal(c.messages,before);assert.equal(c.messages[0].content,'Edited');
  assert.match(state.toasts.at(-1),/Could not switch/);
});
