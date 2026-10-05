const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadCore,source}=require('./source');
const core=loadCore();

test('a chat setting overrides the global default, and 0 means unlimited',()=>{
  assert.equal(core.effectiveHistoryLimit(undefined,50),50);
  assert.equal(core.effectiveHistoryLimit('',20),20);
  assert.equal(core.effectiveHistoryLimit('0',20),0);
  assert.equal(core.effectiveHistoryLimit('100',0),100);
  assert.equal(core.effectiveHistoryLimit(undefined,0),0);
  const api=[{role:'system',content:'S'},...Array.from({length:500},(_,i)=>({role:'user',content:'m'+i}))];
  const {kept,dropped}=core.limitApiHistory(api,core.effectiveHistoryLimit('0',20));
  assert.equal(kept.length,501);assert.equal(dropped.length,0);
});
test('workflow snapshots include the whole conversation when unlimited, else the last N',()=>{
  const page=source();
  const code=page.slice(page.indexOf('function workflowHistorySnapshot(){'),page.indexOf('async function startWorkflowRun('));
  const messages=Array.from({length:300},(_,i)=>({role:i%2?'assistant':'user',content:'m'+i}));
  for(const [limit,expected] of [[0,300],[20,20]]){
    const c=vm.createContext({messages,isContextMessage:m=>!!m.content,currentHistoryLimit:()=>limit});
    vm.runInContext(code+'\nthis.snap=workflowHistorySnapshot();',c);
    assert.equal(c.snap.length,expected);assert.equal(c.snap.at(-1).content,'m299');
  }
});
test('every editor offers Unlimited plus a "use Settings default" choice',()=>{
  const page=source();
  for(const id of ['ctxLimit','edHistory','grHistory','wfHistory']){
    const select=page.slice(page.indexOf('id="'+id+'"'),page.indexOf('</select>',page.indexOf('id="'+id+'"')));
    assert.match(select,/value="0">Unlimited — entire conversation/,id);
    if(id!=='ctxLimit')assert.match(select,/value="">Use Settings default/,id);
  }
});
