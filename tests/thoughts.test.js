const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadCore}=require('./source');
const core=loadCore();

test('thought tags are lifted out of the reply, alongside a mood tag',()=>{
  const bot={content:'*She smiles.* Hello.\n\n[thoughts: I hope he stays tonight.]\n[mood: flirty 6]',moodMature:true};
  core.applyThoughtsTag(bot);core.applyMoodTag(bot);
  assert.equal(bot.content,'*She smiles.* Hello.');assert.equal(bot.thoughts,'I hope he stays tonight.');
  assert.equal(bot.mood.mood,'flirty');
  const after=core.applyThoughtsTag({content:'Hi.\n[mood: calm 3]\n[Inner thoughts: Careful now.]'});
  assert.equal(after.thoughts,'Careful now.');assert.equal(after.content,'Hi.\n[mood: calm 3]');
  const none=core.applyThoughtsTag({content:'Plain reply.'});assert.equal(none.thoughts,undefined);assert.equal(none.content,'Plain reply.');
});
test('partial thought tags are hidden while a reply streams',()=>{
  for(const tail of ['[','[tho','[thoughts','[thoughts: She wonders if','[inner thoughts: x'])
    assert.equal(core.stripThoughtsWhileStreaming('Hello there. '+tail),'Hello there.');
  assert.equal(core.stripThoughtsWhileStreaming('Hi [thoughts: done] and more'),'Hi  and more');
  assert.equal(core.stripThoughtsWhileStreaming('A [link] stays'),'A [link] stays');
});
test('thoughts appear in the text export',()=>{
  const t=core.chatToText('C',[{role:'assistant',agentName:'Nadia',content:'Hi',thoughts:'He is cute.',at:Date.UTC(2026,0,1)}],{now:Date.UTC(2026,0,1)});
  assert.match(t,/Nadia:\nHi\n\(thoughts: He is cute\.\)/);
  assert.match(vm.runInContext('THOUGHTS_INSTRUCTION',core),/\[thoughts: …\]/);
});
test('a leading [char]: label is removed from the saved reply',()=>{
  const {source}=require('./source');
  const line=source().split(/\r?\n/).find(l=>l.includes('bot.content=bot.content.replace(/^(?:'));
  assert.ok(line,'strip line present');
  const re=new RegExp(line.match(/replace\(\/(.+)\/i,""\)/)[1],'i');
  assert.equal('[char]: Hello [1]'.replace(re,''),'Hello [1]');assert.equal('Plain'.replace(re,''),'Plain');
});
