(() => {
'use strict';
const config=window.COMMUNITY_CONFIG||{}, api=(config.apiBase||'').replace(/\/$/,''), $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=ms=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(ms);
let member='',key='',storageOK=true;
try{member=localStorage.getItem(config.identityStorageKey)||'';key=localStorage.getItem('prediction-edit-key-v1')||'';if(!/^[A-Za-z0-9_-]{32,100}$/.test(key)){key=crypto.randomUUID();localStorage.setItem('prediction-edit-key-v1',key);}}catch{storageOK=false;key='';}
const state={tab:['mine','board'].includes(location.hash.slice(1))?location.hash.slice(1):'schedule',day:null,stage:'',season:'',data:null,offset:0,loading:false};
const drafts=new Map(),pending=new Set();
const draftKey=e=>member+'|'+e.id+'|'+e.signature;
const options=(values,value,label=x=>x)=>values.map(x=>`<option value="${esc(x)}" ${x===value?'selected':''}>${esc(label(x))}</option>`).join('');
function message(text,error=false){$('feedback').textContent=text;$('feedback').classList.toggle('error',error);}
function score(e,p){const t=e.teams.find(t=>t.id===p.winnerId);return (t?.code||'待定')+' '+(Math.floor(e.bestOf/2)+1)+':'+p.loserWins;}
function outcome(e,p){if(e.state==='void')return '比赛取消 · 不计分';if(!e.winnerId)return e.state==='completed'?'赛果待确认':'等待赛果';return p.winnerId===e.winnerId?(e.bestOf>1&&p.loserWins===e.loserWins?'胜者、比分双中':'猜中胜者'):'预测落空';}
function card(e){
 const locked=e.locked,ready=e.canVote&&member&&storageOK, own=e.mine;
 const draft=drafts.get(draftKey(e))||own||{winnerId:'',loserWins:0};
 const badge=e.state==='void'?'已取消':e.state==='completed'?(e.winnerId?'已结算':'赛果待确认'):e.state==='inProgress'?'比赛进行中':locked?'已封盘':!e.ready?'对阵待定':'预测开放';
 const now=Date.now()+state.offset, minutes=Math.max(0,Math.ceil((e.lockAt-now)/60000));
 const note=locked?'已封盘，无法修改':!e.ready?'官方对阵待定后开放':state.data.stale?'官方数据同步延迟，暂缓提交':!member?'先在上方选择自己的 ID':!storageOK?'请允许浏览器保存本地数据后再提交':`距离封盘约 ${minutes<60?minutes+' 分钟':Math.floor(minutes/60)+' 小时 '+minutes%60+' 分钟'}`;
 return `<article class="prediction-match" data-event="${esc(e.id)}"><div class="match-head"><div><time datetime="${new Date(e.startAt).toISOString()}">${esc(fmt(e.startAt))} · 北京时间</time>${esc(e.stage)} · BO${e.bestOf}</div><span class="match-badge ${e.canVote?'open':e.state==='inProgress'?'live':''}">${badge}</span></div>
 <div class="match-teams">${team(e.teams[0])}<span class="match-score ${e.winnerId?'final':''}">${e.state==='unstarted'?'VS':e.teams.map(t=>t.wins).join(' : ')}</span>${team(e.teams[1])}</div>
 ${!locked&&e.ready?`<form class="ballot-form" data-pick-form="${e.id}"><div class="winner-choices" role="group" aria-label="预测胜者">${e.teams.map(t=>`<button type="button" data-winner="${esc(t.id)}" class="${draft.winnerId===t.id?'selected':''}" aria-pressed="${draft.winnerId===t.id}" ${!ready?'disabled':''}>${esc(t.code)} 获胜</button>`).join('')}</div><div class="score-controls"><label>${e.bestOf===1?'BO1 · 1:0':'预测比分'}${e.bestOf>1?`<select aria-label="预测比分" name="loserWins" ${!ready?'disabled':''}>${Array.from({length:Math.floor(e.bestOf/2)+1},(_,n)=>`<option value="${n}" ${draft.loserWins===n?'selected':''}>${Math.floor(e.bestOf/2)+1}:${n}</option>`).join('')}</select>`:''}</label><button class="submit-pick" type="submit" ${!ready||!draft.winnerId||pending.has(e.id)?'disabled':''}>${pending.has(e.id)?'提交中…':own?'更新预测':'提交预测'}</button></div><p class="ballot-note">${esc(note)}</p></form>`:`<div class="match-details"><p>${esc(note)}</p></div>`}
 <div class="match-details"><span>${e.participation} 人参与 · 封盘 ${esc(fmt(e.lockAt))}</span>${own?`<p class="mine-pick">我的预测：${esc(score(e,own))}<span class="pick-outcome">${esc(outcome(e,own))}</span></p>`:''}${e.changed?'<p>原预测因对阵或赛制变更作废，未封盘可重新提交。</p>':''}
 ${locked&&e.participation?`<div class="support-bar" aria-label="支持比例"><i style="width:${(e.support[0]?.count||0)/e.participation*100}%"></i></div><div class="support-caption"><span>${esc(e.teams[0].code)} · ${e.support[0]?.count||0} 票</span><span>${esc(e.teams[1].code)} · ${e.support[1]?.count||0} 票</span></div><details class="ballots"><summary>查看群友的选择</summary><ul>${e.ballots.map(p=>`<li><span>${esc(p.name)}</span><span>${esc(score(e,p))} · ${esc(outcome(e,p))}</span></li>`).join('')}</ul></details>`:!locked?'<p class="ballot-note">封盘前隐藏其他人的选择。</p>':''}</div></article>`;
}
function team(t){return `<div class="team">${t.image?`<img src="${esc(t.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}<b>${esc(t.code)}</b><small>${esc(t.name)}</small></div>`;}
function paint(){
 const d=state.data;if(!d)return;
 document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===state.tab);b.setAttribute('aria-current',b.dataset.tab===state.tab?'page':'false');});
 $('identity').innerHTML='<option value="">请选择自己的 ID</option>'+d.members.map(m=>`<option value="${esc(m.key)}" ${m.key===member?'selected':''}>${esc(m.name)}</option>`).join('');
 $('season').innerHTML=options(d.seasons,state.season,x=>x+' Worlds');
 $('day').innerHTML='<option value="">整个赛事</option>'+options(d.days,state.day);
 $('stage').innerHTML='<option value="">全部阶段</option>'+options(d.stages,state.stage);
 $('sync-status').textContent=(d.lastSyncAt?'官方赛程更新于 '+fmt(d.lastSyncAt):'尚未取得官方赛程')+' · 时间均为北京时间'+(d.stale?' · 同步延迟，暂停新预测':d.syncError?' · 最近同步失败，正自动重试':' · 赛前 / 赛中约每 2 分钟同步');
 $('sync-status').classList.toggle('warning',d.stale||!!d.syncError);
 if(state.tab==='board'){
  $('prediction-content').innerHTML=`<p class="board-intro">${esc(state.day||state.season+' Worlds 全赛事')} · ${esc(state.stage||'全部阶段')}；仅统计已确认赛果的有效预测。</p>`+(d.leaderboard.length?`<div class="board-wrap"><table class="prediction-board"><thead><tr><th>排名</th><th>群友 ID</th><th>胜者命中</th><th>精确比分</th><th>已结算</th><th>命中率</th></tr></thead><tbody>${d.leaderboard.map(r=>`<tr class="${r.memberKey===member?'me':''}"><td>${r.rank}</td><td>${esc(r.name)}</td><td>${r.winnerCorrect}</td><td>${r.exactScore}</td><td>${r.played}</td><td>${(r.hitRate*100).toFixed(1)}%</td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">首场有效预测结算后，群友排行榜就会出现。<br>现在可以先去赛程页留下你的判断。</p>');return;
 }
 const events=d.events.filter(e=>state.tab!=='mine'||e.mine||e.changed);
 let intro='';if(state.tab==='mine'){const own=d.leaderboard.find(r=>r.memberKey===member);intro=`<div class="prediction-summary"><span><b>${events.filter(e=>e.mine).length}</b>本范围已预测</span><span><b>${own?.winnerCorrect||0}</b>猜中胜者</span><span><b>${own?.exactScore||0}</b>精确比分</span></div>`;}
 $('prediction-content').innerHTML=intro+(events.length?`<div class="match-grid">${events.map(card).join('')}</div>`:`<p class="empty">${state.tab==='mine'?member?'当前范围还没有本浏览器提交的预测，先去赛程页选一场。':'先在上方选择自己的 ID。':'当前筛选没有比赛，可切换日期或查看整个赛事。'}</p>`);
 document.querySelectorAll('.team img').forEach(img=>img.onerror=()=>{img.style.visibility='hidden';});
 document.querySelectorAll('[data-pick-form]').forEach(form=>{
  const e=events.find(e=>e.id===form.dataset.pickForm),get=()=>drafts.get(draftKey(e))||e.mine||{winnerId:'',loserWins:0};
  form.querySelectorAll('[data-winner]').forEach(button=>button.onclick=()=>{drafts.set(draftKey(e),{...get(),winnerId:button.dataset.winner});paint();});
  if(form.elements.loserWins)form.elements.loserWins.onchange=()=>drafts.set(draftKey(e),{...get(),loserWins:Number(form.elements.loserWins.value)});
  form.onsubmit=async event=>{event.preventDefault();if(pending.has(e.id))return;const draft=get();pending.add(e.id);message('正在提交…');paint();
   try{await call('/predictions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId:e.id,memberKey:member,signature:e.signature,winnerId:draft.winnerId,loserWins:draft.loserWins})});drafts.delete(draftKey(e));message('预测已保存，封盘前可以修改。');await load();}
   catch(error){message(error.message,true);}finally{pending.delete(e.id);paint();}
  };
 });
}
async function call(path,opts={}){const r=await fetch(api+path,{...opts,headers:{...(key?{'X-Prediction-Key':key}:{}),...opts.headers},signal:AbortSignal.timeout(20000)});let data;try{data=await r.json();}catch{throw new Error('服务返回异常，请稍后重试');}if(!r.ok)throw new Error(data.error||'读取失败');return data;}
async function load(){
 if(state.loading){state.reload=true;return;}state.loading=true;$('refresh').disabled=true;
 const selected=JSON.stringify([member,state.season,state.day,state.stage]);
 try{
  let query=new URLSearchParams({member,season:state.season,day:state.day||'',stage:state.stage}),d=await call('/predictions?'+query);
  if(selected!==JSON.stringify([member,state.season,state.day,state.stage])){state.reload=true;return;}
  state.offset=d.serverTime-Date.now();if(!d.members.some(m=>m.key===member))member='';state.season=d.season;
  if(state.day===null){const upcoming=d.events.find(e=>e.ready&&!e.locked);state.day=upcoming?.day||d.events.at(-1)?.day||'';if(state.day){query.set('day',state.day);query.set('season',state.season);d=await call('/predictions?'+query);}}
  state.data=d;paint();
 }catch(error){message(error.message+'，可点击刷新重试。',true);if(!state.data)$('prediction-content').innerHTML='<p class="empty">赛事服务暂未连接。<br>请点击上方刷新赛程重试。</p>';}
 finally{state.loading=false;$('refresh').disabled=false;if(state.reload){state.reload=false;load();}}
}
$('identity').onchange=event=>{member=event.target.value;try{localStorage.setItem(config.identityStorageKey,member);}catch{}load();};
for(const field of ['day','stage','season'])$(field).onchange=event=>{state[field]=event.target.value;if(field==='season'){state.day='';state.stage='';}load();};
$('all').onclick=()=>{state.day='';state.stage='';load();};$('refresh').onclick=()=>load();
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;history.replaceState(null,'','#'+state.tab);paint();});
setInterval(()=>{if(document.visibilityState==='visible'&&!pending.size&&!document.activeElement?.closest('form'))load();},60000);
load();
})();
