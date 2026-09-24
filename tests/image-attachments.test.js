const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('index.html','utf8');
const core=source.match(/\/\* roleplay-core:start \*\/([\s\S]*?)\/\* roleplay-core:end \*\//)[1];
const image={name:'test.png',url:'data:image/png;base64,iVBORw0KGgo='};
const agent={id:'a',name:'Analyst',prompt:'Analyze images',model:'deepseek-flash',temp:1,think:'off'};
function context(extra={}){return vm.createContext({...extra});}
test('single-agent image-only message sends real image_url blocks to fetch',async()=>{
  let payload;
  const ctx=context({AbortController,TextDecoder,store:{k:'test',base:'https://example.invalid',saveConv(){}},
    currentId:'a',messages:[{role:'user',content:'',images:[image]}],controller:null,
    isGroup:()=>false,renderChat(){},renderResponders(){},setSending(){},toast(){},
    fetch:async(url,options)=>{payload=JSON.parse(options.body);return {ok:true,body:{getReader:()=>({read:async()=>({done:true})})}};}});
  const functions=source.slice(source.indexOf('function buildApiMessages('),source.indexOf('/* ---------- Stream one response from a specific agent'));
  vm.runInContext(core+'\n'+functions,ctx);
  await ctx.streamCompletion(agent,ctx.buildApiMessages(agent));
  assert.equal(payload.model,'deepseek-flash');
  assert.deepEqual(payload.messages[1].content,[{type:'text',text:'An image is attached.'},{type:'image_url',image_url:{url:image.url}}]);
});
test('every group responder retains user image data and speaker labels',()=>{
  const ctx=context();vm.runInContext(core,ctx);
  const group={members:['a','b'],roleplay:{enabled:true,user:{name:'User',description:''},characters:{a:{name:'A',description:''},b:{name:'B',description:''}}}};
  const messages=[{role:'user',content:'Read this',images:[image]},{role:'assistant',agentId:'b',agentName:'B',content:'A chart.'}];
  for(const id of ['a','b']){
    const built=ctx.buildGroupApiMessages(group,{...agent,id},messages);
    assert.equal(built[1].content[0].text,'[User]: Read this');
    assert.equal(built[1].content[1].image_url.url,image.url);
  }
  const plain=ctx.buildGroupApiMessages({members:['a']},agent,[messages[0]]);
  assert.equal(plain[1].content[1].image_url.url,image.url);
});
test('legacy text conversations keep their string content',()=>{
  const ctx=context();vm.runInContext(core,ctx);
  assert.equal(ctx.imageContent('hello',undefined),'hello');
  assert.equal(ctx.imageContent('hello',[]),'hello');
});
test('attachment submission keeps draft intact when storage is full',()=>{
  const ctx=context({readingImages:false,input:{value:'Read this'},pendingImages:[image],messages:[],currentId:'a',store:{saveConv(){throw Error('quota');}},toast(){}});
  vm.runInContext(source.slice(source.indexOf('function commitComposer(){'),source.indexOf('function autoGrow()')),ctx);
  assert.equal(ctx.commitComposer(),false);
  assert.equal(ctx.input.value,'Read this');assert.equal(ctx.pendingImages.length,1);assert.equal(ctx.messages.length,0);
});
