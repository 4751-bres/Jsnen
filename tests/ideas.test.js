const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCore,source}=require('./source');
const core=loadCore();

test('ideas come back as three clean options',()=>{
  const text='Here are some options:\n1. *I lean closer.* Tell me the truth.\n2) "What happened to your brother?"\n3. [Rin]: *I steal her drink.* Mine now.\n4. extra';
  assert.deepEqual([...core.parseIdeas(text)],['*I lean closer.* Tell me the truth.','What happened to your brother?','*I steal her drink.* Mine now.']);
  assert.deepEqual([...core.parseIdeas('- **Bold:** Kiss her.\n- **Careful:** Ask first.')],['Kiss her.','Ask first.']);
  assert.deepEqual([...core.parseIdeas('no list here')],[]);
});
test('the instruction keeps ideas in the user\'s own voice',()=>{
  const s=core.ideaInstruction('Rin','A tired detective.');
  assert.match(s,/exactly three different options/);assert.match(s,/About Rin: A tired detective\./);assert.match(s,/never anyone else's/);
});
test('the Ideas button sits in the ＋ tray with a row above the composer',()=>{
  const page=source();
  const tray=page.slice(page.indexOf('id="composerTools"'),page.indexOf('<div class="composer">'));
  assert.match(tray,/id="ideasBtn"/);assert.match(page,/id="ideaRow" hidden/);
});
