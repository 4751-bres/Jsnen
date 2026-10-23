const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('auto speaker picker never sees whispered messages',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const body=src.slice(src.indexOf('async function pickNextSpeaker'),src.indexOf('async function pickNextSpeaker')+600);
  assert.match(body,/filter\(isContextMessage\)\.filter\(m=>!m\.whisperTo\)/);
});
