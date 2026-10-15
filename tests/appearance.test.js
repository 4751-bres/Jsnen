const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore,source}=require('./source');
const core=loadCore();

test('appearance settings are validated with safe defaults',()=>{
  assert.deepEqual({...core.normalizeAppearance(null)},{accent:'blue',size:16,font:'system',density:'comfortable',bubbles:false});
  assert.deepEqual({...core.normalizeAppearance({accent:'rose',size:'20',font:'serif',density:'compact',bubbles:1})},{accent:'rose',size:20,font:'serif',density:'compact',bubbles:true});
  assert.deepEqual({...core.normalizeAppearance({accent:'toString',size:99,font:'constructor'})},{accent:'blue',size:16,font:'system',density:'comfortable',bubbles:false});
});
test('accent palettes swap colours per theme and blue keeps the defaults',()=>{
  assert.deepEqual({...core.accentVars('blue',false)},{});
  const dark=core.accentVars('teal',false),light=core.accentVars('teal',true);
  assert.equal(dark['--accent'],'#5eead4');assert.equal(light['--accent'],'#0e7469');
  assert.equal(dark['--mark'],dark['--accent-soft']);
});
test('backgrounds accept presets and photos only, with a clamped dim',()=>{
  assert.equal(core.normalizeBackground({kind:'preset',value:'nope'}),null);
  assert.equal(core.normalizeBackground({kind:'photo',value:'javascript:alert(1)'}),null);
  assert.equal(core.normalizeBackground({kind:'photo',value:'data:image/jpeg;base64,AAAA',dim:5}).dim,.85);
  assert.equal(core.normalizeBackground({kind:'preset',value:'dusk'}).dim,.45);
  assert.match(core.backgroundImage({kind:'preset',value:'ocean'}),/^linear-gradient/);
  assert.equal(core.backgroundImage({kind:'photo',value:'data:image/png;base64,AA'}),'url("data:image/png;base64,AA")');
  assert.equal(core.backgroundImage({kind:'none'}),'');
  assert.equal(core.effectiveBackground(null,{kind:'preset',value:'rose'}).value,'rose');
  assert.equal(core.effectiveBackground({kind:'none'},{kind:'preset',value:'rose'}).kind,'none');
});
test('chat backgrounds are stored with conversations so backups carry them',()=>{
  const page=source();
  assert.match(page,/isBigKey\(k\)\{return \/\^ds_\(conv\|run\|sum\|bg\)_\//);
});
test('character colours: chosen colour wins, groups get a stable automatic one',()=>{
  assert.deepEqual([...core.characterColor({id:'a',color:'rose'},false)],['#f48fb1','#c2185b']);
  assert.equal(core.characterColor({id:'a'},false),null);
  const one=core.characterColor({id:'nadia-1'},true),again=core.characterColor({id:'nadia-1'},true);
  assert.deepEqual([...one],[...again]);assert.equal(one.length,2);
  assert.equal(core.characterColor({id:'a',color:'nope'},false),null);
});
