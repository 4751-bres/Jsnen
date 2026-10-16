const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore,source}=require('./source');
const core=loadCore();

test('find matches messages ignoring case and accents, skipping short queries and system messages',()=>{
  const list=[{role:'user',content:'Café at noon'},{role:'system',content:'cafe secret'},{role:'assistant',content:'The CAFE is closed'},{role:'assistant',content:'nothing'}];
  assert.deepEqual([...core.findMatches(list,'cafe')],[0,2]);
  assert.deepEqual([...core.findMatches(list,'CAFÉ')],[0,2]);
  assert.equal(core.findMatches(list,'c').length,0);
  assert.equal(core.findMatches(list,'zzz').length,0);
});
test('the find bar and its menu tile exist',()=>{
  const page=source();
  for(const id of ['findBar','findInput','findCount','findPrev','findNext','findClose','findMenu'])assert.match(page,new RegExp('id="'+id+'"'));
});
