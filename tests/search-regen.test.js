const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore,source}=require('./source');
const core=loadCore();

test('the search-query prompt carries today\'s date',()=>{
  const m=core.searchQueryMessages([{role:'user',content:'latest model?'}],Date.UTC(2026,9,16));
  assert.match(m[0].content,/Today is 2026-10-16/);
});
test('regenerating a web-searched reply searches again',()=>{
  const page=source();
  assert.match(page,/if\(message\.sources\)meta\.forceSearch=true;/);
  assert.match(page,/store\.webOn\|\|!!agent\?\.webSearch\|\|!!meta\.forceSearch/);
  assert.match(page,/delete bot\.forceSearch;/);
});
