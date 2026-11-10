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

test('thoughts start the reply and only the character receives its own last three notes',()=>{
  const list=[{role:'assistant',agentId:'a',content:'one',thoughts:'Old plan'},
    {role:'assistant',agentId:'a',content:'two',thoughts:'Plan one',seenBy:['a']},
    {role:'assistant',agentId:'b',content:'secret',thoughts:'Other character secret'},
    {role:'assistant',agentId:'a',content:'three',thoughts:'Plan two',whisperTo:'a'},
    {role:'assistant',agentId:'a',content:'four',thoughts:'Plan three'},
    {role:'assistant',agentId:'a',error:true,content:'failed',thoughts:'Failed plan'}];
  const block=core.privateThoughtsBlock(list,'a');
  assert.match(block,/Plan one[\s\S]*Plan two[\s\S]*Plan three/);
  assert.doesNotMatch(block,/Other character secret|Old plan|Failed plan/);
  assert.match(vm.runInContext('THOUGHTS_INSTRUCTION',core),/Begin with one line/);
  const bot={content:'[thoughts: I intend to ask about the letter.]\nWhat was in it?'};
  core.applyThoughtsTag(bot);
  assert.equal(bot.content,'What was in it?');assert.equal(bot.thoughts,'I intend to ask about the letter.');
});

test('thought-only and interrupted thought tags never leak into visible text',()=>{
  assert.equal(core.applyThoughtsTag({content:'[thoughts: My secret plan.]'}).content,'');
  assert.equal(core.applyThoughtsTag({content:'[thoughts: My unfinished secret'}).content,'');
  assert.equal(core.stripPartialMoodTag('Visible reply.\n[mood: quietly amused | intent: something private]'),'Visible reply.');
});

test('changing mood leaves the group request prefix stable',()=>{
  const group={members:['a'],roleplay:{enabled:true,user:{name:'Tester'},characters:{a:{name:'A'}}}};
  const agent={id:'a',name:'A'},history=[{role:'user',content:'Hello.'}];
  const first=core.buildGroupApiMessages(group,agent,history,{mood:{track:true,current:{mood:'happy',level:4}}});
  const second=core.buildGroupApiMessages(group,agent,history,{mood:{track:true,current:{mood:'sad',level:7}}});
  assert.equal(JSON.stringify(first.slice(0,-1)),JSON.stringify(second.slice(0,-1)));
  assert.notEqual(first.at(-1).content,second.at(-1).content);
  assert.doesNotMatch(first[0].content,/EMOTION TRACKING/);
});
