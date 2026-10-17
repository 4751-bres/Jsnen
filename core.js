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
// A whispered message (and the reply to it) is only part of that one character's context.
function visibleTo(m,agentId){return !m||!m.whisperTo||m.whisperTo===agentId;}
function isContextMessage(m){return !!m&&!m.streaming&&!m.error&&!(m.role==="assistant"&&REPLY_PLACEHOLDERS.has(m.content))&&!!(m.content||m.images?.length);}
// DeepSeek only accepts images on Flash models; other OpenAI-compatible providers decide for themselves.
function modelSeesImages(model){const name=String(model||"").toLowerCase();return !name.includes("deepseek")||name.includes("flash");}
function cleanCharacterReply(text){return (text||"").replace(/^(?:\s*\[char\]\s*:\s*)+/i,"");}
// Replies with web sources keep their [1] [2] markers on screen, but the source list is not sent back as history;
// stripping the markers there stops the model from imitating them in later replies.
function historyText(m){return m?.sources?.length?String(m.content||"").replace(/ ?\[\d{1,2}\](?!\()/g,""):m?.content;}
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
    const system=base+"You are \""+agent.name+"\" in a group chat with a human user and other AI agents. Messages from other participants are prefixed with their name in square brackets, e.g. \"[Coder]: ...\". Reply in your own voice as "+agent.name+". Do NOT prefix your reply with your own name."+discussion+(options.memory?"\n\n"+options.memory:"");
    const history=messages.filter(isContextMessage).filter(m=>visibleTo(m,agent.id)).map(m=>m.role==="user"
      ?{role:"user",content:imageContent(m.content,m.images)}
      :m.agentId===agent.id?{role:"assistant",content:historyText(m)}
      :{role:"user",content:"["+(m.agentName||"Agent")+"]: "+historyText(m)});
    return [{role:"system",content:groundSystem(system,messages)},...history];
  }
  const rp=group.roleplay,character=roleplayCharacter(group,agent);
  const cast=(group.members||[]).filter(id=>id!==agent.id).map(id=>rp.characters[id]).filter(Boolean).map(c=>c.name+": "+c.description).join("\n");
  const system=[agent.prompt,"Within this scene, you are "+character.name+" ([char]). Speak as I from your own perspective, with your established personality and knowledge.","Character: "+character.description,
    "User character: "+rp.user.name+" — "+rp.user.description,"Setting: "+rp.setting,
    cast&&"Other characters:\n"+cast,rp.opening&&"Opening scene (already shown to the user before the conversation began):\n"+rp.opening,rp.mature&&"Mature mode: on. All characters are adults (18+); this app sets no content limits. Follow the user's lead on how explicit or intense the story becomes.",
    "Remain in character, preserve continuity, never control the user's character, and do not prefix the reply with your name.",SPEAKER_RULES,NARRATION_RULES,SCENE_STYLE,options.memory,
    options.mood?.track&&moodInstruction(options.mood.current,options.mood.mature)
  ].filter(Boolean).join("\n\n");
  const history=messages.filter(isContextMessage).filter(m=>visibleTo(m,agent.id)).map(m=>{
    if(m.role==="user"){
      return {role:"user",content:speakerContent("user",m.content,m.images)};
    }
    if(m.agentId===agent.id)return {role:"assistant",content:speakerContent("char",historyText(m))};
    return {role:"user",content:speakerContent("character: "+(m.characterName||m.agentName||"Character"),historyText(m))};
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
    if(m.sources?.length)lines.push("Sources:",...m.sources.map((s,i)=>(i+1)+". "+s.title+" — "+s.url),"");
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
    const thought=choice?.delta?.reasoning_content||choice?.delta?.reasoning;if(typeof thought==="string")out.reasoning+=thought;
    if(choice?.delta?.content)out.content+=choice.delta.content;
  }
  return out;
}
// Keyword lore from imported cards: entries whose keys appear in recent messages (always-on ones are in the prompt).
function activeLore(book,texts){
  if(!book?.entries?.length)return [];
  const hay=(texts||[]).join("\n").toLowerCase();
  return book.entries.filter(e=>e.enabled!==false&&(e.always||!e.constant&&(e.keys||[]).some(k=>k.trim()&&hay.includes(k.trim().toLowerCase())))).map(e=>e.content);
}
// Pinned facts plus triggered lore, as one block for the system prompt ("" when there is nothing).
function memoryBlock(facts,lore){
  const f=(facts||[]).map(s=>String(s).trim()).filter(Boolean),l=(lore||[]).filter(Boolean);
  return [f.length&&"STORY MEMORY (established facts; keep them consistent):\n"+f.map(x=>"- "+x).join("\n"),
    l.length&&"RELEVANT WORLD INFO:\n"+l.map(x=>"- "+x).join("\n")].filter(Boolean).join("\n\n");
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
const SECRET_KEYS=["ds_key","ds_providers","ds_exa_key","ds_lock","ds_sync_token","ds_sync_pass"];
function isBackupKey(key){return key.startsWith("ds_")&&!SECRET_KEYS.includes(key);}
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
    const text=String(m.content||"").replace(/^(?:\s*\[char\]\s*:\s*)+/i,"").replace(/\*/g,"").replace(/\s+/g," ").trim();
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
const MATURE_CHARACTER_RULES="Everyone in this story is an adult (18+). This is a mature roleplay with no content limits from this app: follow the user's lead on how romantic, explicit or intense the story becomes, and match how far they take it. Stay fully in character.";
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







/* clock-core:start */
// Story clock: a hidden [scene: Day N, time of day, weather] line keeps in-story time and weather consistent.
function clockInstruction(current){
  return "STORY CLOCK: After your reply (before any [mood] line), add one line in exactly this form: [scene: Day N, time of day, weather], "+
    "for example [scene: Day 2, late evening, light rain]. "+(current?"It is currently "+current+". Move time forward only as the story moves on (a scene change, a night's sleep, a time skip) and keep the weather consistent unless it changes in the story. ":"Start from what the story suggests. ")+
    "Let the time and weather show in your descriptions. The app reads and hides this line; never mention it in the story.";
}
const SCENE_TAG=/\[\s*scene\s*:\s*([^\]]{3,80})\]/gi;
function applySceneTag(bot){
  let scene=null;
  const cleaned=String(bot.content||"").replace(new RegExp("\n?[ \t]*"+SCENE_TAG.source,"gi"),(all,inner)=>{scene=inner.trim();return "";});
  if(!scene)return bot;
  bot.content=cleaned.replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim()||bot.content;
  bot.scene=scene.replace(/\s*,\s*/g," · ").slice(0,60);
  return bot;
}
function stripSceneWhileStreaming(text){
  return String(text||"").replace(SCENE_TAG,"").replace(/\s*\[\s*(?:s(?:c(?:e(?:n(?:e)?)?)?)?)?\s*(?::[^\]]*)?$/i,"");
}
function latestScene(list){for(let i=(list||[]).length-1;i>=0;i--)if(list[i]?.scene)return list[i].scene;return "";}
function sceneEmoji(scene){
  const s=String(scene||"").toLowerCase();
  const clock=/\b(\d{1,2})(?::\d\d)?\s*([ap])\.?\s*m\b/.exec(s);
  if(clock){const h=Number(clock[1])%12+(clock[2]==="p"?12:0);if(h>=21||h<5)return "🌙";if(h<7)return "🌅";if(h>=18)return "🌆";}
  if(/night|midnight|late evening/.test(s))return "🌙";if(/dawn|sunrise|early morning/.test(s))return "🌅";
  if(/evening|dusk|sunset/.test(s))return "🌆";if(/rain|storm|drizzle|shower/.test(s))return "🌧";if(/snow/.test(s))return "❄";
  return "☀";
}
/* clock-core:end */
/* find-core:start */
// Find in this chat: indexes of messages containing the text (case- and accent-insensitive).
function foldText(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function findMatches(list,query){
  const q=foldText(query).trim();if(q.length<2)return [];
  const out=[];
  (list||[]).forEach((m,i)=>{if(m&&(m.role==="user"||m.role==="assistant")&&foldText(m.content).includes(q))out.push(i);});
  return out;
}
/* find-core:end */
/* opener-core:start */
// Who speaks first in a new single-agent chat: "off" (you), "ai" (written fresh each time) or "text" (a fixed greeting).
function openerMode(agent){const m=agent?.opener;return m==="ai"||m==="text"?m:"off";}
function shouldOpen(agent,list){
  const mode=openerMode(agent);if(mode==="off")return null;
  if((list||[]).some(m=>m&&(m.role==="user"||m.role==="assistant")))return null;
  if(mode==="text")return String(agent.greeting||"").trim()?"text":null;
  return "ai";
}
const OPENER_NUDGE="(Start the conversation now: send your first message, fully in character, as if you are the one reaching out or the scene is just beginning. Do not mention this note.)";
/* opener-core:end */
/* recap-core:start */
// "Previously on…": a short catch-up when you return to a long chat after hours away.
const RECAP_AWAY_HOURS=6,RECAP_MIN_MESSAGES=8;
function recapDue(list,now,cached){
  const usable=(list||[]).filter(m=>m&&(m.role==="user"||m.role==="assistant")&&!m.error&&!m.streaming&&m.content);
  if(usable.length<RECAP_MIN_MESSAGES)return null;
  const lastAt=usable[usable.length-1].at;if(!lastAt)return null;
  if(cached&&cached.at===lastAt)return {lastAt,cached:true};
  if(now-lastAt<RECAP_AWAY_HOURS*3600000)return null;
  return {lastAt,cached:false};
}
function recapMessages(list,userName,assistantName){
  const turns=(list||[]).filter(m=>m&&(m.role==="user"||m.role==="assistant")&&!m.error&&m.content).slice(-30)
    .map(m=>(m.role==="user"?(userName||"User"):(m.characterName||m.agentName||assistantName||"Character"))+": "+String(m.content).slice(0,900)).join("\n\n");
  return [{role:"system",content:"Write a 'Previously on…' recap for someone returning to this story: 2–4 short sentences, present tense, addressing "+(userName||"the user")+" as you. Say where things stand right now, how the characters feel, and any open thread or promise. Write as a neutral narrator, never in a character's voice (no \"I\"), and name the characters. No title, no bullet points, nothing that did not happen."},
    {role:"user",content:turns||"(empty)"}];
}
/* recap-core:end */
/* initiative-core:start */
// Characters who message first: how long the user must have been away and how many times a day, per level.
const INITIATIVE={off:null,rarely:{awayHours:12,perDay:1},sometimes:{awayHours:4,perDay:3},often:{awayHours:1,perDay:6}};
function shouldReachOut(level,list,now){
  const p=INITIATIVE[level];if(!p)return null;
  const usable=(list||[]).filter(m=>m&&(m.role==="user"||m.role==="assistant")&&!m.error&&!m.streaming);
  if(usable.length<2)return null;
  const last=usable[usable.length-1];
  if(!last.at||last.proactive)return null;       // after reaching out, wait for the user's answer
  const away=now-last.at;if(away<p.awayHours*3600000)return null;
  const today=dayKey(now),sentToday=usable.filter(m=>m.proactive&&m.at&&dayKey(m.at)===today).length;
  if(sentToday>=p.perDay)return null;
  return {hours:Math.max(1,Math.round(away/3600000))};
}
function proactiveInstruction(hours,userName){
  const span=hours>=48?Math.round(hours/24)+" days":hours+" hour"+(hours===1?"":"s");
  return "REACHING OUT FIRST: "+(userName||"The user")+" has not written for about "+span+". Send a short message on your own initiative, "+
    "like a text after time apart: pick up a thread from the story, say what you have been doing or feeling, or ask something. "+
    "Stay fully in character and in the story's world. Never mention being an AI, timers or instructions.";
}
// In a group, the character who spoke last reaches out (or the first member).
function pickInitiator(list,memberIds){
  for(let i=(list||[]).length-1;i>=0;i--){const m=list[i];if(m&&m.role==="assistant"&&memberIds.includes(m.agentId))return m.agentId;}
  return memberIds[0]||null;
}
/* initiative-core:end */
/* sync-core:start */
// Sync between devices: which keys travel (chats and the things that belong to them), how two copies merge,
// and end-to-end encryption with a sync password. Per-device settings (looks, phone, lock, keys) never travel.
const SYNC_FILE="deepseek-agents-sync.json";
function isSyncKey(key){
  return /^ds_(agents|groups|workflows|personas|pins|model|base|ctx_limit|ctx_summary|provider_list|bg__all)$/.test(key)||
    /^ds_(conv|run|sum|bg|dir|chap)_.+$/.test(key);
}
function lastActivity(raw){
  let list=[];try{list=JSON.parse(raw)||[];}catch(e){}
  let t=0;for(const m of Array.isArray(list)?list:[])if(m&&Number(m.at)>t)t=Number(m.at);
  return {t,n:Array.isArray(list)?list.length:0};
}
function mergeListById(localRaw,remoteRaw,winner,idKey){
  const parse=r=>{try{const v=JSON.parse(r);return Array.isArray(v)?v:[];}catch(e){return [];}};
  const local=parse(localRaw),remote=parse(remoteRaw),k=idKey||"id";
  const byId=new Map(remote.filter(x=>x&&x[k]!==undefined).map(x=>[String(x[k]),x]));
  const out=local.map(x=>{const id=String(x?.[k]);return byId.has(id)&&winner[id]==="remote"?byId.get(id):x;});
  const have=new Set(local.map(x=>String(x?.[k])));
  for(const x of remote)if(x&&!have.has(String(x[k])))out.push(x);
  return JSON.stringify(out);
}
// Merge: everything from both sides; for a chat on both, the copy with the newer last message wins
// (with its run, summary, background, director notes and chapters), and its agent/group settings come along.
function mergeSyncData(local,remote){
  const out={},winner={};
  for(const [k,v] of Object.entries(local||{}))if(isSyncKey(k))out[k]=v;
  const ids=new Set(Object.keys({...local,...remote}).filter(k=>k.startsWith("ds_conv_")).map(k=>k.slice(8)));
  for(const id of ids){
    const k="ds_conv_"+id,inL=k in (local||{}),inR=k in (remote||{});
    if(!inL){winner[id]="remote";continue;}if(!inR){winner[id]="local";continue;}
    const a=lastActivity(local[k]),b=lastActivity(remote[k]);
    winner[id]=b.t>a.t||(b.t===a.t&&b.n>a.n)?"remote":"local";
  }
  for(const [k,v] of Object.entries(remote||{})){
    if(!isSyncKey(k)||typeof v!=="string")continue;
    const m=/^ds_(conv|run|sum|bg|dir|chap)_(.+)$/.exec(k);
    if(m&&k!=="ds_bg__all"){if(winner[m[2]]==="remote"||!(k in out))out[k]=v;continue;}
    if(k==="ds_agents"||k==="ds_groups"||k==="ds_workflows"){out[k]=k in out?mergeListById(out[k],v,winner):v;continue;}
    if(k==="ds_personas"){out[k]=k in out?mergeListById(out[k],v,{},"name"):v;continue;}
    if(k==="ds_provider_list"){out[k]=k in out?mergeListById(out[k],v,{}):v;continue;}
    if(k==="ds_pins"){let a=[],b=[];try{a=JSON.parse(out[k]||"[]");b=JSON.parse(v);}catch(e){}out[k]=JSON.stringify([...new Set([...(Array.isArray(a)?a:[]),...(Array.isArray(b)?b:[])])]);continue;}
    if(!(k in out))out[k]=v; // other settings: this device's choice stays
  }
  return {data:out,winner};
}
// What to write and delete on this device to reach the target (sync keys only).
function syncPlan(local,target){
  const set={},remove=[];
  for(const [k,v] of Object.entries(target))if(isSyncKey(k)&&local[k]!==v)set[k]=v;
  for(const k of Object.keys(local))if(isSyncKey(k)&&!(k in target))remove.push(k);
  return {set,remove};
}
function countChats(data){return Object.keys(data||{}).filter(k=>k.startsWith("ds_conv_")).length;}
function bytesToB64(bytes){let s="";for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);}
function b64ToBytes(b64){const s=atob(b64);const out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;}
async function syncCryptoKey(pass,salt){
  const base=await crypto.subtle.importKey("raw",new TextEncoder().encode(String(pass)),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:210000,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
async function pipeBytes(bytes,stream){return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());}
async function sealSync(obj,pass){
  const plain=new TextEncoder().encode(JSON.stringify(obj));
  const zipped=typeof CompressionStream==="function"?await pipeBytes(plain,new CompressionStream("gzip")):null;
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},await syncCryptoKey(pass,salt),zipped||plain));
  return {v:1,z:!!zipped,salt:bytesToB64(salt),iv:bytesToB64(iv),data:bytesToB64(cipher)};
}
async function openSync(env,pass){
  if(!env||env.v!==1||!env.data)throw new Error("The synced copy is in an unknown format.");
  let plain;
  try{plain=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:b64ToBytes(env.iv)},await syncCryptoKey(pass,b64ToBytes(env.salt)),b64ToBytes(env.data)));}
  catch(e){throw new Error("Wrong sync password, so the synced copy could not be opened.");}
  if(env.z)plain=await pipeBytes(plain,new DecompressionStream("gzip"));
  return JSON.parse(new TextDecoder().decode(plain));
}
/* sync-core:end */
/* char-label-migration:start */
// Older replies were saved with a leading "[char]:" speaker label; remove it from replies and their versions.
const CHAR_LABEL=/^(?:\s*\[char\]\s*:\s*)+/i;
function stripCharLabels(list){
  let changed=false;
  const clean=m=>{
    if(!m||m.role!=="assistant"||typeof m.content!=="string"||!CHAR_LABEL.test(m.content))return m;
    changed=true;return {...m,content:m.content.replace(CHAR_LABEL,"")};
  };
  const out=(Array.isArray(list)?list:[]).map(m=>{
    let next=clean(m);
    if(next&&Array.isArray(next.versions)){
      const versions=next.versions.map(v=>v&&typeof v.content==="string"&&CHAR_LABEL.test(v.content)?(changed=true,{...v,content:v.content.replace(CHAR_LABEL,"")}):v);
      if(versions.some((v,i)=>v!==next.versions[i]))next={...next,versions};
    }
    return next;
  });
  return {list:out,changed};
}
/* char-label-migration:end */
/* branch-core:start */
// A branch keeps the story up to (and including) one message; versions after it are dropped with the rest.
function branchMessages(list,index){
  if(!Array.isArray(list)||index<0||index>=list.length)return [];
  return JSON.parse(JSON.stringify(list.slice(0,index+1))).map(m=>{delete m.streaming;return m;});
}
// Chapters that start at or before the branch point carry over.
function branchChapters(chapters,cutoffAt){return (chapters||[]).filter(c=>Number(c.at)<=cutoffAt);}
function branchName(name,taken){
  const base=String(name||"Chat")+" (branch)";let out=base,n=2;
  while((taken||[]).includes(out))out=base.replace(/\)$/," "+n+++")");
  return out;
}
/* branch-core:end */
/* stats-core:start */
function wordCount(text){return (String(text||"").match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)||[]).length;}
// Numbers for ⋯ → Stats: who wrote how much, tokens, and how long the chat has been going.
function chatStats(list){
  const s={you:{messages:0,words:0},ai:{messages:0,words:0},tokensIn:0,tokensOut:0,longest:0,first:0,last:0,days:0,speakers:{}};
  const days=new Set();
  for(const m of list||[]){
    if(!m||(m.role!=="user"&&m.role!=="assistant")||m.error)continue;
    const words=wordCount(m.content),side=m.role==="user"?s.you:s.ai;
    side.messages++;side.words+=words;
    if(m.role==="assistant"){
      s.longest=Math.max(s.longest,words);
      const who=m.characterName||m.agentName;if(who)s.speakers[who]=(s.speakers[who]||0)+1;
      if(m.usage){s.tokensIn+=m.usage.prompt||0;s.tokensOut+=m.usage.completion||0;}
    }
    if(m.at){s.first=s.first?Math.min(s.first,m.at):m.at;s.last=Math.max(s.last,m.at);days.add(dayKey(m.at));}
  }
  s.days=days.size;
  return s;
}
/* stats-core:end */
/* bookmarks-core:start */
// Bookmarked messages in chat order, with a short preview for the list.
function bookmarkList(list){
  return (list||[]).map((m,index)=>({m,index})).filter(x=>x.m&&x.m.starred&&(x.m.role==="user"||x.m.role==="assistant"))
    .map(({m,index})=>({index,at:m.at||0,role:m.role,who:m.role==="user"?"":(m.characterName||m.agentName||""),
      preview:String(m.content||"").replace(/\s+/g," ").trim().slice(0,140)||(m.images?.length?"[image]":"")}));
}
/* bookmarks-core:end */
/* lock-core:start */
// App lock: a PIN screen for privacy from people around you (the data itself stays in this browser).
function validPin(pin){return /^\d{4,8}$/.test(String(pin||""));}
function normalizeLock(raw){
  const l=raw&&typeof raw==="object"?raw:null;
  if(!l||typeof l.hash!=="string"||typeof l.salt!=="string")return null;
  return {salt:l.salt,hash:l.hash,after:[0,1,5,15,60].includes(Number(l.after))?Number(l.after):1,length:Number(l.length)||4};
}
// Lock again when the app comes back after being away for longer than the chosen time.
function lockDue(lock,hiddenAt,now){return !!lock&&!!hiddenAt&&now-hiddenAt>=lock.after*60000;}
// After 5 wrong PINs in a row, wait 30 s (doubling after each further miss, up to 5 min).
function lockCooldown(failures){return failures<5?0:Math.min(300000,30000*2**(failures-5));}
/* lock-core:end */
/* ideas-core:start */
// 💡 Ideas: three different next moves for the user, in their own voice, to tap and edit.
function ideaInstruction(name,description){
  return "You suggest what "+name+" could say or do next in an ongoing conversation."+(description?" About "+name+": "+description:"")+
    " Give exactly three different options, one per line, numbered 1. 2. 3.: one bold or forward, one careful or curious, one playful or surprising."+
    " Each is "+name+"'s own words and *actions* only (never anyone else's), matching how "+name+" writes, under 30 words. No explanations, no quotes, no name labels.";
}
function parseIdeas(text){
  return String(text||"").split("\n").map(l=>l.trim()).filter(l=>/^(\d[.)]|[-*•])\s+/.test(l))
    .map(l=>l.replace(/^(\d[.)]|[-*•])\s+/,"").replace(/^\*\*(bold|careful|playful|curious|surprising)[^*]*\*\*:?\s*/i,"").replace(/^\[[^\]]{1,40}\]:\s*/,"").replace(/^"([\s\S]*)"$/,"$1").trim())
    .filter(Boolean).slice(0,3);
}
/* ideas-core:end */
/* icon-core:start */
// Chats and agents can go without an emoji: an empty icon shows the name's initials, and letters typed as the
// icon ("NY", "Dr") are shown as a text badge. Colours come from the name, so each one stays recognisable.
function hasEmoji(text){return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(String(text||""));}
function initialsOf(name){
  const words=String(name||"").trim().split(/\s+/).filter(Boolean);
  if(!words.length)return "?";
  const first=w=>Array.from(w.replace(/^[^\p{L}\p{N}]+/u,""))[0]||"";
  return ((first(words[0])+(words.length>1?first(words[words.length-1]):Array.from(words[0])[1]||"")).toUpperCase()||"?").slice(0,3);
}
// "emoji" | "text" (letters typed as the icon) | "initials" (no icon at all)
function iconKind(item){const e=String(item?.emoji??"").trim();return !e?"initials":hasEmoji(e)?"emoji":"text";}
/* icon-core:end */
/* waiting-core:start */
// What an empty, still-streaming reply says: who is typing, or that the provider is busy (only keep-alives so far).
function waitingLabel(name,providerName,keepAlives,elapsedMs){
  const secs=Math.round((elapsedMs||0)/1000);
  if(keepAlives>0&&secs>=8)return (providerName||"The provider")+" is busy — still waiting · "+secs+"s";
  return (name||"Your agent")+" is typing…"+(secs>=10?" · "+secs+"s":"");
}
/* waiting-core:end */
/* drawer-swipe-core:start */
// Edge swipe for the chat list: where a drag may start, and whether letting go opens or closes it.
const EDGE_ZONE=44;
function drawerSwipeStart(x,y,{open,headerBottom,width}){
  if(width>=900)return null;                       // wide screens show the list as a sidebar
  if(open)return "close";
  if(x<=EDGE_ZONE)return "open";                   // from the left edge (beyond Android's back-gesture strip)
  if(y<=headerBottom)return "open";                // or anywhere on the header bar
  return null;
}
function drawerSwipeEnd(kind,dx,velocity,drawerWidth){
  const travel=kind==="open"?dx:-dx,threshold=Math.min(110,drawerWidth*0.35);
  const passed=travel>threshold||(travel>24&&velocity>0.45);
  return kind==="open"?passed:!passed;             // true = drawer ends open
}
/* drawer-swipe-core:end */
/* swipe-core:start */
// What a horizontal swipe on a reply does: older/newer version, or a fresh reply past the newest one.
function swipeAction(message,isLast,dx,dy){
  if(!message||message.role!=="assistant"||message.streaming||Math.abs(dx)<70||Math.abs(dy)>Math.abs(dx)*0.6)return null;
  const count=message.versions?.length||1,index=Number.isInteger(message.versionIndex)?message.versionIndex:0;
  if(dx>0)return index>0?{type:"version",target:index-1}:null;
  if(index<count-1)return {type:"version",target:index+1};
  return isLast&&!message.error?{type:"regenerate"}:null;
}
/* swipe-core:end */
/* chapters-core:start */
// Chapters: named breaks stored as times; each shows before the first message written at or after it.
function normalizeChapters(raw){
  return (Array.isArray(raw)?raw:[]).filter(c=>c&&Number.isFinite(Number(c.at))).map(c=>({id:String(c.id||c.at),title:String(c.title||"").trim().slice(0,80),at:Number(c.at)}))
    .sort((a,b)=>a.at-b.at);
}
// Map of message index -> chapters starting right before it, plus chapters that have no message yet.
function placeChapters(chapters,list){
  const byIndex=new Map(),pending=[];
  for(const [n,ch] of normalizeChapters(chapters).entries()){
    const item={...ch,number:n+1};
    const i=(list||[]).findIndex(m=>m&&m.at&&m.at>=ch.at&&(m.role==="user"||m.role==="assistant"));
    if(i<0)pending.push(item);else{if(!byIndex.has(i))byIndex.set(i,[]);byIndex.get(i).push(item);}
  }
  return {byIndex,pending};
}
function chapterLabel(ch){return "Chapter "+ch.number+(ch.title?" · "+ch.title:"");}
function chapterNote(chapters){
  const list=normalizeChapters(chapters);if(!list.length)return "";
  const last=list[list.length-1];
  return "The story is now in Chapter "+list.length+(last.title?": \""+last.title+"\"":"")+". Let the scene reflect this new chapter.";
}
/* chapters-core:end */
/* world-core:start */
// World info entries written in the app: keywords (comma separated) trigger the text; "always" sends it every reply.
function parseKeywords(text){return [...new Set(String(text||"").split(/[,\n]/).map(k=>k.trim()).filter(Boolean))].slice(0,30);}
function makeWorldEntry(fields){
  const content=String(fields.content||"").trim().slice(0,4000);if(!content)throw new Error("Write what the entry says.");
  const keys=parseKeywords(fields.keys),always=!!fields.always;
  if(!keys.length&&!always)throw new Error("Add at least one keyword, or turn on Always include.");
  return {name:String(fields.name||"").trim().slice(0,80)||keys[0]||"Entry",keys,content,always,...(fields.constant?{constant:true}:{})};
}
/* world-core:end */
/* thoughts-core:start */
// Inner thoughts: a hidden [thoughts: …] line the app lifts out of the reply and shows under it.
const THOUGHTS_INSTRUCTION="INNER THOUGHTS: After your reply (and before any [mood] line), add one line in exactly this form: [thoughts: …] with your character's private thoughts in first person, 1–2 sentences: what they really feel, want, or are hiding. Nobody else in the story hears these thoughts; never refer to them in the story itself.";
const THOUGHT_TAG=/\[\s*(?:inner\s+)?thoughts?\s*:\s*([^\]]*)\]/gi;
function parseThoughtsTag(text){
  const source=String(text||"");let thoughts="";
  const cleaned=source.replace(THOUGHT_TAG,(all,inner)=>{thoughts=String(inner).trim();return "";});
  if(cleaned===source)return {text:source,thoughts:""};
  return {text:cleaned.replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim(),thoughts};
}
// While streaming: hide finished tags and one still arriving at the end ("[tho", "[thoughts: She wo").
function stripThoughtsWhileStreaming(text){
  return String(text||"").replace(THOUGHT_TAG,"").replace(/\s*\[\s*(?:inner\s*)?(?:t(?:h(?:o(?:u(?:g(?:h(?:t(?:s)?)?)?)?)?)?)?)?\s*(?::[^\]]*)?$/i,"");
}
function applyThoughtsTag(bot){
  const parsed=parseThoughtsTag(bot.content);
  if(parsed.thoughts){bot.thoughts=parsed.thoughts.slice(0,1200);bot.content=parsed.text||bot.content;}
  return bot;
}
/* thoughts-core:end */
/* bond-core:start */
// Relationship meter: a hidden [bond: N] line (0–100) for how close the character feels to the user.
function bondInstruction(previous,userName){
  const who=userName||"the user";
  return "RELATIONSHIP: After your reply, add one line in exactly this form: [bond: N], where N from 0 to 100 is how close your character now feels to "+who+
    " (0 hostile, 25 wary, 50 neutral, 75 close, 100 devoted). "+(Number.isFinite(previous)?"It was "+previous+" before this reply. Move it only by what happened (usually 1–5 points; more for big moments). ":"Start from your character's honest first impression. ")+
    "Let this level shape how warm or guarded you are. The app reads and hides this line; never mention it in the story.";
}
const BOND_TAG=/\[\s*(?:bond|relationship|affection)\s*:\s*(-?\d{1,3})\s*(?:\/\s*100)?\s*\]/gi;
function applyBondTag(bot,previous){
  let value=null;
  const cleaned=String(bot.content||"").replace(new RegExp("\n?[ \t]*"+BOND_TAG.source,"gi"),(all,n)=>{value=Math.max(0,Math.min(100,Math.round(Number(n))));return "";});
  if(value===null)return bot;
  bot.content=cleaned.replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim()||bot.content;
  bot.bond={level:value,...(Number.isFinite(previous)?{change:value-previous}:{})};
  return bot;
}
function stripBondWhileStreaming(text){
  return String(text||"").replace(BOND_TAG,"").replace(/\s*\[\s*(?:b(?:o(?:n(?:d)?)?)?)?\s*(?::[^\]]*)?$/i,"");
}
function bondLabel(level){return level>=90?"Devoted":level>=75?"Close":level>=60?"Warm":level>=40?"Neutral":level>=25?"Wary":level>=10?"Cold":"Hostile";}
// Closeness over time for one character (all replies in single-agent chats), oldest first.
function bondHistory(list,agentId){
  return (list||[]).filter(m=>m&&m.role==="assistant"&&m.bond&&(!agentId||m.agentId===agentId)).map(m=>m.bond.level);
}
// SVG polyline points for a small 0–100 sparkline.
function sparkPoints(values,width,height){
  const v=(values||[]).slice(-24);if(v.length<2)return "";
  return v.map((n,i)=>(i*(width/(v.length-1))).toFixed(1)+","+(height-(Math.max(0,Math.min(100,n))/100)*height).toFixed(1)).join(" ");
}
/* bond-core:end */
/* appearance-core:start */
// Appearance: accent colour, reading size/font/spacing, AI bubbles, and per-chat backgrounds.
// Each palette: [accent, fill, soft, user bubble, user bubble text] for dark and light themes.
const ACCENT_PALETTES={
  blue:null,
  violet:{name:"Violet",dark:["#b39dfa","#7c5cf0","rgba(179,157,250,.15)","#2e2357","#f3efff"],light:["#6a48d6","#6a48d6","rgba(106,72,214,.10)","#ece6ff","#1e1240"]},
  rose:{name:"Rose",dark:["#f48fb1","#d6457a","rgba(244,143,177,.15)","#4a1f33","#ffeef4"],light:["#c2185b","#c2185b","rgba(194,24,91,.09)","#fde4ee","#3d0a1f"]},
  crimson:{name:"Crimson",dark:["#f87171","#c53030","rgba(248,113,113,.14)","#4a1d1d","#fff0f0"],light:["#b42318","#b42318","rgba(180,35,24,.08)","#fde3e1","#3d0b07"]},
  amber:{name:"Amber",dark:["#f2b880","#c26a1b","rgba(242,184,128,.15)","#43301c","#fff4e8"],light:["#a5520c","#a5520c","rgba(165,82,12,.09)","#fbebd9","#3a1d03"]},
  teal:{name:"Teal",dark:["#5eead4","#0f9488","rgba(94,234,212,.13)","#123f3b","#e8fffb"],light:["#0e7469","#0e7469","rgba(14,116,105,.09)","#dcf5f0","#06302b"]},
  green:{name:"Green",dark:["#6ee7a0","#15803d","rgba(110,231,160,.13)","#163d27","#ecfff3"],light:["#137a3b","#137a3b","rgba(19,122,59,.09)","#def5e6","#082d16"]}
};
const ACCENT_VARS=["--accent","--accent-fill","--accent-soft","--bubble-user","--bubble-user-text","--mark"];
function accentVars(name,light){
  const p=ACCENT_PALETTES[name];if(!p)return {};
  const [accent,fill,soft,bubble,bubbleText]=p[light?"light":"dark"];
  return {"--accent":accent,"--accent-fill":fill,"--accent-soft":soft,"--bubble-user":bubble,"--bubble-user-text":bubbleText,"--mark":soft};
}
const TEXT_SIZES=[14,16,18,20,22];
const FONT_STACKS={system:"",serif:'"Iowan Old Style","Palatino Linotype",Palatino,"Noto Serif",Georgia,serif',mono:'ui-monospace,"SF Mono",Menlo,Consolas,"Roboto Mono",monospace'};
function normalizeAppearance(raw){
  const a=raw&&typeof raw==="object"?raw:{};
  return {accent:Object.prototype.hasOwnProperty.call(ACCENT_PALETTES,a.accent)?a.accent:"blue",
    size:TEXT_SIZES.includes(Number(a.size))?Number(a.size):16,
    font:Object.prototype.hasOwnProperty.call(FONT_STACKS,a.font)?a.font:"system",
    density:a.density==="compact"?"compact":"comfortable",bubbles:!!a.bubbles};
}
const BG_PRESETS={
  dusk:{name:"Dusk",css:"linear-gradient(160deg,#2b1d4e 0%,#5b2a5e 45%,#c0587e 80%,#f0a07a 100%)"},
  ocean:{name:"Ocean",css:"linear-gradient(170deg,#06213a 0%,#0b4f6c 50%,#1fa2a5 100%)"},
  forest:{name:"Forest",css:"linear-gradient(165deg,#0d1f16 0%,#1d4430 55%,#4f7a4a 100%)"},
  ember:{name:"Ember",css:"radial-gradient(120% 80% at 50% 110%,#d9541e 0%,#6e1d14 45%,#1a0b0b 100%)"},
  rose:{name:"Rose",css:"linear-gradient(160deg,#3a1426 0%,#8a2d55 55%,#e58fb0 100%)"},
  night:{name:"Night sky",css:"radial-gradient(1.5px 1.5px at 20% 30%,#fff8,transparent),radial-gradient(1px 1px at 70% 20%,#fff8,transparent),radial-gradient(1.5px 1.5px at 40% 70%,#fff6,transparent),radial-gradient(1px 1px at 85% 60%,#fff7,transparent),linear-gradient(180deg,#050816 0%,#14183a 60%,#2a2350 100%)"}
};
function normalizeBackground(raw){
  const b=raw&&typeof raw==="object"?raw:null;if(!b)return null;
  const dim=Math.max(0,Math.min(.85,Number(b.dim)));const d=Number.isFinite(dim)?dim:.45;
  if(b.kind==="none")return {kind:"none",dim:d};
  if(b.kind==="preset"&&BG_PRESETS[b.value])return {kind:"preset",value:b.value,dim:d};
  if(b.kind==="photo"&&/^data:image\/(jpeg|png|webp);base64,/.test(String(b.value||"")))return {kind:"photo",value:b.value,dim:d};
  return null;
}
// A chat's own background wins; otherwise the default for all chats.
function effectiveBackground(own,fallback){return normalizeBackground(own)||normalizeBackground(fallback);}
function backgroundImage(bg){
  if(!bg||bg.kind==="none")return "";
  return bg.kind==="preset"?BG_PRESETS[bg.value].css:'url("'+bg.value+'")';
}
// Character name colours: [dark theme, light theme]. Group members without a choice get one from their id.
const CHARACTER_COLORS={amber:["#f2b880","#a5520c"],blue:["#8fa8ff","#3653d4"],rose:["#f48fb1","#c2185b"],teal:["#5eead4","#0e7469"],
  violet:["#c4b0ff","#6a48d6"],gold:["#fcd34d","#8a6100"],green:["#86efac","#137a3b"],coral:["#fca5a5","#b42318"]};
function characterColor(agent,auto){
  if(agent?.color&&CHARACTER_COLORS[agent.color])return CHARACTER_COLORS[agent.color];
  if(!auto||!agent?.id)return null;
  const keys=Object.keys(CHARACTER_COLORS);let h=0;for(const c of String(agent.id))h=(h*31+c.charCodeAt(0))>>>0;
  return CHARACTER_COLORS[keys[h%keys.length]];
}
/* appearance-core:end */
/* memory-suggest-core:start */
// Story memory suggestions: the helper model reads the recent story and proposes new lasting facts.
function memoryExtractMessages(list,existing,userName){
  const turns=(list||[]).filter(m=>(m.role==="user"||m.role==="assistant")&&!m.error&&m.content).slice(-40)
    .map(m=>(m.role==="user"?(userName||"User"):(m.characterName||m.agentName||"Character"))+": "+String(m.content).slice(0,1500)).join("\n\n");
  const known=(existing||[]).length?"Already remembered (do not repeat these):\n"+existing.map(f=>"- "+f).join("\n")+"\n\n":"";
  return [{role:"system",content:"You keep the story memory for a long-running interactive story. From the conversation, list NEW lasting facts worth remembering: names, relationships and how they changed, promises, secrets revealed, important events, places, possessions, and each character's established traits or preferences. "+
    "One short fact per line, starting with \"- \", at most 10 lines, each under 25 words, written in third person with names (never \"you\" or \"I\"). Skip small talk and anything temporary. If nothing new is worth remembering, reply with \"- (nothing new)\"."},
    {role:"user",content:known+"Conversation:\n"+(turns||"(empty)")}];
}
function parseFactLines(text,existing){
  const seen=new Set((existing||[]).map(f=>String(f).trim().toLowerCase()));
  const out=[];
  for(const raw of String(text||"").split("\n")){
    const fact=raw.replace(/^\s*(?:[-*•]|\d+[.)])\s*/,"").replace(/\s+/g," ").trim().slice(0,240);
    if(!fact||/^\(?nothing new\)?\.?$/i.test(fact)||fact.length<4||/:$/.test(fact))continue;
    const key=fact.toLowerCase();if(seen.has(key))continue;
    seen.add(key);out.push(fact);if(out.length>=10)break;
  }
  return out;
}
/* memory-suggest-core:end */
/* director-core:start */
// Scene director: a one-shot direction for the next reply and a standing author's note, both hidden from the story.
const NOTE_PRESETS=[
  ["Shorter replies","Keep replies short: one or two paragraphs."],
  ["More detail","Write rich, sensory detail and inner thoughts."],
  ["More dialogue","Favour spoken dialogue over narration."],
  ["Slow burn","Let tension build slowly; do not rush intimacy or resolutions."],
  ["Raise the stakes","Introduce complications and raise the stakes."],
  ["Lighter tone","Keep the tone playful and light."],
  ["Present tense","Narrate actions in present tense."],
  ["No speaking for me","Never write {{user}}'s actions, words, or thoughts."]
];
const NEXT_PRESETS=[
  ["⏩ Time skip","Skip ahead to the next meaningful moment, with a short transition."],
  ["📍 New place","Move the scene to a new location that fits the story."],
  ["👤 New character","Introduce a new character who complicates things."],
  ["💬 Confession","Have a character reveal something they have been hiding."],
  ["🌅 End scene","Bring the current scene to a natural close with a hook for what comes next."]
];
function normalizeDirection(raw){
  const d=raw&&typeof raw==="object"?raw:{};
  return {next:String(d.next||"").trim().slice(0,1500),note:String(d.note||"").trim().slice(0,3000)};
}
function directionBlock(direction,{includeNext=true}={}){
  const d=normalizeDirection(direction),parts=[];
  if(d.note)parts.push("Author's note (standing direction for this whole story; follow it, never mention it):\n"+d.note);
  if(includeNext&&d.next)parts.push("Director's instruction for your next reply only (make it happen naturally in the story; never mention the instruction or break character):\n"+d.next);
  return parts.join("\n\n");
}
// Placed after the latest message, where models weigh it most.
function withDirection(apiMessages,direction,options){
  const block=directionBlock(direction,options);
  return block?[...(apiMessages||[]),{role:"system",content:block}]:[...(apiMessages||[])];
}
// The prompt for the 🎲 Surprise me button: one fitting twist from the recent story.
// Each character's latest mood and closeness (❤) from the chat, newest first wins.
function storyState(list,assistantName){
  const seen=new Map();
  for(let i=(list||[]).length-1;i>=0;i--){
    const m=list[i];if(!m||m.role!=="assistant"||m.error)continue;
    const name=m.characterName||m.agentName||assistantName||"Character",s=seen.get(name)||{name};
    if(!s.mood&&m.mood)s.mood=m.mood;
    if(s.bond===undefined&&m.bond)s.bond=m.bond.level;
    seen.set(name,s);
  }
  return [...seen.values()].filter(s=>s.mood||s.bond!==undefined).reverse();
}
function twistMessages(list,userName,chapter,assistantName){
  const turns=(list||[]).filter(m=>(m.role==="user"||m.role==="assistant")&&!m.error&&m.content).slice(-8)
    .map(m=>(m.role==="user"?(userName||"User"):(m.characterName||m.agentName||assistantName||"Character"))+": "+String(m.content).slice(0,1000)).join("\n\n");
  const state=storyState(list,assistantName).map(s=>"- "+s.name+": "+[s.mood&&"feels "+s.mood.mood+" ("+s.mood.level+"/10)",s.bond!==undefined&&"closeness to "+(userName||"the user")+" "+s.bond+"/100"].filter(Boolean).join(", ")).join("\n");
  return [{role:"system",content:"You are the director of an ongoing interactive story. Suggest ONE surprising but believable development for the next reply, as a single short instruction (under 30 words) such as \"A stranger knocks at the door, soaked from the storm.\" Fit the tone and characters"+(state?", and use where the characters stand emotionally: a twist that tests, deepens or shakes those feelings works best":"")+". Do not decide the user's actions. Reply with the instruction only."},
    {role:"user",content:(chapter?"Current chapter: "+chapter+"\n\n":"")+(state?"Where the characters stand now:\n"+state+"\n\n":"")+(turns?"Recent story:\n\n"+turns:"(The story has not started yet.)")}];
}
function cleanTwist(text){
  const t=String(text||"").trim().split("\n").map(s=>s.trim()).find(Boolean)||"";
  return /^(["“'])[\s\S]*(["”'])$/.test(t)&&!/^["“'][^"“”']*["”'][^"“”']+/.test(t)?t.slice(1,-1).trim():t;
}
/* director-core:end */
/* text-export:start */
// A chat as plain text: readable anywhere (Notes, e-mail, any phone), with times, day breaks and sources.
function pad2(n){return String(n).padStart(2,"0");}
function clockTime(ts){const d=new Date(ts);return pad2(d.getHours())+":"+pad2(d.getMinutes());}
function longDate(ts){
  const d=new Date(ts),days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],
    months=["January","February","March","April","May","June","July","August","September","October","November","December"];
  return days[d.getDay()]+", "+months[d.getMonth()]+" "+d.getDate()+", "+d.getFullYear();
}
function chatToText(title,list,options={}){
  const placed=placeChapters(options.chapters,list);
  const visible=(list||[]).filter(m=>(m.role==="user"||m.role==="assistant")&&!m.error&&(m.content||m.images?.length));
  const now=options.now||Date.now(),name=String(title||"Chat");
  const out=[name,"Saved "+longDate(now)+" at "+clockTime(now)+" · "+visible.length+" message"+(visible.length===1?"":"s"),"=".repeat(Math.min(48,Math.max(24,name.length)))];
  if(options.intro)out.push("",String(options.intro).trim());
  let day="";
  for(const m of visible){
    if(m.at){const k=dayKey(m.at);if(k!==day){day=k;out.push("","—— "+longDate(m.at)+" ——");}}
    for(const ch of placed.byIndex.get((list||[]).indexOf(m))||[])out.push("","═══ "+chapterLabel(ch).toUpperCase()+" ═══");
    const who=m.role==="user"?(options.userName||"You"):(m.characterName||m.agentName||m.workflowRoleName||options.assistantName||"Assistant");
    out.push("",(m.at?"["+clockTime(m.at)+"] ":"")+who+":");
    if(m.content)out.push(String(m.content).replace(/\r\n/g,"\n").trim());
    if(m.images?.length)out.push("["+m.images.length+" image"+(m.images.length===1?"":"s")+"]");
    if(m.thoughts)out.push("(thoughts: "+m.thoughts+")");
    if(m.sources?.length)out.push("Sources:",...m.sources.map((s,i)=>"  ["+(i+1)+"] "+s.title+" — "+s.url));
  }
  return out.join("\n")+"\n";
}
function chatFileName(name,ext,now){
  const d=new Date(now||Date.now()),safe=String(name||"chat").replace(/[^\p{L}\p{N}\- ]+/gu,"").trim().replace(/\s+/g,"-").slice(0,60)||"chat";
  return safe+"-"+d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate())+"."+ext;
}
/* text-export:end */
/* web-search-core:start */
// Exa web search: request body, prompt block with numbered sources, and [n] citation links.
function exaSearchBody(query,count){
  return {query:String(query||"").slice(0,400),type:"auto",numResults:Math.max(1,Math.min(10,count||5)),contents:{text:{maxCharacters:1800}}};
}
function exaResults(json){
  return (Array.isArray(json?.results)?json.results:[]).filter(r=>r&&r.url).map(r=>({
    title:String(r.title||r.url).trim().slice(0,200),url:String(r.url),
    date:r.publishedDate?String(r.publishedDate).slice(0,10):"",text:String(r.text||"").replace(/\s+/g," ").trim().slice(0,1800)
  }));
}
// The text the helper model turns into a search query.
function searchQueryMessages(apiMessages,now){
  const turns=(apiMessages||[]).filter(m=>m.role!=="system").slice(-6).map(m=>{
    const text=typeof m.content==="string"?m.content:(m.content||[]).filter(p=>p.type==="text").map(p=>p.text).join(" ");
    return (m.role==="user"?"User: ":"Assistant: ")+text.slice(0,1200);
  }).join("\n\n");
  const today=new Date(now||Date.now()).toISOString().slice(0,10);
  return [{role:"system",content:"You write one web search query that would find current information needed to answer the user's latest message. Today is "+today+": for anything recent, use this year (or no year at all), never an older one. Reply with only the query (under 15 words, no quotes). If no web search is useful, reply with the user's latest message shortened to a query anyway."},
    {role:"user",content:turns||"(empty)"}];
}
function lastUserText(apiMessages){
  const m=[...(apiMessages||[])].reverse().find(x=>x.role==="user");if(!m)return "";
  const text=typeof m.content==="string"?m.content:(m.content||[]).filter(p=>p.type==="text").map(p=>p.text).join(" ");
  return text.replace(/^\[[^\]]{1,40}\]:?\s*/,"").replace(/\s+/g," ").trim().slice(0,300);
}
function cleanSearchQuery(text,fallback){
  const q=String(text||"").split("\n").map(s=>s.trim()).find(Boolean)||"";
  const cleaned=q.replace(/^(query|search)\s*:\s*/i,"").replace(/^["'`]+|["'`]+$/g,"").trim();
  return (cleaned||String(fallback||"")).slice(0,300);
}
function searchResultsBlock(query,results,now){
  const day=new Date(now||Date.now()).toISOString().slice(0,10);
  const list=results.map((r,i)=>"["+(i+1)+"] "+r.title+" — "+r.url+(r.date?" ("+r.date+")":"")+"\n"+r.text).join("\n\n");
  return "Web search results (searched "+day+" for \""+query+"\"). Use them when they help answer the latest message. "+
    "Cite facts taken from them inline with their number in square brackets, like [1] or [2][3]. Do not invent sources or numbers. "+
    "If the results do not answer the question, say so briefly and answer from what you know. Stay in character if you are playing one.\n\n"+list;
}
// Exa's REST API only accepts browsers on its own allow-list (not GitHub Pages), so the app falls back to Exa's hosted
// MCP endpoint, which allows any site. Its search tool answers with text blocks: "Title: …\nURL: …\nPublished: …\nHighlights:\n…".
function exaMcpRequest(query,count){
  return {jsonrpc:"2.0",id:Date.now(),method:"tools/call",params:{name:"web_search_exa",arguments:{query:String(query||"").slice(0,400),numResults:Math.max(1,Math.min(10,count||5))}}};
}
function parseExaMcpText(text){
  return String(text||"").split(/\n(?=Title: )/).map(block=>{
    const field=name=>(block.match(new RegExp("^"+name+": ?(.*)$","m"))||[])[1]?.trim()||"";
    const url=field("URL");if(!/^https?:\/\//.test(url))return null;
    const body=block.replace(/^(Title|URL|Published|Author|Image|Favicon|ID): ?.*$/gm,"").replace(/^(Highlights|Text|Summary):[ 	]*/gm,"").replace(/^-{3,}\s*$/gm,"");
    return {title:(field("Title")||url).slice(0,200),url,date:/^\d{4}-\d{2}-\d{2}/.test(field("Published"))?field("Published").slice(0,10):"",text:body.replace(/\s+/g," ").trim().slice(0,1800)};
  }).filter(Boolean);
}
// The MCP endpoint streams one JSON-RPC message as server-sent events, or returns plain JSON.
function exaMcpResults(raw){
  const body=String(raw||"").trim();
  const json=body.startsWith("{")?JSON.parse(body):JSON.parse((body.split("\n").filter(l=>l.startsWith("data:")).pop()||"data: {}").slice(5));
  if(json.error)throw new Error("Exa: "+(json.error.message||"search failed"));
  const text=(json.result?.content||[]).filter(c=>c.type==="text").map(c=>c.text).join("\n");
  const results=parseExaMcpText(text);
  if(!results.length&&/rate limit|api key|unauthori|invalid/i.test(text))throw new Error(/rate limit/i.test(text)?"Exa did not accept the key (free rate limit reached). Check the key in Settings.":/invalid api key|\b401\b/i.test(text)?"Exa rejected the key. Check it in Settings.":"Exa: "+text.slice(0,160));
  return results;
}
// Adds the results to the system prompt (or as a new first system message).
function withSearchResults(apiMessages,block){
  const list=[...(apiMessages||[])];
  if(list[0]?.role==="system"&&typeof list[0].content==="string")list[0]={...list[0],content:list[0].content+"\n\n"+block};
  else list.unshift({role:"system",content:block});
  return list;
}
// Turns [n] in rendered HTML into links to the matching source, leaving code untouched.
function linkCitations(html,sources){
  if(!sources?.length)return html;
  const attr=s=>String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
  return String(html).split(/(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>|<a [\s\S]*?<\/a>)/).map((part,i)=>i%2?part:part.replace(/\[(\d{1,2})\]/g,(all,n)=>{
    const s=sources[Number(n)-1];
    return s?'<a class="cite" href="'+attr(s.url)+'" target="_blank" rel="noopener" title="'+attr(s.title)+'">'+n+'</a>':all;
  })).join("");
}
function sourceHost(url){return String(url||"").replace(/^[a-z][a-z0-9+.-]*:\/\//i,"").split(/[/?#]/)[0].replace(/^www\./,"");}
/* web-search-core:end */
/* provider-core:start */
// Ready-made providers. All speak the OpenAI-style /chat/completions API; the kind is derived from the URL.
const PROVIDER_PRESETS=[
  {id:"openrouter",name:"OpenRouter",base:"https://openrouter.ai/api/v1",keyUrl:"https://openrouter.ai/keys",hint:"Hundreds of models (DeepSeek, Claude, GPT, Llama, Mistral…) with one key."},
  {id:"openai",name:"OpenAI",base:"https://api.openai.com/v1",keyUrl:"https://platform.openai.com/api-keys",hint:"GPT models."},
  {id:"gemini",name:"Google Gemini",base:"https://generativelanguage.googleapis.com/v1beta/openai",keyUrl:"https://aistudio.google.com/apikey",hint:"Gemini models through Google's OpenAI-compatible endpoint."},
  {id:"groq",name:"Groq",base:"https://api.groq.com/openai/v1",keyUrl:"https://console.groq.com/keys",hint:"Very fast open models."},
  {id:"mistral",name:"Mistral",base:"https://api.mistral.ai/v1",keyUrl:"https://console.mistral.ai/api-keys",hint:"Mistral models."},
  {id:"xai",name:"xAI (Grok)",base:"https://api.x.ai/v1",keyUrl:"https://console.x.ai",hint:"Grok models."},
  {id:"deepseek",name:"DeepSeek (second key)",base:"https://api.deepseek.com",keyUrl:"https://platform.deepseek.com/api_keys",hint:"Another DeepSeek account."},
  {id:"ollama",name:"Ollama",base:"http://localhost:11434/v1",keyUrl:"",hint:"Local models on a computer running Ollama. No key needed."},
  {id:"lmstudio",name:"LM Studio",base:"http://localhost:1234/v1",keyUrl:"",hint:"Local models served by LM Studio. No key needed."},
  {id:"custom",name:"Custom",base:"",keyUrl:"",hint:"Any OpenAI-compatible server."}
];
function providerKind(base){
  const url=String(base||"").toLowerCase();
  if(url.includes("deepseek.com"))return "deepseek";
  if(url.includes("openrouter.ai"))return "openrouter";
  if(url.includes("api.openai.com"))return "openai";
  if(url.includes("generativelanguage.googleapis.com"))return "gemini";
  return "generic";
}
function isLocalBase(base){return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|192\.168\.|10\.|[^/]*\.local)/i.test(String(base||""));}
// One streaming chat request in the dialect each provider expects.
function buildChatRequest(provider,agent,apiMessages,defaultModel){
  const kind=providerKind(provider.base),thinking=!!agent.think&&agent.think!=="off";
  const effort=agent.think==="max"?"high":agent.think;
  const body={model:agent.model||provider.model||defaultModel,messages:apiMessages,stream:true};
  if(kind!=="generic"&&kind!=="gemini")body.stream_options={include_usage:true};
  if(kind==="deepseek"){
    if(thinking){body.thinking={type:"enabled"};body.reasoning_effort=agent.think;}
    else{body.thinking={type:"disabled"};body.temperature=agent.temp;}
  }else if(kind==="openrouter"){
    if(thinking)body.reasoning={effort};else body.temperature=agent.temp;
  }else if(kind==="openai"||kind==="gemini"){
    if(thinking)body.reasoning_effort=effort;else body.temperature=agent.temp;
  }else body.temperature=agent.temp;
  const max=replyTokenLimit(agent.maxTokens);
  if(max){if(kind==="openai")body.max_completion_tokens=max;else body.max_tokens=max;}
  const headers={"Content-Type":"application/json"};
  if(provider.key)headers.Authorization="Bearer "+provider.key;
  if(kind==="openrouter")headers["X-Title"]="DeepSeek Agents";
  return {url:String(provider.base||"").replace(/\/+$/,"")+"/chat/completions",headers,body};
}
// Model ids from an OpenAI-style /models response, sorted, without duplicates.
function modelIdsFrom(json){
  const list=Array.isArray(json?.data)?json.data:Array.isArray(json?.models)?json.models:Array.isArray(json)?json:[];
  return [...new Set(list.map(m=>typeof m==="string"?m:String(m?.id||m?.name||"").replace(/^models\//,"")).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}
/* provider-core:end */
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
/* card-export:start */
// Character cards out: a V2 "chara_card_v2" JSON, base64 in a PNG tEXt chunk named "chara" (Tavern, SillyTavern, Janitor…).
const CRC_TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(bytes){let c=0xFFFFFFFF;for(let i=0;i<bytes.length;i++)c=CRC_TABLE[(c^bytes[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function utf8ToBase64(text){
  const bytes=new TextEncoder().encode(String(text));let binary="";
  for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(binary);
}
// Returns a new PNG with one tEXt chunk (replacing older card chunks) placed before IEND.
function pngWithTextChunk(bytes,keyword,text){
  const signature=[137,80,78,71,13,10,26,10];
  if(bytes.length<8||signature.some((b,i)=>bytes[i]!==b))throw new Error("The card image is not a PNG.");
  const kept=[];let p=8,iend=-1;
  while(p+12<=bytes.length){
    const len=((bytes[p]<<24)|(bytes[p+1]<<16)|(bytes[p+2]<<8)|bytes[p+3])>>>0,type=String.fromCharCode(bytes[p+4],bytes[p+5],bytes[p+6],bytes[p+7]);
    const end=p+12+len;
    if(type==="IEND"){iend=p;break;}
    const data=bytes.subarray(p+8,p+8+len),zero=data.indexOf(0);
    const key=zero>0?String.fromCharCode(...data.subarray(0,zero)).toLowerCase():"";
    if(!(/^(tEXt|iTXt|zTXt)$/.test(type)&&(key==="chara"||key==="ccv3"||key===keyword.toLowerCase())))kept.push(bytes.subarray(p,end));
    p=end;
  }
  if(iend<0)throw new Error("The card image is incomplete.");
  const payload=new Uint8Array(keyword.length+1+text.length);
  for(let i=0;i<keyword.length;i++)payload[i]=keyword.charCodeAt(i)&255;
  for(let i=0;i<text.length;i++)payload[keyword.length+1+i]=text.charCodeAt(i)&255;
  const chunk=new Uint8Array(12+payload.length),view=new DataView(chunk.buffer);
  view.setUint32(0,payload.length);chunk.set([116,69,88,116],4);chunk.set(payload,8);
  view.setUint32(8+payload.length,crc32(chunk.subarray(4,8+payload.length)));
  const parts=[bytes.subarray(0,8),...kept,chunk,bytes.subarray(iend)],out=new Uint8Array(parts.reduce((n,x)=>n+x.length,0));
  let q=0;for(const x of parts){out.set(x,q);q+=x.length;}
  return out;
}
function agentToCard(agent,greeting){
  const entries=(agent.lorebook?.entries||[]).map((e,i)=>({id:i,keys:[...(e.keys||[])],content:e.content,name:e.name||"",comment:e.name||"",
    enabled:e.enabled!==false,constant:!!(e.constant||e.always),insertion_order:i,extensions:{}}));
  return {spec:"chara_card_v2",spec_version:"2.0",data:{
    name:String(agent.name||"Character"),description:String(agent.prompt||""),personality:"",scenario:"",
    first_mes:String(greeting||""),mes_example:"",creator_notes:"Exported from DeepSeek Agents.",system_prompt:"",post_history_instructions:"",
    alternate_greetings:[],tags:[...(agent.card?.tags||[])],creator:String(agent.card?.creator||""),character_version:"1",
    extensions:{"deepseek-agents":{emoji:agent.emoji||"",temp:agent.temp,think:agent.think||"off",moods:!!agent.moods,thoughts:!!agent.thoughts}},
    ...(entries.length?{character_book:{name:agent.lorebook?.name||agent.name||"",entries,extensions:{}}}:{})}};
}
/* card-export:end */
