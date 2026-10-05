const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=require('./source')();
function setup(messages){
  const ctx=vm.createContext({messages,isGroup:()=>false});
  vm.runInContext(source.slice(source.indexOf('/* roleplay-core:start */'),source.indexOf('/* roleplay-core:end */'))+'\n'+source.slice(source.indexOf('function buildApiMessages('),source.indexOf('/* ---------- Stream one response ---------- */')),ctx);
  return ctx;
}
const history=[
  {role:'user',content:'Hello'},
  {role:'assistant',content:'⚠️ HTTP 401: bad key',error:true},
  {role:'assistant',content:'⏹ stopped.'},
  {role:'assistant',content:'(empty response)'},
  {role:'assistant',content:'Partial answer'},
  {role:'user',content:'⏹ stopped.'}
];
test('failed and placeholder replies never reach single-agent context',()=>{
  const payload=setup(history).buildApiMessages({prompt:'x'});
  const text=JSON.stringify(payload);
  assert.ok(!text.includes('HTTP 401'));assert.ok(!text.includes('(empty response)'));
  assert.ok(text.includes('Partial answer'));
  assert.equal(payload.length,4); // system + Hello + Partial answer + user text that merely looks like a placeholder
});
test('failed replies never reach group context',()=>{
  const c=setup(history);
  const group=c.buildGroupApiMessages({members:['a']},{id:'a',name:'A'},history.map(m=>m.role==='assistant'?{...m,agentId:'a'}:m));
  assert.ok(!JSON.stringify(group).includes('HTTP 401'));
  assert.equal(group.length,4);
});
test('vision guard blocks every non-Flash DeepSeek model but trusts other providers',()=>{
  const {modelSeesImages}=setup([]);
  assert.equal(modelSeesImages('deepseek-flash'),true);
  assert.equal(modelSeesImages('deepseek-v4-flash'),true);
  assert.equal(modelSeesImages('deepseek-v4-pro'),false);
  assert.equal(modelSeesImages('deepseek-reasoner'),false);
  assert.equal(modelSeesImages('gpt-4o'),true);
});
