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
  assert.ok(out[0].content.startsWith('Analyze images'));
  assert.ok(out[0].content.includes('IMAGE GROUNDING'));
});

test('text-only turns leave the system prompt byte-for-byte unchanged',()=>{
  assert.equal(build([{role:'user',content:'hi'}])[0].content,'Analyze images');
});

test('grounding is added even when the agent has no prompt of its own',()=>{
  const out=build([{role:'user',content:'',images:[image]}],{...agent,prompt:''});
  assert.ok(out[0].content.startsWith('IMAGE GROUNDING'));
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

test('roleplay grounding outranks the stay-in-character instruction',()=>{
  const sys=groupCore().buildGroupApiMessages(rpGroup(),agent,[{role:'user',content:'',images:[image]}])[0].content;
  assert.ok(sys.indexOf('IMAGE GROUNDING')>sys.indexOf('Remain in character'));
  assert.ok(sys.includes('cannot establish who someone is'));
});

test('roleplay without images carries no grounding block',()=>{
  const sys=groupCore().buildGroupApiMessages(rpGroup(),agent,[{role:'user',content:'I enter.'}])[0].content;
  assert.ok(!sys.includes('IMAGE GROUNDING'));
});

test('plain group chats ground image turns too',()=>{
  const sys=groupCore().buildGroupApiMessages({members:['a']},agent,[{role:'user',content:'',images:[image]}])[0].content;
  assert.ok(sys.includes('IMAGE GROUNDING'));
});

test('shipped defaults and fallbacks use current model ids',()=>{
  const defaults=source.slice(source.indexOf('const DEFAULT_AGENTS'),source.indexOf('let agents = store.agents'));
  assert.ok(!defaults.includes('deepseek-v4-flash'),'default agents must not ship a legacy vision alias');
  assert.ok(!source.includes('||"deepseek-chat"'),'no fallback may resolve to a retired model name');
});
