const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore}=require('./source');
const core=loadCore();

test('words are counted across languages and contractions',()=>{
  assert.equal(core.wordCount("I can't stay — it's late."),5);
  assert.equal(core.wordCount('Élise sourit, puis répond.'),4);
  assert.equal(core.wordCount(''),0);
});
test('chat stats add up both sides, tokens, speakers and days',()=>{
  const d1=new Date(2026,9,14,22).getTime(),d2=new Date(2026,9,15,9).getTime();
  const s=core.chatStats([
    {role:'user',content:'Hello there',at:d1},
    {role:'assistant',characterName:'Nadia',content:'Hi you, welcome back',at:d1+1,usage:{prompt:100,completion:20}},
    {role:'assistant',characterName:'Mara',content:'Hey',at:d2,usage:{prompt:50,completion:5}},
    {role:'assistant',characterName:'Nadia',content:'Again',at:d2+1},
    {role:'assistant',content:'oops',error:true},{role:'system',content:'x'}]);
  assert.deepEqual({...s.you},{messages:1,words:2});assert.deepEqual({...s.ai},{messages:3,words:6});
  assert.equal(s.tokensIn,150);assert.equal(s.tokensOut,25);assert.equal(s.longest,4);assert.equal(s.days,2);
  assert.deepEqual({...s.speakers},{Nadia:2,Mara:1});assert.equal(s.first,d1);assert.equal(s.last,d2+1);
});
