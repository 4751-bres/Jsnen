const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore,source}=require('./source');
const core=loadCore();

test('a branch keeps the story up to the chosen message, as a copy',()=>{
  const list=[{role:'user',content:'a',at:1},{role:'assistant',content:'b',at:2,versions:[{},{}],versionIndex:1},{role:'user',content:'c',at:3}];
  const b=core.branchMessages(list,1);
  assert.equal(b.length,2);assert.equal(b[1].content,'b');assert.equal(b[1].versions.length,2);
  b[0].content='changed';assert.equal(list[0].content,'a');
  assert.equal(core.branchMessages(list,9).length,0);
  assert.deepEqual(core.branchChapters([{at:1},{at:5}],2).map(c=>c.at),[1]);
  assert.equal(core.branchName('Last Call',[]),'Last Call (branch)');
  assert.equal(core.branchName('Last Call',['Last Call (branch)']),'Last Call (branch 2)');
});
test('long-press opens a message menu with branch, copy, edit, bookmark and delete',()=>{
  const page=source();
  for(const id of ['mmCopy','mmEdit','mmStar','mmSpeak','mmPin','mmRegen','mmBranch','mmDelete'])assert.match(page,new RegExp('id="'+id+'"'));
  assert.match(page,/getElementById\("chat"\)\.addEventListener\("contextmenu"/);
});
