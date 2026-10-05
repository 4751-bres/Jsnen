const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=require('./source')();
function setup(fail=false){
  const data=new Map(),image={url:'data:image/png;base64,AAAA'},input={value:'Inspect'};
  const c={pendingImages:[image],messages:[],currentRun:null,currentId:'wf',agents:[],input,
    workflowErrorText:{},curWorkflow:()=>({id:'wf',roles:[]}),validateWorkflow:()=>[],
    store:{k:'test',raw:k=>data.get(k)??null,setRaw:(k,v)=>data.set(k,v),removeRaw:k=>data.delete(k),saveRun:(id,r)=>data.set('ds_run_'+id,JSON.stringify(r)),saveConv:(id,m)=>{if(fail)throw Error('quota');data.set('ds_conv_'+id,JSON.stringify(m));}},
    localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},
    newRun:()=>({id:'run',status:'running'}),uid:()=> 'run',Date,
    $:()=>({value:''}),toast:()=>{},autoGrow(){},renderAttachments(){},renderChat(){},renderWorkflowUi(){},continueWorkflowRun:async()=>{},workflowAgent:()=>null,modelSeesImages:()=>true,isContextMessage:m=>!!m.content};
  vm.createContext(c);
  vm.runInContext(html.match(/function workflowHistorySnapshot\(\)\{[\s\S]*?(?=async function continueWorkflowRun)/)[0],c);
  return {c,data,image,input};
}
test('workflow upload persists images in transcript and run before clearing draft',async()=>{
  const {c,data,image,input}=setup();await c.startWorkflowRun('Inspect');
  assert.equal(c.currentRun.images[0].url,image.url);
  assert.equal(JSON.parse(data.get('ds_conv_wf'))[0].images[0].url,image.url);
  assert.equal(c.pendingImages.length,0);assert.equal(input.value,'');
});
test('workflow storage failure preserves image and text draft and rolls back run',async()=>{
  const {c,data,image,input}=setup(true);await c.startWorkflowRun('Inspect');
  assert.equal(c.pendingImages[0],image);assert.equal(input.value,'Inspect');
  assert.equal(c.currentRun,null);assert.equal(c.messages.length,0);assert.equal(data.has('ds_run_wf'),false);
});
