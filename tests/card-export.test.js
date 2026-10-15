const test=require('node:test');
const assert=require('node:assert/strict');
const zlib=require('node:zlib');
const {loadCore}=require('./source');
const core=loadCore({TextEncoder,TextDecoder,btoa,atob});

// A real 1×1 PNG built here (IHDR, IDAT, IEND) with correct CRCs.
function tinyPng(){
  const chunk=(type,data)=>{const b=Buffer.alloc(12+data.length);b.writeUInt32BE(data.length,0);b.write(type,4,'latin1');data.copy(b,8);b.writeUInt32BE(core.crc32(new Uint8Array(b.subarray(4,8+data.length))),8+data.length);return b;};
  const ihdr=Buffer.from([0,0,0,1,0,0,0,1,8,6,0,0,0]);
  return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(Buffer.from([0,255,0,0,255]))),chunk('IEND',Buffer.alloc(0))]));
}
test('crc32 matches the PNG reference value',()=>{
  assert.equal(core.crc32(new TextEncoder().encode('IEND')),0xAE426082);
});
test('an exported card imports back with name, prompt, greeting and lorebook',()=>{
  const agent={name:'Nadia ✨',prompt:'A bartender with a secret.',emoji:'🍸',temp:1.2,think:'off',lorebook:{name:'Bar',entries:[{name:'Docks',keys:['docks'],content:'The Morettis run the docks.'},{name:'Rain',keys:[],always:true,content:'It always rains.'}]}};
  const card=core.agentToCard(agent,'*She looks up.* Hi.');
  const png=core.pngWithTextChunk(tinyPng(),'chara',core.utf8ToBase64(JSON.stringify(card)));
  const back=core.normalizeCard(core.cardJsonFromPng(png));
  assert.equal(back.name,'Nadia ✨');assert.equal(back.description,'A bartender with a secret.');assert.equal(back.greetings[0],'*She looks up.* Hi.');
  assert.equal(back.book.entries.length,2);assert.equal(back.book.entries[1].constant,true);
  // Exporting again replaces the old chunk instead of adding a second one.
  const twice=core.pngWithTextChunk(png,'chara',core.utf8ToBase64(JSON.stringify(core.agentToCard({...agent,name:'B'},''))));
  assert.equal(core.pngTextChunks(twice).filter(c=>c.keyword==='chara').length,1);
  assert.equal(core.normalizeCard(core.cardJsonFromPng(twice)).name,'B');
  assert.throws(()=>core.pngWithTextChunk(new Uint8Array([1,2,3]),'chara','x'),/not a PNG/);
});
