const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=require('./source')();
test('new agents reason at least at Low while keeping higher choices',()=>{
  const c=vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('const NEW_AGENT_MIN_THINK'),source.indexOf('function openEditor(')),c);
  assert.equal(c.newAgentThink('off'),'low');
  assert.equal(c.newAgentThink(''),'low');
  assert.equal(c.newAgentThink('medium'),'medium');
  assert.equal(c.newAgentThink('high'),'high');
});
test('the new-agent form defaults to Low and hides Off only when creating',()=>{
  assert.match(source,/think:NEW_AGENT_MIN_THINK\}/);
  assert.match(source,/offOption\.disabled=offOption\.hidden=!id/);
});
