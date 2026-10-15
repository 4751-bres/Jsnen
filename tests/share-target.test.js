const test=require('node:test');
const assert=require('node:assert/strict');
const {read}=require('./source');

test('installed app accepts shares and has home-screen shortcuts',()=>{
  const m=JSON.parse(read('manifest.json'));
  assert.equal(m.share_target.method,'POST');assert.equal(m.share_target.enctype,'multipart/form-data');
  assert.equal(m.share_target.params.files[0].name,'images');assert.match(m.share_target.action,/share-target=1/);
  assert.deepEqual(m.shortcuts.map(s=>s.url),['./?open=last','./?open=library','./?open=import']);
  const sw=read('sw.js');
  assert.match(sw,/searchParams\.has\("share-target"\)\) \{ event\.respondWith\(receiveShare\(request\)\)/);
  assert.match(sw,/key !== SHARE_CACHE/);
});
