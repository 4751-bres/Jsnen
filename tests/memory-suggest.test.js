const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore}=require('./source');
const core=loadCore();

test('memory suggestions read recent story with names and skip known facts',()=>{
  const list=[{role:'user',content:'I promise to come back.'},{role:'assistant',characterName:'Nadia',content:'I will wait.'},{role:'assistant',error:true,content:'x'}];
  const m=core.memoryExtractMessages(list,['Rin owns a red car.'],'Rin');
  assert.equal(m[0].role,'system');assert.match(m[0].content,/NEW lasting facts/);
  assert.match(m[1].content,/^Already remembered[\s\S]*- Rin owns a red car\.\n\nConversation:\nRin: I promise to come back\.\n\nNadia: I will wait\.$/);
  assert.doesNotMatch(core.memoryExtractMessages(list,[],'Rin')[1].content,/Already remembered/);
});
test('suggested facts are cleaned, de-duplicated and capped',()=>{
  const text='Here you go:\n- Rin promised to return.\n* rin promised to return.\n2. Nadia works at the bar.\n- Rin owns a red car.\n- (nothing new)\n- ok';
  assert.deepEqual([...core.parseFactLines(text,['Rin owns a red car.'])],['Rin promised to return.','Nadia works at the bar.']);
  assert.deepEqual([...core.parseFactLines('- (nothing new)',[])],[]);
  assert.equal(core.parseFactLines(Array.from({length:20},(_,i)=>'- Fact number '+i).join('\n'),[]).length,10);
});
