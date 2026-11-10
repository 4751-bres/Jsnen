const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadCore,read}=require('./source');
const core=loadCore();
const plain=value=>JSON.parse(JSON.stringify(value));
const agent={id:'sera',name:'Sera',emoji:'🥖',prompt:'You are Sera, a baker.',memory:['Theo visits on Mondays.'],lorebook:{entries:[{always:true,content:'The bakery is blue.'}]},thoughts:true,moods:false,realClock:true,historyLimit:'50'};
const history=[{role:'user',content:'*I enter*',images:[{url:'data:image/png;base64,abc'}],at:1},{role:'assistant',content:'Hello.',thoughts:'I remember Theo.',learnedMemory:['Theo likes rye.'],at:2,versions:[{content:'Hi.',tail:[{role:'user',content:'A loaf please.'},{role:'assistant',content:'Of course.',versions:[{content:'Certainly.',tail:[{role:'assistant',content:'Fresh today.'}]}]}]}]}];

test('group copy keeps history, images, thoughts and branches with the original speaker',()=>{
  const result=core.agentChatGroup(agent,history,'group','Sera group');
  assert.deepEqual([...result.group.members],['sera']);
  assert.equal(result.group.thoughts,true);assert.equal(result.group.realClock,true);
  assert.equal(result.group.historyLimit,'50');assert.equal(result.group.moods,false);
  assert.deepEqual(plain(result.messages[0]),history[0]);
  const reply=result.messages[1],tail=reply.versions[0].tail[1];
  for(const message of [reply,tail,tail.versions[0].tail[0]])assert.equal(message.agentId,'sera');
  assert.equal(reply.thoughts,'I remember Theo.');assert.equal(reply.characterName,'Sera');
  result.group.memory.push('New fact');result.group.lorebook.entries[0].content='Changed';reply.versions[0].tail[0].content='Changed';
  assert.equal(agent.memory.length,1);assert.equal(agent.lorebook.entries[0].content,'The bakery is blue.');
  assert.equal(history[1].versions[0].tail[0].content,'A loaf please.');assert.equal(history[1].agentId,undefined);
});

test('original agent sees copied replies as its own; another agent sees them attributed to Sera',()=>{
  const built=core.agentChatGroup(agent,history,'group','Sera group');
  built.group.members.push('mara');
  const own=core.buildGroupApiMessages(built.group,agent,built.messages);
  const other=core.buildGroupApiMessages(built.group,{id:'mara',name:'Mara'},built.messages);
  assert.equal(own[2].role,'assistant');assert.equal(own[2].content,'Hello.');
  assert.equal(other[2].role,'user');assert.equal(other[2].content,'[Sera]: Hello.');
  assert.match(core.privateThoughtsBlock(built.messages,'sera'),/I remember Theo/);
  assert.equal(core.privateThoughtsBlock(built.messages,'mara'),'');
});

function harness(fail=false){
  const data=new Map([['ds_conv_sera',JSON.stringify(history)],['ds_dir_sera','{"note":"Slow pace"}'],['ds_chap_sera','[{"title":"Bakery"}]'],['ds_bg_sera','{"dim":0.5}'],['ds_sum_sera','{"summary":"Earlier"}']]);
  const notices=[],store={raw:key=>data.get(key)??null,setRaw:(key,value)=>data.set(key,value),removeRaw:key=>data.delete(key),set groups(value){if(fail)throw Error('quota');this.savedGroups=value;},touch(){},setPreview(){}};
  const ctx=vm.createContext({currentKind:'agent',currentId:'sera',controller:null,sequence:null,readingImages:false,agents:[agent],groups:[],workflows:[],messages:history,store,pendingImages:[],uid:()=> 'new',agentChatGroup:core.agentChatGroup,previewOf:()=>null,toast:t=>notices.push(t),loadConv(){ctx.messages=JSON.parse(data.get('ds_conv_'+ctx.currentId));},renderAttachments(){},renderAgents(){},openGroupEditor:id=>{ctx.editor=id;}});
  const source=read('app.js');vm.runInContext(source.slice(source.indexOf('function copyCurrentChatToGroup(){'),source.indexOf('$("#copyToGroupBtn").onclick')),ctx);
  return {ctx,data,notices};
}

test('copy opens a saved one-member group editor with all scene sidecars and leaves original intact',()=>{
  const {ctx,data}=harness();ctx.copyCurrentChatToGroup();
  assert.equal(ctx.currentKind,'group');assert.equal(ctx.currentId,'new');assert.equal(ctx.editor,'new');
  assert.equal(ctx.store.kind,'group');assert.equal(ctx.store.cur,'new');
  assert.deepEqual(plain(ctx.store.savedGroups[0].members),['sera']);
  for(const prefix of ['ds_dir_','ds_chap_','ds_bg_','ds_sum_'])assert.equal(data.get(prefix+'new'),data.get(prefix+'sera'));
  assert.equal(data.get('ds_conv_sera'),JSON.stringify(history));
  assert.equal(JSON.parse(data.get('ds_conv_new'))[1].agentId,'sera');
});

test('a failed group save rolls back every copied record and keeps the original chat selected',()=>{
  const {ctx,data,notices}=harness(true);ctx.copyCurrentChatToGroup();
  assert.equal(ctx.currentId,'sera');assert.equal(ctx.currentKind,'agent');assert.equal(ctx.groups.length,0);
  assert.ok(![...data.keys()].some(key=>key.endsWith('_new')));assert.match(notices[0],/storage/);
});

test('copy is unavailable for groups, workflows, streaming and image loading',()=>{
  for(const patch of [{currentKind:'group'},{currentKind:'workflow'},{controller:{}},{sequence:{}},{readingImages:true}]){
    const {ctx,data}=harness();Object.assign(ctx,patch);ctx.copyCurrentChatToGroup();assert.equal(data.has('ds_conv_new'),false);
  }
  assert.match(read('app.js'),/\$\("#copyToGroupBtn"\)\.hidden=currentKind!=="agent"/);
  assert.match(read('index.html'),/id="copyToGroupBtn"[\s\S]*?<b>Copy to group<\/b>/);
});
