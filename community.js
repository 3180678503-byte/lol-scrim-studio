(() => {
'use strict';
const P=window.PERFORMANCE,Core=window.COMMUNITY_CORE,config=window.COMMUNITY_CONFIG||{},members=window.COMMUNITY_MEMBERS||[];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let saved='';try{saved=localStorage.getItem(config.identityStorageKey)||'';}catch{}
const settings={rater:members.some(m=>m.key===saved)?saved:'',scope:'match',match:null,day:null,player:null,role:null,compare:''};
const initial=new URLSearchParams(location.search);
Object.assign(settings,{scope:initial.get('reviewScope')==='day'?'day':'match',player:initial.get('reviewPlayer'),day:initial.get('reviewDay'),match:Number(initial.get('reviewMatch'))||null,role:initial.get('reviewRole')});
const api=config.apiBase?.replace(/\/$/,'')||'',drafts=new Map(),pending=new Set(),reviewsCache=new Map();
let active=null,version=0,state={stars:0,comment:''};
const draftKey=()=>active?.id+'|'+active?.rater;
function stash(){if(!active)return;const field=document.getElementById('community-comment');if(field)state.comment=field.value;drafts.set(draftKey(),{...state});}
function starsHTML(){return [1,2,3,4,5].map(n=>`<button type="button" data-community-star="${n}" aria-label="给 ${n} 星" aria-pressed="${state.stars===n}" class="${n<=state.stars?'selected':''}" ${!settings.rater?'disabled':''}>★</button>`).join('');}
function render(data){
 stash();const ctx=P.context(data,settings);
 Object.assign(settings,{scope:ctx.scope,player:ctx.playerKey,day:ctx.day,match:ctx.game?.number||null,role:ctx.role,compare:ctx.compare});
 if(ctx.rows.length&&location.hash==='#community')try{const url=new URL(location.href);for(const [key,value] of [['reviewScope',ctx.scope],['reviewPlayer',ctx.playerKey],['reviewDay',ctx.day],['reviewRole',ctx.role],['reviewMatch',ctx.scope==='match'?ctx.game?.number:null]]){if(value!=null)url.searchParams.set(key,value);else url.searchParams.delete(key);}history.replaceState(null,'',url);}catch{}
 const target={kind:ctx.scope,playerKey:ctx.playerKey,...(ctx.scope==='match'?{matchKey:ctx.game?.matchKey}:{day:ctx.day,dataset:ctx.dataset})};
 active={target,id:ctx.rows.length?Core.targetId(target):null,ctx,rater:settings.rater};version++;state={stars:0,comment:'',...(drafts.get(draftKey())||{})};
 const ready=!!api&&location.protocol!=='file:'&&!!active.id,busy=pending.has(draftKey());
 const opts=(items,key,value,label)=>items.map(x=>`<option value="${esc(x[key])}" ${x[key]===value?'selected':''}>${esc(label(x))}</option>`).join('');
 return `<div class="section-head"><div><h2>表现与评分 · 看面板，再开麦</h2><p>玩家、日期与场次共用一组选择，雷达、锐评和群友评分一起切换。</p></div><a class="performance-more" href="#radar">更多雷达对比 ↗</a></div>
 <div class="performance-controls"><div class="performance-scope" role="group" aria-label="评价范围"><button data-community-scope="match" class="${ctx.scope==='match'?'selected':''}" aria-pressed="${ctx.scope==='match'}">单局表现</button><button data-community-scope="day" class="${ctx.scope==='day'?'selected':''}" aria-pressed="${ctx.scope==='day'}">当天表现</button></div><label>被评价的玩家<select id="community-player">${opts(ctx.players,'key',ctx.playerKey,p=>p.name)}</select></label><label>日期 · 04:00 换日<select id="community-day">${ctx.days.map(day=>`<option value="${day}" ${ctx.day===day?'selected':''}>${day}</option>`).join('')}</select></label>${ctx.scope==='match'?`<label>比赛<select id="community-match">${opts([...ctx.gameChoices].reverse(),'number',settings.match,m=>`${ctx.dataset==='scrim'?'G':'F'}${m.number} · ${m.date} ${m.start}`)}</select></label>`:''}</div>
 <p class="footnote performance-range-note">${ctx.scope==='day'?'本页使用该玩家这一天已入库的全部出场。':'本页按玩家、04:00 日期和具体对局选择战绩。'} ${esc(P.caption(ctx))}</p>
 <div class="performance-rating-layout">${P.render(data,ctx)}<aside class="community-panel performance-rating-panel">
 <div class="community-heading"><div><span class="performance-eyebrow">正在评价 · ${ctx.scope==='day'?'当天整体':'这一局'}</span><h3 id="community-target-name">${esc(ctx.name)}</h3><p id="community-target-caption">${esc(P.caption(ctx))}${ctx.scope==='day'?' · 包含所有位置':''}</p></div><button id="community-refresh" class="text-button" ${!ready?'disabled':''}>刷新 ↻</button></div>
 <h4 class="community-rating-title">群友评分 <small>1–5 星</small></h4><div id="community-live"><p class="muted">${ready?'正在读取大家的评分…':location.protocol==='file:'?'在公开网站中可以提交共享评分。':'当前没有可评价的对局。'}</p></div>
 <div class="community-form"><h4>发表你的评价</h4><div class="community-identity"><label>我是谁<select id="community-rater"><option value="">请选择你自己的 ID</option>${opts(members,'key',settings.rater,m=>m.name)}</select></label><span>本浏览器会记住你的署名。</span></div><p id="community-my-rating" class="footnote">${settings.rater?'当前署名：'+esc(members.find(m=>m.key===settings.rater)?.name):'先选择自己的 ID，再打星或评论'}</p>
 <div class="community-stars" role="group" aria-label="一到五星评分">${starsHTML()}<span id="community-star-label">${state.stars?state.stars+' 星':'尚未选择星级'}</span></div><label class="community-comment-label">评论<textarea id="community-comment" maxlength="1000" rows="4" placeholder="看完面板，你怎么评价这次表现？" ${!settings.rater?'disabled':''}>${esc(state.comment)}</textarea></label><p class="footnote">同一 ID 对同一对象计一份评分，再打星会更新；也可以只评论。</p><button class="primary-button" id="community-submit" ${!settings.rater||!ready||busy?'disabled':''}>${busy?'正在提交…':'提交评分 / 评论'}</button><p id="community-feedback" role="status" class="footnote"></p></div>
 </aside></div>${P.games(data,ctx)}<section class="community-panel community-comment-panel"><div class="community-heading"><div><h3>群友评论</h3><p>${esc(ctx.name)} · ${esc(P.caption(ctx))}</p></div></div><div id="community-comments" class="community-comments"><p class="muted">${ready?'正在读取评论…':'在公开网站中查看大家的评论。'}</p></div></section>`;
}
function paint(reviews){
 const el=document.getElementById('community-live');if(!el)return;
 const mean=reviews.mean==null?'—':reviews.mean.toFixed(1),counts=reviews.histogram?.slice().reverse()||[];
 el.innerHTML=`<div class="community-score"><strong>${mean}</strong><span> / 5 星<small>${reviews.voteCount} 个 ID 评分 · ${reviews.commentCount} 条评论</small></span></div><div class="community-distribution">${counts.map(h=>`<div><span>${h.stars} 星</span><i><b style="width:${reviews.voteCount?h.count/reviews.voteCount*100:0}%"></b></i><small>${h.count}</small></div>`).join('')}</div>${reviews.votes?.length?`<details class="community-voters"><summary>查看大家的星级</summary>${reviews.votes.map(v=>`<p>${esc(v.name||members.find(m=>m.key===v.raterKey)?.name||v.raterKey)}<span>${'★'.repeat(v.stars)}</span></p>`).join('')}</details>`:''}`;
 const comments=document.getElementById('community-comments');if(comments)comments.innerHTML=reviews.comments?.length?reviews.comments.map(c=>`<article><div><b>${esc(c.name)}</b><time>${esc(new Date(c.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}))}</time></div><p>${esc(c.comment)}</p></article>`).join(''):'<p class="muted">还没有评论，来坐第一排。</p>';
 const own=reviews.votes?.find(v=>v.raterKey===settings.rater),caption=document.getElementById('community-my-rating');if(caption&&own)caption.textContent=`你已给出 ${own.stars} 星，可重新打星更新。`;
}
async function load(){
 if(!api||location.protocol==='file:'||!active?.id)return;
 const id=active.id,current=version,node=document.getElementById('community-live');if(!node)return;
 if(reviewsCache.has(id))paint(reviewsCache.get(id));
 try{const response=await fetch(api+'/reviews?'+new URLSearchParams(active.target)),value=await response.json();if(!response.ok)throw new Error(value.error||'读取评分失败');reviewsCache.set(id,value);if(version===current&&active.id===id)paint(value);}
 catch(e){if(version===current&&node.isConnected){node.innerHTML='<p class="muted">'+esc(e.message)+'。可点击刷新重试。</p>';const comments=document.getElementById('community-comments');if(comments&&!reviewsCache.has(id))comments.innerHTML='<p class="muted">评论暂未读取到，可点击刷新重试。</p>';}}
}
function bind(rerender){
 const el=id=>document.getElementById(id),change=fn=>{stash();fn();rerender();};
 for(const [id,key] of [['community-rater','rater'],['community-match','match'],['community-day','day'],['community-player','player'],['performance-compare','compare']])if(el(id))el(id).onchange=e=>change(()=>{settings[key]=key==='match'?Number(e.target.value):e.target.value;if(key==='rater')try{localStorage.setItem(config.identityStorageKey,settings.rater);}catch{}});
 document.querySelectorAll('[data-community-scope]').forEach(b=>b.onclick=()=>change(()=>settings.scope=b.dataset.communityScope));
 document.querySelectorAll('[data-performance-role]').forEach(b=>b.onclick=()=>change(()=>{settings.role=b.dataset.performanceRole;settings.compare='';}));
 document.querySelectorAll('[data-performance-game]').forEach(b=>b.onclick=()=>change(()=>{settings.match=Number(b.dataset.performanceGame);settings.scope='match';document.querySelector('.performance-controls')?.scrollIntoView({block:'start',behavior:'smooth'});}));
 if(el('performance-back-day'))el('performance-back-day').onclick=()=>change(()=>settings.scope='day');
 if(el('community-comment'))el('community-comment').oninput=()=>{state.comment=el('community-comment').value;drafts.set(draftKey(),{...state});};
 document.querySelectorAll('[data-community-star]').forEach(b=>b.onclick=()=>{state.stars=Number(b.dataset.communityStar);drafts.set(draftKey(),{...state});document.querySelectorAll('[data-community-star]').forEach(x=>{x.classList.toggle('selected',Number(x.dataset.communityStar)<=state.stars);x.setAttribute('aria-pressed',String(Number(x.dataset.communityStar)===state.stars));});el('community-star-label').textContent=state.stars+' 星';});
 if(el('community-refresh'))el('community-refresh').onclick=load;
 const radar=active.ctx.radar;
 if(radar)document.querySelectorAll('[data-radar-axis]').forEach(g=>{const update=()=>{const i=Number(g.dataset.radarAxis),a=radar.axes[i];el('performance-axis-note').textContent=a.label+' · '+a.weight+'% 权重 · '+radar.sides.map(s=>s.name+' '+(s.raw[i]==null?'—':a.unit==='%'?(s.raw[i]*100).toFixed(1)+'%':s.raw[i].toFixed(1))).join(' / ');};g.onclick=update;g.onmouseenter=update;g.onfocus=update;});
 if(el('performance-save'))el('performance-save').onclick=()=>{const title=active.ctx.name+' · '+P.caption(active.ctx)+' · '+P.ROLES[radar.role],url=URL.createObjectURL(new Blob([window.FRIEND_RADAR.exportSVG({...radar,title})],{type:'image/svg+xml;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=title.replace(/[\\/:*?"<>|]/g,'_')+'.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);};
 if(el('community-submit'))el('community-submit').onclick=async()=>{
 const key=draftKey();if(pending.has(key)||!settings.rater||!active.id)return;
 const comment=el('community-comment').value.trim();if(!state.stars&&!comment){el('community-feedback').textContent='请选择星级或填写评论';return;}
 const id=active.id,rater=settings.rater,body={target:active.target,raterKey:rater,stars:state.stars||null,comment,requestId:crypto.randomUUID()};pending.add(key);el('community-submit').disabled=true;el('community-feedback').textContent='正在提交…';
 try{const response=await fetch(api+'/entries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),value=await response.json();if(!response.ok)throw new Error(value.error||'提交失败');reviewsCache.set(id,value);drafts.delete(key);if(active.id===id&&settings.rater===rater&&el('community-feedback')){paint(value);state.comment='';el('community-comment').value='';el('community-feedback').textContent='已发表，其他朋友现在可以看到';}}
 catch(e){if(active.id===id&&settings.rater===rater&&el('community-feedback'))el('community-feedback').textContent=e.message;}
 finally{pending.delete(key);if(active.id===id&&settings.rater===rater&&el('community-submit')){el('community-submit').disabled=false;el('community-submit').textContent='提交评分 / 评论';}}
 };
 load();
}
window.COMMUNITY={render,bind,settings};
})();
