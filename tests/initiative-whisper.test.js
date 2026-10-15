const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore}=require('./source');
const core=loadCore();
const H=3600000;

test('characters reach out only after the chosen time away and within the daily limit',()=>{
  const chat=[{role:'user',content:'a',at:0},{role:'assistant',content:'b',at:H}];
  assert.equal(core.shouldReachOut('off',chat,10*H),null);
  assert.equal(core.shouldReachOut('often',chat,H+30*60000),null);
  assert.equal(core.shouldReachOut('often',chat,3*H).hours,2);
  assert.equal(core.shouldReachOut('rarely',chat,5*H),null);
  assert.equal(core.shouldReachOut('often',[...chat,{role:'assistant',content:'hey',at:2*H,proactive:true}],9*H),null);
  assert.equal(core.shouldReachOut('often',[{role:'user',content:'a',at:0}],9*H),null);
  assert.match(core.proactiveInstruction(50,'Rin'),/Rin has not written for about 2 days/);
  assert.equal(core.pickInitiator([{role:'assistant',agentId:'x'},{role:'assistant',agentId:'b'}],['a','b']),'b');
  assert.equal(core.pickInitiator([],['a','b']),'a');
});
test('whispers stay out of other characters\' context',()=>{
  assert.equal(core.visibleTo({whisperTo:'a'},'a'),true);
  assert.equal(core.visibleTo({whisperTo:'a'},'b'),false);
  assert.equal(core.visibleTo({content:'public'},'b'),true);
  const group={members:['a','b'],roleplay:{enabled:true,setting:'',opening:'',user:{name:'Rin',description:''},characters:{a:{name:'A',description:''},b:{name:'B',description:''}}}};
  const msgs=[{role:'user',content:'hello all'},{role:'user',content:'psst A only',whisperTo:'a'}];
  const forB=JSON.stringify(core.buildGroupApiMessages(group,{id:'b',name:'B'},msgs));
  const forA=JSON.stringify(core.buildGroupApiMessages(group,{id:'a',name:'A'},msgs));
  assert.doesNotMatch(forB,/psst/);assert.match(forA,/psst A only/);
});
