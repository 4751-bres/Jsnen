const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore,read}=require('./source');
const core=loadCore();

// A live blur behind every bubble made phones run out of graphics memory (flicker, parts never repainted).
test('no per-message blur or always-on row animations',()=>{
  const css=read('styles.css');
  assert.doesNotMatch(css,/backdrop-filter/);
  assert.doesNotMatch(css,/\.msg\.bot\{transition:transform/);
  assert.match(css,/\.msg\.bot\.snapping\{transition:transform/);
});
test('chat previews drop an old [char]: label',()=>{
  assert.equal(core.previewOf([{role:'assistant',content:'[char]: I stop mid-step.'}]).text,'I stop mid-step.');
});
