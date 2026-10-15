// Reassembles index.html with its stylesheet and scripts inlined, in load order, so tests that slice the
// page source keep working after the split into styles.css, core.js, and app.js. New tests should load
// core.js directly instead (see loadCore).
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
function source(){
  const page=read('index.html');
  const css=/<link rel="stylesheet" href="styles\.css" \/>/,js=/<script src="core\.js"><\/script>\r?\n<script src="app\.js"><\/script>/;
  if(!css.test(page)||!js.test(page))throw new Error('index.html no longer links styles.css, core.js, and app.js as expected');
  return page
    .replace(css,()=>'<style>\n'+read('styles.css')+'</style>')
    .replace(js,()=>'<script>\n'+read('core.js')+'\n'+read('app.js')+'</script>');
}
function loadCore(extra={}){const ctx=vm.createContext({...extra});vm.runInContext(read('core.js'),ctx);return ctx;}
module.exports=source;
module.exports.source=source;
module.exports.loadCore=loadCore;
module.exports.read=read;
