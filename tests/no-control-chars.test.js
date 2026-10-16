const test=require('node:test');
const assert=require('node:assert/strict');
const {read}=require('./source');

// Shell heredocs once turned "\b" in regexes into raw backspace characters; source files must stay clean.
test('source files contain no stray control characters',()=>{
  for(const name of ['core.js','app.js','sw.js','styles.css','index.html']){
    const bad=[...read(name)].findIndex(ch=>{const c=ch.charCodeAt(0);return c<32&&c!==9&&c!==10&&c!==13;});
    assert.equal(bad,-1,name+' has a control character at index '+bad);
  }
});
