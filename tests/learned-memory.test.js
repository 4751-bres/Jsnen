const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadCore,read}=require('./source');

test('learned notes stay out of the visible reply, including while streaming',()=>{
  const core=loadCore();
  const reply='The key is under the mat.';
  const tag='\n[remember: Rin hid the key under the mat.]';
  for(let i=2;i<=tag.length;i++)assert.equal(core.stripLearnedMemory(reply+tag.slice(0,i)).trimEnd(),reply);
  const bot={content:reply+'\n[mood: calm 3]'+tag+tag};
  core.applyLearnedMemory(bot,true);
  assert.equal(bot.content,reply+'\n[mood: calm 3]');
  assert.deepEqual([...bot.learnedMemory],['Rin hid the key under the mat.']);
  const stopped={content:reply+tag+'\n[remember: incomplete'};
  core.applyLearnedMemory(stopped,false);
  assert.equal(stopped.content,reply);
  assert.equal(stopped.learnedMemory,undefined);
});

test('learned memory deduplicates and keeps private facts scoped to one character',()=>{
  const {learnedMemoryEntries}=loadCore();
  const list=[{learnedMemory:['Rin found a key.']},{learnedMemory:['rin found a key']},
    {memoryForAgent:'nadia',learnedMemory:['The key opens the cellar.']},
    {whisperTo:'nadia',learnedMemory:['Rin trusts Nadia.']},
    {error:true,learnedMemory:['Invalid.']}];
  assert.deepEqual(Array.from(learnedMemoryEntries(list,'elise'),entry=>entry.fact),['rin found a key']);
  assert.equal(learnedMemoryEntries(list,'nadia').length,3);
  assert.equal(learnedMemoryEntries(list).length,3);
});

test('automatic memory reviews on the sixth completed reply, including after a review saved nothing',()=>{
  const core=loadCore();
  const reply={role:'assistant',content:'A reply.'};
  const four=[reply,reply,reply,reply];
  assert.equal(core.autoMemoryDue([...four,{...reply,stopped:true},{...reply,truncated:true},{...reply,error:true},{role:'user',content:'Go on.'}]),false);
  assert.equal(core.autoMemoryDue([...four,reply]),true);
  const reviewed={...reply};
  core.applyLearnedMemory(reviewed,true);
  assert.equal(reviewed.memoryReviewed,true);
  assert.equal(reviewed.learnedMemory,undefined);
  assert.equal(core.autoMemoryDue([...four,reply,reviewed,...four]),false);
  assert.equal(core.autoMemoryDue([reviewed,...four,reply]),true);
  assert.equal(core.autoMemoryDue([...four,reply,{...reply,learnedMemory:['Legacy note.']}]),false);
});

test('a review saves at most one new note and drops repeats of pinned and learned facts',()=>{
  const core=loadCore();
  const bot={role:'assistant',content:'The agreement is signed.\n[remember: they own the inn!]\n[remember: Mara kept the keys.]\n[remember: Rin became a partner.]\n[remember: The shop moved.]'};
  core.applyLearnedMemory(bot,true,[{learnedMemory:['Mara kept the keys.']}],['They own the inn.']);
  assert.equal(bot.content,'The agreement is signed.');
  assert.deepEqual([...bot.learnedMemory],['Rin became a partner.']);
});

test('switching a reply version switches its learned facts and privacy scope',()=>{
  const core=loadCore();
  const code=read('app.js').split('/* message-edit-core:start */')[1].split('/* message-edit-core:end */')[0];
  vm.runInContext(code,core);
  const list=[{role:'assistant',content:'The key is gone.',learnedMemory:['Rin lost the key.'],memoryForAgent:'nadia',
    versions:[{content:'The key is safe.',learnedMemory:['Rin kept the key.'],memoryReviewed:true},{content:'The key is gone.'}],versionIndex:1}];
  const switched=core.switchMessageVersion(list,0,0);
  assert.equal(switched[0].memoryForAgent,undefined);
  assert.deepEqual([...switched[0].learnedMemory],['Rin kept the key.']);
  assert.equal(switched[0].memoryReviewed,true);
  assert.equal(core.switchMessageVersion(switched,0,1)[0].memoryReviewed,undefined);
  assert.equal(core.switchMessageVersion(switched,0,1)[0].memoryForAgent,'nadia');
  assert.equal(core.editMessageVersion(list,0,'I changed my mind.')[0].learnedMemory,undefined);
});
