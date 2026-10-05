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
  assert.equal(agents.length,2);
  assert.equal(agents[0],original);
  assert.equal(original.prompt,'My custom prompt');
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
