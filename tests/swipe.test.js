const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore}=require('./source');
const core=loadCore();
const reply=(index,count)=>({role:'assistant',content:'x',versions:Array.from({length:count},()=>({})),versionIndex:index});

test('swiping left walks forward through versions, then asks for a new reply on the latest message',()=>{
  assert.deepEqual({...core.swipeAction(reply(0,3),true,-100,5)},{type:'version',target:1});
  assert.deepEqual({...core.swipeAction(reply(2,3),true,-100,5)},{type:'regenerate'});
  assert.equal(core.swipeAction(reply(2,3),false,-100,5),null);
  assert.deepEqual({...core.swipeAction({role:'assistant',content:'x'},true,-100,0)},{type:'regenerate'});
});
test('swiping right goes back; short, vertical or invalid swipes do nothing',()=>{
  assert.deepEqual({...core.swipeAction(reply(2,3),true,100,0)},{type:'version',target:1});
  assert.equal(core.swipeAction(reply(0,3),true,100,0),null);
  assert.equal(core.swipeAction(reply(1,3),true,-40,0),null);
  assert.equal(core.swipeAction(reply(1,3),true,-100,90),null);
  assert.equal(core.swipeAction({role:'user'},true,-100,0),null);
  assert.equal(core.swipeAction({...reply(0,1),streaming:true},true,-100,0),null);
  assert.equal(core.swipeAction({role:'assistant',error:true},true,-100,0),null);
});
