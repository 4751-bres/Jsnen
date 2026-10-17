const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore,source}=require('./source');
const core=loadCore();

test('the agent speaks first only in an empty chat, as chosen in its editor',()=>{
  assert.equal(core.shouldOpen({},[]),null);
  assert.equal(core.shouldOpen({opener:'ai'},[]),'ai');
  assert.equal(core.shouldOpen({opener:'ai'},[{role:'user',content:'hi'}]),null);
  assert.equal(core.shouldOpen({opener:'text',greeting:'  '},[]),null);
  assert.equal(core.shouldOpen({opener:'text',greeting:'You\'re late.'},[]),'text');
  assert.equal(core.shouldOpen({opener:'weird'},[]),null);
  assert.equal(core.openerMode({opener:'text'}),'text');
});
test('editor has the First message choice; a fresh AI opener nudges the model without saving the nudge',()=>{
  const page=source();
  assert.match(page,/id="edOpener"/);assert.match(page,/id="edGreeting"/);
  assert.match(page,/if\(meta\.opener\)payload\.messages=\[\.\.\.payload\.messages,\{role:"user",content:OPENER_NUDGE\}\];/);
  assert.match(page,/delete bot\.opener;/);
});
