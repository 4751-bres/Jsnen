const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadCore,source}=require('./source');
const core=loadCore();
const page=source();

// streamCompletion plus its helpers (fetchWithRetry, wake lock), run against a scripted fetch.
function streamHarness(responses){
  const calls=[],toasts=[],saved=[];
  const ctx={AbortController,TextDecoder,TextEncoder,setTimeout,clearTimeout,Response,ReadableStream,Error,
    store:{k:'test',base:'https://example.invalid',model:'deepseek-flash',saveConv(id,list){saved.push(structuredClone(list));}},
    currentId:'chat',messages:[{role:'user',content:'Hi'}],controller:null,
    renderChat(){},scheduleStreamPaint(){},cancelStreamPaint(){},renderResponders(){},setSending(){},toast:t=>toasts.push(t),$:()=>({click(){}}),
    modelSeesImages:()=>true,replyTokenLimit:core.replyTokenLimit,friendlyApiError:core.friendlyApiError,isRetryableStatus:core.isRetryableStatus,
    fetch:async(url,opts)=>{calls.push(JSON.parse(opts.body));const next=responses.shift();return typeof next==='function'?next(opts):next;}};
  vm.createContext(ctx);
  const code=page.match(/async function streamCompletion\(agent,apiMessages,meta=\{\}\)\{[\s\S]*?(?=\n\/\* ---------- Stream one response from a specific agent)/)[0];
  vm.runInContext(code+'\nthis.streamCompletion=streamCompletion;',ctx);
  return {ctx,calls,toasts,saved};
}
const enc=new TextEncoder();
function sse(events,{failAfter=false,trailingNewline=true}={}){
  return new Response(new ReadableStream({start(c){
    events.forEach((e,i)=>c.enqueue(enc.encode('data: '+JSON.stringify(e)+(i===events.length-1&&!trailingNewline?'':'\n\n'))));
    // error() discards queued chunks, so fail only after the reader has taken them.
    if(failAfter)setTimeout(()=>c.error(new TypeError('network connection was lost')),20);else c.close();
  }}),{status:200});
}
const delta=t=>({choices:[{delta:{content:t}}]});

test('a dropped connection keeps the partial reply and marks it continuable',async()=>{
  const {ctx,saved}=streamHarness([sse([delta('Long story part one. ')],{failAfter:true})]);
  const result=await ctx.streamCompletion({temp:1,think:'off'},[{role:'user',content:'Hi'}]);
  assert.equal(result.bot.content,'Long story part one. ');
  assert.equal(result.bot.error,undefined);assert.match(result.bot.interrupted,/connection/);
  assert.equal(result.bot.truncated,true);assert.equal(result.ok,false);
  assert.equal(saved.at(-1).at(-1).content,'Long story part one. ');
});
test('busy responses are retried before failing, and errors are explained',async()=>{
  const busy=()=>new Response(JSON.stringify({error:{message:'busy'}}),{status:503});
  const ok=streamHarness([busy(),sse([delta('Hello')])]);
  const r1=await ok.ctx.streamCompletion({temp:1,think:'off'},[]);
  assert.equal(r1.bot.content,'Hello');assert.equal(ok.calls.length,2);assert.match(ok.toasts[0],/retrying/);
  const broke=streamHarness([new Response(JSON.stringify({error:{message:'Insufficient Balance'}}),{status:402})]);
  const r2=await broke.ctx.streamCompletion({temp:1,think:'off'},[]);
  assert.equal(r2.bot.error,true);assert.match(r2.bot.content,/balance is empty/);assert.equal(broke.calls.length,1);
});
test('thinking requests omit temperature; reply length sets max_tokens',async()=>{
  const h=streamHarness([sse([delta('a')]),sse([delta('b')])]);
  await h.ctx.streamCompletion({temp:0.3,think:'high',maxTokens:'max'},[]);
  await h.ctx.streamCompletion({temp:0.3,think:'off'},[]);
  assert.equal('temperature' in h.calls[0],false);assert.equal(h.calls[0].reasoning_effort,'high');assert.equal(h.calls[0].max_tokens,393216);
  assert.equal(h.calls[1].temperature,0.3);assert.equal('max_tokens' in h.calls[1],false);
});
test('finish reasons are recorded, a final event without newline is read, mid-stream errors surface',async()=>{
  const h=streamHarness([
    sse([delta('x'),{choices:[{delta:{},finish_reason:'insufficient_system_resource'}]},{choices:[],usage:{prompt_tokens:5,completion_tokens:1}}],{trailingNewline:false}),
    sse([delta('y'),{choices:[{delta:{},finish_reason:'content_filter'}]}]),
    sse([{error:{message:'Model overloaded'}}])
  ]);
  const a=await h.ctx.streamCompletion({temp:1,think:'off'},[]);
  assert.equal(a.bot.finish,'insufficient_system_resource');assert.equal(a.bot.truncated,true);assert.deepEqual({...a.bot.usage},{prompt:5,completion:1});
  const b=await h.ctx.streamCompletion({temp:1,think:'off'},[]);
  assert.equal(b.bot.finish,'content_filter');assert.equal(b.bot.truncated,undefined);
  const c=await h.ctx.streamCompletion({temp:1,think:'off'},[]);
  assert.equal(c.bot.error,true);assert.match(c.bot.content,/Model overloaded/);
});
test('api helpers: reply limits, friendly errors, times, markdown export',()=>{
  assert.equal(core.replyTokenLimit(''),undefined);assert.equal(core.replyTokenLimit('32768'),32768);assert.equal(core.replyTokenLimit('999999'),393216);
  assert.match(core.friendlyApiError(400,"This model's maximum context length is 1048576 tokens"),/longer than the model can read/);
  assert.match(core.friendlyApiError(401,''),/key was rejected/);
  assert.equal(core.friendlyApiError(418,'teapot'),'HTTP 418: teapot');
  const now=new Date(2026,9,5,15,0).getTime();
  assert.equal(core.messageTime(new Date(2026,9,5,9,7).getTime(),now),'09:07');
  assert.equal(core.messageTime(new Date(2026,9,3,21,30).getTime(),now),'Oct 3, 21:30');
  assert.equal(core.messageTime(new Date(2025,0,2,8,0).getTime(),now),'Jan 2 2025, 08:00');
  const md=core.chatToMarkdown('💬 Chat',[{role:'user',content:'Hi',images:[{}]},{role:'assistant',agentName:'Coder',content:'Hello'},{role:'system',content:'x'}],'Rin');
  assert.equal(md,'# 💬 Chat\n\n**Rin**\n\nHi\n\n_[1 image]_\n\n**Coder**\n\nHello\n');
});
test('roleplay prompt includes the opening scene; escaping covers quotes; code fences drop the language tag',()=>{
  const group={members:['a'],roleplay:{enabled:true,opening:'Rain hammers the window.',setting:'',user:{name:'Rin',description:''},characters:{a:{name:'Elise',description:''}}}};
  assert.match(core.buildGroupApiMessages(group,{id:'a',name:'A'},[])[0].content,/Opening scene[\s\S]*Rain hammers/);
  const ctx=vm.createContext({});
  vm.runInContext(page.slice(page.indexOf('function esc('),page.indexOf('/* ---------- Header / agent / group')),ctx);
  assert.equal(ctx.esc('"x" \'y\' <z>'),'&quot;x&quot; &#39;y&#39; &lt;z&gt;');
  assert.equal(ctx.esc(undefined),'');
  assert.equal(ctx.md('```js\nconst a = 1;\n```'),'<pre><code>const a = 1;\n</code></pre>');
  assert.equal(ctx.md('```\nplain\n```'),'<pre><code>plain\n</code></pre>');
});

test('day dividers label today, yesterday, this week, and older dates',()=>{
  const now=new Date(2026,9,5,15,0).getTime();
  assert.equal(core.dayLabel(new Date(2026,9,5,0,5).getTime(),now),'Today');
  assert.equal(core.dayLabel(new Date(2026,9,4,23,59).getTime(),now),'Yesterday');
  assert.equal(core.dayLabel(new Date(2026,9,1,12,0).getTime(),now),'Thu, Oct 1');
  assert.equal(core.dayLabel(new Date(2026,8,20,12,0).getTime(),now),'Sep 20');
  assert.equal(core.dayLabel(new Date(2025,11,31,12,0).getTime(),now),'Dec 31, 2025');
  assert.equal(core.dayKey(new Date(2026,9,5,0,1).getTime()),core.dayKey(new Date(2026,9,5,23,59).getTime()));
  assert.notEqual(core.dayKey(new Date(2026,9,5,0,1).getTime()),core.dayKey(new Date(2026,9,4,23,59).getTime()));
});

test('a saved event-stream transcript rebuilds the reply for background recovery',()=>{
  const raw=['data: {"choices":[{"delta":{"reasoning_content":"think "}}]}','','data: {"choices":[{"delta":{"content":"Hello"}}]}',
    'data: {"choices":[{"delta":{"content":" there"},"finish_reason":"length"}]}','data: {"choices":[],"usage":{"prompt_tokens":9,"completion_tokens":2}}',
    ': keep-alive','data: not json','data: [DONE]',''].join('\n');
  const r=core.parseSseText(raw);
  assert.equal(r.content,'Hello there');assert.equal(r.reasoning,'think ');assert.equal(r.finish,'length');
  assert.deepEqual({...r.usage},{prompt:9,completion:2});assert.equal(r.error,null);
  assert.equal(core.parseSseText('data: {"error":{"message":"Overloaded"}}\n').error,'Overloaded');
  assert.equal(core.parseSseText('').content,'');
});
