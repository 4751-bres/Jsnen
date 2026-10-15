const test=require('node:test');
const assert=require('node:assert/strict');
const {source}=require('./source');
const page=source();

test('the message box has one ＋ button; photo, web and Write for me sit in a tray',()=>{
  const composer=page.slice(page.indexOf('<div class="composer">'),page.indexOf('<div class="status" id="toast"'));
  assert.match(composer,/id="toolsBtn"/);
  for(const id of ['attachBtn','webBtn','draftBtn'])assert.doesNotMatch(composer,new RegExp('id="'+id+'"'));
  const tray=page.slice(page.indexOf('id="composerTools"'),page.indexOf('<div class="composer">'));
  for(const id of ['attachBtn','webBtn','draftBtn'])assert.match(tray,new RegExp('id="'+id+'"'));
});
test('the app resizes above the on-screen keyboard',()=>{
  assert.match(page,/interactive-widget=resizes-content/);assert.match(page,/minimum-scale=1/);assert.match(page,/text-size-adjust:100%/);
  assert.match(page,/height:var\(--app-h,100dvh\)/);
  assert.match(page,/visualViewport\.addEventListener\("resize",fitToViewport\)/);
});
