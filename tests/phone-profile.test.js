const test=require('node:test');
const assert=require('node:assert/strict');
const {read,source}=require('./source');

test('Honor/Other layout rules are scoped to the dev-safe profile; the normal viewport is unchanged',()=>{
  const page=read('index.html'),css=read('styles.css');
  assert.match(page,/<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" \/>/);
  // no global versions of the Honor fixes
  assert.doesNotMatch(css,/^html\{background:var\(--bg\)/m);
  assert.doesNotMatch(css,/^html\{[^}]*text-size-adjust/m);
  assert.match(css,/:root\.dev-safe\{background:var\(--bg\);-webkit-text-size-adjust:100%/);
  for(const o of ['auto','samsung','honor','other'])assert.match(page,new RegExp('<option value="'+o+'">'));
});
test('only Honor/Other switch the viewport and skip the keyboard height fit',()=>{
  const app=source();
  assert.match(app,/function safeDevice\(\)\{return devicePref\(\)==="honor"\|\|devicePref\(\)==="other";\}/);
  assert.match(app,/if\(safeDevice\(\)\)return; \/\/ Honor \/ Other/);
  assert.match(app,/meta\.setAttribute\("content",safe\?SAFE_VIEWPORT:ORIGINAL_VIEWPORT\)/);
});
