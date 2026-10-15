const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore}=require('./source');
const core=loadCore();

test('citation markers are removed from history only for replies that had sources',()=>{
  assert.equal(core.historyText({content:'Sunny [1], windy [2][3].',sources:[{},{},{}]}),'Sunny, windy.');
  assert.equal(core.historyText({content:'Array a[1] stays',sources:[]}),'Array a[1] stays');
  assert.equal(core.historyText({content:'See [1](https://x.y) link',sources:[{}]}),'See [1](https://x.y) link');
  assert.equal(core.historyText({content:'No sources [1]'}),'No sources [1]');
});
test('group history uses the cleaned text',()=>{
  const group={members:['a','b'],roleplay:null};
  const msgs=[{role:'user',content:'Hi'},{role:'assistant',agentId:'a',agentName:'A',content:'Fact [1].',sources:[{}]},{role:'assistant',agentId:'b',agentName:'B',content:'Other [2].',sources:[{},{}]}];
  const out=core.buildGroupApiMessages(group,{id:'a',name:'A',prompt:''},msgs);
  assert.equal(out[2].content,'Fact.');assert.equal(out[3].content,'[B]: Other.');
});
