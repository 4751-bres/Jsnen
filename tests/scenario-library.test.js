const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadCore}=require('./source');
const core=loadCore();
const library=vm.runInContext('SCENARIO_LIBRARY',core);

test('every scenario is a complete, adult, mature roleplay with distinct characters',()=>{
  assert.ok(library.length>=6);
  const ids=new Set();
  for(const preset of library){
    assert.ok(!ids.has(preset.id),preset.id);ids.add(preset.id);
    for(const key of ['emoji','title','tagline','setting','opening'])assert.ok(String(preset[key]).trim(),preset.id+' '+key);
    assert.match(preset.setting,/adult/i,preset.id);
    assert.ok(preset.characters.length>=1&&preset.characters.length<=3,preset.id);
    for(const c of preset.characters){
      assert.ok(c.name&&c.emoji&&c.description,preset.id);
      assert.match(c.description,/\b(2[1-9]|[3-9]\d)\b|adult-model/,preset.id+' '+c.name+' states an adult age');
    }
  }
});
test('buildScenario creates mood-tracking mature agents and a valid mature roleplay group',()=>{
  let n=0;const preset=library.find(p=>p.characters.length===2);
  const {agents,group}=core.buildScenario(preset,'  Rin  ',()=>'id'+(++n));
  assert.equal(agents.length,2);
  for(const a of agents){assert.equal(a.moods,true);assert.equal(a.matureMoods,true);assert.match(a.prompt,/Everyone in this story is an adult/);assert.match(a.prompt,/consent/);}
  assert.deepEqual([...group.members],[...agents.map(a=>a.id)]);
  assert.equal(group.moods,true);assert.equal(group.roleplay.enabled,true);assert.equal(group.roleplay.mature,true);
  assert.equal(group.roleplay.user.name,'Rin');assert.equal(group.roleplay.opening,preset.opening);
  assert.deepEqual([...core.validateRoleplay(group.roleplay,group.members,true)],[]);
  assert.deepEqual([...core.validateRoleplay(group.roleplay,group.members,false)],['adult-confirmation']);
  const normalized=core.normalizeStoredGroups([group],agents)[0];
  assert.equal(normalized.roleplay.characters[agents[0].id].name,preset.characters[0].name);
});
