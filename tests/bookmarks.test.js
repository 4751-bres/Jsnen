const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore,source}=require('./source');
const core=loadCore();

test('bookmarks list starred messages in order with previews',()=>{
  const list=[{role:'user',content:'Hi',starred:true,at:1},{role:'assistant',content:'No'},{role:'system',content:'x',starred:true},
    {role:'assistant',characterName:'Nadia',content:'A   long\nreply',starred:true,at:3},{role:'user',content:'',images:[{}],starred:true}];
  const b=core.bookmarkList(list);
  assert.deepEqual(b.map(x=>x.index),[0,3,4]);
  assert.equal(b[1].who,'Nadia');assert.equal(b[1].preview,'A long reply');assert.equal(b[2].preview,'[image]');
});
test('every message has a bookmark button and the menu has a Bookmarks sheet',()=>{
  const page=source();
  assert.match(page,/actionButton\("star","Bookmark message",\(\)=>toggleBookmark\(m\),"act-star"\)/);
  assert.match(page,/id="bookmarkMenu"/);assert.match(page,/id="bookmarkSheet"/);
});
