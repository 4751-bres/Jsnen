const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore}=require('./source');
const core=loadCore();
const msgs=[{role:'user',content:'Hi'}];

test('provider kind is read from the base URL',()=>{
  assert.equal(core.providerKind('https://api.deepseek.com'),'deepseek');
  assert.equal(core.providerKind('https://openrouter.ai/api/v1'),'openrouter');
  assert.equal(core.providerKind('https://api.openai.com/v1'),'openai');
  assert.equal(core.providerKind('https://generativelanguage.googleapis.com/v1beta/openai'),'gemini');
  assert.equal(core.providerKind('http://localhost:11434/v1'),'generic');
  assert.equal(core.isLocalBase('http://localhost:1234/v1'),true);
  assert.equal(core.isLocalBase('https://api.groq.com/openai/v1'),false);
  for(const p of require('node:vm').runInContext('PROVIDER_PRESETS',core))assert.ok(p.id&&p.name&&typeof p.base==='string');
});
test('DeepSeek keeps its thinking switch and max_tokens',()=>{
  const r=core.buildChatRequest({base:'https://api.deepseek.com',key:'k'},{think:'max',temp:1,maxTokens:'max'},msgs,'deepseek-flash');
  assert.equal(r.url,'https://api.deepseek.com/chat/completions');
  assert.equal(r.body.model,'deepseek-flash');assert.deepEqual({...r.body.thinking},{type:'enabled'});assert.equal(r.body.reasoning_effort,'max');
  assert.equal('temperature' in r.body,false);assert.equal(r.body.max_tokens,393216);assert.equal(r.headers.Authorization,'Bearer k');
  const off=core.buildChatRequest({base:'https://api.deepseek.com',key:'k'},{think:'off',temp:0.7},msgs,'deepseek-flash');
  assert.deepEqual({...off.body.thinking},{type:'disabled'});assert.equal(off.body.temperature,0.7);
});
test('OpenRouter, OpenAI and generic servers get their own request shape',()=>{
  const or=core.buildChatRequest({base:'https://openrouter.ai/api/v1/',key:'k',model:'anthropic/claude'},{think:'max',temp:1},msgs,'x');
  assert.equal(or.url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(or.body.model,'anthropic/claude');
  assert.deepEqual({...or.body.reasoning},{effort:'high'});assert.equal('thinking' in or.body,false);assert.equal(or.headers['X-Title'],'DeepSeek Agents');
  const oa=core.buildChatRequest({base:'https://api.openai.com/v1',key:'k'},{model:'gpt-x',think:'low',temp:1,maxTokens:'8192'},msgs,'x');
  assert.equal(oa.body.model,'gpt-x');assert.equal(oa.body.reasoning_effort,'low');assert.equal(oa.body.max_completion_tokens,8192);assert.equal('max_tokens' in oa.body,false);
  const local=core.buildChatRequest({base:'http://localhost:11434/v1',key:'',model:'llama3'},{think:'high',temp:0.9},msgs,'x');
  assert.equal(local.body.temperature,0.9);assert.equal('reasoning_effort' in local.body,false);assert.equal('stream_options' in local.body,false);
  assert.equal('Authorization' in local.headers,false);
});
test('model lists are parsed from /models responses',()=>{
  assert.deepEqual([...core.modelIdsFrom({data:[{id:'b'},{id:'a'},{id:'a'}]})],['a','b']);
  assert.deepEqual([...core.modelIdsFrom({models:[{name:'models/gemini-pro'}]})],['gemini-pro']);
  assert.deepEqual([...core.modelIdsFrom(null)],[]);
});
test('backups never include API keys',()=>{
  for(const k of ['ds_key','ds_providers','ds_exa_key'])assert.equal(core.isBackupKey(k),false);
  assert.equal(core.isBackupKey('ds_agents'),true);
});
