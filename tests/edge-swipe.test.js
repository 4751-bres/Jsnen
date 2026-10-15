const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore}=require('./source');
const core=loadCore();
const phone={open:false,headerBottom:56,width:384};

test('a drag can open the chat list from the left edge or the header, and close it when open',()=>{
  assert.equal(core.drawerSwipeStart(10,400,phone),'open');
  assert.equal(core.drawerSwipeStart(44,400,phone),'open');
  assert.equal(core.drawerSwipeStart(200,30,phone),'open');
  assert.equal(core.drawerSwipeStart(200,400,phone),null);
  assert.equal(core.drawerSwipeStart(200,400,{...phone,open:true}),'close');
  assert.equal(core.drawerSwipeStart(10,400,{...phone,width:1200}),null);
});
test('letting go opens past a third of the way or on a quick flick',()=>{
  assert.equal(core.drawerSwipeEnd('open',120,0.1,320),true);
  assert.equal(core.drawerSwipeEnd('open',60,0.1,320),false);
  assert.equal(core.drawerSwipeEnd('open',40,0.8,320),true);
  assert.equal(core.drawerSwipeEnd('close',-120,0.1,320),false);
  assert.equal(core.drawerSwipeEnd('close',-30,0.1,320),true);
  assert.equal(core.drawerSwipeEnd('close',-40,0.9,320),false);
});
