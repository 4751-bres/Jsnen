const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore}=require('./source');
const core=loadCore();

test('bond tags are read, clamped and hidden, with the change since last time',()=>{
  const bot={content:'Hi.\n[thoughts: x]\n[bond: 64]\n[mood: calm 3]'};
  core.applyBondTag(bot,60);
  assert.equal(bot.content,'Hi.\n[thoughts: x]\n[mood: calm 3]');assert.deepEqual({...bot.bond},{level:64,change:4});
  assert.deepEqual({...core.applyBondTag({content:'A [Relationship: 140/100]'}).bond},{level:100});
  assert.equal(core.applyBondTag({content:'no tag'}).bond,undefined);
  assert.equal(core.stripBondWhileStreaming('Hello. [bon'),'Hello.');
  assert.equal(core.stripBondWhileStreaming('Hello. [bond: 4'),'Hello.');
});
test('the instruction carries the previous level and labels read naturally',()=>{
  assert.match(core.bondInstruction(42,'Rin'),/closer?.*Rin[\s\S]*It was 42 before/);
  assert.match(core.bondInstruction(undefined,''),/honest first impression/);
  assert.equal(core.bondLabel(80),'Close');assert.equal(core.bondLabel(50),'Neutral');assert.equal(core.bondLabel(5),'Hostile');
});
