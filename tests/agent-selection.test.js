const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {read}=require('./source');

test('creating a personal agent persists both its id and chat kind',()=>{
  const code=read('app.js');
  const handler=code.slice(code.indexOf('$("#saveAgent").onclick='),code.indexOf('$("#dupAgent").onclick='));
  for(const kind of ['agent','group','workflow']){
    const fields=new Map();
    const $=selector=>{
      if(!fields.has(selector))fields.set(selector,{value:selector==='#edName'?'Sera':'',checked:false});
      return fields.get(selector);
    };
    const ctx=vm.createContext({$,editingId:null,editingAvatar:null,editingColor:null,agents:[],currentKind:kind,currentId:'old',store:{kind,cur:'old'},uid:()=> 'sera',newAgentThink:()=> 'low',memoryLines:()=>[],renderAgents(){},loadConv(){},closeAll(){},toast(){}});
    vm.runInContext(handler,ctx);
    $('#saveAgent').onclick();
    assert.equal(ctx.currentKind,'agent');
    assert.equal(ctx.currentId,'sera');
    assert.equal(ctx.store.kind,'agent');
    assert.equal(ctx.store.cur,'sera');
    assert.equal(ctx.store.agents[0].id,'sera');
  }
});
