const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadCore,source}=require('./source');
const core=loadCore();
const page=source();
const enc=new TextEncoder();
function harness(autoSpeak,content,extra={}){
  const spoken=[];
  const ctx={AbortController,TextDecoder,setTimeout,clearTimeout,Response,ReadableStream,Error,TypeError,
    store:{k:'t',base:'https://api.deepseek.com',model:'deepseek-flash',autoSpeak,saveConv(){}},
    currentId:'chat',messages:[],controller:null,renderChat(){},scheduleStreamPaint(){},cancelStreamPaint(){},renderResponders(){},setSending(){},toast(){},$:()=>({click(){}}),
    webSearchWanted:()=>false,directionFor:()=>({next:'',note:''}),speakMessage:(m,q)=>spoken.push([m.content,q]),REPLY_PLACEHOLDERS:vm.runInContext('REPLY_PLACEHOLDERS',core),
    modelSeesImages:()=>true,replyTokenLimit:core.replyTokenLimit,friendlyApiError:core.friendlyApiError,isRetryableStatus:core.isRetryableStatus,
    buildChatRequest:core.buildChatRequest,isLocalBase:core.isLocalBase,
    fetch:async()=>new Response(new ReadableStream({start(c){if(content)c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"'+content+'"}}]}\n\n'));c.close();}}),{status:200}),...extra};
  vm.createContext(ctx);
  const code=page.match(/async function streamCompletion\(agent,apiMessages,meta=\{\}\)\{[\s\S]*?(?=\n\/\* ---------- Stream one response from a specific agent)/)[0];
  vm.runInContext(code+'\nthis.streamCompletion=streamCompletion;',ctx);
  return {ctx,spoken};
}
test('finished replies are queued for reading only when auto-read is on',async()=>{
  const on=harness(true,'Hello there');await on.ctx.streamCompletion({temp:1,think:'off'},[]);
  assert.deepEqual(on.spoken,[['Hello there',true]]);
  const off=harness(false,'Hello');await off.ctx.streamCompletion({temp:1,think:'off'},[]);
  assert.equal(off.spoken.length,0);
  const empty=harness(true,'');await empty.ctx.streamCompletion({temp:1,think:'off'},[]);
  assert.equal(empty.spoken.length,0);
  const cont=harness(true,'more');await cont.ctx.streamCompletion({temp:1,think:'off'},[],{noSearch:true});
  assert.equal(cont.spoken.length,0);
});
