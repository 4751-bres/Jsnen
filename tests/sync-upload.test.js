const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore}=require('./source');
const core=loadCore({crypto:globalThis.crypto,TextEncoder,TextDecoder,CompressionStream,DecompressionStream,Blob,Response,btoa,atob,URL,AbortSignal});
const pass='synthetic sync password';

test('automatic upload encrypts a merged backup and never sends plaintext secrets',async()=>{
  const remote={ds_conv_remote:'[{"role":"user","content":"Remote chat","at":10}]'};
  const file={env:await core.sealSync({data:remote},pass)};
  const calls=[];
  const request=async(url,options)=>{
    calls.push({url,...options});
    if(!options.method)return {ok:true,json:async()=>({id:'abc123',files:{'deepseek-agents-sync.json':{content:JSON.stringify(file)}}})};
    return {ok:true,json:async()=>({id:'abc123'})};
  };
  const result=await core.uploadEncryptedSync({gist:'abc123',device:'Test phone',token:'synthetic-token',pass,data:{ds_conv_local:'[]',ds_key:'DO_NOT_UPLOAD'}},request);
  assert.equal(result.gist,'abc123');
  const body=calls.at(-1).body;
  assert.doesNotMatch(body,/DO_NOT_UPLOAD|synthetic-token|synthetic sync password|Remote chat|ds_conv_local/);
  const saved=JSON.parse(JSON.parse(body).files['deepseek-agents-sync.json'].content);
  const opened=await core.openSync(saved.env,pass);
  assert.ok('ds_conv_remote' in opened.data);assert.ok('ds_conv_local' in opened.data);assert.equal('ds_key' in opened.data,false);
});

test('a wrong password or failed remote download never overwrites the existing cloud copy',async()=>{
  const env=await core.sealSync({data:{}},'different password');let writes=0;
  await assert.rejects(core.uploadEncryptedSync({gist:'abc123',token:'fake',pass,data:{}},async(url,options)=>{
    if(options.method)writes++;
    return {ok:true,json:async()=>({id:'abc123',files:{'deepseek-agents-sync.json':{content:JSON.stringify({env})}}})};
  }),/Wrong sync password/);
  assert.equal(writes,0);
});

test('a first backup creates a private gist and propagates API failures',async()=>{
  let payload;
  const request=async(url,options)=>{
    if(options.method){payload=JSON.parse(options.body);return {ok:true,json:async()=>({id:'abc123'})};}
    return {ok:true,json:async()=>[]};
  };
  await core.uploadEncryptedSync({token:'fake',pass,data:{ds_conv_a:'[]'}},request);
  assert.equal(payload.public,false);
  await assert.rejects(core.uploadEncryptedSync({token:'fake',pass,data:{}},async()=>({ok:false,status:401})),/rejected the sync token/);
});

test('a new local edit or clear wins over an older remote transcript',()=>{
  const local={ds_conv_a:'[]',ds_rev_a:'200'},remote={ds_conv_a:'[{"at":100,"content":"Older"}]',ds_rev_a:'100'};
  const merged=core.mergeSyncData(local,remote);
  assert.equal(merged.data.ds_conv_a,'[]');assert.equal(merged.data.ds_rev_a,'200');
});
