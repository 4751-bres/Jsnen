const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore,source}=require('./source');
const core=loadCore();

test('scene tags are lifted out and shown as Day · time · weather',()=>{
  const bot={content:'*Thunder.* Stay.\n[thoughts: x]\n[scene: Day 3, night, heavy rain]\n[mood: calm 2]'};
  core.applySceneTag(bot);
  assert.equal(bot.scene,'Day 3 · night · heavy rain');
  assert.equal(bot.content,'*Thunder.* Stay.\n[thoughts: x]\n[mood: calm 2]');
  assert.equal(core.applySceneTag({content:'no tag'}).scene,undefined);
  assert.equal(core.stripSceneWhileStreaming('Hi. [sce'),'Hi.');
  assert.equal(core.stripSceneWhileStreaming('Hi. [scene: Day 1, mor'),'Hi.');
});
test('the clock carries the latest scene forward and picks a fitting icon',()=>{
  assert.equal(core.latestScene([{scene:'Day 1 · morning · sun'},{content:'x'},{scene:'Day 1 · night · rain'},{content:'y'}]),'Day 1 · night · rain');
  assert.equal(core.latestScene([]),'');
  assert.match(core.clockInstruction('Day 2 · evening · clear'),/currently Day 2 · evening · clear/);
  assert.match(core.clockInstruction(''),/Start from what the story suggests/);
  assert.equal(core.sceneEmoji('Day 3 · night · rain'),'🌙');
  assert.equal(core.sceneEmoji('Day 1 · afternoon · rain'),'🌧');
  assert.equal(core.sceneEmoji('Day 1 · noon · clear'),'☀');
  assert.equal(core.sceneEmoji('Day 1 · 1:40 a.m. · storm'),'🌙');
  assert.equal(core.sceneEmoji('Day 2 · 6 pm · rain'),'🌆');
  assert.match(source(),/id="grClock"/);
});
