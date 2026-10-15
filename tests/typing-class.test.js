const test=require('node:test');
const assert=require('node:assert/strict');
const {read}=require('./source');

// "typing" on <body> means the keyboard is up. A bare .typing style would restyle the whole page while typing
// (it once made everything italic, small and centred), so only body.typing selectors may use that name.
test('no style targets a bare .typing class, and no element uses it',()=>{
  const css=read('styles.css');
  assert.ok(/body\.typing/.test(css));
  assert.equal(/(^|[\s,{}>+~])\.typing(?![\w-])/m.test(css),false,'found a bare .typing selector');
  assert.doesNotMatch(read('app.js'),/class="typing[" ]/);
});
