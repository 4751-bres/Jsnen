const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('index.html','utf8');
const code=source.slice(source.indexOf('function duplicateCurrentChat(){'),source.indexOf('$("#duplicateChatBtn").onclick'));
function setup(kind='agent',fail=false){
  const original={id:'old',name:'Room',prompt:'Custom prompt',members:['a'],roleplay:{setting:'Office'},roles:[{id:'role-a'}]};
  const history=[{role:'user',content:'Hello',images:[{url:'image'}]},{role:'assistant',content:'New',versions:[{content:'Old',tail:[{role:'user',content:'Later'}]},{content:'New',tail:[]}],versionIndex:1}];
  const data=new Map([['ds_conv_old',JSON.stringify(history)]]),saved={},notices=[];
  const store={set agents(v){if(fail)throw Error('quota');saved.agents=v;},set groups(v){if(fail)throw Error('quota');saved.groups=v;},set workflows(v){if(fail)throw Error('quota');saved.workflows=v;}};
  const c=vm.createContext({currentKind:kind,currentId:'old',agents:kind==='agent'?[original]:[],groups:kind==='group'?[original]:[],workflows:kind==='workflow'?[original]:[],messages:history,currentRun:null,controller:null,readingImages:false,pendingImages:[{url:'draft'}],store,uid:()=> 'new',
    localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},
    isWorkflow:()=>kind==='workflow',toast:t=>notices.push(t),loadConv(){c.messages=JSON.parse(data.get('ds_conv_'+c.currentId));c.pendingImages=[];},renderAttachments(){},renderAgents(){},closeAll(){}});
  vm.runInContext(code,c);return {c,data,saved,original,history,notices};
}
test('duplicate preserves transcript, image and version branches with independent agent settings',()=>{
  const {c,data,saved,original,history}=setup();c.duplicateCurrentChat();
  assert.equal(c.currentId,'new');assert.equal(saved.agents[1].name,'Room copy');
  assert.deepEqual(JSON.parse(data.get('ds_conv_new')),history);
  c.messages[1].versions[0].tail[0].content='Changed';saved.agents[1].roleplay.setting='Changed';
  assert.equal(history[1].versions[0].tail[0].content,'Later');assert.equal(original.roleplay.setting,'Office');
  assert.equal(c.pendingImages[0].url,'draft');assert.equal(JSON.parse(data.get('ds_conv_old'))[0].content,'Hello');
});
test('group copies keep members and separate history; completed workflows can be copied',()=>{
  for(const kind of ['group','workflow']){const {c,saved}=setup(kind);c.duplicateCurrentChat();assert.equal(c.currentId,'new');assert.equal(saved[kind==='group'?'groups':'workflows'].length,2);}
});
test('quota failure leaves no orphan copy or changes to original selection',()=>{
  const {c,data,saved}=setup('agent',true);c.duplicateCurrentChat();
  assert.equal(c.currentId,'old');assert.equal(data.has('ds_conv_new'),false);assert.equal(c.agents.length,1);assert.equal(saved.agents,undefined);
});
test('copy is blocked while streaming or a workflow is unfinished',()=>{
  const busy=setup();busy.c.controller={};busy.c.duplicateCurrentChat();assert.equal(busy.c.currentId,'old');
  const workflow=setup('workflow');workflow.c.currentRun={status:'review'};workflow.c.duplicateCurrentChat();assert.equal(workflow.c.currentId,'old');
});
