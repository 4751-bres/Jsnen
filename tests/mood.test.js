const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore}=require('./source');
const core=loadCore();

test('the trailing mood tag is read and removed, with synonyms, clamping and loose formats',()=>{
  assert.deepEqual({...core.parseMoodTag('*She smiles.* Fine.\n\n[mood: happy 7]').mood},{mood:'happy',level:7});
  assert.equal(core.parseMoodTag('*She smiles.* Fine.\n\n[mood: happy 7]').text,'*She smiles.* Fine.');
  assert.deepEqual({...core.parseMoodTag('Go away. [Mood: Furious 12/10]').mood},{mood:'angry',level:10});
  assert.deepEqual({...core.parseMoodTag('Hm. [mood: guarded]').mood},{mood:'cold',level:5});
  const unknown=core.parseMoodTag('Text [mood: bewildered 4]');
  assert.equal(unknown.mood,null);assert.equal(unknown.text,'Text');
  assert.deepEqual({...core.parseMoodTag('No tag here [link] text')},{text:'No tag here [link] text',mood:null});
  assert.equal(core.parseMoodTag('[mood: sad 3] then more text').mood,null);
});
test('a partially streamed tag is hidden from the display',()=>{
  for(const tail of ['[','[m','[mo','[moo','[mood','[mood:','[mood: ang','[mood: angry 7',' [mood: angry 7]'])
    assert.equal(core.stripPartialMoodTag('I slam the door.\n'+tail),'I slam the door.',tail);
  assert.equal(core.stripPartialMoodTag('An array a[0] stays'),'An array a[0] stays');
});
test('applyMoodTag updates the reply in place but never empties it',()=>{
  const bot={content:'Fine. [mood: calm 2]'};core.applyMoodTag(bot);
  assert.equal(bot.content,'Fine.');assert.deepEqual({...bot.mood},{mood:'calm',level:2});
  const only={content:'[mood: sad 4]'};core.applyMoodTag(only);
  assert.equal(only.content,'[mood: sad 4]');assert.deepEqual({...only.mood},{mood:'sad',level:4});
});
test('roleplay prompts ask for the tag and carry the current or steered mood',()=>{
  const group={members:['a'],roleplay:{enabled:true,opening:'',setting:'',user:{name:'Rin',description:''},characters:{a:{name:'Elise',description:''}}}};
  const agent={id:'a',name:'A'};
  assert.ok(!core.buildGroupApiMessages(group,agent,[])[0].content.includes('EMOTION TRACKING'));
  const carried=core.buildGroupApiMessages(group,agent,[],{mood:{track:true,current:{mood:'sad',level:6}}})[0].content;
  assert.match(carried,/EMOTION TRACKING[\s\S]*currently feels sad at 6\/10\. Carry it/);
  const steered=core.buildGroupApiMessages(group,agent,[],{mood:{track:true,current:{mood:'angry',level:9,steered:true}}})[0].content;
  assert.match(steered,/angry at 9\/10\. The user set this mood/);
  assert.match(core.moodInstruction(null),/\[mood: NAME N\]/);
  assert.ok(!core.moodInstruction(null).includes('currently feels'));
});
