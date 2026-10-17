const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore,source}=require('./source');
const core=loadCore();
const plain=v=>JSON.parse(JSON.stringify(v));

test('a group remembers who replies; unknown or removed choices fall back to the buttons',()=>{
  assert.deepEqual(plain(core.replyModeOf({},['a','b'])),{kind:'buttons'});
  assert.deepEqual(plain(core.replyModeOf({replyMode:'everyone'},['a','b'])),{kind:'everyone'});
  assert.deepEqual(plain(core.replyModeOf({replyMode:'auto'},['a','b'])),{kind:'auto'});
  assert.deepEqual(plain(core.replyModeOf({replyMode:'agent:b'},['a','b'])),{kind:'agent',id:'b'});
  assert.deepEqual(plain(core.replyModeOf({replyMode:'agent:gone'},['a','b'])),{kind:'buttons'});
  assert.deepEqual(plain(core.replyModeOf({replyMode:'weird'},['a','b'])),{kind:'buttons'});
  assert.deepEqual(plain(core.replyModeOf({replyMode:'discuss'},['a'])),{kind:'agent',id:'a'});
});
test('the chat menu has the Who replies choice; a saved choice hides the bar and replies after send',()=>{
  const page=source();
  assert.match(page,/id="replyMode"/);assert.match(page,/id="moodMenu"/);
  assert.match(page,/if\(!sequence&&replyModeOf\(group,mems\.map\(a=>a\.id\)\)\.kind!=="buttons"\)\{bar\.style\.display="none";return;\}/);
  assert.match(page,/if\(replyAsChosen\(\)\)return;/);
  assert.match(page,/group\.replyMode=e\.target\.value==="buttons"\?undefined:e\.target\.value;/);
});
