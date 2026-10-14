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
  assert.equal(m[1].content,'Rin: Hi\n\nElise: Hello');
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
