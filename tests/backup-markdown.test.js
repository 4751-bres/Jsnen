const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=require('./source')();
function memoryStorage(initial={},limit=Infinity){
  const data=new Map(Object.entries(initial));
  return {data,get length(){return data.size},key:i=>[...data.keys()][i]??null,getItem:k=>data.has(k)?data.get(k):null,
    setItem:(k,v)=>{if(data.size>=limit&&!data.has(k))throw Error('quota');data.set(k,String(v));},removeItem:k=>data.delete(k)};
}
function backup(){const c=vm.createContext({});vm.runInContext(source.slice(source.indexOf('/* backup-core:start */'),source.indexOf('/* backup-core:end */')),c);return c;}
function md(){const c=vm.createContext({});vm.runInContext(source.slice(source.indexOf('function esc('),source.indexOf('/* ---------- Header / agent / group')),c);return c.md;}

test('backup excludes the API key and round-trips everything else',()=>{
  const {makeBackup,restoreBackup}=backup();
  const from=memoryStorage({ds_key:'secret',ds_agents:'[1]',ds_conv_a:'[2]',other:'x'});
  const file=JSON.parse(JSON.stringify(makeBackup(from)));
  assert.ok(!JSON.stringify(file).includes('secret'));assert.ok(!('other' in file.data));
  const to=memoryStorage({ds_key:'mine',ds_conv_old:'gone'});
  restoreBackup(to,file);
  assert.equal(to.getItem('ds_key'),'mine');assert.equal(to.getItem('ds_conv_a'),'[2]');assert.equal(to.getItem('ds_conv_old'),null);
});
test('restore rejects foreign files and rolls back on quota failure',()=>{
  const {restoreBackup}=backup();
  const target=memoryStorage({ds_key:'k',ds_agents:'keep'},3);
  assert.throws(()=>restoreBackup(target,{app:'nope',data:{}}),/not a DeepSeek Agents backup/);
  assert.throws(()=>restoreBackup(target,{app:'deepseek-agents',data:{ds_a:'1',ds_b:'2',ds_c:'3'}}),/Nothing was changed/);
  assert.equal(target.getItem('ds_agents'),'keep');assert.equal(target.getItem('ds_a'),null);
});
test('markdown blocks render without touching scene actions',()=>{
  const render=md();
  assert.equal(render('## Plan'),'<b class="md-h">Plan</b>');
  assert.equal(render('- one\n* two'),'• one\n• two');
  assert.equal(render('> quoted'),'<span class="md-quote">quoted</span>');
  assert.equal(render('*I wave.* Hi'),'<em>I wave.</em> Hi');
  assert.equal(render('```\n# not a heading\n```'),'<pre><code># not a heading\n</code></pre>');
});
