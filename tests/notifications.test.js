const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {read,source}=require('./source');

test('the worker previews a reply without hidden tags for the notification',()=>{
  const sw=read('sw.js');
  const ctx=vm.createContext({self:{addEventListener(){}},caches:{},indexedDB:{}});
  vm.runInContext(sw.slice(sw.indexOf('function replyPreview'),sw.indexOf('async function notifyReply')),ctx);
  const raw=['data: {"choices":[{"delta":{"content":"*She smiles.* Hello"}}]}','data: {"choices":[{"delta":{"content":" there.\\n[thoughts: hm]\\n[bond: 60]\\n[mood: calm 3]"}}]}','data: [DONE]'].join('\n');
  assert.equal(ctx.replyPreview(raw),'She smiles. Hello there.');
  assert.equal(ctx.replyPreview('data: {"choices":[{"delta":{"content":"'+'x'.repeat(300)+'"}}]}').length,158);
});
test('install metadata has PNG icons and a declared colour scheme (Samsung Internet)',()=>{
  const m=JSON.parse(read('manifest.json'));
  assert.ok(m.icons.some(i=>i.src==='icon-192.png'&&i.type==='image/png'));
  assert.ok(m.icons.some(i=>i.purpose==='maskable'&&i.type==='image/png'));
  assert.match(source(),/<meta name="color-scheme" content="dark only" \/>/);
  assert.match(read("sw.js"),/"ds-agents-shell-v\d+"/);
});
