const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore,source}=require('./source');
const core=loadCore();

test('old [char]: labels are removed from replies and their versions only',()=>{
  const list=[{role:'user',content:'[char]: user text stays'},
    {role:'assistant',content:'[char]: Hello',versions:[{content:'[char]:  Hi'},{content:'Plain'}]},
    {role:'assistant',content:'Fine already'}];
  const r=core.stripCharLabels(list);
  assert.equal(r.changed,true);
  assert.equal(r.list[0].content,'[char]: user text stays');
  assert.equal(r.list[1].content,'Hello');
  assert.deepEqual(r.list[1].versions.map(v=>v.content),['Hi','Plain']);
  assert.equal(r.list[2],list[2]);
  assert.equal(core.stripCharLabels([{role:'assistant',content:'ok'}]).changed,false);
  assert.equal(core.stripCharLabels(null).list.length,0);
});
test('the cleanup runs once at start-up',()=>{
  assert.match(source(),/recoverBackgroundReplies\(\);\s*cleanCharLabelsOnce\(\);/);
});
