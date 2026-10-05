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
  assert.equal(c.newAgentThink('high'),'high');
});
test('the new-agent form defaults to Low and hides Off only when creating',()=>{
  assert.match(source,/think:NEW_AGENT_MIN_THINK\}/);
  assert.match(source,/offOption\.disabled=offOption\.hidden=!id/);
});

test('only official DeepSeek thinking levels remain; stored medium becomes high once',()=>{
  const core=require('./source').loadCore();
  assert.deepEqual([...require('node:vm').runInContext('THINK_LEVELS',core)],['off','low','high','max']);
  assert.equal(core.officialThink('medium'),'high');assert.equal(core.officialThink('max'),'max');assert.equal(core.officialThink('weird'),'off');
  const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  const agents=[{id:'a',think:'medium'},{id:'b',think:'low'}],workflows=[{id:'w',roles:[{id:'r',agent:{think:'medium'}},{id:'s'}]}];
  const out=core.migrateEffortLevels(storage,agents,workflows);
  assert.equal(out.agents[0].think,'high');assert.equal(out.agents[1].think,'low');
  assert.equal(out.workflows[0].roles[0].agent.think,'high');assert.equal(data.get('ds_effort_levels_v1'),'1');
  const again=core.migrateEffortLevels(storage,[{id:'a',think:'medium'}],[]);
  assert.equal(again.agents[0].think,'medium');
  const page=require('./source')();
  assert.ok(!/<option value="medium">/.test(page));
});
