const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=require('./source')();
function setup(){
  const c=vm.createContext({});vm.runInContext(html.match(/\/\* flash-migration:start \*\/([\s\S]*?)\/\* flash-migration:end \*\//)[1],c);
  const data=new Map([['ds_conv_a','private conversation'],['ds_key','private key']]);
  return {fn:c.migrateAllAgentsToFlash,data,storage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)}};
}
test('all agent and workflow models switch without changing other settings or private data',()=>{
  const {fn,data,storage}=setup();
  const agent={id:'a',model:'deepseek-v4-pro',prompt:'keep',temp:0.2,think:'high'};
  const result=fn(storage,[agent],[{id:'w',roles:[{id:'r',agent:{...agent}}]}]);
  assert.equal(result.agents[0].model,'deepseek-flash');assert.equal(result.workflows[0].roles[0].agent.model,'deepseek-flash');
  assert.equal(result.agents[0].prompt,'keep');assert.equal(result.agents[0].temp,0.2);assert.equal(result.agents[0].think,'high');
  assert.equal(agent.model,'deepseek-v4-pro');assert.equal(data.get('ds_conv_a'),'private conversation');assert.equal(data.get('ds_key'),'private key');assert.equal(data.get('ds_model'),'deepseek-flash');
});
test('later manual model choices are respected on reload',()=>{
  const {fn,storage}=setup();fn(storage,[],[]);
  const agents=[{model:'custom'}],workflows=[{roles:[{agent:{model:'custom'}}]}];
  const result=fn(storage,agents,workflows);assert.equal(result.agents,agents);assert.equal(result.workflows,workflows);
});
test('failed persistence does not mark migration complete',()=>{
  const {fn,storage,data}=setup();const original=storage.setItem;
  storage.setItem=(k,v)=>{if(k==='ds_workflows')throw Error('quota');original(k,v);};
  assert.throws(()=>fn(storage,[],[]),/quota/);assert.equal(data.has('ds_all_agents_flash_v1'),false);
});
