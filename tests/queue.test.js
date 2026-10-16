const test=require('node:test');
const assert=require('node:assert/strict');
const {source}=require('./source');
test('typing during a reply queues the message instead of stopping',()=>{
  const page=source();
  assert.match(page,/id="queueBar"/);
  assert.match(page,/if\(controller&&!isWorkflow\(\)&&input\.value\.trim\(\)\)\{queueMessage\(\);return;\}/);
  assert.match(page,/if\(!on\)setTimeout\(flushQueuedMessage,250\);/);
  assert.match(page,/if\(!queuedMessage\|\|controller\|\|sequence\|\|readingImages\)return;/);
});
