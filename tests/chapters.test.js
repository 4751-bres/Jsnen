const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore}=require('./source');
const core=loadCore();

test('chapters sit before the first message written after them; later ones wait',()=>{
  const list=[{role:'user',content:'a',at:100},{role:'assistant',content:'b',at:200},{role:'system',content:'x',at:250},{role:'user',content:'c',at:300}];
  const placed=core.placeChapters([{id:'2',title:'Storm',at:250},{id:'1',title:'',at:150},{id:'3',title:'Later',at:900}],list);
  assert.deepEqual([...placed.byIndex.keys()],[1,3]);
  assert.equal(placed.byIndex.get(1)[0].number,1);assert.equal(placed.byIndex.get(3)[0].title,'Storm');
  assert.equal(placed.pending.length,1);assert.equal(placed.pending[0].number,3);
  assert.equal(core.chapterLabel({number:2,title:'Storm'}),'Chapter 2 · Storm');
  assert.equal(core.chapterLabel({number:1,title:''}),'Chapter 1');
});
test('the AI is told the current chapter, and .txt exports mark the breaks',()=>{
  assert.equal(core.chapterNote([]),'');
  assert.match(core.chapterNote([{at:1,title:'Arrival'},{at:2,title:'The storm'}]),/Chapter 2: "The storm"/);
  const at=new Date(2026,9,15,9,0).getTime();
  const text=core.chatToText('S',[{role:'user',content:'Hi',at},{role:'assistant',agentName:'N',content:'Yo',at:at+60000}],{chapters:[{id:'a',title:'Night',at:at+1}],now:at});
  assert.match(text,/\[09:00\] You:\nHi\n\n═══ CHAPTER 1 · NIGHT ═══\n\n\[09:01\] N:\nYo/);
  assert.deepEqual(core.normalizeChapters([{at:'x'},null,{at:5,title:' T '}]).map(c=>c.title),['T']);
});
