const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const LF=String.fromCharCode(10);
const source=fs.readFileSync('index.html','utf8');
const core=source.slice(source.indexOf('/* roleplay-core:start */'),source.indexOf('/* roleplay-core:end */'));
const single=source.slice(source.indexOf('function buildApiMessages('),source.indexOf('/* ---------- Stream one response'));
const image={name:'t.png',url:'data:image/png;base64,iVBORw0KGgo='};
const agent={id:'a',name:'Analyst',prompt:'Analyze images',model:'deepseek-flash',temp:1,think:'off'};
function build(messages,who){
  const ctx=vm.createContext({isGroup:()=>false,messages});
  vm.runInContext(core+LF+single,ctx);
  return ctx.buildApiMessages(who||agent);
}
function rpGroup(){
  return {members:['a','b'],roleplay:{enabled:true,setting:'A shared flat',
    user:{name:'Alex',description:'The user character'},
    characters:{a:{name:'Jordan',description:'Blunt'},b:{name:'Riley',description:'Warm'}}}};
}
function groupCore(){const ctx=vm.createContext({});vm.runInContext(core,ctx);return ctx;}

test('image turns append grounding after the agent prompt',()=>{
  const out=build([{role:'user',content:'',images:[image]}]);
  assert.equal(out[0].role,'system');
  assert.ok(out[0].content.includes('Analyze images'));
  assert.ok(out[0].content.includes('IMAGE CONTEXT'));
});

test('text-only turns include character framing without image instructions',()=>{
  const prompt=build([{role:'user',content:'hi'}])[0].content;
  assert.ok(prompt.includes('Analyze images'));
  assert.ok(prompt.includes('not a profile of the user'));
  assert.ok(!prompt.includes('IMAGE CONTEXT'));
});

test('grounding is added even when the agent has no prompt of its own',()=>{
  const out=build([{role:'user',content:'',images:[image]}],{...agent,prompt:''});
  assert.ok(out[0].content.startsWith('IMAGE CONTEXT'));
});

test('an image-only roleplay turn is labeled factually, not as a directive',()=>{
  const built=groupCore().buildGroupApiMessages(rpGroup(),agent,[{role:'user',content:'',images:[image]}]);
  assert.equal(built[1].content[0].text,'[Alex] shared an image.');
  assert.equal(built[1].content[1].image_url.url,image.url);
});

test('a roleplay turn with text keeps the speaker prefix',()=>{
  const built=groupCore().buildGroupApiMessages(rpGroup(),agent,[{role:'user',content:'Look at this',images:[image]}]);
  assert.equal(built[1].content[0].text,'[Alex]: Look at this');
});

test('image guidance preserves voice and casting without mandating an inventory',()=>{
  const sys=groupCore().buildGroupApiMessages(rpGroup(),agent,[{role:'user',content:'',images:[image]}])[0].content;
  assert.ok(sys.includes('IMAGE CONTEXT'));
  assert.ok(sys.includes("Accept the user's fictional casting"));
  assert.ok(sys.includes('Do not automatically give an image inventory'));
  assert.ok(!sys.includes('overrides tone'));
});

test('roleplay without images carries no grounding block',()=>{
  const sys=groupCore().buildGroupApiMessages(rpGroup(),agent,[{role:'user',content:'I enter.'}])[0].content;
  assert.ok(!sys.includes('IMAGE CONTEXT'));
});

test('plain group chats ground image turns too',()=>{
  const sys=groupCore().buildGroupApiMessages({members:['a']},agent,[{role:'user',content:'',images:[image]}])[0].content;
  assert.ok(sys.includes('IMAGE CONTEXT'));
});

test('an old image does not keep injecting image instructions into later text turns',()=>{
  const turns=[{role:'user',content:'Look',images:[image]},{role:'assistant',content:'I see it.'},{role:'user',content:'*I put the phone away* Hello again.'}];
  const built=build(turns);
  assert.ok(!built[0].content.includes('IMAGE CONTEXT'));
  assert.equal(built[1].content[1].image_url.url,image.url);
  assert.ok(!groupCore().buildGroupApiMessages(rpGroup(),agent,turns)[0].content.includes('IMAGE CONTEXT'));
});

test('shipped defaults and fallbacks use current model ids',()=>{
  const defaults=source.slice(source.indexOf('const DEFAULT_AGENTS'),source.indexOf('let agents = store.agents'));
  assert.ok(!defaults.includes('deepseek-v4-flash'),'default agents must not ship a legacy vision alias');
  assert.ok(!source.includes('||"deepseek-chat"'),'no fallback may resolve to a retired model name');
});
