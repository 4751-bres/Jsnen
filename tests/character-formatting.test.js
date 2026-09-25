const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('index.html','utf8');
function formatting(){const ctx=vm.createContext({});vm.runInContext(source.slice(source.indexOf('function esc('),source.indexOf('/* ---------- Header / agent / group')),ctx);return ctx;}
test('asterisk scene actions render as emphasis without damaging dialogue or code',()=>{
  const {md}=formatting();
  assert.equal(md('*I put my phone away.* Hello.'),'<em>I put my phone away.</em> Hello.');
  assert.equal(md('**Important** and *an action*'),'<b>Important</b> and <em>an action</em>');
  assert.equal(md('`*literal*`'),'<code>*literal*</code>');
  assert.equal(md('```*literal*```'),'<pre><code>*literal*</code></pre>');
  assert.equal(md('\\*literal\\*'),'*literal*');
});
test('emphasis and link parsing keep untrusted content escaped',()=>{
  const {md}=formatting();
  assert.equal(md('*<img src=x onerror=alert(1)>*'),'<em>&lt;img src=x onerror=alert(1)&gt;</em>');
  assert.ok(!md('[x](https://example.com/"onclick="alert(1))').includes('"onclick="'));
});
test('single-agent persona stays in system role and user actions remain untouched',()=>{
  const prompt='sexual problems therapist with 25-year-old girl and married.';
  const messages=[{role:'user',content:'*I take out my phone.* Hello.'}];
  const ctx=vm.createContext({messages,isGroup:()=>false});
  const core=source.slice(source.indexOf('/* roleplay-core:start */'),source.indexOf('/* roleplay-core:end */'));
  const single=source.slice(source.indexOf('function buildApiMessages('),source.indexOf('/* ---------- Stream one response'));
  vm.runInContext(core+'\n'+single,ctx);
  const payload=ctx.buildApiMessages({prompt});
  assert.equal(payload[0].role,'system');assert.ok(payload[0].content.includes(prompt));
  assert.ok(payload[0].content.includes('description above defines you'));
  assert.ok(payload[0].content.includes('single asterisks'));
  assert.equal(payload[1].content,'[user]: '+messages[0].content);
  assert.equal(messages[0].content,'*I take out my phone.* Hello.');
});
