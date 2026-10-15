const test=require('node:test');
const assert=require('node:assert/strict');
const {source}=require('./source');
const page=source();

test('the chat title opens the quick model switcher with provider, model and thinking',()=>{
  assert.match(page,/<div class="title" role="button" tabindex="0" title="Change model">/);
  const sheet=page.slice(page.indexOf('id="modelSheet"'),page.indexOf('<!-- World info -->'));
  for(const id of ['qmProvider','qmModel','qmLoad','qmThink','qmTemp','qmSave','qmMembers'])assert.match(sheet,new RegExp('id="'+id+'"'));
  assert.match(page,/\$\("\.title"\)\.addEventListener\("click",openQuickModel\)/);
});
