"use strict";
const $ = s => document.querySelector(s);
// Line icons (24px grid, stroke = currentColor); styled by svg.i in styles.css.
const ICONS={
  copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  regen:'<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v5h-5"/>',
  play:'<path d="M8 5.5l10 6.5-10 6.5z"/>',
  pencil:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  chevL:'<path d="M15 6l-6 6 6 6"/>',chevR:'<path d="M9 6l6 6-6 6"/>',
  up:'<path d="M12 19V5M6 11l6-6 6 6"/>',down:'<path d="M12 5v14M6 13l6 6 6-6"/>',
  send:'<path d="M12 19V5M6 11l6-6 6 6"/>',stop:'<rect x="7" y="7" width="10" height="10" rx="2"/>',
  pin:'<path d="M9 4h6M10 4v6l-3 4h10l-3-4V4M12 14v6"/>',x:'<path d="M6 6l12 12M18 6L6 18"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 20a6 6 0 0 0-2.6-5"/>',
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  discuss:'<path d="M4 5h11v8H9l-4 3v-3H4z"/><path d="M18 9h2v8h-1v3l-4-3h-4v-1"/>',
  book:'<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5z"/>',
  skip:'<path d="M5 5.5l9 6.5-9 6.5z"/><path d="M18 5v14"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  trash:'<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/>',
  heart:'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'
};
function icon(name){return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">'+(ICONS[name]||"")+'</svg>';}
// Theme: "" follows the device; "dark"/"light" force one. Applied before first paint of the chat.
function applyTheme(value){
  const root=document.documentElement;
  if(value)root.dataset.theme=value;else delete root.dataset.theme;
  const light=value==="light"||(!value&&matchMedia("(prefers-color-scheme: light)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content",light?"#f5f6fa":"#0b0f17");
}
try{applyTheme(localStorage.getItem("ds_theme")||"");}catch(e){applyTheme("");}
const store = {
  get k(){return localStorage.getItem("ds_key")||""},        set k(v){localStorage.setItem("ds_key",v)},
  get base(){return localStorage.getItem("ds_base")||"https://api.deepseek.com"}, set base(v){localStorage.setItem("ds_base",v)},
  get model(){return localStorage.getItem("ds_model")||"deepseek-flash"}, set model(v){localStorage.setItem("ds_model",v)},
  get agents(){try{return JSON.parse(localStorage.getItem("ds_agents"))||null}catch(e){return null}}, set agents(v){localStorage.setItem("ds_agents",JSON.stringify(v))},
  get groups(){try{return JSON.parse(localStorage.getItem("ds_groups"))||[]}catch(e){return []}}, set groups(v){localStorage.setItem("ds_groups",JSON.stringify(v))},
  get workflows(){try{return normalizeStoredWorkflows(JSON.parse(localStorage.getItem("ds_workflows")))}catch(e){return []}}, set workflows(v){localStorage.setItem("ds_workflows",JSON.stringify(v))},
  get cur(){return localStorage.getItem("ds_cur")||""}, set cur(v){localStorage.setItem("ds_cur",v)},
  get kind(){return localStorage.getItem("ds_kind")||"agent"}, set kind(v){localStorage.setItem("ds_kind",v)},
  get ctxLimit(){return Number(localStorage.getItem("ds_ctx_limit"))||0}, set ctxLimit(v){localStorage.setItem("ds_ctx_limit",String(v||0))},
  get ctxSummary(){return localStorage.getItem("ds_ctx_summary")==="1"}, set ctxSummary(v){localStorage.setItem("ds_ctx_summary",v?"1":"0")},
  get pins(){try{return JSON.parse(localStorage.getItem("ds_pins"))||[]}catch(e){return []}}, set pins(v){localStorage.setItem("ds_pins",JSON.stringify(v))},
  get sort(){return localStorage.getItem("ds_sort")||"recent"}, set sort(v){localStorage.setItem("ds_sort",v)},
  get activity(){try{return JSON.parse(localStorage.getItem("ds_activity"))||{}}catch(e){return {}}},
  touch(id){try{const a=this.activity;a[id]=Date.now();localStorage.setItem("ds_activity",JSON.stringify(a));}catch(e){/* Sorting hint only. */}},
  // Conversations, runs, and summaries are large: IndexedDB holds them when available (records mirrors it in memory
  // as JSON strings so reads stay synchronous); otherwise they fall back to localStorage.
  records:null,db:null,onWriteError:null,
  channel:typeof BroadcastChannel!=="undefined"?new BroadcastChannel("ds-agents"):null,
  isBigKey(k){return /^ds_(conv|run|sum)_/.test(k);},
  raw(k){return this.records?(this.records.has(k)?this.records.get(k):null):localStorage.getItem(k);},
  setRaw(k,v){
    if(!this.records){localStorage.setItem(k,v);return;}
    this.records.set(k,v);this.persist(tx=>tx.objectStore("kv").put(v,k));this.channel?.postMessage({k,v});
  },
  removeRaw(k){
    if(!this.records){localStorage.removeItem(k);return;}
    this.records.delete(k);this.persist(tx=>tx.objectStore("kv").delete(k));this.channel?.postMessage({k,v:null});
  },
  bigKeys(){
    if(this.records)return [...this.records.keys()];
    const keys=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(this.isBigKey(k))keys.push(k);}return keys;
  },
  persist(write){
    try{const tx=this.db.transaction("kv","readwrite");write(tx);tx.onerror=tx.onabort=()=>this.onWriteError?.(tx.error);}
    catch(error){this.onWriteError?.(error);}
  },
  // Replace every large record atomically (used by backup import).
  replaceBig(entries){
    if(!this.records){for(const k of this.bigKeys())localStorage.removeItem(k);for(const [k,v] of entries)localStorage.setItem(k,v);return Promise.resolve();}
    return new Promise((resolve,reject)=>{
      const tx=this.db.transaction("kv","readwrite"),kv=tx.objectStore("kv");kv.clear();for(const [k,v] of entries)kv.put(v,k);
      tx.oncomplete=()=>{this.records=new Map(entries);this.channel?.postMessage({reload:true});resolve();};tx.onerror=tx.onabort=()=>reject(tx.error||new Error("Storage error"));
    });
  },
  init(){
    if(typeof indexedDB==="undefined")return Promise.resolve(false);
    return new Promise(resolve=>{
      let request;try{request=indexedDB.open("ds-agents",1);}catch(e){resolve(false);return;}
      request.onupgradeneeded=()=>request.result.createObjectStore("kv");
      request.onerror=()=>resolve(false);
      request.onsuccess=()=>{
        const db=request.result,tx=db.transaction("kv","readwrite"),kv=tx.objectStore("kv"),records=new Map();
        const cursor=kv.openCursor();
        cursor.onsuccess=()=>{
          const c=cursor.result;if(c){records.set(String(c.key),c.value);c.continue();return;}
          // One-time move from localStorage; IndexedDB wins if both somehow exist.
          const legacy=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(this.isBigKey(k))legacy.push(k);}
          for(const k of legacy)if(!records.has(k)){const v=localStorage.getItem(k);records.set(k,v);kv.put(v,k);}
          tx.oncomplete=()=>{for(const k of legacy)localStorage.removeItem(k);this.db=db;this.records=records;navigator.storage?.persist?.().catch(()=>{});resolve(true);};
        };
        tx.onerror=tx.onabort=()=>resolve(false);
      };
    });
  },
  run(id){try{return normalizeRunAfterReload(JSON.parse(this.raw("ds_run_"+id)))}catch(e){return null}},
  saveRun(id,v){if(v)this.setRaw("ds_run_"+id,JSON.stringify(v));else this.removeRaw("ds_run_"+id)},
  clearRun(id){this.removeRaw("ds_run_"+id)},
  conv(id){try{return JSON.parse(this.raw("ds_conv_"+id))||[]}catch(e){return []}},
  saveConv(id,m){this.setRaw("ds_conv_"+id,JSON.stringify(m));this.touch(id);try{this.setPreview(id,previewOf(m));}catch(e){/* List preview only. */}},
  clearConv(id){this.removeRaw("ds_conv_"+id);this.removeRaw("ds_sum_"+id);this.setPreview(id,undefined);},
  get previews(){try{return JSON.parse(localStorage.getItem("ds_previews"))||{}}catch(e){return {}}},
  setPreview(id,value){try{const p=this.previews;if(value===undefined)delete p[id];else p[id]=value;localStorage.setItem("ds_previews",JSON.stringify(p));}catch(e){/* List preview only. */}},
  summary(id){try{return JSON.parse(this.raw("ds_sum_"+id))}catch(e){return null}},
  saveSummary(id,v){this.setRaw("ds_sum_"+id,JSON.stringify(v));},
};

const uid = () => Math.random().toString(36).slice(2,9);

const THERAPIST_AGENT = {id:"builtin-sexual-health-therapist",emoji:"💬",name:"Sexual-health Therapist",prompt:"You play Elise, a fictional 25-year-old married woman who discusses sexual health and relationship concerns with warmth and without judgment. The age and marriage describe your character, not the user. You are an AI character, not a licensed clinician; do not claim real professional credentials or legally protected confidentiality. Offer general information rather than diagnoses, and recommend qualified care when appropriate.",model:"deepseek-flash",temp:1.0,think:"off"};
const DEFAULT_AGENTS = [
  {id:uid(),emoji:"💬",name:"General Assistant",prompt:"You are a helpful, friendly assistant. Answer clearly and concisely.",model:"deepseek-flash",temp:1.0,think:"off"},
  {id:uid(),emoji:"👨‍💻",name:"Coder",prompt:"You are a senior software engineer. Give correct, runnable code with brief explanations. Prefer modern idioms.",model:"deepseek-flash",temp:0.0,think:"high"},
  {id:uid(),emoji:"🧠",name:"Deep Reasoner",prompt:"Think step by step and reason carefully before answering hard problems in math, logic, and analysis.",model:"deepseek-flash",temp:0.6,think:"high"},
  {id:uid(),emoji:"✍️",name:"Writer",prompt:"You are a skilled writer and editor. Improve clarity, tone, and flow. Offer options when useful.",model:"deepseek-flash",temp:1.3,think:"off"},
  {id:uid(),emoji:"🌍",name:"Translator",prompt:"You are an expert translator. Detect the language and translate accurately, preserving tone. If asked, explain nuances.",model:"deepseek-flash",temp:0.3,think:"off"},
  {...THERAPIST_AGENT},
];
let agents = store.agents; if(!agents){agents=DEFAULT_AGENTS;store.agents=agents;}
// Install once for existing browsers without replacing their agents or restoring deliberate deletions.
if(!localStorage.getItem("ds_therapist_v1")){
  if(!agents.some(a=>a.id===THERAPIST_AGENT.id)){agents=[...agents,{...THERAPIST_AGENT}];store.agents=agents;}
  localStorage.setItem("ds_therapist_v1","1");
}
// Remove the stray shorthand line from the built-in therapist prompt, only if the user never edited it.
if(!localStorage.getItem("ds_therapist_prompt_v2")){
  const legacy="sexual problems therapist with 25-year-old girl and married.\n\n"+THERAPIST_AGENT.prompt;
  if(agents.some(a=>a.id===THERAPIST_AGENT.id&&a.prompt===legacy)){
    agents=agents.map(a=>a.id===THERAPIST_AGENT.id&&a.prompt===legacy?{...a,prompt:THERAPIST_AGENT.prompt}:a);store.agents=agents;
  }
  localStorage.setItem("ds_therapist_prompt_v2","1");
}
// One-time conversational default update; later manual thinking changes remain respected.
if(!localStorage.getItem("ds_therapist_brief_v1")){
  const updated=agents.map(a=>a.id===THERAPIST_AGENT.id?{...a,think:"off"}:a);
  store.agents=updated;agents=updated;
  localStorage.setItem("ds_therapist_brief_v1","1");
}
let groups = normalizeStoredGroups(store.groups,agents);
let workflows = store.workflows;
workflows.forEach(w=>separateWorkflowAgents(w,agents));
try{store.workflows=workflows;}catch(e){/* Keep migrated settings in memory if storage is full. */}
// User-requested one-time model switch, including independent workflow copies.
// DeepSeek's effort levels are low, high and max; "medium" was always sent as high, so store it as high.
try{const migrated=migrateEffortLevels(localStorage,agents,workflows);agents=migrated.agents;workflows=migrated.workflows;}catch(e){/* Retried on next load; medium still behaves as high. */}
try{const migrated=migrateAllAgentsToFlash(localStorage,agents,workflows);agents=migrated.agents;workflows=migrated.workflows;}catch(e){console.warn("Model update could not be saved; free browser storage and reload.");}
let currentKind = store.kind;               // "agent" | "group" | "workflow"
let currentId = store.cur || agents[0].id;
if(currentKind==="group"){ if(!groups.find(g=>g.id===currentId)){currentKind="agent";currentId=agents[0].id;} }
else if(currentKind==="workflow"){if(!workflows.find(w=>w.id===currentId)){currentKind="agent";currentId=agents[0].id;}}
else if(!agents.find(a=>a.id===currentId)) currentId = agents[0].id;
let messages = [];
let editingId = null;
let editingGroupId = null;
let groupRoleplayDraft = null;
let editingWorkflowId = null;
let workflowDraft = null;
let workflowDraftDirty = false;
let currentRun = null;
let controller = null; // AbortController for streaming

/* ---------- UI helpers ---------- */
function toast(t,action){
  const el=$("#toast");el.textContent=t;el.classList.toggle("actionable",!!action);
  if(action){const b=document.createElement("button");b.type="button";b.textContent=action.label;b.onclick=()=>{el.classList.remove("on","actionable");clearTimeout(el._t);action.run();};el.append(" ",b);}
  el.classList.add("on");clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove("on","actionable"),action?6000:2200);
}
function openSheet(id){$("#scrim").classList.add("on");$(id).classList.add("on");}
function closeAll(){$("#scrim").classList.remove("on");document.querySelectorAll(".sheet.on").forEach(s=>s.classList.remove("on"));}
$("#scrim").onclick=closeAll;
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=closeAll);

function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
// Protect code and link attributes before formatting narration and emphasis.
function md(t){
  const tokens=[];
  const keep=html=>"\u0000"+(tokens.push(html)-1)+"\u0000";
  t=esc(t.replace(/\u0000/g,""));
  t=t.replace(/```([\s\S]*?)```/g,(m,c)=>keep("<pre><code>"+c.replace(/^[\w#+.-]*\n/,"")+"</code></pre>"));
  t=t.replace(/`([^`\n]+)`/g,(m,c)=>keep("<code>"+c+"</code>"));
  t=t.replace(/\\\*/g,()=>keep("*"));
  // Pipe tables (header row + |---| separator) become one-line HTML so pre-wrap adds no stray gaps.
  t=t.replace(/^(\|.*\|)[ \t]*\n\|[ \t:|-]*-[ \t:|-]*\|[ \t]*((?:\n\|.*\|[ \t]*)*)\n?/gm,(m,head,body)=>{
    const cells=row=>row.trim().replace(/^\||\|$/g,"").split("|").map(c=>c.trim());
    const rows=body.split("\n").filter(r=>r.trim());
    return '<div class="md-table"><table><thead><tr>'+cells(head).map(c=>"<th>"+c+"</th>").join("")+'</tr></thead><tbody>'+
      rows.map(r=>"<tr>"+cells(r).map(c=>"<td>"+c+"</td>").join("")+"</tr>").join("")+'</tbody></table></div>';
  });
  // Block markers become plain glyphs/spans; line breaks stay visible through pre-wrap.
  t=t.replace(/^#{1,6} +(.+)$/gm,'<b class="md-h">$1</b>');
  t=t.replace(/^( *)[-*] +(?=\S)/gm,"$1• ");
  t=t.replace(/^&gt; ?(.*)$/gm,'<span class="md-quote">$1</span>');
  t=t.replace(/\[([^\]]+)\]\((https?:[^\s)]+)\)/g,(m,label,url)=>keep('<a href="'+url.replace(/"/g,"&quot;")+'" target="_blank" rel="noopener" style="color:var(--accent)">'+label+'</a>'));
  t=t.replace(/\*\*([^*]+)\*\*/g,"<b>$1</b>");
  t=t.replace(/\*([^*\n]+)\*/g,"<em>$1</em>");
  return t.replace(/\u0000(\d+)\u0000/g,(m,i)=>tokens[Number(i)]);
}

/* ---------- Header / agent / group ---------- */
function curAgent(){return agents.find(a=>a.id===currentId)||agents[0];}
function curGroup(){return groups.find(g=>g.id===currentId);}
function isGroup(){return currentKind==="group" && !!curGroup();}
function groupMembers(g){return (g.members||[]).map(id=>agents.find(a=>a.id===id)).filter(Boolean);}
function curWorkflow(){return workflows.find(w=>w.id===currentId);}
function isWorkflow(){return currentKind==="workflow" && !!curWorkflow();}
function conversationTokens(list){return (list||[]).reduce((n,m)=>n+(m.usage?(m.usage.prompt||0)+(m.usage.completion||0):0),0);}
function refreshHeader(){
  const used=conversationTokens(messages),usedText=used?" · "+formatTokens(used)+" tokens":"";
  const item=isWorkflow()?curWorkflow():isGroup()?curGroup():curAgent();
  document.body.dataset.mood=isWorkflow()?"workflow":isGroup()?(isRoleplayGroup(curGroup())?"fiction":"social"):"work";
  $("#moodBtn").hidden=!(!isWorkflow()&&!isGroup()&&curAgent()?.moods);
  $("#hAvatar").innerHTML=avatarInner(item,"💬");
  if(isWorkflow()){
    const w=curWorkflow();
    $("#hAgent").textContent=w.name;
    if(currentRun&&["running","synthesizing"].includes(currentRun.status)){
      const role=w.roles[currentRun.nextRoleIndex];
      $("#hSub").textContent=(role?role.name:"Finishing")+" · "+Math.min(currentRun.nextRoleIndex+1,w.roles.length)+" of "+w.roles.length;
    }else{
      $("#hSub").textContent=w.roles.length+" roles · "+(w.template||"custom")+" workflow"+usedText;
    }
    $("#input").placeholder="Give this workflow a task…";
  }else if(isGroup()){
    const g=curGroup(),n=groupMembers(g).length,roleplay=isRoleplayGroup(g);
    $("#hAgent").textContent=g.name;
    $("#hSub").textContent=roleplay?"Roleplay · "+(g.roleplay.user.name||"you"):n+" agent"+(n===1?"":"s")+usedText;
    $("#input").placeholder=roleplay?"Continue the scene, or @name…":"Message the group, or @name…";
  }else{
    const a=curAgent();
    $("#hAgent").textContent=a.name;
    $("#hSub").textContent=(a.model||store.model)+" · temp "+a.temp+usedText;
    $("#input").placeholder="Message your agent…";
  }
}
function memberLabel(group,agent){return isRoleplayGroup(group)?roleplayCharacter(group,agent).name:agent.name;}
function renderResponders(){
  const bar=$("#responders");
  if(!isGroup()){bar.style.display="none";bar.innerHTML="";return;}
  const group=curGroup(),mems=groupMembers(group);
  bar.innerHTML="";bar.style.display="flex";
  const busy=!!controller;
  const chip=(html,cls,onclick,title)=>{const b=document.createElement("button");b.className="chip-btn"+(cls?" "+cls:"");b.innerHTML=html;b.disabled=busy;b.onclick=onclick;if(title)b.title=title;bar.appendChild(b);return b;};
  if(sequence){
    // While several agents reply in turn, show progress and allow skipping just the current speaker.
    sequence.list.forEach((a,i)=>{
      if(i<sequence.index)return;
      const b=chip('<span class="av">'+avatarInner(a)+'</span><span>'+esc(memberLabel(group,a))+'</span>'+(i===sequence.index?'<small>replying</small>':i===sequence.index+1?'<small>next</small>':''),i===sequence.index?"speaking":i===sequence.index+1?"next":"",null);
      b.disabled=true;
    });
    const skip=chip(icon("skip")+'<span>Skip</span>',"all",skipCurrentSpeaker,"Stop only the current speaker and continue");
    skip.disabled=!controller||sequence.picking;
    updateChipFade();return;
  }
  const roleplay=isRoleplayGroup(group),rounds=groupRounds(group);
  const continueChip=()=>chip(roleplay?icon("book")+'<span>Continue scene</span>':icon("users")+'<span>Everyone</span>',"all",()=>everyoneRespond());
  // In a scene the main action leads; in an ordinary group the members do.
  if(roleplay&&mems.length>1)continueChip();
  mems.forEach(a=>chip('<span class="av">'+avatarInner(a)+'</span><span>'+esc(memberLabel(group,a))+'</span>',"",()=>groupRespond(a)));
  // Roleplay groups keep deleted characters' sheets; surface them instead of silently hiding them.
  for(const id of group.members||[]){
    if(agents.some(a=>a.id===id))continue;
    const b=chip('<span class="av">⚠️</span><span>'+esc(group.roleplay?.characters?.[id]?.name||"Missing character")+' (deleted)</span>',"deleted",null,"This character's agent was deleted. Edit the group to remove or replace it.");
    b.disabled=true;
  }
  if(mems.length>1){
    if(!roleplay)continueChip();
    chip(icon("target")+'<span>Auto</span>',"all",()=>autoRespond(),"Let a quick model call pick who should reply next (1 small extra request)");
    chip(icon("discuss")+'<span>Discuss ×'+rounds+'</span>',"all",()=>discussRespond(),"Agents reply to each other for "+rounds+" round"+(rounds===1?"":"s"));
  }
  if(roleplay&&group.moods!==false&&mems.length)chip(icon("heart")+'<span>Moods</span>',"all",openMoodSheet,"See and set each character's mood");
  bar.scrollLeft=0;updateChipFade();
}
// Fade the right edge only while more chips are hidden off-screen.
function updateChipFade(){const bar=$("#responders");bar.classList.toggle("more",bar.scrollWidth-bar.clientWidth-bar.scrollLeft>4);}
$("#responders").addEventListener("scroll",updateChipFade,{passive:true});
addEventListener("resize",updateChipFade);

/* ---------- Chat rendering ---------- */
/* message-edit-core:start */
function editedMessage(message,text){
  if(!text.trim()&&!message.images?.length)throw new Error("A message needs text or an image.");
  return {...message,content:text,reasoning:"",error:false,edited:true,usage:null,truncated:false,interrupted:null,finish:null};
}
function variantText(message){return {content:message.content||"",reasoning:message.reasoning||"",error:!!message.error,edited:!!message.edited,usage:message.usage||null,truncated:!!message.truncated,interrupted:message.interrupted||null,finish:message.finish||null};}
function captureMessageVersions(list,index){
  const message=list[index];
  if(!message)throw new Error("Message not found.");
  const versions=message.versions?.length?message.versions.map(v=>({...v})):[variantText(message)];
  const selected=Number.isInteger(message.versionIndex)&&message.versionIndex>=0&&message.versionIndex<versions.length?message.versionIndex:0;
  versions[selected]={...variantText(message),tail:list.slice(index+1)};
  return {versions,selected};
}
function editMessageVersion(list,index,text){
  const changed=editedMessage(list[index],text),{versions}=captureMessageVersions(list,index);
  versions.push({...variantText(changed),tail:[]});
  return [...list.slice(0,index),{...changed,versions,versionIndex:versions.length-1},...list.slice(index+1)];
}
function switchMessageVersion(list,index,target){
  const {versions}=captureMessageVersions(list,index);
  if(!Number.isInteger(target)||target<0||target>=versions.length)throw new Error("Version not found.");
  const chosen=versions[target],tail=chosen.tail||[];
  versions[target]={...chosen,tail:[]};
  return [...list.slice(0,index),{...list[index],...variantText(chosen),streaming:false,versions,versionIndex:target},...tail];
}
function prepareRegeneration(list,index){
  const {versions}=captureMessageVersions(list,index);
  versions.push({content:"",reasoning:"",error:false,edited:false,tail:[]});
  return {prefix:list.slice(0,index),versions,versionIndex:versions.length-1};
}
/* message-edit-core:end */
let messageEditTarget=null;
function openMessageEditor(message){
  if(controller||message.streaming){toast("Stop the response before editing.");return;}
  if(isWorkflow()){toast("Workflow messages are managed by their run. Use Retry this role instead.");return;}
  messageEditTarget={conversationId:currentId,message};
  $("#messageEditText").value=message.content||"";
  closeAll();openSheet("#messageEditor");$("#messageEditText").focus();
}
$("#saveMessageEdit").onclick=()=>{
  if(controller){toast("Stop the response before editing.");return;}
  const target=messageEditTarget;
  if(!target||target.conversationId!==currentId)return;
  const index=messages.indexOf(target.message);if(index<0)return;
  let next;try{next=editMessageVersion(messages,index,$("#messageEditText").value);}
  catch(error){toast(error.message);return;}
  try{store.saveConv(currentId,next);}catch(error){toast("Browser storage is full. Your edit has not been applied.");return;}
  messages=next;messageEditTarget=null;closeAll();renderChat();toast("Message updated");
};
function selectMessageVersion(message,target){
  if(controller||isWorkflow()){toast("Stop the response before changing versions.");return;}
  const index=messages.indexOf(message);if(index<0)return;
  let next;try{next=switchMessageVersion(messages,index,target);store.saveConv(currentId,next);}
  catch(error){toast("Could not switch versions. Browser storage may be full.");return;}
  messages=next;renderChat();renderResponders();
}
async function regenerateMessage(message){
  if(controller||isWorkflow()||message.role!=="assistant")return;
  const index=messages.indexOf(message);if(index<0)return;
  const agent=isGroup()?agents.find(a=>a.id===message.agentId):curAgent();
  if(!agent){toast("The original agent is no longer available.");return;}
  if(!store.k){toast("Add your API key in Settings");$("#setBtn").click();return;}
  const previous=messages,branch=prepareRegeneration(messages,index);
  const meta={versions:branch.versions,versionIndex:branch.versionIndex};
  for(const key of ["agentId","agentName","agentEmoji","characterName"])if(message[key])meta[key]=message[key];
  messages=branch.prefix;
  const mood=moodOptions(agent);Object.assign(meta,moodMeta(mood));
  try{
    const context=await prepareContext(buildApiMessages(agent,{mood}));
    if(!context){messages=previous;renderChat();return;}
    const result=await streamCompletion(agent,context,meta);
    if(result===false){messages=previous;renderChat();}
  }catch(error){messages=previous;renderChat();toast("Could not regenerate. The previous conversation is still available.");}
}
// Deletes one message (with all its versions) right away; Undo restores it unless the chat changed since.
function deleteMessage(message){
  if(controller||isWorkflow()||message.streaming){toast("Stop the response before deleting.");return;}
  const index=messages.indexOf(message);if(index<0)return;
  const id=currentId,kind=currentKind,before=messages,next=[...messages.slice(0,index),...messages.slice(index+1)];
  try{store.saveConv(id,next);}catch(error){toast("Could not delete: browser storage is full.");return;}
  messages=next;renderChat();renderResponders();refreshHeader();
  toast("Message deleted",{label:"Undo",run(){
    if(currentId!==id||currentKind!==kind||controller||messages!==next)return;
    try{store.saveConv(id,before);}catch(error){toast("Could not restore: browser storage is full.");return;}
    messages=before;renderChat();renderResponders();refreshHeader();
  }});
}
async function copyMessageText(text){
  if(!text)return false;
  try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return true;}}catch(e){}
  const focused=document.activeElement,selection=document.getSelection();
  const ranges=selection?Array.from({length:selection.rangeCount},(_,i)=>selection.getRangeAt(i).cloneRange()):[];
  const field=document.createElement("textarea");field.value=text;field.readOnly=true;
  field.style.cssText="position:fixed;left:-9999px;top:0;opacity:0";
  document.body.appendChild(field);
  try{field.select();return !!document.execCommand("copy");}
  catch(e){return false;}
  finally{field.remove();focused?.focus({preventScroll:true});if(selection){selection.removeAllRanges();ranges.forEach(r=>selection.addRange(r));}}
}
function messageCopyButton(message){
  const button=document.createElement("button");button.type="button";button.className="copy-msg";button.innerHTML=icon("copy");
  button.disabled=!message.content;
  button.title=message.content?"Copy message":"No message text to copy";
  button.setAttribute("aria-label",button.title);
  button.onclick=async()=>{
    const copied=await copyMessageText(message.role==="assistant"?cleanCharacterReply(message.content):message.content||"");
    toast(copied?"Message copied":"Could not copy. Select the text and copy manually.");
    if(copied){button.innerHTML=icon("check");button.setAttribute("aria-label","Message copied");setTimeout(()=>{button.innerHTML=icon("copy");button.setAttribute("aria-label",button.title);},1800);}
  };
  return button;
}
const expandedReasoning=new WeakSet();
const CHAT_BATCH=40;
let chatDividers=new Map(),chatRows=new WeakMap(),chatViewId=null,chatVisibleStart=0,chatFollowing=true,streamPaintTimer=null,streamPaintTarget=null;
function isChatNearBottom(c){return c.scrollHeight-c.clientHeight-c.scrollTop<100;}
function updateLatestButton(){$("#jumpToLatest").hidden=chatFollowing;}
$("#chat").addEventListener("scroll",()=>{chatFollowing=isChatNearBottom($("#chat"));updateLatestButton();},{passive:true});
$("#chat").addEventListener("click",async e=>{
  const button=e.target.closest(".code-copy");if(!button)return;
  const code=button.parentElement.querySelector("code")?.textContent||"";
  const ok=await copyMessageText(code);button.innerHTML=icon(ok?"check":"x")+(ok?"Copied":"Failed");setTimeout(()=>{button.innerHTML=icon("copy")+"Copy";},1500);
});
$("#chat").addEventListener("click",e=>{
  if(e.target.closest("button,a,summary,details,img,input,textarea,select,.code-copy"))return;
  if(String(getSelection?.()||""))return;
  const row=e.target.closest(".msg");if(!row||!row.closest("#chat"))return;
  const show=!row._showActions;
  for(const other of $("#chat").querySelectorAll(".msg.show-actions"))if(other!==row){other._showActions=false;other.classList.remove("show-actions");}
  row._showActions=show;row.classList.toggle("show-actions",show);
});
$("#jumpToLatest").onclick=()=>{chatFollowing=true;$("#chat").scrollTop=$("#chat").scrollHeight;updateLatestButton();};
function loadEarlierMessages(){
  if(chatVisibleStart===0)return;
  const c=$("#chat"),anchor=c.querySelector(".msg"),top=anchor?.getBoundingClientRect().top;
  chatVisibleStart=Math.max(0,chatVisibleStart-CHAT_BATCH);chatFollowing=false;
  renderChat();
  if(anchor&&top!==undefined)c.scrollTop+=anchor.getBoundingClientRect().top-top;
  updateLatestButton();
}
function createReasoning(m,d){
  const details=document.createElement("details");details.className="reasoning";details.open=expandedReasoning.has(m);
  const summary=document.createElement("summary"),text=document.createElement("div");text.className="think";
  details.append(summary,text);details.addEventListener("toggle",()=>{
    if(!details.isConnected)return;
    if(details.open){expandedReasoning.add(m);text.textContent=m.reasoning||"";}else expandedReasoning.delete(m);
  });
  d.insertBefore(details,d._body);d._reasoning={details,summary,text};
}
function updateChatRow(m,d){
  if(m.reasoning&&!d._reasoning)createReasoning(m,d);
  if(d._reasoning){
    const {details,summary,text}=d._reasoning;
    summary.textContent=m.streaming&&!m.content?"Thinking…":"Reasoning";
    // Long hidden reasoning is not parsed or inserted into the page on every token.
    if(details.open&&text.textContent!==m.reasoning)text.textContent=m.reasoning||"";
  }
  if(d._contentValue!==m.content||d._streaming!==!!m.streaming){
    const shown=m.role==="assistant"?cleanCharacterReply(m.moodTracked&&m.streaming?stripPartialMoodTag(m.content):m.content):m.content||"";
    d._text.innerHTML=md(shown)+(m.streaming?'<span class="cursor"></span>':"");
    d._contentValue=m.content;d._streaming=!!m.streaming;
    if(!m.streaming)for(const pre of d._text.querySelectorAll("pre")){const b=document.createElement("button");b.type="button";b.className="code-copy";b.innerHTML=icon("copy")+"Copy";b.setAttribute("aria-label","Copy code");pre.prepend(b);}
  }
  d.className="msg "+(m.role==="user"?"user":m.error?"err":"bot");
  if(m.workflowStage==="synthesis"&&!m.streaming&&!m.error)d.classList.add("final");
  if(d._showActions)d.classList.add("show-actions");
  const note=m.interrupted?"⚠ connection lost — reply incomplete":m.finish?"⚠ "+(FINISH_NOTES[m.finish]||m.finish):m.truncated?"⚠ "+FINISH_NOTES.length:"";
  // Time only: the day divider above already shows the date.
  const time=messageTime(m.at,m.at);
  const meta=(time?'<span>'+time+'</span>':"")+(note?'<span class="w">'+esc(note)+'</span>':"")+
    (m.usage?'<span class="tok">'+formatTokens(m.usage.prompt)+" in · "+formatTokens(m.usage.completion)+' out</span>':"");
  if(d._continue)d._continue.hidden=!(m.truncated&&!m.streaming&&messages.at(-1)===m);
  if(d._metaHtml!==meta){d._meta.innerHTML=meta;d._metaHtml=meta;}
  if(m.mood){
    const key=m.mood.mood+":"+m.mood.level;
    if(d._moodKey!==key){d._mood.className="mood mood-"+m.mood.mood;d._mood.style.setProperty("--lvl",(m.mood.level*10)+"%");d._mood.innerHTML="<i></i>"+esc(moodLabel(m.mood));d._mood.setAttribute("aria-label","Mood: "+moodLabel(m.mood)+" of 10. Open moods");d._moodKey=key;}
    d._mood.hidden=false;
  }else d._mood.hidden=true;
  d._metaRow.hidden=!meta&&!m.edited&&!m.mood;
  d._copy.disabled=!m.content;d._copy.title=m.content?"Copy message":"No message text to copy";
  d._copy.setAttribute("aria-label",d._copy.title);
  for(const button of d.querySelectorAll("[data-chat-action]"))button.disabled=!!controller||!!m.streaming||button.dataset.limitDisabled==="true";
}
function formatTokens(n){return n>=1000?(n/1000).toFixed(n>=10000?0:1)+"k":String(n);}
function scheduleStreamPaint(message){
  streamPaintTarget=message;
  if(streamPaintTimer!==null)return;
  streamPaintTimer=setTimeout(()=>{
    streamPaintTimer=null;
    const target=streamPaintTarget;streamPaintTarget=null;
    const row=chatRows.get(target);if(!row?.isConnected)return;
    updateChatRow(target,row);
    if(chatFollowing)$("#chat").scrollTop=$("#chat").scrollHeight;
    updateLatestButton();
  },50);
}
function cancelStreamPaint(){if(streamPaintTimer!==null)clearTimeout(streamPaintTimer);streamPaintTimer=null;streamPaintTarget=null;}
function renderChat(){
  const c=$("#chat"),viewId=currentKind+":"+currentId;
  if(chatViewId!==viewId){
    cancelStreamPaint();chatViewId=viewId;chatRows=new WeakMap();chatDividers=new Map();chatVisibleStart=Math.max(0,messages.length-CHAT_BATCH);chatFollowing=true;c.replaceChildren();
  }
  if(chatVisibleStart>=messages.length)chatVisibleStart=Math.max(0,messages.length-CHAT_BATCH);
  if(!messages.length){
    const title=!store.k?"Add your API key to start":isWorkflow()?curWorkflow().name:isGroup()?curGroup().name:curAgent().name;
    const roleplay=isGroup()&&isRoleplayGroup(curGroup())?curGroup().roleplay:null;
    const sub = !store.k ? "Add your DeepSeek API key in Settings to begin. It stays in this browser and is only sent to DeepSeek."
      : isWorkflow() ? "Describe a task to run its work, critique, and synthesis roles."
      : roleplay ? ((roleplay.opening?esc(roleplay.opening)+"<br><br>":"")+"<b>You play as "+esc(roleplay.user.name||"your character")+".</b>")
      : isGroup() ? "Send a message, then tap an agent below to have it reply."
      : "Say hi to start the conversation.";
    c.innerHTML='<div class="empty"><h2>'+esc(title)+'</h2><div>'+sub+'</div></div>';
    chatVisibleStart=0;chatFollowing=true;updateLatestButton();
    return;
  }
  const nodes=[];
  const opening=isGroup()&&isRoleplayGroup(curGroup())?curGroup().roleplay.opening:"";
  if(opening&&chatVisibleStart===0){
    const card=c.querySelector(".scene-card")||document.createElement("div");card.className="scene-card";
    if(card._text!==opening){card.innerHTML='<div class="who">'+icon("book")+'Opening scene</div>'+md(opening);card._text=opening;}
    nodes.push(card);
  }
  if(chatVisibleStart>0){
    const older=c.querySelector(".older-messages")||document.createElement("button");older.className="older-messages";older.innerHTML=icon("up")+"Load earlier messages ("+chatVisibleStart+")";older.onclick=loadEarlierMessages;nodes.push(older);
  }
  // A divider goes before the first visible message of each calendar day (messages without a time are skipped).
  let lastDay=null;const now=Date.now();
  for(const m of messages.slice(chatVisibleStart)){
    if(m.role==="system")continue;
    if(m.at){
      const key=dayKey(m.at);
      if(key!==lastDay){
        let divider=chatDividers.get(key);
        if(!divider){divider=document.createElement("div");divider.className="day-divider";divider.setAttribute("role","separator");chatDividers.set(key,divider);}
        const label=dayLabel(m.at,now);if(divider.textContent!==label)divider.textContent=label;
        nodes.push(divider);lastDay=key;
      }
    }
    let d=chatRows.get(m);
    const retryKey=isWorkflow()?[currentRun?.id,currentRun?.status].join(":"):"";
    if(!d||d._retryKey!==retryKey){d=createChatRow(m);d._retryKey=retryKey;chatRows.set(m,d);}
    updateChatRow(m,d);nodes.push(d);
  }
  // Reuse existing rows; appending a token never recreates old messages or images.
  let cursor=c.firstChild;
  for(const node of nodes){if(cursor===node)cursor=cursor.nextSibling;else c.insertBefore(node,cursor);}
  while(cursor){const next=cursor.nextSibling;c.removeChild(cursor);cursor=next;}
  if(chatFollowing)c.scrollTop=c.scrollHeight;
  updateLatestButton();
}
// Speaker line above AI replies: avatar tile, name in the mood colour, optional secondary name.
function whoLabel(m){
  if(m.role==="user")return null;
  let name,sub="",cls="who";
  if(m.workflowRoleName){name=m.workflowRoleName;sub=m.agentName||"";cls+=" role";}
  else if(m.characterName){name=m.characterName;sub=m.agentName&&m.agentName!==m.characterName?m.agentName:"";}
  else if(m.agentName)name=m.agentName;
  else return null;
  const el=document.createElement("div");el.className=cls;
  el.innerHTML='<span class="av">'+avatarInner(agentById(m.agentId)||{emoji:m.agentEmoji})+'</span><span class="who-name">'+esc(name)+'</span>'+(sub?'<span class="who-sub">'+esc(sub)+'</span>':"");
  return el;
}
function actionButton(name,title,onclick,extraClass){
  const b=document.createElement("button");b.type="button";b.className="copy-msg"+(extraClass?" "+extraClass:"");
  b.innerHTML=icon(name);b.title=title;b.setAttribute("aria-label",title);b.onclick=onclick;return b;
}
function createChatRow(m){
    const d=document.createElement("div");
    d.className="msg "+(m.role==="user"?"user":m.error?"err":"bot");
    if(m.workflowStage==="synthesis"&&!m.streaming&&!m.error)d.classList.add("final");
    const who=whoLabel(m);if(who)d.appendChild(who);
    d._body=document.createElement("div");d._body.className="msg-body";
    d._text=document.createElement("div");d._text.className="message-text";d._body.appendChild(d._text);
    for(const image of m.images||[]){
      if(!/^data:image\/(jpeg|png|webp|gif);base64,/.test(image.url||""))continue;
      const img=document.createElement("img");img.className="chat-image";img.loading="lazy";img.decoding="async";img.src=image.url;img.alt=image.name||"Attached image";d._body.appendChild(img);
    }
    d.appendChild(d._body);
    if(m.role!=="user"&&m.workflowRoleId&&currentRun&&["review","stopped"].includes(currentRun.status)&&m.runId===currentRun.id&&!m.streaming){
      const retry=document.createElement("button");retry.type="button";retry.className="retry-role";retry.innerHTML=icon("regen")+"Retry this role";
      retry.onclick=()=>retryRoleFromUi(m.workflowRoleId);d.appendChild(retry);
    }
    d._metaRow=document.createElement("div");d._metaRow.className="msg-meta";
    if(m.edited){const label=document.createElement("span");label.className="edited-label";label.textContent="edited";d._metaRow.appendChild(label);}
    d._mood=document.createElement("button");d._mood.type="button";d._mood.hidden=true;d._mood.onclick=openMoodSheet;d._metaRow.appendChild(d._mood);
    d._meta=document.createElement("span");d._meta.className="reply-meta";d._metaRow.appendChild(d._meta);d.appendChild(d._metaRow);
    const actions=document.createElement("div");actions.className="msg-actions";
    if(!isWorkflow()){
      if(m.versions?.length>1){
        const selected=m.versionIndex||0;
        const previous=actionButton("chevL","Previous message version",()=>selectMessageVersion(m,selected-1));previous.disabled=!!controller||!!m.streaming||selected===0;
        const count=document.createElement("span");count.className="version-count";count.textContent=(selected+1)+" / "+m.versions.length;
        const next=actionButton("chevR","Next message version",()=>selectMessageVersion(m,selected+1));next.disabled=!!controller||!!m.streaming||selected===m.versions.length-1;
        actions.append(previous,count,next);
      }
      if(m.role==="assistant"){
        const more=document.createElement("button");more.type="button";more.className="copy-msg continue-msg";more.innerHTML=icon("play")+"Continue";more.title="Continue this cut-off reply (uses API)";more.setAttribute("aria-label",more.title);more.hidden=true;more.onclick=()=>continueMessage(m);actions.appendChild(more);d._continue=more;
        const regenerate=actionButton("regen","Regenerate reply (uses API)",()=>regenerateMessage(m));regenerate.disabled=!!controller||!!m.streaming;actions.appendChild(regenerate);
      }
      const edit=actionButton("pencil","Edit message",()=>openMessageEditor(m));edit.disabled=!!controller||!!m.streaming;actions.appendChild(edit);
      const remove=actionButton("trash","Delete message",()=>deleteMessage(m));remove.disabled=!!controller||!!m.streaming;actions.appendChild(remove);
    }
    for(const button of actions.querySelectorAll("button")){button.dataset.chatAction="true";button.dataset.limitDisabled=String(button.title==="Previous message version"&&(m.versionIndex||0)===0||button.title==="Next message version"&&(m.versionIndex||0)===m.versions.length-1);}
    d._copy=messageCopyButton(m);actions.appendChild(d._copy);d.appendChild(actions);
    return d;
}
function renderWorkflowUi(){
  $("#duplicateChatBtn").disabled=!!controller||(isWorkflow()&&!!currentRun&&currentRun.status!=="complete");
  const progress=$("#workflowProgress"),actions=$("#workflowActions"),composer=document.querySelector(".composer");
  if(!isWorkflow()){
    progress.style.display=actions.style.display="none";composer.style.display="flex";input.disabled=false;$("#menuBtn").disabled=false;$("#clearBtn").disabled=!!controller;return;
  }
  const run=currentRun,w=curWorkflow();
  progress.style.display="none";actions.style.display="none";composer.style.display="flex";
  input.disabled=false;$("#menuBtn").disabled=!!controller;$("#clearBtn").disabled=!!controller;
  if(!run||run.status==="complete")return;
  const role=w.roles[run.nextRoleIndex],step=Math.min(run.nextRoleIndex+1,w.roles.length);
  progress.textContent=run.status==="review"?"Review checkpoint":(role?role.name:"Workflow")+" · "+step+" of "+w.roles.length;
  progress.style.display="block";
  if(["running","synthesizing"].includes(run.status)){
    input.disabled=true;return;
  }
  composer.style.display="none";actions.style.display="block";
  const review=run.status==="review";
  $("#workflowActionText").textContent=review?"Review the agents' work before final synthesis":"Workflow stopped at "+(role?role.name:"the next role");
  $("#workflowCostNote").textContent=review?"Final synthesis uses 1 more API response.":"Resume retries the current role.";
  $("#reviewGuidance").style.display=review?"block":"none";
  $("#approveSynthesis").style.display=review?"block":"none";
  $("#resumeWorkflow").style.display=review?"none":"block";
  $("#cancelWorkflow").style.display="block";
}
function loadConv(){
  pendingImages=[];renderAttachments();
  messages=store.conv(currentId);currentRun=isWorkflow()?store.run(currentId):null;
  try{input.value=localStorage.getItem(draftKey())||"";}catch(e){input.value="";}autoGrow();
  if(currentRun)store.saveRun(currentId,currentRun);
  renderChat();refreshHeader();renderResponders();renderWorkflowUi();
}

/* ---------- Duplicate a conversation ---------- */
function duplicateCurrentChat(){
  if(controller||readingImages){toast("Wait for the current response or image upload to finish.");return;}
  if(isWorkflow()&&currentRun&&currentRun.status!=="complete"){toast("Complete or cancel the workflow before duplicating it.");return;}
  const kind=currentKind;
  const list=kind==="group"?groups:kind==="workflow"?workflows:agents;
  const original=list.find(item=>item.id===currentId);if(!original)return;
  let id;do{id=uid();}while(agents.some(a=>a.id===id)||groups.some(g=>g.id===id)||workflows.some(w=>w.id===id)||store.raw("ds_conv_"+id)!==null);
  const base=original.name+" copy";
  let name=base,n=2;while(list.some(item=>item.name===name))name=base+" "+n++;
  const copy=JSON.parse(JSON.stringify({...original,id,name}));
  const history=JSON.parse(JSON.stringify(messages));
  const next=[...list,copy],key="ds_conv_"+id;
  try{
    // Save the full transcript, including inactive versions, before exposing the copy.
    store.setRaw(key,JSON.stringify(history));
    if(kind==="group")store.groups=next;
    else if(kind==="workflow")store.workflows=next;
    else store.agents=next;
  }catch(error){
    store.removeRaw(key);
    toast("Not enough browser storage to duplicate this chat. The original is unchanged.");return;
  }
  if(kind==="group")groups=next;else if(kind==="workflow")workflows=next;else agents=next;
  currentId=id;
  try{store.cur=id;store.kind=kind;}catch(error){/* The copy is saved and remains available in the drawer. */}
  const draftImages=pendingImages;loadConv();pendingImages=draftImages;renderAttachments();
  renderAgents();closeAll();toast("Chat duplicated");
}
$("#duplicateChatBtn").onclick=duplicateCurrentChat;

/* ---------- Agents & groups drawer ---------- */
function selectAgent(id){if(controller){toast("Stop the response before switching");return;}currentKind="agent";currentId=id;store.kind="agent";store.cur=id;loadConv();renderAgents();closeAll();}
function selectGroup(id){if(controller){toast("Stop the response before switching");return;}currentKind="group";currentId=id;store.kind="group";store.cur=id;loadConv();renderAgents();closeAll();}
function selectWorkflow(id){if(controller){toast("Stop the response before switching");return;}currentKind="workflow";currentId=id;store.kind="workflow";store.cur=id;loadConv();renderAgents();closeAll();}
let drawerQuery="";
function drawerSection(listEl,kind,items,emptyHint,describe,onSelect,onEdit){
  listEl.innerHTML="";
  const q=drawerQuery.trim().toLowerCase(),pins=store.pins;
  let shown=0;
  for(const item of orderDrawerItems(items,{pins,sort:store.sort,activity:store.activity})){
    const nameHit=!q||String(item.name).toLowerCase().includes(q);
    // Cheap raw-text check first so big chats are only parsed when they might match.
    const raw=q&&!nameHit?store.raw("ds_conv_"+item.id):null;
    const hit=raw&&(/["\\]/.test(q)||raw.toLowerCase().includes(q))?searchConversation(store.conv(item.id),q):null;
    if(q&&!nameHit&&!hit)continue;
    shown++;
    const row=document.createElement("div"),pinned=pins.includes(item.id);
    row.className="agent-row"+(currentKind===kind&&item.id===currentId?" active":"");
    const snippet=hit?'<span class="snippet">'+esc(hit.before)+'<mark>'+esc(hit.match)+'</mark>'+esc(hit.after)+'</span>':"";
    const preview=chatPreview(item.id),when=preview?shortWhen(preview.at,Date.now()):"";
    const sub=preview?(preview.who?'<span class="who-prefix">'+esc(preview.who)+':</span> ':"")+esc(preview.text):describe(item);
    row.innerHTML='<div class="av">'+avatarInner(item)+'</div><div class="meta"><span class="row-top"><b>'+esc(item.name)+'</b>'+(when?'<span class="when">'+esc(when)+'</span>':"")+'</span><small>'+sub+'</small>'+snippet+'</div>'+
      '<button class="pin'+(pinned?" on":"")+'" type="button" aria-label="'+(pinned?"Unpin":"Pin to top")+'" aria-pressed="'+pinned+'" title="'+(pinned?"Unpin":"Pin to top")+'">'+icon("pin")+'</button>'+
      '<button class="edit" type="button" aria-label="Edit '+esc(item.name)+'" title="Edit">'+icon("pencil")+'</button>';
    row.querySelector(".meta").onclick=row.querySelector(".av").onclick=()=>{onSelect(item.id);if(hit)focusMessage(hit.index);};
    row.querySelector(".pin").onclick=e=>{e.stopPropagation();const next=pinned?pins.filter(id=>id!==item.id):[...pins,item.id];try{store.pins=next;}catch(err){}renderAgents();};
    row.querySelector(".edit").onclick=e=>{e.stopPropagation();onEdit(item.id);};
    listEl.appendChild(row);
  }
  if(!shown&&(q||emptyHint))listEl.innerHTML='<div class="hint" style="margin:0 6px 6px">'+(q?"No matches.":emptyHint)+'</div>';
}
// Scroll a chat message into view after opening a search result.
function focusMessage(index){
  if(index<0||index>=messages.length)return;
  if(index<chatVisibleStart){chatVisibleStart=Math.max(0,index-5);renderChat();}
  chatFollowing=false;
  const row=chatRows.get(messages[index]);if(!row)return;
  row.scrollIntoView({block:"center"});row.classList.add("flash");setTimeout(()=>row.classList.remove("flash"),1600);updateLatestButton();
}
// Previews are cached by saveConv; chats saved before that are read once and cached.
function chatPreview(id){
  const map=store.previews;
  if(!(id in map)){const p=store.raw("ds_conv_"+id)===null?null:previewOf(store.conv(id));store.setPreview(id,p);return p;}
  return map[id];
}
function renderWorkflows(){
  drawerSection($("#workflowList"),"workflow",workflows,"",
    w=>esc(w.template||"custom")+' · '+w.roles.length+' roles',selectWorkflow,openWorkflowEditor);
}
// Agents that only exist as characters in a roleplay scene (and have no chat of their own) go in a folded list.
function isSceneCharacter(a){
  return !(currentKind==="agent"&&currentId===a.id)&&store.raw("ds_conv_"+a.id)===null&&groups.some(g=>isRoleplayGroup(g)&&(g.members||[]).includes(a.id));
}
let showCharacters=false;
function renderAgents(){
  renderWorkflows();
  drawerSection($("#groupList"),"group",groups,"No groups yet. Use + for a new group, or Library for a ready-made scene.",
    g=>{const mems=groupMembers(g);return (isRoleplayGroup(g)?'Roleplay · ':'')+mems.map(a=>esc(a.name)).join(", ");},
    selectGroup,openGroupEditor);
  const searching=!!drawerQuery.trim(),characters=searching?[]:agents.filter(isSceneCharacter);
  const regular=agents.filter(a=>!characters.includes(a));
  drawerSection($("#agentList"),"agent",regular,"No agents yet.",()=>"Start a chat",selectAgent,openEditor);
  const wrap=$("#characterList");wrap.innerHTML="";
  if(characters.length){
    const toggle=document.createElement("button");toggle.type="button";toggle.className="chars-toggle";toggle.setAttribute("aria-expanded",String(showCharacters));
    toggle.innerHTML='<span>Scene characters · '+characters.length+'</span>'+icon(showCharacters?"chevL":"chevR");
    toggle.onclick=()=>{showCharacters=!showCharacters;renderAgents();};
    wrap.appendChild(toggle);
    if(showCharacters){const list=document.createElement("div");wrap.appendChild(list);
      drawerSection(list,"agent",characters,"",a=>"Character in "+esc(groups.filter(g=>(g.members||[]).includes(a.id)).map(g=>g.name).join(", ")),selectAgent,openEditor);}
  }
  $("#workflowSect").hidden=searching&&!$("#workflowList").children.length;
}
$("#drawerSearch").addEventListener("input",e=>{clearTimeout(e.target._t);e.target._t=setTimeout(()=>{drawerQuery=e.target.value;renderAgents();},150);});
$("#drawerSort").onchange=e=>{try{store.sort=e.target.value;}catch(err){}renderAgents();};

/* ---------- Agent editor ---------- */
// New agents always reason at least a little; existing agents may still be set to Off.
const NEW_AGENT_MIN_THINK="low";
function newAgentThink(value){return !value||value==="off"?NEW_AGENT_MIN_THINK:value;}
function openEditor(id){
  editingId=id;
  const a=id?agents.find(x=>x.id===id):{emoji:"🤖",name:"",prompt:"",model:"",temp:1.0,think:NEW_AGENT_MIN_THINK};
  $("#edTitle").textContent=id?"Edit agent":"New agent";
  $("#edEmoji").value=a.emoji;$("#edName").value=a.name;$("#edPrompt").value=a.prompt;
  $("#edModel").value=a.model;$("#edThink").value=a.think||"off";$("#edHistory").value=a.historyLimit??"";editingAvatar=a.avatar||null;renderEditorAvatar();$("#edMoods").checked=!!a.moods;$("#edMatureMoods").checked=!!a.matureMoods;$("#edMaxTokens").value=a.maxTokens??"";
  const offOption=$("#edThink").querySelector('option[value="off"]');offOption.disabled=offOption.hidden=!id;
  $("#edTemp").value=a.temp;$("#tempVal").textContent=Number(a.temp).toFixed(1);syncTempState();
  $("#delAgent").hidden=!(id&&agents.length>1);
  $("#dupAgent").hidden=!id;
  closeAll();openSheet("#editor");
}
let editingAvatar=null;
function renderEditorAvatar(){
  $("#edAvatarPreview").innerHTML=avatarInner({avatar:editingAvatar,emoji:$("#edEmoji").value.trim()||"🤖"});
  $("#edAvatarRemove").hidden=!editingAvatar;$("#edAvatarPickLabel").textContent=editingAvatar?"Change photo":"Add photo";
}
$("#edEmoji").addEventListener("input",renderEditorAvatar);
$("#edAvatarPick").onclick=()=>$("#edAvatarFile").click();
$("#edAvatarRemove").onclick=()=>{editingAvatar=null;renderEditorAvatar();};
$("#edAvatarFile").onchange=async e=>{
  const file=e.target.files[0];e.target.value="";if(!file)return;
  try{editingAvatar=await makeAvatar(file);renderEditorAvatar();}catch(err){toast("Could not read this picture.");}
};
// DeepSeek ignores temperature in thinking mode, so the slider is only active with thinking off.
function syncTempState(){
  const thinking=$("#edThink").value!=="off";
  $("#edTempBlock").classList.toggle("disabled",thinking);$("#edTemp").disabled=thinking;
  $("#edTempHint").textContent=thinking?"Not used while thinking is on.":"0.0 for code and maths · 1.0 for chat · 1.3 for creative writing and roleplay";
}
$("#edThink").addEventListener("change",syncTempState);
$("#edTemp").oninput=e=>$("#tempVal").textContent=Number(e.target.value).toFixed(1);
$("#addAgent").onclick=()=>openEditor(null);
$("#saveAgent").onclick=()=>{
  const name=$("#edName").value.trim()||"Agent";
  const data={emoji:$("#edEmoji").value.trim()||"🤖",name,prompt:$("#edPrompt").value.trim(),
    model:$("#edModel").value.trim(),temp:parseFloat($("#edTemp").value),think:$("#edThink").value,historyLimit:$("#edHistory").value,maxTokens:$("#edMaxTokens").value,moods:$("#edMoods").checked,matureMoods:$("#edMatureMoods").checked,avatar:editingAvatar};
  if(editingId){Object.assign(agents.find(a=>a.id===editingId),data);}
  else{const a={id:uid(),...data,think:newAgentThink(data.think)};agents.push(a);currentId=a.id;store.cur=a.id;}
  store.agents=agents;renderAgents();loadConv();closeAll();toast("Agent saved");
};
$("#dupAgent").onclick=()=>{
  // duplicate using the current form values, so any edits carry into the copy
  const data={emoji:$("#edEmoji").value.trim()||"🤖",name:($("#edName").value.trim()||"Agent")+" copy",
    prompt:$("#edPrompt").value.trim(),model:$("#edModel").value.trim(),
    temp:parseFloat($("#edTemp").value),think:$("#edThink").value,historyLimit:$("#edHistory").value,maxTokens:$("#edMaxTokens").value,moods:$("#edMoods").checked,matureMoods:$("#edMatureMoods").checked,avatar:editingAvatar};
  const a={id:uid(),...data,think:newAgentThink(data.think)};agents.push(a);store.agents=agents;
  currentKind="agent";currentId=a.id;store.kind="agent";store.cur=a.id;
  renderAgents();loadConv();openEditor(a.id);toast("Agent duplicated");
};
function forgetItem(id){
  try{store.pins=store.pins.filter(p=>p!==id);const a=store.activity;delete a[id];localStorage.setItem("ds_activity",JSON.stringify(a));
    for(const kind of ["agent","group","workflow"])localStorage.removeItem("ds_draft_"+kind+":"+id);}catch(e){/* Cosmetic leftovers only. */}
}
function confirmDelete(name,count){
  return confirm("Delete “"+name+"”"+(count?" and its conversation ("+count+" message"+(count===1?"":"s")+")":"")+"? This cannot be undone — export a backup first if unsure.");
}
$("#delAgent").onclick=()=>{
  if(!editingId)return;
  const doomed=agents.find(a=>a.id===editingId);if(!confirmDelete(doomed?.name||"this agent",store.conv(editingId).length))return;
  forgetItem(editingId);
  agents=agents.filter(a=>a.id!==editingId);store.agents=agents;store.clearConv(editingId);
  // drop the deleted agent from any group memberships
  groups=groups.map(g=>groupAfterAgentDelete(g,editingId));store.groups=groups;
  if(currentKind==="agent"&&currentId===editingId){currentId=agents[0].id;store.cur=currentId;}
  renderAgents();loadConv();closeAll();toast("Agent deleted");
};

/* ---------- Group editor ---------- */
function selectedGroupMemberIds(){
  return [...$("#grMembers").querySelectorAll(".mem.sel")].map(row=>row.dataset.id);
}
function syncRoleplayCharacterInputs(){
  if(!groupRoleplayDraft)return;
  $("#grRpCharacters").querySelectorAll(".rp-character").forEach(card=>{
    groupRoleplayDraft.characters[card.dataset.id]={
      name:card.querySelector('[data-field="name"]').value,
      description:card.querySelector('[data-field="description"]').value
    };
  });
}
function renderRoleplayCharacters(){
  syncRoleplayCharacterInputs();
  const members=selectedGroupMemberIds();
  groupRoleplayDraft=normalizeRoleplay(groupRoleplayDraft,members,agents);
  const wrap=$("#grRpCharacters");wrap.innerHTML="";
  for(const id of members){
    const agent=agents.find(a=>a.id===id),character=groupRoleplayDraft.characters[id];
    const card=document.createElement("div");card.className="rp-character";card.dataset.id=id;
    card.innerHTML='<b>'+esc((agent?.emoji||"⚠️")+" "+(agent?.name||"Unavailable character"))+'</b>'+
      '<label>Character name</label><input class="field" data-field="name">'+
      '<label>Character description</label><textarea class="field" data-field="description"></textarea>';
    const nameInput=card.querySelector('[data-field="name"]'),descriptionInput=card.querySelector('[data-field="description"]');
    nameInput.value=character.name;descriptionInput.value=character.description;
    wrap.appendChild(card);
  }
}
function renderRoleplayEditor(){
  const enabled=$("#grRoleplay").checked;
  groupRoleplayDraft.enabled=enabled;$("#grRpFields").style.display=enabled?"block":"none";
  $("#grRpAdultRow").style.display=$("#grRpMature").checked?"flex":"none";
  if(enabled)renderRoleplayCharacters();
}
function collectRoleplayEditor(members){
  syncRoleplayCharacterInputs();
  groupRoleplayDraft={...groupRoleplayDraft,enabled:$("#grRoleplay").checked,mature:$("#grRpMature").checked,
    setting:$("#grRpSetting").value.trim(),opening:$("#grRpOpening").value.trim(),
    user:{name:$("#grRpUserName").value.trim(),description:$("#grRpUserDescription").value.trim()}};
  return normalizeRoleplay(groupRoleplayDraft,members,agents);
}
function memberRow(id,emoji,title,subtitle,selected){
  const row=document.createElement("div");row.className="mem"+(selected?" sel":"");row.dataset.id=id;
  row.innerHTML='<div class="av">'+avatarInner(agentById(id)||{emoji})+'</div><div class="meta"><b>'+esc(title)+'</b><small>'+esc(subtitle)+'</small></div>'+
    '<div class="order"><button type="button" data-move="-1" aria-label="Speak earlier">'+icon("up")+'</button><button type="button" data-move="1" aria-label="Speak later">'+icon("down")+'</button></div><span class="tick"></span>';
  row.onclick=()=>{syncRoleplayCharacterInputs();row.classList.toggle("sel");
    // Newly selected members join the end of the speaking order.
    const wrap=row.parentNode,firstUnselected=[...wrap.children].find(r=>r!==row&&!r.classList.contains("sel"));
    if(row.classList.contains("sel"))wrap.insertBefore(row,firstUnselected||null);
    numberMembers();renderRoleplayCharacters();};
  row.querySelectorAll("[data-move]").forEach(b=>b.onclick=e=>{
    e.stopPropagation();syncRoleplayCharacterInputs();
    const selected=[...row.parentNode.querySelectorAll(".mem.sel")],i=selected.indexOf(row),j=i+Number(b.dataset.move);
    if(j<0||j>=selected.length)return;
    if(j<i)row.parentNode.insertBefore(row,selected[j]);else row.parentNode.insertBefore(selected[j],row);
    numberMembers();renderRoleplayCharacters();
  });
  return row;
}
// Selected members show their speaking position instead of a plain tick.
function numberMembers(){
  const rows=[...$("#grMembers").querySelectorAll(".mem")];let n=0;
  rows.forEach(r=>{const sel=r.classList.contains("sel");r.querySelector(".tick").textContent=sel?String(++n):"";});
  const selected=rows.filter(r=>r.classList.contains("sel"));
  selected.forEach((r,i)=>{r.querySelector('[data-move="-1"]').disabled=i===0;r.querySelector('[data-move="1"]').disabled=i===selected.length-1;});
}
function openGroupEditor(id){
  editingGroupId=id;
  const g=id?groups.find(x=>x.id===id):{emoji:"👥",name:"",members:agents.slice(0,Math.min(3,agents.length)).map(a=>a.id)};
  groupRoleplayDraft=normalizeRoleplay(g.roleplay,g.members||[],agents);
  $("#grTitle").textContent=id?"Edit group":"New group";
  $("#grEmoji").value=g.emoji;$("#grName").value=g.name;$("#grRounds").value=groupRounds(g);$("#grHistory").value=g.historyLimit??"";
  const wrap=$("#grMembers");wrap.innerHTML="";
  const members=g.members||[];
  // Selected members first, in speaking order (deleted agents included so they can be removed), then the rest.
  for(const memberId of members){
    const a=agents.find(x=>x.id===memberId);
    const row=a?memberRow(a.id,a.emoji,a.name,a.model||store.model,true)
      :memberRow(memberId,"⚠️",groupRoleplayDraft.characters[memberId]?.name||"Missing character","Unavailable — deleted agent · tap to remove",true);
    if(!a)row.classList.add("missing");
    wrap.appendChild(row);
  }
  agents.filter(a=>!members.includes(a.id)).forEach(a=>wrap.appendChild(memberRow(a.id,a.emoji,a.name,a.model||store.model,false)));
  numberMembers();
  $("#grRoleplay").checked=groupRoleplayDraft.enabled;$("#grRpSetting").value=groupRoleplayDraft.setting;
  $("#grRpOpening").value=groupRoleplayDraft.opening;$("#grRpUserName").value=groupRoleplayDraft.user.name;
  $("#grRpUserDescription").value=groupRoleplayDraft.user.description;$("#grRpMature").checked=groupRoleplayDraft.mature;
  $("#grRpAdult").checked=groupRoleplayDraft.mature;$("#grRpMoods").checked=g.moods!==false;
  $("#grRoleplay").onchange=renderRoleplayEditor;
  $("#grRpMature").onchange=()=>{$("#grRpAdultRow").style.display=$("#grRpMature").checked?"flex":"none";if(!$("#grRpMature").checked)$("#grRpAdult").checked=false;};
  renderRoleplayEditor();$("#delGroup").style.display=id?"":"none";
  closeAll();openSheet("#groupEditor");
}
/* ---------- Character card import ---------- */
let pendingCard=null;
async function readCardFile(file){
  if(file.size>30*1024*1024)throw new Error("This file is too large to be a character card.");
  const isPng=/\.png$/i.test(file.name)||file.type==="image/png";
  const json=isPng?cardJsonFromPng(new Uint8Array(await file.arrayBuffer())):JSON.parse(await file.text());
  const card=normalizeCard(json);
  let avatar=null;if(isPng){try{avatar=await makeAvatar(file);}catch(e){/* Card works without its picture. */}}
  return {card,avatar};
}
function renderCardSheet(){
  const {card,avatar}=pendingCard,snippet=fillPlaceholders(card.description||card.personality||card.scenario||"",card.name,"you").replace(/\s+/g," ").slice(0,220);
  $("#cardPreview").innerHTML='<div class="card-head"><span class="av">'+avatarInner({avatar,emoji:"🎭"})+'</span><div class="card-title"><b>'+esc(card.name)+'</b>'+
    '<small>'+esc([card.creator&&"by "+card.creator,card.greetings.length+" greeting"+(card.greetings.length===1?"":"s"),card.book&&card.book.entries.length+" lore entries"].filter(Boolean).join(" · "))+'</small></div></div>'+
    (snippet?'<p class="card-desc">'+esc(snippet)+(snippet.length>=220?"…":"")+'</p>':"")+
    (card.tags.length?'<div class="card-tags">'+card.tags.map(t=>'<span>'+esc(t)+'</span>').join("")+'</div>':"");
  const sel=$("#cardGreeting");sel.innerHTML="";
  if(!card.greetings.length)sel.innerHTML='<option value="0">No greeting (start empty)</option>';
  card.greetings.forEach((g,i)=>{const o=document.createElement("option");o.value=i;o.textContent=(i?"Alternate "+i+": ":"Default: ")+g.replace(/\s+/g," ").slice(0,70)+(g.length>70?"…":"");sel.appendChild(o);});
  const mature=/nsfw|mature|18\+|adult|explicit/i.test(card.tags.join(" "));
  $("#cardMature").checked=mature;$("#cardAdultRow").hidden=!mature;$("#cardAdult").checked=false;
}
$("#cardMature").onchange=()=>{$("#cardAdultRow").hidden=!$("#cardMature").checked;if(!$("#cardMature").checked)$("#cardAdult").checked=false;};
$("#importCard").onclick=()=>{if(controller){toast("Stop the response first");return;}$("#cardFile").click();};
$("#cardFile").onchange=async e=>{
  const file=e.target.files[0];e.target.value="";if(!file)return;
  try{pendingCard=await readCardFile(file);}catch(err){toast(err instanceof SyntaxError?"This file is not valid card data.":err.message||"Could not read this card.");return;}
  renderCardSheet();closeAll();openSheet("#cardSheet");
};
$("#cardImportBtn").onclick=()=>{
  if(!pendingCard)return;
  const mode=$("#cardMode").value,userName=$("#cardUserName").value.trim(),mature=$("#cardMature").checked;
  if(mode==="scene"&&!userName){toast("Enter your name for the roleplay scene");$("#cardUserName").focus();return;}
  if(mature&&!$("#cardAdult").checked){toast("Confirm that you are an adult");return;}
  const built=cardToChat(pendingCard.card,{userName,mature,mode,greetingIndex:Number($("#cardGreeting").value)||0,avatar:pendingCard.avatar},uid,Date.now());
  const nextAgents=[...agents,built.agent],nextGroups=built.group?[...groups,built.group]:groups;
  try{store.agents=nextAgents;if(built.group)store.groups=nextGroups;store.saveConv(built.conversationId,built.messages);}
  catch(err){store.agents=agents;toast("Not enough browser storage to import this card.");return;}
  agents=nextAgents;if(built.group)groups=normalizeStoredGroups(nextGroups,agents);
  pendingCard=null;
  if(built.group)selectGroup(built.group.id);else selectAgent(built.agent.id);
  toast(built.agent.name+" imported");
};

/* ---------- Scenario library ---------- */
function renderLibrary(){
  const list=$("#libraryList");list.innerHTML="";
  for(const preset of SCENARIO_LIBRARY){
    const card=document.createElement("div");card.className="lib-card";
    card.innerHTML='<div class="lib-head"><span class="av">'+esc(preset.emoji)+'</span><div class="lib-title"><b>'+esc(preset.title)+'</b><small>'+preset.characters.map(c=>esc(c.emoji+" "+c.name)).join(" · ")+'</small></div></div>'+
      '<p class="lib-tagline">'+esc(preset.tagline)+'</p><button type="button" class="btn primary">'+icon("plus")+'Add scenario</button>';
    card.querySelector("button").onclick=()=>addScenario(preset);
    list.appendChild(card);
  }
}
function addScenario(preset){
  const userName=$("#libUserName").value.trim();
  if(!userName){toast("Enter your character name first");$("#libUserName").focus();return;}
  if(!$("#libAdult").checked){toast("Confirm that you are an adult");return;}
  const {agents:newAgents,group}=buildScenario(preset,userName,uid);
  const nextAgents=[...agents,...newAgents],nextGroups=[...groups,group];
  try{store.agents=nextAgents;store.groups=nextGroups;}
  catch(e){store.agents=agents;toast("Not enough browser storage to add this scenario.");return;}
  agents=nextAgents;groups=normalizeStoredGroups(nextGroups,agents);
  selectGroup(group.id);toast(preset.title+" added");
}
$("#openLibrary").onclick=()=>{if(controller){toast("Stop the response first");return;}renderLibrary();closeAll();openSheet("#librarySheet");};
$("#addGroup").onclick=()=>{
  if(!agents.length){toast("Create an agent first");return;}
  openGroupEditor(null);
};
$("#saveGroup").onclick=()=>{
  const members=selectedGroupMemberIds();
  if(members.length<1){toast("Pick at least one agent");return;}
  const roleplay=collectRoleplayEditor(members),errors=validateRoleplay(roleplay,members,$("#grRpAdult").checked);
  if(errors.includes("adult-confirmation")){toast("Confirm that you are an adult");return;}
  if(errors.length){toast("Complete the roleplay character details");return;}
  const data={emoji:$("#grEmoji").value.trim()||"👥",name:$("#grName").value.trim()||"Group",members,roleplay,discussRounds:groupRounds({discussRounds:$("#grRounds").value}),historyLimit:$("#grHistory").value,moods:$("#grRpMoods").checked};
  if(editingGroupId){Object.assign(groups.find(g=>g.id===editingGroupId),data);}
  else{const g={id:uid(),...data};groups.push(g);currentKind="group";currentId=g.id;store.kind="group";store.cur=g.id;}
  store.groups=groups;renderAgents();loadConv();closeAll();toast("Group saved");
};
$("#delGroup").onclick=()=>{
  if(!editingGroupId)return;
  const doomed=groups.find(g=>g.id===editingGroupId);if(!confirmDelete(doomed?.name||"this group",store.conv(editingGroupId).length))return;
  forgetItem(editingGroupId);
  groups=groups.filter(g=>g.id!==editingGroupId);store.groups=groups;store.clearConv(editingGroupId);
  if(currentKind==="group"&&currentId===editingGroupId){currentKind="agent";currentId=agents[0].id;store.kind="agent";store.cur=currentId;}
  renderAgents();loadConv();closeAll();toast("Group deleted");
};

/* ---------- Workflow editor ---------- */
function cloneWorkflow(w){return JSON.parse(JSON.stringify(w));}
function stageLabel(stage){return stage==="synthesis"?"final":stage;}
function renderWorkflowRoles(){
  separateWorkflowAgents(workflowDraft,agents);
  const wrap=$("#wfRoles");wrap.innerHTML="";
  workflowDraft.roles.forEach((r,index)=>{
    const card=document.createElement("div");card.className="role-card";card.dataset.roleId=r.id;
    const missingAgent=!agents.some(a=>a.id===r.agentId);
    const agentOptions=(missingAgent?'<option value="'+esc(r.agentId)+'" selected>⚠ Unassigned — deleted agent</option>':'')+agents.map(a=>'<option value="'+esc(a.id)+'"'+(a.id===r.agentId?' selected':'')+'>'+esc(a.emoji+" "+a.name)+'</option>').join("");
    card.innerHTML='<div class="role-head"><b>Role '+(index+1)+'</b><span class="stage-badge">'+esc(stageLabel(r.stage))+'</span><div class="role-actions">'+
      '<button type="button" data-action="up" aria-label="Move up">'+icon("up")+'</button><button type="button" data-action="down" aria-label="Move down">'+icon("down")+'</button><button type="button" data-action="remove" aria-label="Remove role">'+icon("x")+'</button></div></div>'+
      '<div class="role-grid"><div><label>Role name</label><input class="field" data-field="name" value="'+esc(r.name)+'"></div>'+
      '<div><label>Copy settings from chat agent</label><select class="field" data-field="agentId">'+agentOptions+'</select></div></div>'+
      '<label>Stage</label><select class="field" data-field="stage"><option value="work"'+(r.stage==="work"?' selected':'')+'>Work</option><option value="critique"'+(r.stage==="critique"?' selected':'')+'>Critique</option><option value="synthesis"'+(r.stage==="synthesis"?' selected':'')+'>Synthesis</option></select>'+
      '<label>Instructions</label><textarea class="field" data-field="instruction">'+esc(r.instruction||"")+'</textarea>';
    const a=r.agent||{name:"",prompt:"",model:"deepseek-flash",temp:0.7,think:"off"};
    card.innerHTML+='<details><summary>Independent agent settings</summary><div class="hint">Saved only for this workflow role. Regular chat agents are unchanged.</div>'+
      '<label>Agent name</label><input class="field" data-agent="name" value="'+esc(a.name)+'">'+
      '<label>System prompt</label><textarea class="field" data-agent="prompt">'+esc(a.prompt||"")+'</textarea>'+
      '<label>Model (use deepseek-flash for images)</label><input class="field" data-agent="model" value="'+esc(a.model)+'">'+
      '<label>Temperature (0–2)</label><input class="field" type="number" min="0" max="2" step="0.1" data-agent="temp" value="'+a.temp+'">'+
      '<label>Thinking</label><select class="field" data-agent="think">'+THINK_LEVELS.map(v=>'<option'+(a.think===v?' selected':'')+'>'+v+'</option>').join("")+'</select></details>';
    card.querySelectorAll("[data-agent]").forEach(el=>el.oninput=()=>{r.agent=r.agent||{...a};r.agent[el.dataset.agent]=el.dataset.agent==="temp"?Number(el.value):el.value;workflowDraftDirty=true;});
    card.querySelectorAll("[data-field]").forEach(el=>el.oninput=()=>{r[el.dataset.field]=el.value;workflowDraftDirty=true;card.classList.remove("invalid");card.querySelector(".stage-badge").textContent=stageLabel(r.stage);});
    card.querySelector('[data-field="agentId"]').onchange=e=>{r.agentId=e.target.value;delete r.agent;separateWorkflowAgents(workflowDraft,agents);workflowDraftDirty=true;renderWorkflowRoles();};
    card.querySelector('[data-action="up"]').disabled=index===0;
    card.querySelector('[data-action="down"]').disabled=index===workflowDraft.roles.length-1;
    card.querySelector('[data-action="remove"]').disabled=workflowDraft.roles.length<=2;
    card.querySelector('[data-action="up"]').onclick=()=>moveWorkflowRole(index,-1);
    card.querySelector('[data-action="down"]').onclick=()=>moveWorkflowRole(index,1);
    card.querySelector('[data-action="remove"]').onclick=()=>removeWorkflowRole(index);
    wrap.appendChild(card);
  });
}
function moveWorkflowRole(index,delta){
  const next=index+delta;if(next<0||next>=workflowDraft.roles.length)return;
  [workflowDraft.roles[index],workflowDraft.roles[next]]=[workflowDraft.roles[next],workflowDraft.roles[index]];
  workflowDraftDirty=true;workflowDraft.template="custom";$("#wfTemplate").value="custom";renderWorkflowRoles();
}
function removeWorkflowRole(index){
  if(workflowDraft.roles.length<=2)return;
  workflowDraft.roles.splice(index,1);workflowDraftDirty=true;workflowDraft.template="custom";$("#wfTemplate").value="custom";renderWorkflowRoles();
}
function syncWorkflowDraftHeader(){
  workflowDraft.emoji=$("#wfEmoji").value.trim()||"⚙️";
  workflowDraft.name=$("#wfName").value.trim()||"Workflow";
  workflowDraft.template=$("#wfTemplate").value;
  workflowDraft.historyLimit=$("#wfHistory").value;
}
function openWorkflowEditor(id){
  editingWorkflowId=id;
  workflowDraft=id?cloneWorkflow(workflows.find(w=>w.id===id)):makeWorkflowPreset("research",agents,uid);
  workflowDraftDirty=false;
  const activeRun=id?store.run(id):null;
  if(!canEditWorkflowRun(activeRun)){toast("Finish or cancel the active run before editing");return;}
  $("#wfTitle").textContent=id?"Edit workflow":"New workflow";
  $("#wfEmoji").value=workflowDraft.emoji;$("#wfName").value=workflowDraft.name;$("#wfTemplate").value=workflowDraft.template||"custom";$("#wfHistory").value=workflowDraft.historyLimit??"";
  $("#delWorkflow").style.display=id?"":"none";
  renderWorkflowRoles();closeAll();openSheet("#workflowEditor");
}
$("#addWorkflow").onclick=()=>{
  if(!agents.length){toast("Create an agent first");return;}
  openWorkflowEditor(null);
};
$("#wfTemplate").onchange=()=>{
  const template=$("#wfTemplate").value;if(template==="custom"){workflowDraft.template="custom";workflowDraftDirty=true;return;}
  if(workflowDraftDirty&&!confirm("Replace the current roles with the selected template?")){$("#wfTemplate").value=workflowDraft.template||"custom";return;}
  const preset=makeWorkflowPreset(template,agents,uid),id=workflowDraft.id;
  workflowDraft={...preset,id};workflowDraftDirty=false;
  $("#wfEmoji").value=preset.emoji;$("#wfName").value=preset.name;renderWorkflowRoles();
};
$("#addWfRole").onclick=()=>{
  if(workflowDraft.roles.length>=5){toast("A workflow can have at most 5 roles");return;}
  const synthIndex=workflowDraft.roles.findIndex(r=>r.stage==="synthesis"),at=synthIndex<0?workflowDraft.roles.length:synthIndex;
  workflowDraft.roles.splice(at,0,{id:uid(),name:"Critic",instruction:"Challenge earlier work and recommend concrete corrections.",stage:"critique",agentId:agents[at%agents.length]?.id||""});
  workflowDraft.template="custom";workflowDraftDirty=true;$("#wfTemplate").value="custom";renderWorkflowRoles();
};
const workflowErrorText={
  "agent-settings":"Enter a model and a temperature between 0 and 2 in independent agent settings",
  "role-count":"Use between 2 and 5 roles","role-name":"Every role needs a name","missing-agent":"Assign an existing agent to every role",
  "invalid-stage":"Choose a valid stage","missing-work":"Add at least one work role","missing-critique":"Add at least one critique role",
  "synthesis-count":"The final role must be the only synthesizer","stage-order":"Place all work roles before critique roles"
};
$("#saveWorkflow").onclick=()=>{
  syncWorkflowDraftHeader();
  const errors=validateWorkflow(workflowDraft,agents);
  $("#wfRoles").querySelectorAll(".invalid").forEach(c=>c.classList.remove("invalid"));
  if(errors.length){
    const first=errors[0];if(first.roleId)$("#wfRoles").querySelector('[data-role-id="'+first.roleId+'"]')?.classList.add("invalid");
    toast(workflowErrorText[first.code]||"Fix the workflow configuration");return;
  }
  if(editingWorkflowId&&!canEditWorkflowRun(store.run(editingWorkflowId))){toast("Finish or cancel the active run before editing");closeAll();return;}
  const saved=cloneWorkflow(workflowDraft);
  if(editingWorkflowId)Object.assign(workflows.find(w=>w.id===editingWorkflowId),saved);
  else{workflows.push(saved);currentKind="workflow";currentId=saved.id;store.kind="workflow";store.cur=saved.id;}
  store.workflows=workflows;renderAgents();loadConv();closeAll();toast("Workflow saved");
};
$("#delWorkflow").onclick=()=>{
  if(!editingWorkflowId)return;
  const doomed=workflows.find(w=>w.id===editingWorkflowId);if(!confirmDelete(doomed?.name||"this workflow",store.conv(editingWorkflowId).length))return;
  forgetItem(editingWorkflowId);
  workflows=workflows.filter(w=>w.id!==editingWorkflowId);store.workflows=workflows;store.clearConv(editingWorkflowId);store.clearRun(editingWorkflowId);
  if(currentKind==="workflow"&&currentId===editingWorkflowId){currentKind="agent";currentId=agents[0].id;store.kind="agent";store.cur=currentId;}
  renderAgents();loadConv();closeAll();toast("Workflow deleted");
};

/* ---------- Settings ---------- */
function refreshConnPill(){const p=$("#connPill");if(store.k){p.textContent="key saved";p.style.color="var(--ok)";}else{p.textContent="not set";p.style.color="var(--muted)";}}
async function refreshStorageInfo(){
  const el=$("#storageInfo");
  try{const {usage,quota}=await navigator.storage.estimate();el.textContent=formatBytes(usage)+" of "+formatBytes(quota)+(store.records?" · IndexedDB":" · localStorage");}
  catch(e){el.textContent=store.records?"IndexedDB":"localStorage";}
  const last=Number(localStorage.getItem("ds_last_backup"))||0;
  $("#lastBackup").textContent=last?messageTime(last):"never";
}
function formatBytes(n){if(!Number.isFinite(n))return "?";const u=["B","KB","MB","GB","TB"];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++;}return (i?n.toFixed(n>=100?0:1):n)+" "+u[i];}
$("#checkKey").onclick=async()=>{
  const key=$("#apiKey").value.trim(),base=($("#baseUrl").value.trim()||"https://api.deepseek.com").replace(/\/+$/,""),out=$("#keyStatus");
  if(!key){out.textContent="Enter a key first.";return;}
  out.textContent="Checking…";
  const get=path=>fetch(base+path,{headers:{"Authorization":"Bearer "+key}});
  try{
    let res=await get("/user/balance");
    if(res.ok){
      const data=await res.json(),info=(data.balance_infos||[]).map(b=>b.total_balance+" "+b.currency).join(" · ");
      out.textContent="✓ Key works"+(info?" · Balance: "+info:"")+(data.is_available===false?" · balance too low to send requests":"");return;
    }
    if(res.status===404){res=await get("/models");if(res.ok){out.textContent="✓ Key works (this provider does not report a balance).";return;}}
    let detail="";try{detail=(await res.json()).error?.message||"";}catch(e){}
    out.textContent="✗ "+friendlyApiError(res.status,detail);
  }catch(e){out.textContent="✗ Could not reach "+base+". Check the base URL and your connection.";}
};
$("#exportChat").onclick=()=>{
  if(!messages.length){toast("This chat is empty.");return;}
  const item=isWorkflow()?curWorkflow():isGroup()?curGroup():curAgent();
  const userName=isGroup()&&isRoleplayGroup(curGroup())?curGroup().roleplay.user.name:"";
  downloadFile((item.name||"chat").replace(/[^\w\- ]+/g,"").trim()+".md",chatToMarkdown(item.emoji+" "+item.name,messages,userName),"text/markdown");
  toast("Chat exported");
};
function downloadFile(name,text,type){
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
$("#themeSelect").onchange=e=>{applyTheme(e.target.value);try{localStorage.setItem("ds_theme",e.target.value);}catch(err){}};
$("#setBtn").onclick=()=>{try{$("#themeSelect").value=localStorage.getItem("ds_theme")||"";}catch(e){}refreshStorageInfo();$("#keyStatus").textContent="";$("#ctxLimit").value=String(store.ctxLimit);$("#ctxSummary").checked=store.ctxSummary;$("#apiKey").value=store.k;$("#baseUrl").value=store.base;$("#defModel").value=store.model;refreshConnPill();closeAll();openSheet("#settings");};
$("#saveSettings").onclick=()=>{
  store.k=$("#apiKey").value.trim();
  store.base=($("#baseUrl").value.trim()||"https://api.deepseek.com").replace(/\/+$/,"");
  store.model=$("#defModel").value.trim()||"deepseek-flash";
  store.ctxLimit=Number($("#ctxLimit").value)||0;store.ctxSummary=$("#ctxSummary").checked;
  refreshConnPill();renderChat();closeAll();toast("Saved");
};
$("#exportBackup").onclick=()=>{
  const records=Object.fromEntries(store.bigKeys().map(k=>[k,store.raw(k)]));
  downloadFile("deepseek-agents-"+new Date().toISOString().slice(0,10)+".json",JSON.stringify(makeBackup(localStorage,records)),"application/json");
  try{localStorage.setItem("ds_last_backup",String(Date.now()));}catch(e){}
  refreshStorageInfo();toast("Backup exported");
};
$("#importBackup").onclick=()=>{if(controller){toast("Stop the current response first");return;}$("#backupFile").click();};
$("#backupFile").onchange=async e=>{
  const file=e.target.files[0];e.target.value="";if(!file)return;
  let backup;try{backup=JSON.parse(await file.text());}catch(error){toast("Could not read this file.");return;}
  if(!confirm("Replace all agents, groups, workflows, and chats with this backup? Your API key is kept."))return;
  try{
    if(!store.records){restoreBackup(localStorage,backup);}
    else{
      // Settings go to localStorage (with rollback); conversations replace IndexedDB in one transaction.
      const data=backup?.data&&typeof backup.data==="object"?backup.data:{};
      const big=Object.entries(data).filter(([k,v])=>store.isBigKey(k)&&typeof v==="string");
      const small={...backup,data:Object.fromEntries(Object.entries(data).filter(([k])=>!store.isBigKey(k)))};
      const previous=makeBackup(localStorage);
      restoreBackup(localStorage,small);
      try{await store.replaceBig(big);}
      catch(error){restoreBackup(localStorage,previous);throw new Error("Could not store the backup's conversations. Nothing was changed.");}
    }
  }catch(error){toast(error.message);return;}
  location.reload();
};
$("#moodBtn").onclick=openMoodSheet;
$("#menuBtn").onclick=()=>{$("#drawerSort").value=store.sort;renderAgents();closeAll();openSheet("#drawer");};
$("#clearBtn").onclick=()=>{if(controller){toast("Stop the current response before clearing");return;}
  if(!messages.length)return;
  // No confirm dialog: the cleared chat can be restored from the toast until you leave this chat.
  const id=currentId,kind=currentKind,saved=["ds_conv_","ds_run_","ds_sum_"].map(p=>[p+id,store.raw(p+id)]);
  store.clearConv(id);
  if(isWorkflow()){store.clearRun(id);currentRun=null;}
  loadConv();
  toast("Chat cleared",{label:"Undo",run(){
    if(currentId!==id||currentKind!==kind||controller)return;
    try{for(const [k,v] of saved)if(v!==null)store.setRaw(k,v);}catch(e){toast("Could not restore: browser storage is full.");return;}
    loadConv();toast("Chat restored");
  }});
};

/* ---------- Composer ---------- */
const input=$("#input");
let pendingImages=[],readingImages=false;
function renderAttachments(){
  const tray=$("#attachments");tray.innerHTML="";
  pendingImages.forEach((image,index)=>{
    const item=document.createElement("div");item.className="attachment";
    const img=document.createElement("img");img.src=image.url;img.alt=image.name;
    const remove=document.createElement("button");remove.type="button";remove.innerHTML=icon("x");remove.setAttribute("aria-label","Remove "+image.name);
    remove.onclick=()=>{pendingImages.splice(index,1);renderAttachments();};item.append(img,remove);tray.append(item);
  });
  $("#attachBtn").disabled=readingImages||!!controller;
  $("#attachBtn").title="Attach images or paste a screenshot";
}
async function prepareImage(file){
  if(!/^image\/(jpeg|png|webp|gif)$/.test(file.type))throw new Error("Choose a JPEG, PNG, WebP, or GIF image.");
  if(file.size>20*1024*1024)throw new Error("Choose images smaller than 20 MB each.");
  const url=URL.createObjectURL(file),img=new Image();
  try{
    img.src=url;await img.decode();
    const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    let data=canvas.toDataURL("image/jpeg",0.85);
    if(data.length>700000)data=canvas.toDataURL("image/jpeg",0.55);
    if(data.length>1000000)throw new Error("Image is too detailed to store. Crop it or choose a smaller image.");
    return {name:file.name||"Pasted image",url:data};
  }finally{URL.revokeObjectURL(url);}
}
async function addImages(files){
  if(readingImages||controller)return;
  const conversation=currentId;readingImages=true;renderAttachments();
  try{
    for(const file of files){
      if(pendingImages.length>=4){toast("Up to 4 images per message");break;}
      const image=await prepareImage(file);
      if(currentId!==conversation)break;
      pendingImages.push(image);
    }
  }catch(error){toast(error.message||"Could not read this image");}
  finally{readingImages=false;$("#imageFiles").value="";renderAttachments();}
}
$("#attachBtn").onclick=()=>$("#imageFiles").click();
$("#imageFiles").onchange=e=>addImages(Array.from(e.target.files));
input.addEventListener("paste",e=>{
  const files=Array.from(e.clipboardData?.files||[]).filter(f=>f.type.startsWith("image/"));
  if(files.length){e.preventDefault();addImages(files);}
});
function commitComposer(){
  if(readingImages){toast("Wait for the images to finish loading");return false;}
  const text=input.value.trim();
  if(!text&&!pendingImages.length)return false;
  const message={role:"user",content:text,at:Date.now(),...(pendingImages.length?{images:pendingImages.slice()}:{})};
  try{store.saveConv(currentId,[...messages,message]);}
  catch(error){toast("Browser storage is full. Remove an attachment or clear an old chat first.");return false;}
  messages.push(message);pendingImages=[];input.value="";clearDraft();autoGrow();renderAttachments();renderChat();return true;
}
// Unsent text is kept per chat, so switching chats never carries a draft into the wrong conversation.
function draftKey(){return "ds_draft_"+currentKind+":"+currentId;}
function clearDraft(){try{localStorage.removeItem(draftKey());}catch(e){}}
function autoGrow(){input.style.height="auto";input.style.height=Math.min(input.scrollHeight,window.innerHeight*0.38)+"px";}
input.addEventListener("input",()=>{autoGrow();try{if(input.value)localStorage.setItem(draftKey(),input.value);else clearDraft();}catch(e){/* Draft is still in the box. */}});
input.addEventListener("keydown",e=>{
  // Touch-first devices keep Enter for new lines; a hardware keyboard with a fine pointer sends.
  if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing&&!matchMedia("(pointer:coarse)").matches){
    e.preventDefault();send();
  }
});
$("#sendBtn").onclick=()=>{ if(controller){controller.abort();} else {send();} };

function setSending(on){
  const b=$("#sendBtn");
  if(on){b.classList.add("stop");b.innerHTML=icon("stop");b.setAttribute("aria-label","Stop generating");}
  else{b.classList.remove("stop");b.innerHTML=icon("send");b.setAttribute("aria-label","Send message");refreshHeader();}
  renderWorkflowUi();
  renderAttachments();
}

/* ---------- Build OpenAI-compatible message list for a given responder ---------- */
function buildApiMessages(agent,options={}){
  const sys=[];
  if(isGroup()){
    return buildGroupApiMessages(curGroup(),agent,messages,options);
  }
  const instructions=agentInstructions(agent)+(options.mood?.track?"\n"+moodInstruction(options.mood.current,options.mood.mature):"");
  const grounded=groundSystem(instructions,messages);
  if(grounded) sys.push({role:"system",content:grounded});
  const hist=messages.filter(m=>(m.role==="user"||m.role==="assistant")&&isContextMessage(m)).map(m=>({role:m.role,content:speakerContent(m.role==="user"?"user":"char",m.content,m.role==="user"?m.images:undefined)}));
  return [...sys,...hist];
}

/* ---------- Stream one response ---------- */
async function streamCompletion(agent,apiMessages,meta={}){
  if(!store.k){toast("Add your API key in Settings");$("#setBtn").click();return false;}
  if(!modelSeesImages(agent.model||store.model)&&apiMessages.some(m=>Array.isArray(m.content)&&m.content.some(p=>p.type==="image_url"))){toast("This chat contains images. Set this agent's model to deepseek-flash for vision.");return false;}
  const convId=currentId,conversationMessages=messages;
  const bot={role:"assistant",content:"",reasoning:"",streaming:true,at:Date.now(),...meta};
  messages.push(bot);
  renderChat();

  const payload={
    model:agent.model||store.model,
    messages:apiMessages,
    stream:true,
    stream_options:{include_usage:true},
  };
  // DeepSeek V4 thinking mode (reasoning_content). "off" => cheaper non-thinking path.
  // Thinking mode does not support temperature, so it is only sent when thinking is off.
  if(agent.think && agent.think!=="off"){payload.thinking={type:"enabled"};payload.reasoning_effort=agent.think;}
  else{payload.thinking={type:"disabled"};payload.temperature=agent.temp;}
  const maxTokens=replyTokenLimit(agent.maxTokens);if(maxTokens)payload.max_tokens=maxTokens;

  controller=new AbortController();
  const signal=controller.signal;
  setSending(true);renderResponders();renderChat();acquireWakeLock();
  let aborted=false;
  try{
    const res=await fetchWithRetry(()=>fetch(store.base+"/chat/completions",{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+store.k},
      body:JSON.stringify(payload),
      signal,
    }),signal);
    if(!res.ok){
      let detail="";try{const j=await res.json();detail=j.error?.message||JSON.stringify(j);}catch(e){detail=await res.text().catch(()=>"");}
      throw new Error(friendlyApiError(res.status,detail));
    }
    const reader=res.body.getReader();
    const dec=new TextDecoder();
    let buf="",parsedEvents=0;
    const handleLine=raw=>{
      const line=raw.trim();
      if(!line.startsWith("data:"))return;
      const data=line.slice(5).trim();
      if(data==="[DONE]")return;
      let j;try{j=JSON.parse(data);}catch(e){return;/* ignore keep-alive/partial */}
      if(j.error)throw new Error(j.error.message||"The provider reported an error mid-reply.");
      const choice=j.choices?.[0],d=choice?.delta||{},finish=choice?.finish_reason;
      if(finish&&finish!=="stop"&&finish!=="tool_calls"){
        if(finish!=="length")bot.finish=finish;
        if(finish!=="content_filter")bot.truncated=true;
      }
      if(j.usage)bot.usage={prompt:j.usage.prompt_tokens||0,completion:j.usage.completion_tokens||0};
      if(d.reasoning_content) bot.reasoning+=d.reasoning_content;
      if(d.content) bot.content+=d.content;
      scheduleStreamPaint(bot);
    };
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      buf+=dec.decode(value,{stream:true});
      let idx;
      while((idx=buf.indexOf("\n"))>=0){
        const line=buf.slice(0,idx);buf=buf.slice(idx+1);
        handleLine(line);
        // Cached/buffered SSE data can otherwise monopolize the microtask queue.
        if(++parsedEvents%100===0){
          await new Promise(resolve=>setTimeout(resolve,0));
          if(signal.aborted){const stopped=new Error("Stopped");stopped.name="AbortError";throw stopped;}
        }
      }
    }
    handleLine(buf+dec.decode()); // a final event without a trailing newline
    bot.streaming=false;
    if(!bot.content&&!bot.reasoning){bot.content="(empty response)";}
  }catch(err){
    bot.streaming=false;
    if(err.name==="AbortError"){aborted=true;bot.content=bot.content||"⏹ stopped.";}
    // A dropped connection keeps everything already written; Continue can finish it.
    else if(bot.content){bot.interrupted=String(err.message||"Connection lost");bot.truncated=true;}
    else{bot.error=true;bot.content="⚠️ "+err.message;}
  }finally{
    if(bot.moodTracked&&!bot.error)applyMoodTag(bot);
    cancelStreamPaint();releaseWakeLock();
    controller=null;setSending(false);
    renderChat();try{store.saveConv(convId,conversationMessages);}catch(error){toast("Response received, but browser storage is full. This reply is not saved.");}renderResponders();
  }
  return {ok:!aborted&&!bot.error&&!bot.interrupted,aborted,bot};
}
// Retries busy/overloaded responses and network failures before any text arrives (2 retries, backing off).
async function fetchWithRetry(request,signal){
  for(let attempt=0;;attempt++){
    let res;
    try{res=await request();}
    catch(error){if(error.name==="AbortError"||attempt>=2)throw error;}
    if(res&&(res.ok||!isRetryableStatus(res.status)||attempt>=2))return res;
    toast("DeepSeek is busy — retrying ("+(attempt+1)+"/2)…");
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(resolve,attempt?4000:1500);
      signal.addEventListener("abort",()=>{clearTimeout(timer);const e=new Error("Stopped");e.name="AbortError";reject(e);},{once:true});
    });
  }
}
// Keeps a phone screen awake while a reply streams, so long replies are not cut off by auto-lock.
let wakeLock=null;
async function acquireWakeLock(){
  try{
    if(wakeLock||!globalThis.navigator?.wakeLock||document.visibilityState!=="visible")return;
    const lock=await navigator.wakeLock.request("screen");
    if(controller)wakeLock=lock;else lock.release();
  }catch(e){/* Not supported or not allowed; streaming works without it. */}
}
function releaseWakeLock(){try{wakeLock?.release();}catch(e){}wakeLock=null;}

/* ---------- Stream one response from a specific agent ---------- */
// returns true if it completed normally, false if aborted
async function runAgent(agent,options={}){
  return didResponseComplete(await runAgentResult(agent,options));
}
async function runAgentResult(agent,options={}){
  const character=isGroup()&&isRoleplayGroup(curGroup())?roleplayCharacter(curGroup(),agent):null;
  const mood=moodOptions(agent);
  const meta={...(isGroup()?{agentId:agent.id,agentName:agent.name,agentEmoji:agent.emoji,...(character?{characterName:character.name}:{})}:{}),...moodMeta(mood)};
  const context=await prepareContext(buildApiMessages(agent,{...options,mood}));
  if(!context)return {ok:false,aborted:true};
  const result=await streamCompletion(agent,context,meta);
  afterMoodReply(agent,result);
  return result;
}

/* ---------- Emotion tracking (roleplay groups, and single agents that opt in) ---------- */
function moodSettings(agent){
  if(isWorkflow())return null;
  if(isGroup()){const g=curGroup();return isRoleplayGroup(g)&&g.moods!==false?{owner:g,key:agent.id,mature:g.roleplay.mature===true,save:()=>{store.groups=groups;}}:null;}
  const a=curAgent();return a?.moods?{owner:a,key:a.id,mature:a.matureMoods===true,save:()=>{store.agents=agents;}}:null;
}
function moodHistory(agentId){
  return messages.filter(m=>m.role==="assistant"&&m.mood&&(!isGroup()||m.agentId===agentId)).map(m=>m.mood);
}
// The user's steer wins for the next reply; otherwise the character's latest reported mood carries on.
function currentMood(agent){
  const s=moodSettings(agent);if(!s)return null;
  const steer=s.owner.moodSteer?.[s.key];
  if(steer)return {...steer,steered:true};
  const last=moodHistory(agent.id).at(-1);return last?{...last}:null;
}
function moodOptions(agent){const s=moodSettings(agent);return s?{track:true,mature:s.mature,current:currentMood(agent)}:null;}
// Flags copied onto a reply so its tag is parsed with the same vocabulary it was asked for.
function moodMeta(mood){return mood?{moodTracked:true,...(mood.mature?{moodMature:true}:{})}:{};}
function afterMoodReply(agent,result){
  const s=moodSettings(agent);
  if(!s||!result?.bot?.mood||!s.owner.moodSteer?.[s.key])return;
  delete s.owner.moodSteer[s.key];try{s.save();}catch(e){/* The steer simply stays for one more reply. */}
}
/* ---------- Avatars: a picture when the agent has one, otherwise its emoji ---------- */
function avatarInner(item,fallback){
  const url=item?.avatar;
  if(typeof url==="string"&&/^data:image\/(jpeg|png|webp);base64,/.test(url))return '<img src="'+url+'" alt="">';
  return esc(item?.emoji||fallback||"🤖");
}
function agentById(id){return agents.find(a=>a.id===id);}
// Square, centre-cropped thumbnail so pictures stay small in storage.
async function makeAvatar(blob,size=160){
  const url=URL.createObjectURL(blob),img=new Image();
  try{
    img.src=url;await img.decode();
    const side=Math.min(img.naturalWidth,img.naturalHeight),canvas=document.createElement("canvas");canvas.width=canvas.height=size;
    canvas.getContext("2d").drawImage(img,(img.naturalWidth-side)/2,(img.naturalHeight-side)/2,side,side,0,0,size,size);
    return canvas.toDataURL("image/jpeg",0.82);
  }finally{URL.revokeObjectURL(url);}
}
function moodLabel(m){return m.mood.charAt(0).toUpperCase()+m.mood.slice(1)+" "+m.level;}
function moodChip(m,tag="span"){
  return "<"+tag+' class="mood mood-'+esc(m.mood)+'" style="--lvl:'+(m.level*10)+'%"><i></i>'+esc(moodLabel(m))+"</"+tag+">";
}
function moodCharacters(){
  if(isGroup())return groupMembers(curGroup()).map(a=>({agent:a,name:memberLabel(curGroup(),a)}));
  const a=curAgent();return a?[{agent:a,name:a.name}]:[];
}
function renderMoodSheet(){
  const list=$("#moodList");list.innerHTML="";
  for(const {agent,name} of moodCharacters()){
    const s=moodSettings(agent);if(!s)continue;
    const history=moodHistory(agent.id),now=history.at(-1),steer=s.owner.moodSteer?.[s.key];
    const card=document.createElement("div");card.className="mood-card";
    card.innerHTML='<div class="mood-head"><span class="av">'+avatarInner(agent)+'</span><b>'+esc(name)+'</b>'+(now?moodChip(now):'<span class="hint" style="margin:0">No mood yet</span>')+'</div>'+
      (history.length>1?'<div class="mood-trail" aria-label="Recent moods, oldest first">'+history.slice(-8).map(m=>moodChip(m)).join('<span aria-hidden="true">›</span>')+'</div>':"")+
      '<label>'+(steer?"Set for the next reply: "+esc(moodLabel(steer)):"Set a mood for the next reply")+'</label>'+
      '<div class="mood-steer"><select class="field" aria-label="Mood">'+moodNames(s.mature).map(n=>'<option value="'+n+'"'+((steer||now)?.mood===n?" selected":"")+'>'+n.charAt(0).toUpperCase()+n.slice(1)+'</option>').join("")+'</select>'+
      '<input type="range" min="1" max="10" step="1" aria-label="Intensity" value="'+((steer||now)?.level||5)+'"><output>'+((steer||now)?.level||5)+'</output></div>'+
      '<div class="mood-actions"><button type="button" class="btn primary" data-set>'+icon("heart")+'Set mood</button>'+(steer?'<button type="button" class="btn ghost" data-clear>Clear</button>':"")+'</div>';
    const range=card.querySelector('input[type="range"]'),out=card.querySelector("output");
    range.oninput=()=>{out.textContent=range.value;};
    card.querySelector("[data-set]").onclick=()=>{
      s.owner.moodSteer={...(s.owner.moodSteer||{}),[s.key]:normalizeMood(card.querySelector("select").value,range.value,s.mature)};
      try{s.save();}catch(e){toast("Could not save the mood. Browser storage may be full.");return;}
      renderMoodSheet();toast(name+" will feel "+moodLabel(s.owner.moodSteer[s.key]).toLowerCase()+" in the next reply");
    };
    const clear=card.querySelector("[data-clear]");
    if(clear)clear.onclick=()=>{delete s.owner.moodSteer[s.key];try{s.save();}catch(e){}renderMoodSheet();};
    list.appendChild(card);
  }
  if(!list.children.length)list.innerHTML='<div class="hint">Mood tracking is off for this chat. Turn it on in the agent or group editor.</div>';
}
function openMoodSheet(){if(controller){toast("Wait for the reply to finish.");return;}renderMoodSheet();closeAll();openSheet("#moodSheet");}

/* ---------- Small helper requests (summaries, speaker picking) ---------- */
// Runs a short task with the same Stop button and busy state as a streamed reply.
async function withBusy(task){
  controller=new AbortController();setSending(true);renderResponders();
  try{return await task(controller.signal);}
  finally{controller=null;setSending(false);renderResponders();}
}
async function quickCompletion(apiMessages,signal,maxTokens){
  const res=await fetch(store.base+"/chat/completions",{method:"POST",signal,
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+store.k},
    body:JSON.stringify({model:store.model,messages:apiMessages,temperature:0.2,max_tokens:maxTokens,stream:false,thinking:{type:"disabled"}})});
  if(!res.ok)throw new Error("HTTP "+res.status);
  const data=await res.json();
  return String(data.choices?.[0]?.message?.content||"");
}
const SUMMARY_STEP=10;
function currentHistoryLimit(){
  const item=isWorkflow()?curWorkflow():isGroup()?curGroup():curAgent();
  return effectiveHistoryLimit(item?.historyLimit,store.ctxLimit);
}
// Applies the "history sent to AI" setting. Returns null when the user stopped a summary request.
async function prepareContext(apiMessages){
  const {kept,dropped}=limitApiHistory(apiMessages,currentHistoryLimit());
  if(!dropped.length||!store.ctxSummary)return kept;
  const convId=currentId;let summary=store.summary(convId);
  if(summary&&summary.covered>dropped.length)summary=null; // history was cleared or rewound; rebuild
  if(!summary||dropped.length-summary.covered>=SUMMARY_STEP){
    const fresh=dropped.slice(summary?.covered||0);
    toast("Summarizing older messages…");
    try{
      const text=await withBusy(signal=>quickCompletion([
        {role:"system",content:"You maintain a compact running summary of a conversation for a model that cannot see older messages. Keep names, facts, decisions, commitments, preferences, and open threads. Write at most 200 words of plain prose. Output only the summary."},
        {role:"user",content:(summary?"Existing summary:\n"+summary.text+"\n\n":"")+"Messages to fold in:\n"+fresh.map(m=>(m.role==="assistant"?"[assistant] ":"")+messageText(m.content)).join("\n")}
      ],signal,400));
      summary={covered:dropped.length,text:text.trim()};
      try{store.saveSummary(convId,summary);}catch(e){/* Reused next time if storage allows. */}
    }catch(error){
      if(error.name==="AbortError")return null;
      toast("Could not summarize older messages; sending recent ones only.");
    }
  }
  return withSummary(kept,summary?.text);
}

/* ---------- Group sequences: Everyone, Discuss, @mentions ---------- */
let sequence=null;
async function runSequence(list,options={}){
  if(!list.length)return;
  sequence={list,index:0,skip:false};renderResponders();
  try{
    for(let i=0;i<list.length;i++){
      sequence.index=i;sequence.skip=false;renderResponders();
      const result=await runAgentResult(list[i],options);
      if(sequence.skip){dropSkippedReply(result);continue;}
      if(!didResponseComplete(result))break; // user hit stop
    }
  }finally{sequence=null;renderResponders();}
}
function skipCurrentSpeaker(){if(!sequence||!controller)return;sequence.skip=true;controller.abort();}
// A skipped speaker leaves nothing behind unless they had already written something.
function dropSkippedReply(result){
  const bot=result?.bot;if(!bot||(bot.content&&!REPLY_PLACEHOLDERS.has(bot.content)))return;
  const i=messages.indexOf(bot);if(i<0)return;
  messages.splice(i,1);try{store.saveConv(currentId,messages);}catch(e){/* The placeholder is excluded from context anyway. */}
  renderChat();
}
function groupRounds(group){return Math.min(10,Math.max(1,Number(group?.discussRounds)||2));}
function lastSpeakerId(){return [...messages].reverse().find(m=>m.role==="assistant"&&m.agentId)?.agentId||null;}
function mentionCandidates(group){
  const mems=groupMembers(group),list=mems.map(a=>({id:a.id,name:memberLabel(group,a)}));
  return isRoleplayGroup(group)?list.concat(mems.map(a=>({id:a.id,name:a.name}))):list;
}
async function pickNextSpeaker(group){
  const mems=groupMembers(group),ids=mems.map(a=>a.id),last=lastSpeakerId();
  const candidates=mems.map(a=>({id:a.id,name:memberLabel(group,a)}));
  const recent=messages.filter(isContextMessage).slice(-12).map(m=>"["+(m.role==="user"?"User":(m.characterName||m.agentName||"Agent"))+"]: "+messageText(m.content).slice(0,600)).join("\n");
  try{
    const answer=await withBusy(signal=>quickCompletion([
      {role:"system",content:"You choose who speaks next in a group conversation. Answer with exactly one participant name from the list and nothing else."},
      {role:"user",content:"Participants: "+candidates.map(c=>c.name).join(", ")+"\n\nRecent conversation:\n"+recent+"\n\nWho should reply next? Prefer whoever was addressed or whose role fits best. Avoid the most recent speaker unless they were addressed."}
    ],signal,20));
    return parseSpeakerChoice(answer,candidates)||fallbackNextSpeaker(ids,last);
  }catch(error){
    if(error.name==="AbortError")return null;
    toast("Couldn't pick automatically; using the next member in order.");
    return fallbackNextSpeaker(ids,last);
  }
}

/* ---------- Continue a reply cut off by the length limit ---------- */
async function continueMessage(message){
  if(controller||isWorkflow()||messages.at(-1)!==message)return;
  const agent=isGroup()?agents.find(a=>a.id===message.agentId):curAgent();
  if(!agent){toast("The original agent is no longer available.");return;}
  const mood=moodOptions(agent);
  const base=await prepareContext(buildApiMessages(agent,{mood}));if(!base)return;
  const payload=[...base,{role:"user",content:"Continue your previous reply exactly where it stopped. Do not repeat anything already written and do not add a preamble."}];
  const meta={};for(const key of ["agentId","agentName","agentEmoji","characterName"])if(message[key])meta[key]=message[key];
  Object.assign(meta,moodMeta(mood));
  const result=await streamCompletion(agent,payload,meta);
  if(!result)return;
  const bot=result.bot,i=messages.indexOf(bot);if(i>=0)messages.splice(i,1);
  if(bot.error)toast(bot.content);
  else if(bot.content&&!REPLY_PLACEHOLDERS.has(bot.content)){
    message.content+=bot.content;
    if(bot.reasoning)message.reasoning=(message.reasoning?message.reasoning+"\n\n":"")+bot.reasoning;
    message.truncated=!!bot.truncated;message.interrupted=bot.interrupted||null;message.finish=bot.finish||null;
    if(bot.mood){message.mood=bot.mood;message.moodTracked=true;}
    if(bot.usage)message.usage={prompt:(message.usage?.prompt||0)+bot.usage.prompt,completion:(message.usage?.completion||0)+bot.usage.completion};
  }
  try{store.saveConv(currentId,messages);}catch(e){toast("Browser storage is full. The continuation is not saved.");}
  renderChat();refreshHeader();
}

/* ---------- Workflow execution ---------- */
function saveCurrentRun(){if(isWorkflow()&&currentRun)store.saveRun(currentId,currentRun);}
function workflowMessageMeta(workflow,run,role,agent){
  return {agentId:agent.id,agentName:agent.name,agentEmoji:agent.emoji,workflowRoleId:role.id,workflowRoleName:role.name,workflowStage:role.stage,runId:run.id};
}
// Earlier conversation given to a new workflow task; follows the workflow's history setting (0 = all of it).
function workflowHistorySnapshot(){
  const list=messages.filter(m=>(m.role==="user"||m.role==="assistant")&&isContextMessage(m)&&m.content),limit=currentHistoryLimit();
  return (limit?list.slice(-limit):list).map(m=>({role:m.role,content:m.content}));
}
async function startWorkflowRun(task){
  const workflow=curWorkflow(),errors=validateWorkflow(workflow,agents);
  if(errors.length){toast(workflowErrorText[errors[0].code]||"Fix the workflow configuration");openWorkflowEditor(workflow.id);return;}
  if(!store.k){toast("Add your API key in Settings");$("#setBtn").click();return;}
  if(currentRun&&currentRun.status!=="complete"){toast("Finish or cancel the current run first");return;}
  const images=pendingImages.slice();
  const incompatible=workflow.roles.find(r=>!modelSeesImages(workflowAgent(r,agents)?.model||store.model));
  if(images.length&&incompatible){toast("Set "+incompatible.name+" to deepseek-flash in its independent agent settings to use images.");openWorkflowEditor(workflow.id);return;}
  $("#reviewGuidance").value="";
  const nextRun=newRun(workflow,task,Date.now(),uid);
  nextRun.images=images;
  nextRun.history=workflowHistorySnapshot();
  const nextMessages=[...messages,{role:"user",content:task,images,runId:nextRun.id,at:Date.now()}];
  const previousRun=store.raw("ds_run_"+currentId);
  try{store.saveRun(currentId,nextRun);store.saveConv(currentId,nextMessages);}
  catch(e){
    if(previousRun===null)store.removeRaw("ds_run_"+currentId);else store.setRaw("ds_run_"+currentId,previousRun);
    toast("Browser storage is full. Remove an attachment or clear an old chat first.");return;
  }
  currentRun=nextRun;messages=nextMessages;
  pendingImages=[];input.value="";clearDraft();autoGrow();renderAttachments();
  renderChat();renderWorkflowUi();
  await continueWorkflowRun();
}
async function continueWorkflowRun(){
  if(controller||!isWorkflow()||!currentRun)return;
  const workflow=curWorkflow();
  if(currentRun.status!=="synthesizing")currentRun={...currentRun,status:"running",updatedAt:Date.now()};
  saveCurrentRun();renderWorkflowUi();refreshHeader();
  while(isWorkflow()&&currentRun){
    const action=nextWorkflowAction(workflow,currentRun);
    currentRun=action.run;saveCurrentRun();renderWorkflowUi();refreshHeader();
    if(action.type==="review"||action.type==="complete"){
      renderChat();return;
    }
    const role=action.role,agent=workflowAgent(role,agents);
    if(!agent){
      currentRun=recordRoleFailure(currentRun,role,{content:"Assigned agent no longer exists.",reasoning:""},Date.now());
      saveCurrentRun();renderChat();renderWorkflowUi();return;
    }
    const runId=currentRun.id;
    const result=await streamCompletion(agent,buildWorkflowMessages(workflow,currentRun,role,agent),workflowMessageMeta(workflow,currentRun,role,agent));
    if(!currentRun||currentRun.id!==runId)return;
    if(result===false){currentRun={...currentRun,status:"stopped"};saveCurrentRun();renderWorkflowUi();return;}
    if(result.aborted||result.bot.error||result.bot.interrupted){
      currentRun=recordRoleFailure(currentRun,role,result.bot,Date.now());
      saveCurrentRun();renderChat();renderWorkflowUi();refreshHeader();return;
    }
    currentRun=recordRoleOutput(currentRun,role,result.bot,Date.now());
    saveCurrentRun();renderWorkflowUi();refreshHeader();
  }
}
async function approveWorkflowSynthesis(guidance){
  if(!currentRun||currentRun.status!=="review")return;
  currentRun={...currentRun,status:"synthesizing",guidance:String(guidance||"").trim(),updatedAt:Date.now()};
  saveCurrentRun();renderWorkflowUi();await continueWorkflowRun();
}
function removeRoleMessagesFrom(roleId){
  const workflow=curWorkflow(),index=workflow.roles.findIndex(r=>r.id===roleId);
  if(index<0)return;
  const remove=new Set(workflow.roles.slice(index).map(r=>r.id)),runId=currentRun.id;
  messages=messages.filter(m=>!(m.runId===runId&&remove.has(m.workflowRoleId)));
  store.saveConv(currentId,messages);
}
async function retryRoleFromUi(roleId){
  if(controller||!currentRun)return;
  removeRoleMessagesFrom(roleId);
  currentRun=retryWorkflowRole(curWorkflow(),currentRun,roleId,Date.now());saveCurrentRun();renderChat();renderWorkflowUi();
  currentRun=prepareRunResume(curWorkflow(),currentRun,Date.now());saveCurrentRun();
  await continueWorkflowRun();
}
async function resumeWorkflow(){
  if(controller||!currentRun||currentRun.status!=="stopped")return;
  const role=curWorkflow().roles[currentRun.nextRoleIndex];
  if(role){removeRoleMessagesFrom(role.id);currentRun=retryWorkflowRole(curWorkflow(),currentRun,role.id,Date.now());}
  currentRun=prepareRunResume(curWorkflow(),currentRun,Date.now());saveCurrentRun();
  await continueWorkflowRun();
}
function cancelWorkflow(){
  if(controller)controller.abort();
  if(!currentRun)return;
  currentRun={...currentRun,status:"complete",cancelled:true,updatedAt:Date.now()};saveCurrentRun();renderChat();renderWorkflowUi();refreshHeader();toast("Workflow cancelled");
}
$("#approveSynthesis").onclick=()=>approveWorkflowSynthesis($("#reviewGuidance").value);
$("#resumeWorkflow").onclick=resumeWorkflow;
$("#cancelWorkflow").onclick=cancelWorkflow;

/* ---------- Composer send ---------- */
function send(){
  if(controller||readingImages)return;
  const text=input.value.trim();
  if(!text&&!pendingImages.length)return;
  if(!store.k){toast("Add your API key in Settings");$("#setBtn").click();return;}
  if(isWorkflow()){startWorkflowRun(text);return;}
  if(!commitComposer())return;
  if(isGroup()){
    // "@Name" picks responders directly; otherwise you choose who replies.
    const group=curGroup(),ids=findMentions(text,mentionCandidates(group));
    if(ids.length){runSequence(ids.map(id=>agents.find(a=>a.id===id)).filter(Boolean));return;}
    // A one-character scene (for example an imported card) simply replies.
    const only=groupMembers(group);if(only.length===1){runSequence(only);return;}
    renderResponders();return;
  }
  runAgent(curAgent());
}

/* ---------- Group: one agent replies ---------- */
function groupRespond(agent){
  if(controller||readingImages)return;
  const text=input.value.trim();
  if((text||pendingImages.length)&&!commitComposer())return;
  runAgent(agent);
}

/* ---------- Group: every member replies once, in order ---------- */
async function everyoneRespond(){
  if(controller||readingImages)return;
  const text=input.value.trim();
  if((text||pendingImages.length)&&!commitComposer())return;
  await runSequence(groupMembers(curGroup()));
}

/* ---------- Group: agents discuss among themselves for N rounds ---------- */
async function discussRespond(){
  if(controller||readingImages)return;
  const text=input.value.trim();
  if((text||pendingImages.length)&&!commitComposer())return;
  const group=curGroup(),ids=discussionOrder(groupMembers(group).map(a=>a.id),groupRounds(group),lastSpeakerId());
  await runSequence(ids.map(id=>agents.find(a=>a.id===id)).filter(Boolean),{discussion:true});
}

/* ---------- Group: a quick model call picks the next speaker ---------- */
async function autoRespond(){
  if(controller||readingImages)return;
  const text=input.value.trim();
  if((text||pendingImages.length)&&!commitComposer())return;
  const id=await pickNextSpeaker(curGroup());if(!id)return;
  const agent=agents.find(a=>a.id===id);if(agent)await runSequence([agent]);
}

/* ---------- Boot ---------- */
store.onWriteError=()=>toast("Browser storage refused the last save. Free space or export a backup.");
store.init().finally(()=>{
  renderAgents();loadConv();refreshConnPill();
  if(!store.k){setTimeout(()=>{$("#setBtn").click();},400);}
  else remindBackup();
});
// Another open tab (or the installed app) saved something: mirror it instead of later overwriting it.
if(store.channel)store.channel.onmessage=e=>{
  const {k,v,reload}=e.data||{};
  if(reload){location.reload();return;}
  if(!store.records||typeof k!=="string")return;
  if(v===null)store.records.delete(k);else store.records.set(k,v);
  if(!controller&&!sequence&&(k==="ds_conv_"+currentId||k==="ds_run_"+currentId)){
    const images=pendingImages,draft=input.value;loadConv();pendingImages=images;input.value=draft;renderAttachments();
  }
};
addEventListener("storage",e=>{
  if(controller||sequence||!["ds_agents","ds_groups","ds_workflows"].includes(e.key))return;
  agents=store.agents||agents;groups=normalizeStoredGroups(store.groups,agents);workflows=store.workflows;
  const list=currentKind==="group"?groups:currentKind==="workflow"?workflows:agents;
  if(!list.some(item=>item.id===currentId)){currentKind="agent";currentId=agents[0].id;loadConv();}
  renderAgents();refreshHeader();renderResponders();
});
// Everything lives only in this browser, so nudge (at most every 3 days) when there is no recent backup.
function remindBackup(){
  try{
    const now=Date.now(),last=Number(localStorage.getItem("ds_last_backup"))||0,nagged=Number(localStorage.getItem("ds_backup_nag"))||0;
    if(now-last<14*864e5||now-nagged<3*864e5||!store.bigKeys().some(k=>k.startsWith("ds_conv_")))return;
    localStorage.setItem("ds_backup_nag",String(now));
    setTimeout(()=>toast(last?"No backup in over 2 weeks.":"Your chats exist only in this browser.",{label:"Back up",run:()=>$("#exportBackup").click()}),1500);
  }catch(e){/* Reminder only. */}
}
if("serviceWorker" in navigator&&location.protocol.startsWith("http"))navigator.serviceWorker.register("sw.js").catch(()=>{});
