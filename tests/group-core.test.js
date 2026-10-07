const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadCore,source}=require('./source');
const core=loadCore();
const people=[{id:'a',name:'Al'},{id:'b',name:'Alice'},{id:'c',name:'General Assistant'}];

test('@mentions resolve in text order, prefer longer names, accept names without spaces',()=>{
  assert.deepEqual([...core.findMentions('@Alice then @Al',people)],['b','a']);
  assert.deepEqual([...core.findMentions('hey @generalassistant and @ALICE',people)],['c','b']);
  assert.deepEqual([...core.findMentions('email al@example.com, @Alicia',people)],[]);
  assert.deepEqual([...core.findMentions('@Al @Al',people)],['a']);
});
test('speaker picking parses the answer and falls back to the next member',()=>{
  assert.equal(core.parseSpeakerChoice('Alice.',people),'b');
  assert.equal(core.parseSpeakerChoice('I pick General Assistant',people),'c');
  assert.equal(core.parseSpeakerChoice('nobody',people),null);
  assert.equal(core.fallbackNextSpeaker(['a','b','c'],'c'),'a');
  assert.equal(core.fallbackNextSpeaker(['a','b'],null),'a');
});
test('discussion rounds start after the last speaker and never repeat a speaker back to back',()=>{
  assert.deepEqual([...core.discussionOrder(['a','b','c'],2,'b')],['c','a','b','c','a','b']);
  assert.deepEqual([...core.discussionOrder(['a','b'],1,null)],['a','b']);
});
test('history limit keeps system prompts and the newest messages, and summaries join the system prompt',()=>{
  const api=[{role:'system',content:'S'},...Array.from({length:6},(_,i)=>({role:i%2?'assistant':'user',content:'m'+i}))];
  const {kept,dropped}=core.limitApiHistory(api,4);
  assert.deepEqual([...kept.map(m=>m.content)],['S','m2','m3','m4','m5']);
  assert.deepEqual([...dropped.map(m=>m.content)],['m0','m1']);
  assert.equal(core.limitApiHistory(api,0).kept,api);
  const withSum=core.withSummary(kept,'They agreed on Friday.');
  assert.match(withSum[0].content,/^S\n\nEARLIER CONVERSATION SUMMARY[\s\S]*Friday/);
  assert.equal(core.withSummary(kept,''),kept);
  assert.equal(core.messageText([{type:'text',text:'look'},{type:'image_url',image_url:{url:'x'}}]),'look [image]');
});
test('discussion mode adds a reply-to-each-other instruction only when asked',()=>{
  const g={members:['a']},agent={id:'a',name:'A'};
  assert.ok(!core.buildGroupApiMessages(g,agent,[])[0].content.includes('open discussion'));
  assert.ok(core.buildGroupApiMessages(g,agent,[],{discussion:true})[0].content.includes('open discussion'));
});
test('drawer ordering pins first, then recent or A–Z, otherwise creation order',()=>{
  const items=[{id:'1',name:'beta'},{id:'2',name:'Alpha'},{id:'3',name:'gamma'}];
  assert.deepEqual(core.orderDrawerItems(items).map(i=>i.id),['1','2','3']);
  assert.deepEqual(core.orderDrawerItems(items,{sort:'name'}).map(i=>i.id),['2','1','3']);
  assert.deepEqual(core.orderDrawerItems(items,{sort:'recent',activity:{'3':9,'1':5}}).map(i=>i.id),['3','1','2']);
  assert.deepEqual(core.orderDrawerItems(items,{sort:'name',pins:['3']}).map(i=>i.id),['3','2','1']);
});
test('conversation search finds the first matching message with a snippet',()=>{
  const hit=core.searchConversation([{content:'hello'},{content:'The PLAN is ready for review'}],'plan');
  assert.equal(hit.index,1);assert.equal(hit.match,'PLAN');assert.equal(hit.before,'The ');
  assert.equal(core.searchConversation([{content:'x'}],'zzz'),null);
  assert.equal(core.searchConversation([{content:'x'}],'  '),null);
});
test('pipe tables render as escaped HTML tables',()=>{
  const page=source(),ctx=vm.createContext({});
  vm.runInContext(page.slice(page.indexOf('function esc('),page.indexOf('/* ---------- Header / agent / group')),ctx);
  const html=ctx.md('| Name | Score |\n|---|:-:|\n| <b>x</b> | **9** |\nafter');
  assert.equal(html,'<div class="md-table"><table><thead><tr><th>Name</th><th>Score</th></tr></thead><tbody><tr><td>&lt;b&gt;x&lt;/b&gt;</td><td><b>9</b></td></tr></tbody></table></div>after');
  assert.equal(ctx.md('a | b'),'a | b');
});

test('chat-list previews show the last real message with its speaker',()=>{
  const at=new Date(2026,9,7,11,37).getTime();
  assert.deepEqual({...core.previewOf([{role:'user',content:'Hi',at:1},{role:'assistant',characterName:'Mara',agentName:'Mara agent',content:'*Raises a glass.*  Bravo.',at}])},{who:'Mara',text:'Raises a glass. Bravo.',at});
  assert.equal(core.previewOf([{role:'user',content:'Hi'},{role:'assistant',content:'⚠️ HTTP 401',error:true}]).who,'You');
  assert.equal(core.previewOf([{role:'user',content:'',images:[{}]}]).text,'Photo');
  assert.equal(core.previewOf([]),null);
  const now=new Date(2026,9,7,15,0).getTime();
  assert.equal(core.shortWhen(at,now),'11:37');
  assert.equal(core.shortWhen(new Date(2026,9,6,9,0).getTime(),now),'Yesterday');
  assert.equal(core.shortWhen(new Date(2026,9,3,9,0).getTime(),now),'Sat');
  assert.equal(core.shortWhen(new Date(2026,8,20,9,0).getTime(),now),'Sep 20');
  assert.equal(core.shortWhen(new Date(2025,0,2,9,0).getTime(),now),'Jan 2');
  assert.equal(core.shortWhen(0,now),'');
});
