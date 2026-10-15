const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore,source}=require('./source');
const core=loadCore();

test('world entries need text and a keyword or Always',()=>{
  assert.throws(()=>core.makeWorldEntry({content:'  '}),/Write what/);
  assert.throws(()=>core.makeWorldEntry({content:'x',keys:' , '}),/keyword/);
  const e=core.makeWorldEntry({content:' The docks. ',keys:'Moretti, docks,\nMoretti'});
  assert.deepEqual({...e,keys:[...e.keys]},{name:'Moretti',keys:['Moretti','docks'],content:'The docks.',always:false});
  assert.equal(core.makeWorldEntry({content:'Rain all week.',always:true}).name,'Entry');
});
test('entries trigger on keywords, always-entries every time, card constants never (they are in the prompt)',()=>{
  const book={entries:[{keys:['moretti'],content:'A'},{keys:[],always:true,content:'B'},{keys:['x'],constant:true,content:'C'},{keys:['docks'],content:'D',enabled:false}]};
  assert.deepEqual([...core.activeLore(book,['The Moretti brothers arrived at the docks'])],['A','B']);
  assert.deepEqual([...core.activeLore(book,['quiet night'])],['B']);
});
test('group chats combine the character book with the group book',()=>{
  assert.match(source(),/activeLore\(agent\?\.lorebook,recent\),\.\.\.\(owner!==agent\?activeLore\(owner\.lorebook,recent\):\[\]\)/);
});
