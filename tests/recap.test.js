const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore,source}=require('./source');
const core=loadCore();
const H=3600000;
const chat=n=>Array.from({length:n},(_,i)=>({role:i%2?'assistant':'user',content:'m'+i,at:(i+1)*1000}));

test('a recap is due after 6 hours away from a chat of 8+ messages, and reused from cache',()=>{
  assert.equal(core.recapDue(chat(7),10*H,null),null);
  assert.equal(core.recapDue(chat(8),8000+5*H,null),null);
  assert.deepEqual({...core.recapDue(chat(8),8000+7*H,null)},{lastAt:8000,cached:false});
  assert.deepEqual({...core.recapDue(chat(8),8000+H,{at:8000,text:'x'})},{lastAt:8000,cached:true});
  assert.equal(core.recapDue(chat(8),8000+7*H,{at:1,text:'old'}).cached,false);
});
test('the recap prompt uses names and the recent story',()=>{
  const m=core.recapMessages([{role:'user',content:'Hi',at:1},{role:'assistant',characterName:'Nadia',content:'Hello'}],'Rin','');
  assert.match(m[0].content,/Previously on/);assert.match(m[0].content,/addressing Rin as you/);
  assert.equal(m[1].content,'Rin: Hi\n\nNadia: Hello');
});
test('the recap card and its setting exist',()=>{
  const page=source();
  assert.match(page,/id="recapCard"/);assert.match(page,/id="recapOn"/);
});
