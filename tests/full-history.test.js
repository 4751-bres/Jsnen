const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('index.html','utf8');
function setup(){
  const data=new Map();
  const context=vm.createContext({localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},isGroup:()=>false});
  vm.runInContext(source.slice(source.indexOf('const store ='),source.indexOf('const uid ='))+'\nthis.storage=store;',context);
  vm.runInContext(source.slice(source.indexOf('/* roleplay-core:start */'),source.indexOf('/* roleplay-core:end */'))+'\n'+source.slice(source.indexOf('function buildApiMessages('),source.indexOf('/* ---------- Stream one response ---------- */')),context);
  return context;
}
test('1000 messages survive save and reload and all reach the single-agent API context',()=>{
  const c=setup();
  const history=Array.from({length:1000},(_,i)=>({role:i%2?'assistant':'user',content:'Message '+i}));
  history[0].images=[{url:'data:image/png;base64,test'}];
  history[1].versions=[{content:'Inactive reply',tail:[]}];
  c.storage.saveConv('long-chat',history);c.messages=c.storage.conv('long-chat');
  assert.equal(c.messages.length,1000);assert.equal(c.messages[0].content,'Message 0');
  assert.equal(c.messages[1].versions[0].content,'Inactive reply');
  const payload=c.buildApiMessages({prompt:'Be helpful'});
  assert.equal(payload.length,1001);assert.equal(payload[1].content[0].text,'[user]: Message 0');
  assert.equal(payload[1000].content,'[char]: Message 999');
  assert.ok(!JSON.stringify(payload).includes('Inactive reply'));
  const group=c.buildGroupApiMessages({members:['a']},{id:'a',name:'A',prompt:'Be helpful'},c.messages);
  assert.equal(group.length,1001);assert.equal(group[1].content[0].text,'Message 0');
});
