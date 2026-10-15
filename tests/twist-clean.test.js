const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore}=require('./source');
const core=loadCore();

test('twists keep inner quotes and lose only wrapping quotes',()=>{
  assert.equal(core.cleanTwist('A text lights up: "Stop testing them."'),'A text lights up: "Stop testing them."');
  assert.equal(core.cleanTwist('"A stranger knocks at the door."'),'A stranger knocks at the door.');
  assert.equal(core.cleanTwist('“The lights go out.”'),'The lights go out.');
  assert.equal(core.cleanTwist('"Run," she says, "now."'),'"Run," she says, "now."');
  assert.equal(core.cleanTwist('\n  First line\nsecond'),'First line');
});
test('single-agent twists use the agent name instead of "Character"',()=>{
  const list=[{role:'user',content:'Hi'},{role:'assistant',content:'Hello',bond:{level:45}}];
  const m=core.twistMessages(list,'Rin','','Guide');
  assert.match(m[1].content,/- Guide: closeness to Rin 45\/100/);assert.match(m[1].content,/Guide: Hello/);
});
