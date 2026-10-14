const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore,source}=require('./source');
const core=loadCore();

test('a chat downloads as readable plain text with times, day breaks and sources',()=>{
  const day1=new Date(2026,9,14,22,5).getTime(),day2=new Date(2026,9,15,8,30).getTime();
  const text=core.chatToText('🌙 Lake House',[
    {role:'user',content:'*I sit down.* Hi',at:day1},
    {role:'assistant',characterName:'Elise',content:'Hello there.\r\nWelcome.',at:day1+60000,images:[{}]},
    {role:'assistant',agentName:'Bot',content:'⚠️ failed',error:true,at:day1},
    {role:'system',content:'hidden'},
    {role:'assistant',content:'Sunny [1]',at:day2,sources:[{title:'Météo',url:'https://m.fr'}]}
  ],{userName:'Rin',assistantName:'Guide',intro:'Opening scene:\nRain.',now:day2});
  assert.equal(text,[
    '🌙 Lake House','Saved Thursday, October 15, 2026 at 08:30 · 3 messages','========================','',
    'Opening scene:\nRain.','','—— Wednesday, October 14, 2026 ——','','[22:05] Rin:','*I sit down.* Hi','',
    '[22:06] Elise:','Hello there.\nWelcome.','[1 image]','','—— Thursday, October 15, 2026 ——','',
    '[08:30] Guide:','Sunny [1]','Sources:','  [1] Météo — https://m.fr',''
  ].join('\n'));
});
test('export file names are safe and dated',()=>{
  const now=new Date(2026,9,5,12).getTime();
  assert.equal(core.chatFileName('Lake House: Night #2','txt',now),'Lake-House-Night-2-2026-10-05.txt');
  assert.equal(core.chatFileName('Élise ✨','md',now),'Élise-2026-10-05.md');
  assert.equal(core.chatFileName('???','txt',now),'chat-2026-10-05.txt');
});
test('the header has one chat options button holding download, duplicate and clear',()=>{
  const page=source();
  const header=page.slice(page.indexOf('<header'),page.indexOf('</header>'));
  assert.match(header,/id="chatMenuBtn"/);assert.doesNotMatch(header,/id="clearBtn"|id="duplicateChatBtn"/);
  const menu=page.slice(page.indexOf('id="chatMenu"'),page.indexOf('<!-- Moods sheet -->'));
  for(const id of ['dlTxt','shareTxt','dlMd','duplicateChatBtn','clearBtn'])assert.match(menu,new RegExp('id="'+id+'"'));
});
