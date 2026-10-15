const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadCore,source}=require('./source');
const core=loadCore();

test('a width change without rotating means the keyboard-resize mode is broken on this browser',()=>{
  assert.equal(core.keyboardWidthBug(411,411,true,true),false);
  assert.equal(core.keyboardWidthBug(411,386,true,true),true);
  assert.equal(core.keyboardWidthBug(411,915,true,false),false);
  assert.equal(core.keyboardWidthBug(411,412,true,true),false);
});
test('both viewport modes keep the zoom floor; only one asks for content resizing',()=>{
  const plain=vm.runInContext('VIEWPORT_PLAIN',core),resize=vm.runInContext('VIEWPORT_RESIZE',core);
  assert.match(plain,/minimum-scale=1/);assert.doesNotMatch(plain,/interactive-widget/);
  assert.match(resize,/interactive-widget=resizes-content/);
  assert.match(source(),new RegExp('content="'+resize.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'"'));
});
test('the Phone setting picks the keyboard mode; Automatic follows detection',()=>{
  const plain=vm.runInContext('VIEWPORT_PLAIN',core),resize=vm.runInContext('VIEWPORT_RESIZE',core);
  assert.equal(core.viewportFor('samsung',true),resize);
  assert.equal(core.viewportFor('honor',false),plain);
  assert.equal(core.viewportFor('auto',false),resize);
  assert.equal(core.viewportFor('auto',true),plain);
  assert.equal(core.viewportFor('nonsense',false),resize);
  assert.match(source(),/id="deviceSelect"/);
});
