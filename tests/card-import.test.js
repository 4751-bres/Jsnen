const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore}=require('./source');
const core=loadCore({TextDecoder,atob});

// Minimal PNG: signature, one text chunk, IEND (CRCs are not checked by the reader).
function png(chunks){
  const parts=[Buffer.from([137,80,78,71,13,10,26,10])];
  for(const [type,data] of chunks){
    const len=Buffer.alloc(4);len.writeUInt32BE(data.length);
    parts.push(len,Buffer.from(type,'latin1'),data,Buffer.alloc(4));
  }
  parts.push(Buffer.from([0,0,0,0]),Buffer.from('IEND'),Buffer.alloc(4));
  return new Uint8Array(Buffer.concat(parts));
}
const v2={spec:'chara_card_v2',spec_version:'2.0',data:{name:'Mira',description:'{{char}} is a lighthouse keeper who teases {{user}}.',
  personality:'dry, warm',scenario:'A storm traps {{user}} at the lighthouse.',first_mes:'*Mira opens the door.* You look half drowned, {{user}}.',
  alternate_greetings:['*Mira hands {{user}} a towel.*',''],mes_example:'<START>\n{{user}}: Hi\n{{char}}: Hm.',system_prompt:'Write vividly. {{original}}',
  post_history_instructions:'Stay as {{char}}.',creator:'someone',tags:['NSFW','Romance'],
  character_book:{name:'Lore',entries:[{keys:['storm'],content:'Storms here last three days.',enabled:true,constant:true},
    {keys:['ghost'],content:'A ghost walks the stairs.',enabled:true},{keys:['x'],content:'off',enabled:false}]}}};

test('V2 PNG cards are read from the chara chunk, and ccv3 wins when both exist',()=>{
  const b64=Buffer.from(JSON.stringify(v2),'utf8').toString('base64');
  assert.equal(core.cardJsonFromPng(png([['tEXt',Buffer.concat([Buffer.from('chara\0','latin1'),Buffer.from(b64,'latin1')])]])).data.name,'Mira');
  const v3=Buffer.from(JSON.stringify({spec:'chara_card_v3',data:{...v2.data,name:'Mira V3'}}),'utf8').toString('base64');
  const both=png([['tEXt',Buffer.concat([Buffer.from('chara\0'),Buffer.from(b64)])],['tEXt',Buffer.concat([Buffer.from('ccv3\0'),Buffer.from(v3)])]]);
  assert.equal(core.cardJsonFromPng(both).data.name,'Mira V3');
  const itxt=png([['iTXt',Buffer.concat([Buffer.from('chara\0\0\0\0\0'),Buffer.from(b64)])]]);
  assert.equal(core.cardJsonFromPng(itxt).data.name,'Mira');
});
test('non-card images and compressed chunks give clear errors',()=>{
  assert.throws(()=>core.cardJsonFromPng(new Uint8Array([1,2,3,4,5,6,7,8,9])),/not a PNG/);
  assert.throws(()=>core.cardJsonFromPng(png([['tEXt',Buffer.from('Software\0paint')]])),/no character card data/);
  assert.throws(()=>core.cardJsonFromPng(png([['zTXt',Buffer.from('chara\0\0xx')]])),/compressed/);
});
test('cards normalize across V1, Pygmalion and V2 shapes',()=>{
  const card=core.normalizeCard(v2);
  assert.equal(card.name,'Mira');assert.equal(card.greetings.length,2);assert.equal(card.book.entries.length,2);
  assert.equal(core.normalizeCard({name:'Old',description:'d',first_mes:'hi'}).greetings[0],'hi');
  const pyg=core.normalizeCard({char_name:'Pyg',char_persona:'p',char_greeting:'yo',world_scenario:'w',example_dialogue:'e'});
  assert.equal(pyg.name,'Pyg');assert.equal(pyg.description,'p');assert.equal(pyg.scenario,'w');
  assert.throws(()=>core.normalizeCard({data:{description:'x'}}),/no name/);
});
test('the prompt fills placeholders and includes only always-on lore',()=>{
  const prompt=core.cardPrompt(core.normalizeCard(v2),'Rin');
  assert.match(prompt,/^Write vividly\.\n\nYou are Mira\.\n\nMira is a lighthouse keeper who teases Rin\./);
  assert.match(prompt,/Personality: dry, warm/);assert.match(prompt,/Scenario: A storm traps Rin/);
  assert.match(prompt,/World facts:\n- Storms here last three days\./);assert.ok(!prompt.includes('ghost'));
  assert.match(prompt,/Example dialogue[\s\S]*Rin: Hi\nMira: Hm\./);assert.match(prompt,/Stay as Mira\.$/);
  assert.ok(!prompt.includes('{{'));
});
test('importing creates a single chat or a roleplay scene that opens with the chosen greeting',()=>{
  let n=0;const id=()=>'id'+(++n),card=core.normalizeCard(v2);
  const single=core.cardToChat(card,{userName:'Rin',mode:'single',greetingIndex:1,avatar:'data:image/jpeg;base64,AA'},id,5);
  assert.equal(single.group,null);assert.equal(single.conversationId,single.agent.id);
  assert.equal(single.messages[0].content,'*Mira hands Rin a towel.*');assert.equal(single.agent.avatar,'data:image/jpeg;base64,AA');
  assert.equal(single.agent.moods,true);assert.equal(single.agent.matureMoods,false);
  const scene=core.cardToChat(card,{userName:'Rin',mode:'scene',mature:true},id,7);
  assert.equal(scene.conversationId,scene.group.id);assert.deepEqual([...scene.group.members],[scene.agent.id]);
  assert.equal(scene.group.roleplay.mature,true);assert.equal(scene.group.roleplay.setting,'A storm traps Rin at the lighthouse.');
  assert.equal(scene.messages[0].agentId,scene.agent.id);assert.equal(scene.messages[0].characterName,'Mira');
  assert.match(scene.messages[0].content,/half drowned, Rin\./);
  assert.deepEqual([...core.validateRoleplay(scene.group.roleplay,scene.group.members,true)],[]);
});
