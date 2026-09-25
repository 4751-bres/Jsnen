const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('index.html','utf8');
const helpers=source.slice(source.indexOf('async function copyMessageText'),source.indexOf('const expandedReasoning'));
function setup(writeText,fallback=true){
  const state={copied:[],removed:false,focused:false,notices:[]};
  const document={activeElement:{focus(){state.focused=true;}},getSelection:()=>null,
    createElement:()=>({style:{},setAttribute(k,v){this[k]=v;},select(){},remove(){state.removed=true;}}),
    body:{appendChild(el){state.field=el;}},execCommand(cmd){assert.equal(cmd,'copy');return fallback;}};
  const ctx=vm.createContext({document,navigator:{clipboard:writeText?{writeText}:undefined},toast:t=>state.notices.push(t),setTimeout:()=>{}});
  vm.runInContext(source.slice(source.indexOf('/* roleplay-core:start */'),source.indexOf('/* roleplay-core:end */'))+'\n'+helpers,ctx);return {ctx,state};
}
test('copy preserves exact text and markdown',async()=>{
  const copied=[];const {ctx}=setup(async t=>copied.push(t));
  const text='*I wave.* Hello\n```js\nconst x = 1;\n```';
  assert.equal(await ctx.copyMessageText(text),true);assert.deepEqual(copied,[text]);
});
test('assistant copy removes repeated char labels while user text stays literal',async()=>{
  const copied=[];const {ctx}=setup(async t=>copied.push(t));
  await ctx.messageCopyButton({role:'assistant',content:'[char]: [Char]: *I wave.* Hello'}).onclick();
  await ctx.messageCopyButton({role:'user',content:'[char]: literal example'}).onclick();
  assert.deepEqual(copied,['*I wave.* Hello','[char]: literal example']);
  assert.equal(ctx.speakerContent('char','[char]: [char]: Hello'),'[char]: Hello');
  assert.equal(ctx.cleanCharacterReply('Keep [char]: inside the sentence'),'Keep [char]: inside the sentence');
});
test('clipboard denial falls back and cleans up without leaving focus behind',async()=>{
  const {ctx,state}=setup(async()=>{throw Error('denied');});
  assert.equal(await ctx.copyMessageText('hello'),true);
  assert.equal(state.field.value,'hello');assert.equal(state.removed,true);assert.equal(state.focused,true);
});
test('failed fallback reports failure and empty text does not write',async()=>{
  const {ctx,state}=setup(null,false);
  assert.equal(await ctx.copyMessageText('hello'),false);
  assert.equal(await ctx.copyMessageText(''),false);assert.equal(state.removed,true);
});
test('buttons copy only message content for both roles, not reasoning or labels',async()=>{
  const copied=[];const {ctx,state}=setup(async t=>copied.push(t));
  for(const role of ['user','assistant']){
    const button=ctx.messageCopyButton({role,content:'*An action*',reasoning:'private reasoning',agentName:'Elise'});
    assert.equal(button['aria-label'],'Copy message');assert.equal(button.disabled,false);
    await button.onclick();assert.equal(button.textContent,'✓');
  }
  assert.deepEqual(copied,['*An action*','*An action*']);assert.equal(state.notices.length,2);
  assert.equal(ctx.messageCopyButton({content:'',images:[{}]}).disabled,true);
});
