const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadCore,source}=require('./source');
const core=loadCore();
const page=source();

test('Exa request and results are shaped for the prompt',()=>{
  const body=core.exaSearchBody('latest news',50);
  assert.equal(body.numResults,10);assert.equal(body.type,'auto');assert.equal(body.contents.text.maxCharacters,1800);
  const results=core.exaResults({results:[{title:'A',url:'https://a.com/x',publishedDate:'2026-10-01T00:00:00Z',text:'one\n two'},{title:'no url'}]});
  assert.equal(results.length,1);assert.deepEqual({...results[0]},{title:'A',url:'https://a.com/x',date:'2026-10-01',text:'one two'});
  const block=core.searchResultsBlock('q',results,Date.UTC(2026,9,15));
  assert.match(block,/searched 2026-10-15 for "q"/);assert.match(block,/\[1\] A — https:\/\/a\.com\/x \(2026-10-01\)\none two/);
  const withSys=core.withSearchResults([{role:'system',content:'S'},{role:'user',content:'U'}],'B');
  assert.equal(withSys[0].content,'S\n\nB');assert.equal(withSys.length,2);
  const noSys=core.withSearchResults([{role:'user',content:'U'}],'B');
  assert.equal(noSys[0].role,'system');assert.equal(noSys.length,2);
});
test('search queries come from the conversation with a safe fallback',()=>{
  const msgs=[{role:'system',content:'x'},{role:'user',content:'[Rin]: What is the weather in Paris?'}];
  assert.equal(core.lastUserText(msgs),'What is the weather in Paris?');
  assert.equal(core.lastUserText([{role:'user',content:[{type:'text',text:'pic question'},{type:'image_url'}]}]),'pic question');
  assert.equal(core.cleanSearchQuery('Query: "paris weather today"\nextra','f'),'paris weather today');
  assert.equal(core.cleanSearchQuery('','fallback'),'fallback');
  const q=core.searchQueryMessages(msgs);
  assert.equal(q.length,2);assert.match(q[1].content,/User: \[Rin\]: What is the weather/);assert.doesNotMatch(q[1].content,/^x/);
});
test('citations link to sources but leave code alone',()=>{
  const sources=[{title:'A "t"',url:'https://a.com/?x=1&y=2'}];
  const html=core.linkCitations('<p>Fact [1] and [2].</p><pre><code>arr[1]</code></pre><code>[1]</code>',sources);
  assert.match(html,/<a class="cite" href="https:\/\/a\.com\/\?x=1&amp;y=2" target="_blank" rel="noopener" title="A &quot;t&quot;">1<\/a> and \[2\]/);
  assert.match(html,/<pre><code>arr\[1\]<\/code><\/pre><code>\[1\]<\/code>/);
  assert.equal(core.linkCitations('[1]',[]),'[1]');
  assert.equal(core.sourceHost('https://www.example.com/a'),'example.com');
});
test('markdown export lists sources',()=>{
  const md=core.chatToMarkdown('T',[{role:'assistant',content:'Hi [1]',sources:[{title:'A',url:'https://a.com'}]}]);
  assert.match(md,/Hi \[1\]\n\nSources:\n1\. A — https:\/\/a\.com\n/);
});

const enc=new TextEncoder();
test('a searching reply sends results in the prompt and saves its sources',async()=>{
  const bodies=[];
  const ctx={AbortController,TextDecoder,setTimeout,clearTimeout,Response,ReadableStream,Error,TypeError,
    store:{k:'test',base:'https://api.deepseek.com',model:'deepseek-flash',saveConv(){}},
    currentId:'chat',messages:[],controller:null,
    renderChat(){},scheduleStreamPaint(){},cancelStreamPaint(){},renderResponders(){},setSending(){},toast(){},$:()=>({click(){}}),
    webSearchWanted:()=>true,runWebSearch:async()=>({query:'paris weather',results:[{title:'Météo',url:'https://m.fr',date:'',text:'Sunny'}]}),
    searchResultsBlock:core.searchResultsBlock,withSearchResults:core.withSearchResults,
    modelSeesImages:()=>true,replyTokenLimit:core.replyTokenLimit,friendlyApiError:core.friendlyApiError,isRetryableStatus:core.isRetryableStatus,
    buildChatRequest:core.buildChatRequest,isLocalBase:core.isLocalBase,
    fetch:async(url,opts)=>{bodies.push(JSON.parse(opts.body));return new Response(new ReadableStream({start(c){c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"Sunny [1]"}}]}\n\n'));c.close();}}),{status:200});}};
  vm.createContext(ctx);
  const code=page.match(/async function streamCompletion\(agent,apiMessages,meta=\{\}\)\{[\s\S]*?(?=\n\/\* ---------- Stream one response from a specific agent)/)[0];
  vm.runInContext(code+'\nthis.streamCompletion=streamCompletion;',ctx);
  const r=await ctx.streamCompletion({temp:1,think:'off'},[{role:'system',content:'Be helpful'},{role:'user',content:'Weather in Paris?'}]);
  assert.match(bodies[0].messages[0].content,/Be helpful\n\nWeb search results[\s\S]*\[1\] Météo — https:\/\/m\.fr\nSunny/);
  assert.equal(r.bot.content,'Sunny [1]');assert.equal(r.bot.searchQuery,'paris weather');
  assert.deepEqual(JSON.parse(JSON.stringify(r.bot.sources)),[{title:'Météo',url:'https://m.fr'}]);assert.equal(r.bot.searching,false);
});
