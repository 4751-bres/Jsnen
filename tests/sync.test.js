const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore,source}=require('./source');
const core=loadCore({crypto:globalThis.crypto,TextEncoder,TextDecoder,CompressionStream,DecompressionStream,Blob,Response,btoa,atob});
const conv=(...ats)=>JSON.stringify(ats.map(at=>({role:'user',content:'x',at})));

test('only chats and their parts sync; per-device settings and keys never do',()=>{
  for(const k of ['ds_agents','ds_groups','ds_conv_a','ds_run_a','ds_sum_a','ds_bg_a','ds_bg__all','ds_dir_a','ds_chap_a','ds_personas','ds_provider_list'])assert.equal(core.isSyncKey(k),true,k);
  for(const k of ['ds_key','ds_providers','ds_exa_key','ds_lock','ds_appearance','ds_theme','ds_device','ds_draft_agent:a','ds_cur','ds_sync_token','ds_sync_pass','ds_previews'])assert.equal(core.isSyncKey(k),false,k);
});
test('merge keeps both sides; the newer copy of a shared chat wins with its parts and its agent',()=>{
  const local={ds_conv_a:conv(1,5),ds_dir_a:'L',ds_conv_b:conv(9),ds_agents:JSON.stringify([{id:'a',name:'A-local'},{id:'b',name:'B'}]),ds_theme:'light'};
  const remote={ds_conv_a:conv(1,7),ds_dir_a:'R',ds_chap_a:'[]',ds_conv_c:conv(3),ds_agents:JSON.stringify([{id:'a',name:'A-remote'},{id:'c',name:'C'}]),ds_key:'secret'};
  const {data,winner}=core.mergeSyncData(local,remote);
  assert.equal(winner.a,'remote');assert.equal(winner.b,'local');assert.equal(winner.c,'remote');
  assert.equal(data.ds_conv_a,remote.ds_conv_a);assert.equal(data.ds_dir_a,'R');assert.equal(data.ds_chap_a,'[]');
  assert.equal(data.ds_conv_b,local.ds_conv_b);assert.equal(data.ds_conv_c,remote.ds_conv_c);
  assert.deepEqual(JSON.parse(data.ds_agents).map(a=>a.name),['A-remote','B','C']);
  assert.equal('ds_key' in data,false);assert.equal('ds_theme' in data,false);
});
test('a plan writes what differs and removes sync keys missing from the target',()=>{
  const p=core.syncPlan({ds_conv_a:'1',ds_conv_b:'2',ds_theme:'dark'},{ds_conv_a:'1',ds_conv_c:'3'});
  assert.deepEqual({...p.set},{ds_conv_c:'3'});assert.deepEqual([...p.remove],['ds_conv_b']);
  assert.equal(core.countChats({ds_conv_a:'',ds_agents:''}),1);
});
test('the synced copy is encrypted and only opens with the right password',async()=>{
  const data={ds_conv_a:conv(1,2,3),ds_agents:'[{"id":"a"}]'};
  const env=await core.sealSync({data},'correct horse');
  assert.equal(env.v,1);assert.doesNotMatch(env.data,/ds_conv_a/);
  const back=await core.openSync(env,'correct horse');
  assert.equal(JSON.stringify(back.data),JSON.stringify(data));
  await assert.rejects(core.openSync(env,'wrong password'),/Wrong sync password/);
});
test('settings have a Sync section with upload, get, merge and replace',()=>{
  const page=source();
  for(const id of ['syncOpen','syncSheet','syUp','syDown','syMerge','syReplace','syToken','syPass','syDevice','syForget'])assert.match(page,new RegExp('id="'+id+'"'));
});
