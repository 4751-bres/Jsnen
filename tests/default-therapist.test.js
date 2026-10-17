const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=require('./source')();
const setup=source.slice(source.indexOf('const THERAPIST_AGENT'),source.indexOf('let groups = normalizeStoredGroups'));
function boot(saved,flags=new Map()){
  let n=0;
  const store={agents:saved};
  const context=vm.createContext({store,uid:()=>`test-${++n}`,localStorage:{getItem:k=>flags.get(k)||null,setItem:(k,v)=>flags.set(k,v)}});
  vm.runInContext(setup,context);
  return {agents:store.agents,flags};
}
test('fresh browser gets exactly one sexual-health therapist with the supplied persona',()=>{
  const {agents,flags}=boot(null);
  const found=agents.filter(a=>a.id==='builtin-sexual-health-therapist');
  assert.equal(found.length,1);
  assert.ok(found[0].prompt.startsWith('You play Elise'));
  assert.ok(!found[0].prompt.includes('sexual problems therapist with 25-year-old girl'));
  assert.ok(found[0].prompt.includes('not a licensed clinician'));
  assert.equal(found[0].model,'deepseek-flash');
  assert.equal(found[0].think,'off');
  assert.equal(boot(agents,flags).agents.length,agents.length);
});
test('untouched legacy therapist prompt loses the stray first line once; edited prompts are kept',()=>{
  const fresh=boot(null).agents.find(a=>a.id==='builtin-sexual-health-therapist');
  const legacy={...fresh,prompt:'sexual problems therapist with 25-year-old girl and married.\n\n'+fresh.prompt};
  assert.equal(boot([legacy],new Map([['ds_therapist_v1','1'],['ds_therapist_brief_v1','1']])).agents[0].prompt,fresh.prompt);
  const edited={...fresh,prompt:'sexual problems therapist with 25-year-old girl and married. My own edit'};
  assert.equal(boot([edited],new Map([['ds_therapist_v1','1']])).agents[0].prompt,edited.prompt);
});
test('existing agents are preserved and a same-name custom therapist is not overwritten',()=>{
  const original={id:'custom',name:'Sexual-health Therapist',prompt:'My custom prompt',temp:1.2};
  const {agents}=boot([original]);
  assert.equal(agents.length,3); // + built-in therapist and Max
  assert.equal(agents[0].id,'custom');assert.equal(agents[0].prompt,'My custom prompt');
  assert.equal(original.prompt,'My custom prompt');
});
test('Max, the plain human friend, is added once and stays deleted if removed',()=>{
  const fresh=boot(null);
  const max=fresh.agents.filter(a=>a.id==='builtin-friend-max');
  assert.equal(max.length,1);assert.equal(max[0].name,'Max');assert.match(max[0].prompt,/regular guy/);assert.match(max[0].prompt,/not an assistant/);
  const existing=boot([{id:'x',name:'Mine',prompt:'p'}]);
  assert.equal(existing.agents.filter(a=>a.id==='builtin-friend-max').length,1);
  const withoutMax=existing.agents.filter(a=>a.id!=='builtin-friend-max');
  assert.equal(boot(withoutMax,existing.flags).agents.some(a=>a.id==='builtin-friend-max'),false);
});
test('mature content is on by default: every agent is switched on once',()=>{
  const {agents,flags}=boot([{id:'a',name:'A',prompt:'p'}]);
  assert.ok(agents.every(a=>a.matureMoods===true));
  assert.equal(flags.get('ds_mature_all_v1'),'1');
  const off=boot([{id:'b',name:'B',prompt:'p'}],new Map([['ds_mature_default','0']]));
  assert.equal(off.agents.find(a=>a.id==='b').matureMoods,undefined);
});
test('therapist edits survive reload and deletion is respected',()=>{
  const first=boot([]);
  first.agents[0].prompt='Edited';
  first.agents[0].think='high';
  assert.equal(boot(first.agents,first.flags).agents[0].prompt,'Edited');
  assert.equal(boot(first.agents,first.flags).agents[0].think,'high');
  assert.equal(boot([],first.flags).agents.length,0);
});
test('existing preset is not duplicated if migration marker is missing',()=>{
  const first=boot(null);
  assert.equal(boot(first.agents).agents.length,first.agents.length);
});
