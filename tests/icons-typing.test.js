const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore,source}=require('./source');
const core=loadCore();

test('chats and agents can go without an emoji: initials or typed letters',()=>{
  assert.equal(core.iconKind({emoji:'🍸'}),'emoji');
  assert.equal(core.iconKind({emoji:'👩‍💻'}),'emoji');
  assert.equal(core.iconKind({emoji:'🇫🇷'}),'emoji');
  assert.equal(core.iconKind({emoji:''}),'initials');
  assert.equal(core.iconKind({emoji:'  '}),'initials');
  assert.equal(core.iconKind({emoji:'NY'}),'text');
  assert.equal(core.initialsOf('Nadia Reyes'),'NR');
  assert.equal(core.initialsOf('general assistant bot'),'GB');
  assert.equal(core.initialsOf('Coder'),'CO');
  assert.equal(core.initialsOf('  '),'?');
  assert.equal(core.initialsOf('Élise'),'ÉL');
  assert.equal(core.initialsOf('"Last Call"'),'LC');
});
test('editors save an empty icon instead of forcing an emoji',()=>{
  const page=source();
  assert.doesNotMatch(page,/\$\("#edEmoji"\)\.value\.trim\(\)\|\|"🤖"/);
  assert.doesNotMatch(page,/\$\("#grEmoji"\)\.value\.trim\(\)\|\|"👥"/);
  assert.match(page,/id="edEmoji" maxlength="8"/);
});
test('an empty streaming reply says who is typing, or that the provider is busy',()=>{
  assert.equal(core.waitingLabel('Nadia','DeepSeek',0,3000),'Nadia is typing…');
  assert.equal(core.waitingLabel('Nadia','DeepSeek',3,4000),'Nadia is typing…');
  assert.equal(core.waitingLabel('Nadia','DeepSeek',5,45200),'DeepSeek is busy — still waiting · 45s');
  assert.equal(core.waitingLabel('',undefined,0,0),'Your agent is typing…');
  assert.equal(core.waitingLabel('Nadia','DeepSeek',0,12400),'Nadia is typing… · 12s');
  const {source}=require('./source');
  assert.match(source(),/setInterval\(\(\)=>\{if\(bot\.streaming&&!bot\.content&&!bot\.reasoning\)scheduleStreamPaint\(bot\)/);
});
