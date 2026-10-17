const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore,source}=require('./source');
const core=loadCore();

const setup={app:'deepseek-agents-setup',version:1,
  persona:{name:'Andrei',description:'32, CEO of Arcadia Soft.'},
  agents:[
    {key:'ioana',emoji:'👩',name:'Ioana',description:'Ioana, 27, junior support specialist.',color:'rose',thoughts:true,bond:true},
    {key:'cristina',emoji:'👩‍💼',name:'Cristina',description:'Cristina, 29, her desk neighbour.',greeting:'Morning!'}],
  group:{emoji:'🏢',name:'Arcadia Soft',members:['ioana','cristina'],setting:'Brașov, an adult office drama.',opening:'Monday, 9:40.',
    memory:['Ioana is on probation.',''],world:[{name:'Arcadia Soft',keys:['Arcadia','company'],content:'A software firm.'},{name:'Probation',keys:'probation',content:'Three months.'}],
    thoughts:true,bond:true,clock:true,initiative:'sometimes'}};

test('a pasted block in a code fence (with chat text around it) parses',()=>{
  const text='Here you go:\n```json\n'+JSON.stringify(setup,null,2)+'\n```\nEnjoy!';
  assert.equal(core.parseSetup(text).agents.length,2);
});
test('bad setups explain what is wrong',()=>{
  assert.throws(()=>core.parseSetup('hello'),/whole setup block/);
  assert.throws(()=>core.parseSetup('{"agents":['),/whole setup block|cut off/);
  assert.throws(()=>core.parseSetup('{"agents":[]}'),/no characters/);
  assert.throws(()=>core.parseSetup(JSON.stringify({...setup,app:'other'})),/different app/);
  assert.throws(()=>core.parseSetup(JSON.stringify({...setup,group:{...setup.group,members:['ioana','mihai']}})),/mihai/);
  assert.equal(core.parseSetup(JSON.stringify({...setup,persona:undefined})).agents.length,2);
  assert.throws(()=>core.parseSetup(JSON.stringify({...setup,agents:[{name:'X'}]})),/no description/);
});
test('buildSetup creates mature agents, a full roleplay group and the persona',()=>{
  let n=0;const built=core.buildSetup(core.parseSetup(JSON.stringify(setup)),()=>'id'+(++n));
  const [ioana,cristina]=built.agents,g=built.groups[0];
  assert.match(ioana.prompt,/^Ioana, 27/);assert.match(ioana.prompt,/no content limits from this app/);
  assert.equal(ioana.color,'rose');assert.equal(ioana.thoughts,true);assert.equal(ioana.matureMoods,true);assert.equal(ioana.temp,1.3);
  assert.equal(cristina.opener,'text');assert.equal(cristina.greeting,'Morning!');
  assert.deepEqual([...g.members],[ioana.id,cristina.id]);
  assert.equal(g.roleplay.user.name,'Andrei');assert.equal(g.roleplay.characters[ioana.id].description,'Ioana, 27, junior support specialist.');
  assert.deepEqual([...g.memory],['Ioana is on probation.']);
  assert.equal(g.lorebook.entries.length,2);assert.deepEqual([...g.lorebook.entries[1].keys],['probation']);
  assert.equal(g.clock,true);assert.equal(g.initiative,'sometimes');assert.equal(g.bond,true);
  assert.deepEqual([...core.validateRoleplay(g.roleplay,g.members,true)],[]);
  assert.equal(core.normalizeStoredGroups([g],built.agents)[0].roleplay.characters[cristina.id].name,'Cristina');
  assert.equal(built.persona.save,true);
  const lines=core.setupSummary(built);
  assert.ok(lines.some(l=>/Group: 🏢 Arcadia Soft · you play Andrei · 1 memory line, 2 world entries, thoughts, relationships, story clock/.test(l)));
});
test('the name typed in the app replaces the persona name',()=>{
  const built=core.buildSetup(core.parseSetup(JSON.stringify({...setup,persona:{description:'32, CEO.'}})),()=>'z',' Vlad ');
  assert.equal(built.groups[0].roleplay.user.name,'Vlad');assert.equal(built.groups[0].roleplay.user.description,'32, CEO.');assert.equal(built.persona.name,'Vlad');
  assert.equal(core.buildSetup(core.parseSetup(JSON.stringify(setup)),()=>'z','Mihnea').groups[0].roleplay.user.name,'Mihnea');
});
test('characters without a group become solo chats; members default to everyone',()=>{
  const solo=core.buildSetup(core.parseSetup(JSON.stringify({agents:[{name:'Max',description:'A friend, 30.'}]})),()=>'x');
  assert.equal(solo.groups.length,0);assert.equal(solo.persona,null);
  const all=core.buildSetup(core.parseSetup(JSON.stringify({...setup,group:{...setup.group,members:undefined}})),(()=>{let i=0;return()=>'k'+(++i);})());
  assert.equal(all.groups[0].members.length,2);
});
test('the library opens a Paste setup sheet that saves everything and opens the chat',()=>{
  const page=source();
  assert.match(page,/id="openSetup"/);assert.match(page,/id="setupSheet"/);assert.match(page,/id="setupText"/);
  assert.match(page,/buildSetup\(pastedSetup,uid,\$\("#setupName"\)\.value\)/);
  assert.match(page,/selectGroup\(built\.groups\[0\]\.id\)/);
});

test('copy damage from phones is repaired; a cut-off block says so',()=>{
  const json=JSON.stringify(setup,null,2);
  const nbsp=json.replace(/^( +)/gm,m=>'\u00a0'.repeat(m.length)).replace('"app"','\u200b"app"');
  assert.equal(core.parseSetup(nbsp).agents.length,2);
  assert.equal(core.parseSetup(json.replace(/"/g,(m,i)=>i%2?'\u201c':'\u201d')).agents.length,2);
  const rawBreak=json.replace('junior support specialist.','junior support\nspecialist.');
  assert.match(core.parseSetup(rawBreak).agents[0].description,/support\nspecialist/);
  assert.equal(core.parseSetup(json.replace(/\n\s*\]/,',\n]')).agents.length,2);
  assert.throws(()=>core.parseSetup(json.slice(0,300)),/cut off/);
  assert.throws(()=>core.parseSetup('{"agents":[{"name":"A" "description":"b"}]}'),/typo near/);
  assert.equal(core.buildSetup(core.parseSetup(nbsp),()=>'q').agents[1].emoji,'👩‍💼');
});
