const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadCore,source}=require('./source');
const core=loadCore();
const page=source();

test('direction blocks hold the author note and the one-shot instruction',()=>{
  assert.equal(core.directionBlock({}),'');
  const both=core.directionBlock({next:' Thunder cracks. ',note:'Slow burn.'});
  assert.match(both,/^Author's note[\s\S]*Slow burn\.\n\nDirector's instruction for your next reply only[\s\S]*Thunder cracks\.$/);
  assert.doesNotMatch(core.directionBlock({next:'X',note:'N'},{includeNext:false}),/X/);
  const msgs=core.withDirection([{role:'system',content:'S'},{role:'user',content:'U'}],{note:'N'});
  assert.equal(msgs.length,3);assert.equal(msgs[2].role,'system');assert.match(msgs[2].content,/N$/);
  assert.equal(core.withDirection([{role:'user',content:'U'}],{}).length,1);
  assert.equal(core.normalizeDirection({next:'x'.repeat(2000)}).next.length,1500);
});
test('twist prompt uses the recent story with names',()=>{
  const m=core.twistMessages([{role:'user',content:'Hi'},{role:'assistant',characterName:'Elise',content:'Hello'},{role:'assistant',error:true,content:'bad'}],'Rin');
  assert.equal(m[1].content,'Recent story:\n\nRin: Hi\n\nElise: Hello');
});
test('twists know where the characters stand (mood, closeness) and the chapter',()=>{
  const list=[{role:'assistant',characterName:'Nadia',content:'a',mood:{mood:'calm',level:3},bond:{level:50}},
    {role:'user',content:'b'},{role:'assistant',characterName:'Nadia',content:'c',mood:{mood:'jealous',level:7}},
    {role:'assistant',characterName:'Mara',content:'d',bond:{level:85}}];
  assert.deepEqual(JSON.parse(JSON.stringify(core.storyState(list))),[{name:'Nadia',mood:{mood:'jealous',level:7},bond:50},{name:'Mara',bond:85}]);
  const m=core.twistMessages(list,'Rin','The storm');
  assert.match(m[0].content,/tests, deepens or shakes those feelings/);
  assert.match(m[1].content,/^Current chapter: The storm\n\nWhere the characters stand now:\n- Nadia: feels jealous \(7\/10\), closeness to Rin 50\/100\n- Mara: closeness to Rin 85\/100\n\nRecent story:/);
  assert.match(core.twistMessages([])[1].content,/not started/);
});

const enc=new TextEncoder();
function harness(dir,content){
  const bodies=[],saved=new Map([['chat',dir]]);
  const ctx={AbortController,TextDecoder,setTimeout,clearTimeout,Response,ReadableStream,Error,TypeError,
    store:{k:'test',base:'https://api.deepseek.com',model:'deepseek-flash',saveConv(){}},
    currentId:'chat',messages:[],controller:null,
    renderChat(){},scheduleStreamPaint(){},cancelStreamPaint(){},renderResponders(){},setSending(){},toast(){},$:()=>({click(){}}),renderDirectorBar(){},REPLY_PLACEHOLDERS:vm.runInContext('REPLY_PLACEHOLDERS',core),
    webSearchWanted:()=>false,directionFor:id=>saved.get(id),saveDirection:(id,d)=>saved.set(id,d),withDirection:core.withDirection,
    modelSeesImages:()=>true,replyTokenLimit:core.replyTokenLimit,friendlyApiError:core.friendlyApiError,isRetryableStatus:core.isRetryableStatus,
    buildChatRequest:core.buildChatRequest,isLocalBase:core.isLocalBase,
    fetch:async(url,opts)=>{bodies.push(JSON.parse(opts.body));return new Response(new ReadableStream({start(c){if(content)c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"'+content+'"}}]}\n\n'));c.close();}}),{status:200});}};
  vm.createContext(ctx);
  const code=page.match(/async function streamCompletion\(agent,apiMessages,meta=\{\}\)\{[\s\S]*?(?=\n\/\* ---------- Stream one response from a specific agent)/)[0];
  vm.runInContext(code+'\nthis.streamCompletion=streamCompletion;',ctx);
  return {ctx,bodies,saved};
}
test('a reply follows the direction once, then the one-shot part is cleared',async()=>{
  const h=harness({next:'She confesses.',note:'Slow burn.'},'ok');
  await h.ctx.streamCompletion({temp:1,think:'off'},[{role:'user',content:'Hi'}]);
  const last=h.bodies[0].messages.at(-1);
  assert.equal(last.role,'system');assert.match(last.content,/Slow burn[\s\S]*She confesses/);
  assert.deepEqual({...h.saved.get('chat')},{next:'',note:'Slow burn.'});
});
test('a failed or continued reply keeps the one-shot direction',async()=>{
  const failed=harness({next:'Twist',note:''},'');
  await failed.ctx.streamCompletion({temp:1,think:'off'},[{role:'user',content:'Hi'}]);
  assert.equal(failed.saved.get('chat').next,'Twist');
  const cont=harness({next:'Twist',note:'N'},'more');
  await cont.ctx.streamCompletion({temp:1,think:'off'},[{role:'user',content:'Continue'}],{noSearch:true});
  assert.doesNotMatch(cont.bodies[0].messages.at(-1).content,/Twist/);assert.equal(cont.saved.get('chat').next,'Twist');
});

test('director instructions identify the character and the human author',()=>{
  const block=core.directionBlock({next:'I hand you a key.'},{actorName:'Elise',userName:'Alex'});
  assert.match(block,/\[char\] \(agent label: Elise\)/);
  assert.match(block,/\[user\], is Alex/);
  assert.match(block,/I\/me\/my refer to \[user\]/);
  assert.match(block,/I hand you a key\.$/);
});

test('a cut-off reply does not consume the direction and a newer direction survives completion',async()=>{
  const cut=harness({next:'Original',note:''},'Some text');
  const originalFetch=cut.ctx.fetch;
  cut.ctx.fetch=async(...args)=>{const response=await originalFetch(...args);const text=await response.text();return new Response(text+'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n',{status:200});};
  await cut.ctx.streamCompletion({name:'Elise',temp:1,think:'off'},[{role:'user',content:'Hi'}]);
  assert.equal(cut.saved.get('chat').next,'Original');
  const changed=harness({next:'Original',note:''},'ok');
  const fetch=changed.ctx.fetch;
  changed.ctx.fetch=async(...args)=>{const response=await fetch(...args);changed.saved.set('chat',{next:'New direction',note:''});return response;};
  await changed.ctx.streamCompletion({name:'Elise',temp:1,think:'off'},[{role:'user',content:'Hi'}]);
  assert.equal(changed.saved.get('chat').next,'New direction');
});

test('a completed background reply consumes only the direction it was sent',()=>{
  const ctx=loadCore(),code=require('./source').read('app.js');
  let direction={next:'Thunder',note:'Slow burn'};
  ctx.store={conv:()=>[],saveConv(){}};
  ctx.directionFor=()=>direction;
  ctx.saveDirection=(id,value)=>{direction=value;};
  vm.runInContext(code.slice(code.indexOf('function adoptJob('),code.indexOf('function refreshIfShowing(')),ctx);
  const job={status:'done',httpStatus:200,meta:{convId:'chat',at:123,directorNext:'Thunder'},raw:'data: '+JSON.stringify({choices:[{delta:{content:'The windows rattle.'},finish_reason:'stop'}]})+'\n'};
  ctx.adoptJob(job,false);
  assert.equal(direction.next,'');assert.equal(direction.note,'Slow burn');
  direction={next:'A newer direction',note:''};ctx.adoptJob(job,false);
  assert.equal(direction.next,'A newer direction');
  direction={next:'Thunder',note:''};ctx.adoptJob(job,true);
  assert.equal(direction.next,'Thunder');
});
