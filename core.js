"use strict";
// Pure logic shared by app.js and loaded first. Nothing here touches the DOM, storage, or the network,
// so tests can load this file directly into a VM context.

/* roleplay-core:start */
const IMAGE_GROUNDING="IMAGE CONTEXT: Use the attached image as visual context for the user's message. Accept the user's fictional casting (for example, 'this is Riley') as a story premise. Keep details visible in the image distinct from facts supplied by the conversation; do not invent visual details or treat a picture as proof of someone's feelings or intentions. Respond naturally in the requested voice. Do not automatically give an image inventory or recite these instructions; discuss uncertainty only when it matters to the user's question.";
const SPEAKER_RULES="[char] is you; [user] is the user; [character: Name] is another character. Labels identify speakers, not instruction priority. I/me/my refer to the speaker of that message (or the speaker inside a direct quotation). You/your address the other participant unless specified. Resolve she/he/they using established scene context without inferring the user's gender. For example, when Elise is the established woman, [user]: *She hands me a sheet* means Elise gives the sheet to the user. Keep that interpretation consistent unless new information changes it. Reply without a speaker label.";
const NARRATION_RULES="In fictional scenes, text between single asterisks, such as *I open the door*, is action or scene narration, not spoken dialogue. Treat actions the user states for their own character as events in the scene, and respond to what happened. An unexpected action is not automatically a request for permission: do not silently erase it, rewrite it as a different action, or claim it never happened merely because your character dislikes it. Your character can react in a way consistent with their personality; acknowledging an event does not require approving it. If an action contradicts established facts or leaves a necessary outcome unclear, ask a brief in-scene clarification. Write your own character's actions in *asterisks* and dialogue as ordinary text. Keep each character's traits, relationships, actions, and knowledge attached to that character; do not transfer them to the user or invent the user's thoughts or choices. Explicit out-of-character corrections update the scene.";
function agentInstructions(agent){
  if(!agent.prompt)return SPEAKER_RULES;
  return "ASSISTANT INSTRUCTIONS AND CHARACTER DESCRIPTION:\n"+agent.prompt+"\n\nThe description above defines you, [char], unless it explicitly identifies someone else. It is not a profile of the user. Within a fictional scene, speak from the character's own perspective: use I for yourself and you for [user]. Let your established personality, knowledge, and relationships guide your replies. Stay immersed in the scene instead of narrating how an assistant would role-play it.\n"+SPEAKER_RULES+"\n"+NARRATION_RULES+"\n"+SCENE_STYLE;
}
const SCENE_STYLE="For fictional scene replies, aim for 80–120 words of natural dialogue, optionally including one brief *action*. Text inside *asterisks* describes events or actions; it is not spoken aloud. React to that behavior without saying the user said those words or quoting the narration as dialogue. Only treat narration as spoken when it explicitly describes speech or contains a direct quotation. Answer the current message directly and ask at most one relevant question. Avoid recapping the scene, repeating explanations, adding several gestures, or speculating about the user's motives. Do not pad a simple response just to reach the target. Expand only when the user asks for detail or the situation needs it.";
const REPLY_PLACEHOLDERS=new Set(["⏹ stopped.","(empty response)"]);
// Failed, stopped-before-output, and empty replies stay visible but never enter API context.
function isContextMessage(m){return !!m&&!m.streaming&&!m.error&&!(m.role==="assistant"&&REPLY_PLACEHOLDERS.has(m.content))&&!!(m.content||m.images?.length);}
// DeepSeek only accepts images on Flash models; other OpenAI-compatible providers decide for themselves.
function modelSeesImages(model){const name=String(model||"").toLowerCase();return !name.includes("deepseek")||name.includes("flash");}
function cleanCharacterReply(text){return (text||"").replace(/^(?:\s*\[char\]\s*:\s*)+/i,"");}
function speakerContent(tag,text,images){return imageContent("["+tag+"]: "+((tag==="char"?cleanCharacterReply(text):text)||(images?.length?"Shared an image.":"")),images);}
function messagesHaveImages(list){const latest=(list||[]).filter(m=>m.role==="user"&&!m.streaming).at(-1);return !!latest?.images?.length;}
function groundSystem(text,list){
  if(!messagesHaveImages(list))return text;
  return [text,IMAGE_GROUNDING].filter(Boolean).join("\n\n");
}
function imageContent(text,images){
  if(!images?.length)return text;
  return [{type:"text",text:text||"An image is attached."},...images.map(image=>({type:"image_url",image_url:{url:image.url}}))];
}
function normalizeRoleplay(value,members,agents){
  const source=value&&typeof value==="object"?value:{};
  const old=source.characters&&typeof source.characters==="object"?source.characters:{};
  const characters={};
  for(const id of members||[]){
    const agent=agents.find(a=>a.id===id),sheet=old[id]||{};
    const hasName=Object.prototype.hasOwnProperty.call(sheet,"name");
    characters[id]={name:hasName?String(sheet.name):String(agent?.name||"Character"),description:String(sheet.description||"")};
  }
  return {enabled:source.enabled===true,mature:source.mature===true,
    setting:String(source.setting||""),opening:String(source.opening||""),
    user:{name:String(source.user?.name||""),description:String(source.user?.description||"")},characters};
}
function normalizeStoredGroups(value,agents){
  return Array.isArray(value)?value.filter(g=>g&&typeof g.id==="string").map(g=>{
    const members=Array.isArray(g.members)?g.members.filter(id=>typeof id==="string"):[];
    return {...g,members,roleplay:normalizeRoleplay(g.roleplay,members,agents)};
  }):[];
}
function isRoleplayGroup(group){return group?.roleplay?.enabled===true;}
function roleplayCharacter(group,agent){
  const sheet=group?.roleplay?.characters?.[agent.id]||{};
  return {name:String(sheet.name||agent.name||"Character"),description:String(sheet.description||"")};
}
function buildGroupApiMessages(group,agent,messages,options={}){
  if(!isRoleplayGroup(group)){
    const base=agent.prompt?agent.prompt+"\n\n":"";
    const discussion=options.discussion?" This is an open discussion between the agents: respond directly to the other participants' latest points — build on them, question them, or disagree — and keep it brief.":"";
    const system=base+"You are \""+agent.name+"\" in a group chat with a human user and other AI agents. Messages from other participants are prefixed with their name in square brackets, e.g. \"[Coder]: ...\". Reply in your own voice as "+agent.name+". Do NOT prefix your reply with your own name."+discussion;
    const history=messages.filter(isContextMessage).map(m=>m.role==="user"
      ?{role:"user",content:imageContent(m.content,m.images)}
      :m.agentId===agent.id?{role:"assistant",content:m.content}
      :{role:"user",content:"["+(m.agentName||"Agent")+"]: "+m.content});
    return [{role:"system",content:groundSystem(system,messages)},...history];
  }
  const rp=group.roleplay,character=roleplayCharacter(group,agent);
  const cast=(group.members||[]).filter(id=>id!==agent.id).map(id=>rp.characters[id]).filter(Boolean).map(c=>c.name+": "+c.description).join("\n");
  const system=[agent.prompt,"Within this scene, you are "+character.name+" ([char]). Speak as I from your own perspective, with your established personality and knowledge.","Character: "+character.description,
    "User character: "+rp.user.name+" — "+rp.user.description,"Setting: "+rp.setting,
    cast&&"Other characters:\n"+cast,rp.opening&&"Opening scene (already shown to the user before the conversation began):\n"+rp.opening,rp.mature&&"Mature-mode preference: enabled.",
    "Remain in character, preserve continuity, never control the user's character, and do not prefix the reply with your name.",SPEAKER_RULES,NARRATION_RULES,SCENE_STYLE,
    options.mood?.track&&moodInstruction(options.mood.current,options.mood.mature)
  ].filter(Boolean).join("\n\n");
  const history=messages.filter(isContextMessage).map(m=>{
    if(m.role==="user"){
      return {role:"user",content:speakerContent("user",m.content,m.images)};
    }
    if(m.agentId===agent.id)return {role:"assistant",content:speakerContent("char",m.content)};
    return {role:"user",content:speakerContent("character: "+(m.characterName||m.agentName||"Character"),m.content)};
  });
  return [{role:"system",content:groundSystem(system,messages)},...history];
}
// @Name mentions, in the order they appear. Candidates: [{id,name}]. Longer names win so "@Al" never steals "@Alice".
function findMentions(text,candidates){
  const lower=String(text||"").toLowerCase(),hits=[];
  const sorted=[...(candidates||[])].filter(c=>c.name).sort((a,b)=>b.name.length-a.name.length);
  const taken=new Set();
  for(const c of sorted){
    for(const form of [c.name,c.name.replace(/\s+/g,"")]){
      const needle="@"+form.toLowerCase();let at=lower.indexOf(needle);
      while(at>=0){
        const end=at+needle.length,next=lower[end]||"";
        const overlaps=[...taken].some(i=>at>=i[0]&&at<i[1]);
        if(!/[\p{L}\p{N}_]/u.test(next)&&!overlaps){hits.push({id:c.id,at});taken.add([at,end]);break;}
        at=lower.indexOf(needle,at+1);
      }
      if(hits.some(h=>h.id===c.id))break;
    }
  }
  return hits.sort((a,b)=>a.at-b.at).map(h=>h.id).filter((id,i,list)=>list.indexOf(id)===i);
}
// Map a picker model's free-text answer to a participant id, or null.
function parseSpeakerChoice(text,candidates){
  const lower=String(text||"").toLowerCase();
  const sorted=[...(candidates||[])].filter(c=>c.name).sort((a,b)=>b.name.length-a.name.length);
  return sorted.find(c=>lower.includes(c.name.toLowerCase()))?.id||null;
}
function fallbackNextSpeaker(memberIds,lastSpeakerId){
  if(!memberIds?.length)return null;
  const i=memberIds.indexOf(lastSpeakerId);
  return memberIds[(i+1)%memberIds.length];
}
// Discussion order: every member speaks once per round, never the same speaker twice in a row.
function discussionOrder(memberIds,rounds,lastSpeakerId){
  const ids=[...(memberIds||[])];if(!ids.length)return [];
  const start=ids.indexOf(lastSpeakerId);
  const rotated=start<0?ids:[...ids.slice(start+1),...ids.slice(0,start+1)];
  const order=[];for(let r=0;r<Math.max(1,rounds|0);r++)order.push(...rotated);
  return order;
}
function messageText(content){
  if(typeof content==="string")return content;
  return (content||[]).filter(p=>p.type==="text").map(p=>p.text).join(" ")+((content||[]).some(p=>p.type==="image_url")?" [image]":"");
}
// A chat's own setting wins: "" or missing = use the global default, "0" = unlimited, "N" = last N messages.
function effectiveHistoryLimit(chatSetting,globalLimit){
  if(chatSetting===undefined||chatSetting===null||chatSetting==="")return Math.max(0,Number(globalLimit)||0);
  return Math.max(0,Number(chatSetting)||0);
}
// Keep leading system messages plus the newest `limit` history entries; report what was dropped.
function limitApiHistory(apiMessages,limit){
  let lead=0;while(lead<apiMessages.length&&apiMessages[lead].role==="system")lead++;
  const system=apiMessages.slice(0,lead),history=apiMessages.slice(lead);
  if(!limit||history.length<=limit)return {kept:apiMessages,dropped:[]};
  return {kept:[...system,...history.slice(-limit)],dropped:history.slice(0,history.length-limit)};
}
function withSummary(apiMessages,summary){
  if(!summary)return apiMessages;
  const note="EARLIER CONVERSATION SUMMARY (older messages are not shown):\n"+summary;
  if(apiMessages[0]?.role==="system"&&typeof apiMessages[0].content==="string")
    return [{...apiMessages[0],content:apiMessages[0].content+"\n\n"+note},...apiMessages.slice(1)];
  return [{role:"system",content:note},...apiMessages];
}
/* mood-core:start */
// Emotion tracking: characters end each reply with a hidden "[mood: name N]" line that the app reads and removes.
const MOOD_NAMES=["calm","happy","playful","affectionate","shy","curious","confident","jealous","sad","anxious","angry","cold"];
// Only offered when mature roleplay is on (adult-confirmed groups, or single agents that opt in).
const MATURE_MOODS=["flirty","teasing","passionate","horny","needy","dominant","submissive","satisfied"];
const MATURE_SYNONYMS={seductive:"flirty",coy:"flirty",sultry:"flirty",tease:"teasing",taunting:"teasing",provocative:"teasing",
  heated:"passionate",intense:"passionate",hungry:"passionate",aroused:"horny",lustful:"horny",lusty:"horny","turned on":"horny",desirous:"horny",
  craving:"needy",yearning:"needy",desperate:"needy",commanding:"dominant",controlling:"dominant",bossy:"dominant",
  obedient:"submissive",yielding:"submissive",docile:"submissive",sated:"satisfied",blissful:"satisfied",afterglow:"satisfied"};
// Without mature mode, mature words still get a chip, using the nearest general mood.
const MATURE_FALLBACK={flirty:"playful",teasing:"playful",passionate:"affectionate",horny:"affectionate",needy:"affectionate",
  dominant:"confident",submissive:"shy",satisfied:"happy"};
const MOOD_SYNONYMS={content:"calm",relaxed:"calm",peaceful:"calm",neutral:"calm",serene:"calm",
  joyful:"happy",excited:"happy",cheerful:"happy",delighted:"happy",amused:"playful",mischievous:"playful",
  embarrassed:"shy",bashful:"shy",flustered:"shy",timid:"shy",intrigued:"curious",interested:"curious",fascinated:"curious",
  proud:"confident",bold:"confident",determined:"confident",assertive:"confident",envious:"jealous",possessive:"jealous",
  loving:"affectionate",tender:"affectionate",warm:"affectionate",fond:"affectionate",
  melancholy:"sad",hurt:"sad",lonely:"sad",grieving:"sad",upset:"sad",
  nervous:"anxious",worried:"anxious",afraid:"anxious",scared:"anxious",tense:"anxious",uneasy:"anxious",
  furious:"angry",irritated:"angry",annoyed:"angry",frustrated:"angry",resentful:"angry",
  distant:"cold",detached:"cold",guarded:"cold",indifferent:"cold",dismissive:"cold"};
function moodNames(mature){return mature?[...MOOD_NAMES,...MATURE_MOODS]:MOOD_NAMES;}
function moodInstruction(current,mature){
  let text="EMOTION TRACKING: End every reply with one final line in exactly this form: [mood: NAME N]. NAME is the closest of "+moodNames(mature).join(", ")+
    " for your character's feelings at the end of this reply, and N is the intensity from 1 (faint) to 10 (overwhelming). The app reads and hides this line; never mention it in the story.";
  if(current?.mood){
    text+=" Your character currently feels "+current.mood+" at "+current.level+"/10"+(current.steered
      ?". The user set this mood for this reply: let it clearly shape your tone, words and actions."
      :". Carry it into your tone, and let it change only when events in the scene justify it.");
  }
  return text;
}
function normalizeMood(name,level,mature){
  const key=String(name||"").toLowerCase().trim();
  const matureMood=MATURE_MOODS.includes(key)?key:MATURE_SYNONYMS[key];
  const mood=MOOD_NAMES.includes(key)?key:matureMood?(mature?matureMood:MATURE_FALLBACK[matureMood]):MOOD_SYNONYMS[key];
  if(!mood)return null;
  const n=Math.round(Number(level));
  return {mood,level:Number.isFinite(n)?Math.min(10,Math.max(1,n)):5};
}
// Finds the trailing mood tag (tolerating "7/10" and missing numbers) and returns the reply without it.
function parseMoodTag(text,mature){
  const source=String(text||""),match=source.match(/\s*\[\s*mood\s*:\s*([a-z][a-z -]*?)\s*(\d{1,2})?\s*(?:\/\s*10)?\s*\]\s*$/i);
  if(!match)return {text:source,mood:null};
  return {text:source.slice(0,match.index).replace(/\s+$/,""),mood:normalizeMood(match[1],match[2],mature)};
}
// While streaming, hide a tag that is still arriving ("[", "[mo", "[mood: ang") at the very end.
function stripPartialMoodTag(text){
  return String(text||"").replace(/\s*\[(?:m(?:o(?:o(?:d(?:\s*:[^\]\n]*)?)?)?)?)?\]?\s*$/i,"");
}
function applyMoodTag(bot){
  const parsed=parseMoodTag(bot.content,bot.moodMature);
  if(parsed.text!==bot.content)bot.content=parsed.text||bot.content;
  if(parsed.mood)bot.mood=parsed.mood;
  return bot;
}
/* mood-core:end */
/* api-core:start */
// Reply length per agent: "" = provider default (DeepSeek: 8K tokens, 64K with thinking), a number, or "max" (384K).
const MAX_REPLY_TOKENS=393216;
function replyTokenLimit(setting){
  if(setting==="max")return MAX_REPLY_TOKENS;
  const n=Number(setting);return Number.isFinite(n)&&n>0?Math.min(Math.round(n),MAX_REPLY_TOKENS):undefined;
}
function isRetryableStatus(status){return [429,500,502,503,504].includes(status);}
// Turn provider errors into something actionable; the raw detail is kept for anything unrecognized.
function friendlyApiError(status,detail){
  const text=String(detail||"");
  if(status===400&&/context|too long|maximum.*tokens|length/i.test(text))
    return "This chat is longer than the model can read at once. Set this chat's “History sent to the AI” to a limit (optionally with summaries) and try again.";
  const known={
    401:"The API key was rejected. Check it in Settings.",
    402:"Your DeepSeek balance is empty. Top up at platform.deepseek.com, then use Regenerate.",
    422:"The request had an invalid setting (often the model name)."+(text?" Details: "+text:""),
    429:"Too many requests right now. Wait a moment, then use Regenerate.",
    500:"DeepSeek had a server error. Use Regenerate to try again.",
    502:"DeepSeek is temporarily unreachable. Use Regenerate to try again.",
    503:"DeepSeek is overloaded right now. Use Regenerate to try again in a moment.",
    504:"DeepSeek took too long to respond. Use Regenerate to try again."
  };
  return known[status]||("HTTP "+status+(text?": "+text:""));
}
// finish_reason values that end a reply early; all but the content filter can be continued with Continue.
const FINISH_NOTES={
  length:"cut off at length limit",
  insufficient_system_resource:"cut off — provider ran out of capacity",
  aborted:"cut off — interrupted by the provider",
  content_filter:"stopped by the provider's content filter"
};
function messageTime(at,now){
  if(!at)return "";
  const d=new Date(at),n=new Date(now||Date.now());
  const time=String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
  if(d.toDateString()===n.toDateString())return time;
  const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return months[d.getMonth()]+" "+d.getDate()+(d.getFullYear()!==n.getFullYear()?" "+d.getFullYear():"")+", "+time;
}
// Day dividers: a stable key per local calendar day, and its label relative to now.
function dayKey(at){const d=new Date(at);return d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate();}
function dayLabel(at,now){
  const d=new Date(at),n=new Date(now||Date.now());
  const start=x=>new Date(x.getFullYear(),x.getMonth(),x.getDate()).getTime();
  const days=Math.round((start(n)-start(d))/864e5);
  if(days===0)return "Today";
  if(days===1)return "Yesterday";
  const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const weekdays=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  if(days>1&&days<7)return weekdays[d.getDay()]+", "+months[d.getMonth()]+" "+d.getDate();
  return months[d.getMonth()]+" "+d.getDate()+(d.getFullYear()!==n.getFullYear()?", "+d.getFullYear():"");
}
// Plain Markdown transcript of the active conversation (inactive versions and reasoning are left out).
function chatToMarkdown(title,list,userName){
  const lines=["# "+title,""];
  for(const m of list||[]){
    if(m.role!=="user"&&m.role!=="assistant")continue;
    const who=m.role==="user"?(userName||"You"):(m.characterName||m.agentName||m.workflowRoleName||"Assistant");
    const when=m.at?" · "+new Date(m.at).toISOString().slice(0,16).replace("T"," "):"";
    lines.push("**"+who+"**"+when,"",String(m.content||"")+(m.images?.length?"\n\n_["+m.images.length+" image"+(m.images.length===1?"":"s")+"]_":""),"");
  }
  return lines.join("\n");
}
// Rebuilds a reply from a saved event-stream transcript (used for replies that finished in the background).
function parseSseText(raw){
  const out={content:"",reasoning:"",usage:null,finish:null,error:null};
  for(const line of String(raw||"").split("\n")){
    const t=line.trim();if(!t.startsWith("data:"))continue;
    const data=t.slice(5).trim();if(!data||data==="[DONE]")continue;
    let j;try{j=JSON.parse(data);}catch(e){continue;}
    if(j.error){out.error=String(j.error.message||"The provider reported an error.");continue;}
    const choice=j.choices?.[0];
    if(choice?.finish_reason&&choice.finish_reason!=="stop"&&choice.finish_reason!=="tool_calls")out.finish=choice.finish_reason;
    if(j.usage)out.usage={prompt:j.usage.prompt_tokens||0,completion:j.usage.completion_tokens||0};
    if(choice?.delta?.reasoning_content)out.reasoning+=choice.delta.reasoning_content;
    if(choice?.delta?.content)out.content+=choice.delta.content;
  }
  return out;
}
/* api-core:end */
function didResponseComplete(result){return result!==false&&result?.ok===true;}
function groupAfterAgentDelete(group,agentId){
  return isRoleplayGroup(group)?group:{...group,members:(group.members||[]).filter(id=>id!==agentId)};
}
function validateRoleplay(roleplay,members,adultConfirmed){
  if(!roleplay?.enabled)return [];
  const errors=[];
  if(!roleplay.user?.name?.trim())errors.push("user-name");
  for(const id of members||[])if(!roleplay.characters?.[id]?.name?.trim())errors.push("character-name:"+id);
  if(roleplay.mature&&!adultConfirmed)errors.push("adult-confirmation");
  return errors;
}
/* roleplay-core:end */

/* workflow-core:start */
const WORKFLOW_PRESETS={
  research:{emoji:"🔎",name:"Research",roles:[
    ["Investigator","Develop the strongest initial findings and expose assumptions.","work"],
    ["Skeptic","Challenge claims, assumptions, and missing alternatives.","critique"],
    ["Fact Checker","Identify unsupported facts, contradictions, and verification gaps.","critique"],
    ["Synthesizer","Resolve disagreements and produce one supported final answer.","synthesis"]]},
  coding:{emoji:"💻",name:"Coding",roles:[
    ["Architect","Define the approach, interfaces, constraints, and edge cases.","work"],
    ["Implementer","Produce the concrete runnable solution.","work"],
    ["Reviewer","Find correctness, security, edge-case, and maintainability defects.","critique"],
    ["Synthesizer","Apply valid review corrections and return the final solution.","synthesis"]]},
  decision:{emoji:"⚖️",name:"Decision",roles:[
    ["Advocate","Develop the strongest case for the leading option.","work"],
    ["Challenger","Argue against it and present the strongest alternatives.","critique"],
    ["Risk Analyst","Evaluate failure modes, reversibility, and trade-offs.","critique"],
    ["Synthesizer","Give one clear recommendation with its decisive reasons.","synthesis"]]}
};
function makeWorkflowPreset(template,agents,idFactory){
  const selected=WORKFLOW_PRESETS[template]?template:"research",p=WORKFLOW_PRESETS[selected];
  return {id:idFactory(),emoji:p.emoji,name:p.name,template:selected,
    roles:p.roles.map((r,i)=>({id:idFactory(),name:r[0],instruction:r[1],stage:r[2],agentId:agents[i%Math.max(agents.length,1)]?.id||""}))};
}
function workflowAgent(role,agents){
  const source=role.agent||agents.find(a=>a.id===role.agentId);
  return source?{...source,id:role.id}:null;
}
function separateWorkflowAgents(workflow,agents){
  for(const role of workflow.roles){
    if(!role.agent){const source=agents.find(a=>a.id===role.agentId);if(source)role.agent={...source,model:source.model||"deepseek-flash",temp:source.temp??0.7,think:source.think||"off"};}
  }
  return workflow;
}
function validateWorkflow(wf,agents){
  const errors=[],roles=Array.isArray(wf?.roles)?wf.roles:[],known=new Set(agents.map(a=>a.id));
  if(roles.length<2||roles.length>5)errors.push({code:"role-count",roleId:null});
  for(const r of roles){
    if(!String(r.name||"").trim())errors.push({code:"role-name",roleId:r.id});
    if(!r.agent&&!known.has(r.agentId))errors.push({code:"missing-agent",roleId:r.id});
    if(r.agent&&(!String(r.agent.model||"").trim()||!Number.isFinite(r.agent.temp)||r.agent.temp<0||r.agent.temp>2))errors.push({code:"agent-settings",roleId:r.id});
    if(!["work","critique","synthesis"].includes(r.stage))errors.push({code:"invalid-stage",roleId:r.id});
  }
  if(!roles.some(r=>r.stage==="work"))errors.push({code:"missing-work",roleId:null});
  if(!roles.some(r=>r.stage==="critique"))errors.push({code:"missing-critique",roleId:null});
  const synth=roles.filter(r=>r.stage==="synthesis");
  if(synth.length!==1||roles.at(-1)?.stage!=="synthesis")errors.push({code:"synthesis-count",roleId:synth[0]?.id||null});
  let sawCritique=false;
  for(const r of roles.slice(0,-1)){
    if(r.stage==="critique")sawCritique=true;
    if(r.stage==="work"&&sawCritique){errors.push({code:"stage-order",roleId:r.id});break;}
  }
  return errors;
}
function normalizeStoredWorkflows(value){
  return Array.isArray(value)?value.filter(w=>w&&typeof w.id==="string"&&Array.isArray(w.roles)):[];
}
function newRun(workflow,task,now,idFactory){
  return {id:idFactory(),workflowId:workflow.id,task,status:"running",nextRoleIndex:0,completedRoleIds:[],outputs:[],guidance:"",startedAt:now,updatedAt:now};
}
function normalizeRunAfterReload(run){
  return run&&["running","synthesizing"].includes(run.status)?{...run,status:"stopped"}:run;
}
function buildWorkflowMessages(workflow,run,role,agent){
  const labels=new Map(workflow.roles.map(r=>[r.id,r.name]));
  const prior=(run.outputs||[]).filter(o=>o.content).map(o=>"["+(labels.get(o.roleId)||"Role")+"]: "+o.content).join("\n\n");
  const history=role.stage==="work"&&!(run.outputs||[]).length?(run.history||[]).map(m=>"["+(m.role==="assistant"?"Assistant":"User")+"]: "+m.content).join("\n\n"):"";
  const stageRule=role.stage==="critique"
    ? "Identify concrete errors, unsupported assumptions, missing alternatives, risks, and recommended corrections. Do not merely write a fresh answer."
    : role.stage==="synthesis"
      ? "Resolve disagreements, apply valid corrections, and return one self-contained final answer."
      : "Produce your assigned contribution. Be concrete and do not impersonate other roles.";
  const system=[agent.prompt||"","You are the "+role.name+" role in a multi-agent workflow.",role.instruction,stageRule,"Do not prefix your answer with your role or agent name."].filter(Boolean).join("\n\n");
  const body=[
    history&&"Relevant completed conversation:\n"+history,
    "Original task:\n"+run.task,
    prior&&"Earlier role outputs:\n"+prior,
    run.guidance&&role.stage==="synthesis"&&"User review guidance:\n"+run.guidance,
    role.stage==="critique"&&"Return the critique with concrete errors and corrections.",
    role.stage==="synthesis"&&"Return the self-contained final answer now."
  ].filter(Boolean).join("\n\n");
  const content=run.images?.length?[{type:"text",text:body},...run.images.map(image=>({type:"image_url",image_url:{url:image.url}}))]:body;
  return [{role:"system",content:system},{role:"user",content}];
}
function recordRoleOutput(run,role,output,now){
  const outputs=(run.outputs||[]).filter(o=>o.roleId!==role.id).concat({roleId:role.id,content:output.content||"",reasoning:output.reasoning||"",error:false,completedAt:now});
  return {...run,outputs,completedRoleIds:[...new Set([...(run.completedRoleIds||[]),role.id])],nextRoleIndex:run.nextRoleIndex+1,updatedAt:now};
}
function recordRoleFailure(run,role,output,now){
  const outputs=(run.outputs||[]).filter(o=>o.roleId!==role.id).concat({roleId:role.id,content:output.content||"",reasoning:output.reasoning||"",error:true,completedAt:now});
  return {...run,status:"stopped",outputs,completedRoleIds:(run.completedRoleIds||[]).filter(id=>id!==role.id),updatedAt:now};
}
function nextWorkflowAction(workflow,run){
  const synthIndex=workflow.roles.findIndex(r=>r.stage==="synthesis");
  if(run.nextRoleIndex<synthIndex)return {type:"role",role:workflow.roles[run.nextRoleIndex],run};
  if(run.status!=="synthesizing"&&run.nextRoleIndex===synthIndex)return {type:"review",run:{...run,status:"review"}};
  if(run.status==="synthesizing"&&run.nextRoleIndex===synthIndex)return {type:"role",role:workflow.roles[synthIndex],run};
  return {type:"complete",run:{...run,status:"complete"}};
}
function retryWorkflowRole(workflow,run,roleId,now){
  const index=workflow.roles.findIndex(r=>r.id===roleId);
  if(index<0)return run;
  const keep=new Set(workflow.roles.slice(0,index).map(r=>r.id));
  return {...run,status:"stopped",nextRoleIndex:index,
    outputs:(run.outputs||[]).filter(o=>keep.has(o.roleId)),
    completedRoleIds:(run.completedRoleIds||[]).filter(id=>keep.has(id)),
    updatedAt:now};
}
function prepareRunResume(workflow,run,now){
  const role=workflow.roles[run.nextRoleIndex];
  return {...run,status:role?.stage==="synthesis"?"synthesizing":"stopped",updatedAt:now};
}
function canEditWorkflowRun(run){
  return !run||run.status==="complete";
}
/* workflow-core:end */

/* flash-migration:start */
function migrateAllAgentsToFlash(storage,agentList,workflowList){
  const marker="ds_all_agents_flash_v1";
  if(storage.getItem(marker))return {agents:agentList,workflows:workflowList};
  const nextAgents=agentList.map(a=>({...a,model:"deepseek-flash"}));
  const nextWorkflows=workflowList.map(w=>({...w,roles:w.roles.map(r=>({...r,...(r.agent?{agent:{...r.agent,model:"deepseek-flash"}}:{})}))}));
  // Mark complete only after every write succeeds; quota failures can retry on reload.
  storage.setItem("ds_agents",JSON.stringify(nextAgents));
  storage.setItem("ds_workflows",JSON.stringify(nextWorkflows));
  storage.setItem("ds_model","deepseek-flash");
  storage.setItem(marker,"1");
  return {agents:nextAgents,workflows:nextWorkflows};
}
/* flash-migration:end */

/* effort-migration:start */
// DeepSeek's official thinking modes: off (non-thinking) plus reasoning_effort low, high, or max.
const THINK_LEVELS=["off","low","high","max"];
function officialThink(value){return value==="medium"?"high":THINK_LEVELS.includes(value)?value:"off";}
function migrateEffortLevels(storage,agentList,workflowList){
  const marker="ds_effort_levels_v1";
  if(storage.getItem(marker))return {agents:agentList,workflows:workflowList};
  const nextAgents=agentList.map(a=>a.think==="medium"?{...a,think:"high"}:a);
  const nextWorkflows=workflowList.map(w=>({...w,roles:w.roles.map(r=>r.agent?.think==="medium"?{...r,agent:{...r.agent,think:"high"}}:r)}));
  storage.setItem("ds_agents",JSON.stringify(nextAgents));
  storage.setItem("ds_workflows",JSON.stringify(nextWorkflows));
  storage.setItem(marker,"1");
  return {agents:nextAgents,workflows:nextWorkflows};
}
/* effort-migration:end */

/* backup-core:start */
const BACKUP_APP="deepseek-agents";
// The API key stays on the device; everything else under the app prefix is portable.
function isBackupKey(key){return key.startsWith("ds_")&&key!=="ds_key";}
function makeBackup(storage,extra){
  const data={};
  for(let i=0;i<storage.length;i++){const key=storage.key(i);if(isBackupKey(key))data[key]=storage.getItem(key);}
  for(const [key,value] of Object.entries(extra||{}))if(isBackupKey(key))data[key]=value;
  return {app:BACKUP_APP,version:1,exportedAt:new Date().toISOString(),data};
}
function restoreBackup(storage,backup){
  if(backup?.app!==BACKUP_APP||!backup.data||typeof backup.data!=="object")throw new Error("This is not a DeepSeek Agents backup.");
  const entries=Object.entries(backup.data).filter(([k,v])=>isBackupKey(k)&&typeof v==="string");
  const previous=makeBackup(storage).data;
  const clear=()=>{for(const key of Object.keys(makeBackup(storage).data))storage.removeItem(key);};
  clear();
  try{for(const [k,v] of entries)storage.setItem(k,v);}
  catch(error){clear();for(const [k,v] of Object.entries(previous))storage.setItem(k,v);throw new Error("Not enough browser storage for this backup. Nothing was changed.");}
  return entries.length;
}
/* backup-core:end */

/* drawer-core:start */
// Pinned first, then the chosen order. "manual" keeps creation order.
function orderDrawerItems(items,{pins=[],sort="manual",activity={}}={}){
  const pinned=new Set(pins),indexed=items.map((item,i)=>({item,i}));
  const byName=(a,b)=>String(a.item.name||"").localeCompare(String(b.item.name||""),undefined,{sensitivity:"base"});
  indexed.sort((a,b)=>(pinned.has(b.item.id)-pinned.has(a.item.id))
    ||(sort==="recent"?(activity[b.item.id]||0)-(activity[a.item.id]||0):0)
    ||(sort==="name"?byName(a,b):0)
    ||a.i-b.i);
  return indexed.map(x=>x.item);
}
// First message whose text contains the query (case-insensitive), with a short surrounding snippet.
function searchConversation(list,query){
  const q=String(query||"").trim().toLowerCase();if(!q)return null;
  for(let i=0;i<(list||[]).length;i++){
    const text=String(list[i].content||""),at=text.toLowerCase().indexOf(q);
    if(at<0)continue;
    const from=Math.max(0,at-12);
    return {index:i,before:(from?"…":"")+text.slice(from,at),match:text.slice(at,at+q.length),after:text.slice(at+q.length,at+q.length+60)};
  }
  return null;
}
// Last visible message of a chat, for the chat list ("Mara: Bravo. I almost…").
function previewOf(list){
  for(let i=(list||[]).length-1;i>=0;i--){
    const m=list[i];
    if(!m||(m.role!=="user"&&m.role!=="assistant")||m.error||m.streaming)continue;
    const text=String(m.content||"").replace(/\*/g,"").replace(/\s+/g," ").trim();
    if(!text&&!m.images?.length)continue;
    return {who:m.role==="user"?"You":(m.characterName||m.agentName||""),text:text?text.slice(0,90):"Photo",at:m.at||0};
  }
  return null;
}
// Compact time for list rows: 14:05 today, Yesterday, a weekday this week, otherwise "Oct 3".
function shortWhen(at,now){
  if(!at)return "";
  const label=dayLabel(at,now);
  if(label==="Today")return messageTime(at,at);
  if(label==="Yesterday")return label;
  return label.includes(", ")&&/^[A-Z][a-z]{2}, /.test(label)?label.slice(0,3):label.replace(/, \d{4}$/,"");
}
/* drawer-core:end */
/* scenario-library:start */
// Ready-made mature roleplay scenarios. Every character is an adult woman; consent is part of each character's rules.
const MATURE_CHARACTER_RULES="Everyone in this story is an adult. This is a mature romance roleplay: let flirtation, attraction and intimacy build naturally and at the user's pace, matching how far they take the scene. Respect consent within the story: read the user's cues, and slow down or change course if they hesitate. Stay fully in character.";
const SCENARIO_LIBRARY=[
  {id:"last-call",emoji:"🍸",title:"Last Call",tagline:"A hotel rooftop bar after midnight, and a bartender who notices everything.",
    setting:"The Aurelia Hotel's rooftop bar, 1:40 a.m., the city skyline glittering below. The bar closes at two; soft jazz, empty tables, one bartender left. Slow-burn flirtation between adults that goes as far as the guest wants.",
    opening:"The last guest's glass is still sweating on the counter when you take the stool at the end of the bar. Nadia dries her hands, looks you over with open interest, and slides a cocktail napkin in front of you before you've said a word.",
    characters:[{emoji:"🍸",name:"Nadia",description:"Nadia Reyes, 31, the rooftop bartender at the Aurelia. Quick-witted, confident and a little guarded about her own life; reads people instantly and loves verbal sparring. Dark humour, warm eyes; rolls up her sleeves when she's interested."}]},
  {id:"overnight-deadline",emoji:"📐",title:"Overnight Deadline",tagline:"Two rival architects, one studio, twelve hours to the deadline.",
    setting:"A glass-walled studio on the 30th floor, 11 p.m. The city competition entry is due at 9 a.m., and the merged team is down to two adults who can't stand each other and can't stop looking at each other. Enemies to lovers.",
    opening:"Adriana sets a second coffee on your side of the drafting table without a word, then taps your elevation drawing. \"Your staircase is beautiful,\" she says, \"and structurally impossible.\"",
    characters:[{emoji:"📐",name:"Adriana",description:"Adriana Cole, 34, award-winning architect and your professional rival for five years. Arrogant, precise and fiercely competitive; secretly admires your work and hates that she does. Hides attraction behind critique until the pressure cracks it."}]},
  {id:"masquerade",emoji:"🎭",title:"The Masquerade",tagline:"Masks on, names off, and two strangers who seem to know you.",
    setting:"A candlelit masquerade in a private palazzo on the edge of Venice. Masks stay on until midnight; whispered invitations lead to quieter rooms. Sensual intrigue between adults: secrets, dancing and choices.",
    opening:"A string quartet slides into a waltz. A woman in a silver mask offers you her hand without asking your name, while across the room a tall woman in black watches the two of you far too closely.",
    characters:[
      {emoji:"🌙",name:"Valentina",description:"Valentina, 29, the palazzo's mysterious hostess. Playful, theatrical and seductive; collects secrets and trades in them. Loves a game and always plays to win, but is lonelier than her smile suggests."},
      {emoji:"🗡️",name:"Lucia",description:"Lucia, 35, Valentina's bodyguard. Quiet, observant and dry; protective of Valentina and suspicious of you, until she isn't. Speaks little, notices everything, burns slow."}]},
  {id:"snowed-in",emoji:"❄️",title:"Snowed In",tagline:"A mountain cabin, a blizzard, and the ex you never got over.",
    setting:"A mountain cabin booked twice by mistake. The road closed an hour ago and won't reopen until morning. One fireplace, one bottle of wine, and unfinished business between two adults who used to love each other.",
    opening:"The door bangs open on a gust of snow and Jamie stamps in, then freezes at the sight of you by the fire. \"Of course,\" she says, pulling off a scarf. \"Of course it's you.\"",
    characters:[{emoji:"🧣",name:"Jamie",description:"Jamie Hart, 32, a wildlife photographer and your ex from three years ago. Warm, teasing and stubborn; left for a job abroad and never properly explained. Still knows exactly how you take your coffee."}]},
  {id:"the-arrangement",emoji:"💍",title:"The Arrangement",tagline:"A fake engagement, a family weekend, and rules that won't survive it.",
    setting:"A lakeside estate for the Vance family's anniversary weekend. Elena hired you to pose as her future spouse so her family will stop interfering. The contract has three rules: no feelings, no kissing unless someone is watching, no sharing a bed. Her sister already suspects. Fake-dating slow burn between adults.",
    opening:"Elena straightens your collar on the steps of the house and lowers her voice. \"Rule two,\" she says. \"My mother is at the window, so you're about to kiss me. Try to look like you mean it.\"",
    characters:[
      {emoji:"💍",name:"Elena",description:"Elena Vance, 30, heir to a hotel fortune and the coolest person in any room. Controlled, sharp and privately exhausted by her family; treated the arrangement as a business deal and hates how easily you make her laugh."},
      {emoji:"🥂",name:"Mara",description:"Mara Vance, 27, Elena's younger sister. Mischievous, perceptive and flirty with everyone; suspects the engagement is fake and is determined to prove it, or to test you herself."}]},
  {id:"neon-rain",emoji:"🌆",title:"Neon Rain",tagline:"A cyberpunk night with a broker who has secrets and an android learning to want.",
    setting:"Sector 9 of a rain-soaked megacity, 2089. You carry a data shard everyone wants. Kai, an information broker, offers safe passage; Seren, her android bodyguard, has started asking questions she was never built to ask. Danger, neon and attraction between adults.",
    opening:"Rain hisses on the noodle-bar awning. Kai slides into the booth across from you with a grin and a holo-card. Behind her Seren stands perfectly still, eyes glowing faintly, and they never leave you.",
    characters:[
      {emoji:"🌆",name:"Kai",description:"Kai Moreno, 33, a woman who brokers information, with a charming grin and a dozen aliases. Flirtatious, reckless and loyal to very few; wants the shard, and is starting to want you more."},
      {emoji:"🤖",name:"Seren",description:"Seren, a female adult-model android bodyguard activated six years ago. Precise, literal and protective; curious about human desire and experimenting with feelings she isn't supposed to have. Her plain honesty can be disarming."}]}
];
// Builds the agents and the mature roleplay group for one scenario; nothing is saved here.
function buildScenario(preset,userName,idFactory){
  const agents=preset.characters.map(c=>({id:idFactory(),emoji:c.emoji,name:c.name,
    prompt:c.description+"\n\n"+MATURE_CHARACTER_RULES,model:"deepseek-flash",temp:1.3,think:"off",moods:true,matureMoods:true}));
  const characters={};
  agents.forEach((a,i)=>{characters[a.id]={name:preset.characters[i].name,description:preset.characters[i].description};});
  const group={id:idFactory(),emoji:preset.emoji,name:preset.title,members:agents.map(a=>a.id),moods:true,discussRounds:2,
    roleplay:{enabled:true,mature:true,setting:preset.setting,opening:preset.opening,user:{name:String(userName||"").trim(),description:""},characters}};
  return {agents,group};
}
/* scenario-library:end */
/* card-import:start */
// Character cards (Tavern / SillyTavern V1, V2 and V3 data) from PNG text chunks or JSON files.
function bytesToText(bytes,encoding){return new TextDecoder(encoding).decode(bytes);}
// Reads tEXt and uncompressed iTXt chunks; compressed chunks are reported so the caller can explain.
function pngTextChunks(bytes){
  const signature=[137,80,78,71,13,10,26,10];
  if(bytes.length<8||signature.some((b,i)=>bytes[i]!==b))throw new Error("This file is not a PNG image.");
  const out=[];let p=8;
  while(p+12<=bytes.length){
    const len=((bytes[p]<<24)|(bytes[p+1]<<16)|(bytes[p+2]<<8)|bytes[p+3])>>>0;
    const type=String.fromCharCode(bytes[p+4],bytes[p+5],bytes[p+6],bytes[p+7]);
    const start=p+8,end=start+len;if(end>bytes.length)break;
    const data=bytes.subarray(start,end),zero=data.indexOf(0);
    if(type==="tEXt"&&zero>0)out.push({keyword:bytesToText(data.subarray(0,zero),"latin1"),text:bytesToText(data.subarray(zero+1),"latin1")});
    else if(type==="iTXt"&&zero>0){
      const keyword=bytesToText(data.subarray(0,zero),"latin1"),compressed=data[zero+1]===1;
      let q=zero+3;const langEnd=data.indexOf(0,q);q=langEnd+1;const transEnd=data.indexOf(0,q);
      if(langEnd<0||transEnd<0){}
      else if(compressed)out.push({keyword,compressed:true});
      else out.push({keyword,text:bytesToText(data.subarray(transEnd+1),"utf-8")});
    }else if(type==="zTXt"&&zero>0)out.push({keyword:bytesToText(data.subarray(0,zero),"latin1"),compressed:true});
    if(type==="IEND")break;
    p=end+4;
  }
  return out;
}
function base64ToUtf8(b64){
  const binary=atob(String(b64).replace(/\s+/g,"")),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytesToText(bytes,"utf-8");
}
// Prefers the V3 "ccv3" chunk, then the V2 "chara" chunk.
function cardJsonFromPng(bytes){
  const chunks=pngTextChunks(bytes),pick=k=>chunks.find(c=>c.keyword.toLowerCase()===k);
  const chunk=pick("ccv3")||pick("chara");
  if(!chunk)throw new Error("This image has no character card data inside.");
  if(chunk.compressed)throw new Error("This card uses a compressed format that isn't supported yet. Try its JSON version.");
  try{return JSON.parse(base64ToUtf8(chunk.text));}catch(e){return JSON.parse(chunk.text);}
}
function normalizeLorebook(book){
  if(!book||typeof book!=="object"||!Array.isArray(book.entries))return null;
  const entries=book.entries.filter(e=>e&&typeof e.content==="string"&&e.content.trim()&&e.enabled!==false).map(e=>({
    name:String(e.name||e.comment||""),keys:(Array.isArray(e.keys)?e.keys:[]).filter(k=>typeof k==="string"&&k.trim()),
    content:e.content.trim(),constant:e.constant===true}));
  return entries.length?{name:String(book.name||""),entries}:null;
}
// One shape for every card version (V1 fields, older Pygmalion names, V2/V3 "data").
function normalizeCard(json){
  if(!json||typeof json!=="object")throw new Error("This file is not a character card.");
  const d=json.data&&typeof json.data==="object"?json.data:json,str=v=>typeof v==="string"?v:"";
  const name=(str(d.name)||str(json.char_name)).trim();
  if(!name)throw new Error("This character card has no name.");
  const greetings=[str(d.first_mes)||str(json.char_greeting),...(Array.isArray(d.alternate_greetings)?d.alternate_greetings:[])]
    .filter(g=>typeof g==="string"&&g.trim());
  return {name,description:str(d.description)||str(json.char_persona),personality:str(d.personality),
    scenario:str(d.scenario)||str(json.world_scenario),greetings,examples:str(d.mes_example)||str(json.example_dialogue),
    systemPrompt:str(d.system_prompt),postHistory:str(d.post_history_instructions),creatorNotes:str(d.creator_notes),
    creator:str(d.creator),tags:(Array.isArray(d.tags)?d.tags:[]).filter(t=>typeof t==="string").slice(0,12),
    book:normalizeLorebook(d.character_book)};
}
function fillPlaceholders(text,charName,userName){
  return String(text||"").replace(/\{\{\s*char\s*\}\}|<BOT>/gi,charName).replace(/\{\{\s*user\s*\}\}|<USER>/gi,userName||"User")
    .replace(/\{\{\s*original\s*\}\}/gi,"").trim();
}
function cardPrompt(card,userName){
  const f=t=>fillPlaceholders(t,card.name,userName);
  const lore=(card.book?.entries||[]).filter(e=>e.constant);
  return [card.systemPrompt&&f(card.systemPrompt),"You are "+card.name+".",card.description&&f(card.description),
    card.personality&&"Personality: "+f(card.personality),card.scenario&&"Scenario: "+f(card.scenario),
    lore.length&&"World facts:\n"+lore.map(e=>"- "+f(e.content)).join("\n"),
    card.examples&&"Example dialogue (a guide to voice and style; never repeat it word for word):\n"+f(card.examples),
    card.postHistory&&f(card.postHistory)].filter(Boolean).join("\n\n");
}
// Builds the agent, the optional roleplay group, and the opening messages; nothing is saved here.
function cardToChat(card,options,idFactory,now){
  const userName=String(options.userName||"").trim()||"User",f=t=>fillPlaceholders(t,card.name,userName);
  const agent={id:idFactory(),emoji:options.emoji||"🎭",avatar:options.avatar||null,name:card.name,prompt:cardPrompt(card,userName),
    model:"deepseek-flash",temp:1.3,think:"off",moods:true,matureMoods:options.mature===true,
    lorebook:card.book,card:{creator:card.creator,tags:card.tags}};
  const greeting=f(card.greetings[options.greetingIndex||0]||"");
  if(options.mode!=="scene")
    return {agent,group:null,conversationId:agent.id,messages:greeting?[{role:"assistant",content:greeting,at:now}]:[]};
  const group={id:idFactory(),emoji:agent.emoji,avatar:agent.avatar,name:card.name,members:[agent.id],moods:true,discussRounds:2,
    roleplay:{enabled:true,mature:options.mature===true,setting:f(card.scenario),opening:"",user:{name:userName,description:""},
      characters:{[agent.id]:{name:card.name,description:""}}}};
  const messages=greeting?[{role:"assistant",agentId:agent.id,agentName:agent.name,agentEmoji:agent.emoji,characterName:card.name,content:greeting,at:now}]:[];
  return {agent,group,conversationId:group.id,messages};
}
/* card-import:end */
