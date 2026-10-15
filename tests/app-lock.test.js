const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore,source}=require('./source');
const core=loadCore();

test('PINs are 4–8 digits; stored locks are validated',()=>{
  for(const ok of ['1234','12345678'])assert.equal(core.validPin(ok),true);
  for(const bad of ['123','123456789','12a4','',null])assert.equal(core.validPin(bad),false);
  assert.equal(core.normalizeLock({hash:1}),null);
  assert.deepEqual({...core.normalizeLock({salt:'s',hash:'h',after:99,length:6})},{salt:'s',hash:'h',after:1,length:6});
  assert.equal(core.isBackupKey('ds_lock'),false);
});
test('the app locks again only after being away long enough',()=>{
  const lock={after:5};
  assert.equal(core.lockDue(lock,1000,1000+4*60000),false);
  assert.equal(core.lockDue(lock,1000,1000+5*60000),true);
  assert.equal(core.lockDue({after:0},1000,1001),true);
  assert.equal(core.lockDue(null,1000,999999),false);
  assert.equal(core.lockDue(lock,0,999999),false);
});
test('repeated wrong PINs slow down, up to five minutes',()=>{
  assert.equal(core.lockCooldown(4),0);assert.equal(core.lockCooldown(5),30000);assert.equal(core.lockCooldown(6),60000);assert.equal(core.lockCooldown(20),300000);
});
test('lock screen markup has a full keypad',()=>{
  const page=source();
  for(const k of ['0','1','5','9','del','ok'])assert.match(page,new RegExp('data-k="'+k+'"'));
  assert.match(page,/id="lockOn" type="checkbox"/);
});
