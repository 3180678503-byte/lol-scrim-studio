(() => {
'use strict';
const R=window.SCRIM_RADAR,F=window.FRIEND_RADAR,C=window.FLEX_REPORT_CORE;
const ROLES={TOP:'上单',JUNGLE:'打野',MIDDLE:'中单',BOTTOM:'射手',UTILITY:'辅助',UNKNOWN:'未确认位置'};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,digits=1)=>v==null||!Number.isFinite(v)?'—':v.toLocaleString('zh-CN',{maximumFractionDigits:digits});
const pct=v=>v==null?'—':fmt(v*100)+'%';
const average=values=>{const a=values.filter(Number.isFinite);return a.length?a.reduce((n,v)=>n+v,0)/a.length:null;};
const hero=(data,p)=>data.champions?.[String(p.championId)]?.title||data.champions?.[String(p.championId)]?.name||'未知英雄';
function context(data,options={}){
 const matches=[...new Map(data.matches.map(m=>[m.matchKey,m])).values()].sort((a,b)=>C.timestamp(a)-C.timestamp(b));
 const players=[...new Map(matches.flatMap(m=>m.players).map(p=>[p.key,{key:p.key,name:p.name}])).values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
 const playerKey=players.some(p=>p.key===options.player)?options.player:players.find(p=>p.key===data.focusPlayerKey)?.key||players[0]?.key||null;
 const personal=matches.filter(m=>m.players.some(p=>p.key===playerKey)),days=C.periods(personal,'daily');
 const scope=options.scope==='day'?'day':'match',day=days.includes(options.day)?options.day:days[0]||null;
 const dayMatches=matches.filter(m=>C.dayKey(m)===day),gameChoices=personal.filter(m=>C.dayKey(m)===day);
 const game=gameChoices.find(m=>m.number===options.match)||gameChoices.at(-1)||null,selected=scope==='day'?dayMatches:game?[game]:[];
 const rows=selected.flatMap(match=>match.players.filter(p=>p.key===playerKey).map(player=>({match,player})));
 const roles=Object.keys(ROLES).map(key=>({key,name:ROLES[key],games:rows.filter(r=>r.player.role===key).length})).filter(r=>r.games);
 const role=scope==='match'?rows[0]?.player.role:roles.some(r=>r.key===options.role)?options.role:[...roles].sort((a,b)=>b.games-a.games)[0]?.key;
 const peers=selected.flatMap(m=>m.players.filter(p=>p.role===role&&p.key!==playerKey).map(p=>[p.key,{key:p.key,name:p.name}]));
 const comparisonChoices=R.ROLE_CONFIG[role]?[...new Map(peers).values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')):[];
 const compare=comparisonChoices.some(p=>p.key===options.compare)?options.compare:'';
 const radar=R.ROLE_CONFIG[role]&&rows.length?F.model(data,selected,role,[playerKey,...(compare?[compare]:[])]):null;
 return {dataset:data.datasetType||'scrim',scope,playerKey,name:players.find(p=>p.key===playerKey)?.name||'暂无玩家',players,days,day,game,gameChoices,selected,rows,roles,role,compare,comparisonChoices,radar};
}
function summary(rows){
 const total=field=>rows.reduce((n,r)=>n+(Number.isFinite(r.player[field])?r.player[field]:0),0);
 const ratio=(numerator,denominator)=>{const valid=rows.filter(r=>Number.isFinite(numerator(r.player))&&Number.isFinite(r.player[denominator]));const d=valid.reduce((n,r)=>n+r.player[denominator],0);return d?valid.reduce((n,r)=>n+numerator(r.player),0)/d:null;};
 const rate=field=>{const valid=rows.filter(r=>Number.isFinite(r.player[field])&&r.match.duration>0),minutes=valid.reduce((n,r)=>n+r.match.duration/60,0);return minutes?valid.reduce((n,r)=>n+r.player[field],0)/minutes:null;};
 const kills=total('kills'),deaths=total('deaths'),assists=total('assists'),wins=rows.filter(r=>r.player.win).length;
 return {games:rows.length,wins,losses:rows.length-wins,kills,deaths,assists,kda:(kills+assists)/Math.max(1,deaths),damage:total('damage'),gold:total('gold'),vision:average(rows.map(r=>r.player.vision)),dpm:rate('damage'),csm:rate('cs'),kp:ratio(p=>p.kills+p.assists,'teamKills'),damageShare:ratio(p=>p.damage,'teamDamage'),goldShare:ratio(p=>p.gold,'teamGold'),gd15:average(rows.map(r=>r.player.gd15)),csd15:average(rows.map(r=>r.player.csd15)),gdSamples:rows.filter(r=>Number.isFinite(r.player.gd15)).length};
}
function review(data,match,player){
 if(player.review)return player.review;
 const awards=data.awards?.matches?.[String(match.number)]||data.awards?.matches?.[match.matchKey]||[];
 return awards.find(r=>r.key===player.key)||null;
}
function caption(ctx){
 if(ctx.scope==='match')return ctx.game?`${ctx.dataset==='scrim'?'G':'F'}${ctx.game.number} · ${ctx.game.date} ${ctx.game.start}`:'暂无对局';
 if(!ctx.day)return '暂无日期';
 const w=C.windowFor('daily',ctx.day),end=new Date(w.end+8*3600000).toISOString().slice(0,10);
 return `${ctx.day} 04:00 → ${end} 04:00 · 全天 ${ctx.rows.length} 场`;
}
function render(data,ctx){
 if(!ctx.rows.length)return '<section class="community-panel performance-panel"><p>该玩家暂无已入库对局。</p></section>';
 const s=summary(ctx.rows),single=ctx.scope==='match',current=ctx.rows[0],h=hero(data,current.player),radar=ctx.radar;
 const stat=(label,value,note='')=>`<div class="performance-stat"><span>${label}</span><b>${value}</b>${note?`<small>${note}</small>`:''}</div>`;
 const score=radar?.sides[0]?.positionScore;
 const roles=ctx.roles.map(r=>`<button type="button" data-performance-role="${r.key}" class="${ctx.role===r.key?'selected':''}" aria-pressed="${ctx.role===r.key}">${r.name}<span>${r.games} 场</span></button>`).join('');
 const axisTable=radar?`<details class="performance-methods"><summary>八项实值、位置权重与得分贡献</summary><p>固定参照：本数据集全历史 ${radar.referenceRows} 条${ROLES[ctx.role]}出场。轮廓为同位置百分位；合并时分别平均单局实值和单局百分位。位置表现分＝Σ（百分位 × 位置权重），权重为本站配置。</p><div class="table-wrap"><table><thead><tr><th>指标</th><th>权重</th>${radar.sides.map(x=>`<th>${esc(x.name)}实值</th><th>百分位</th><th>贡献</th>`).join('')}</tr></thead><tbody>${radar.axes.map((a,i)=>`<tr><td>${a.label}</td><td>${a.weight}%</td>${radar.sides.map(x=>`<td>${a.unit==='%'?pct(x.raw[i]):fmt(x.raw[i])}</td><td>${fmt(x.scores[i])}</td><td>${fmt(x.scores[i]==null?null:x.scores[i]*a.weight/100,2)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p>每死承伤＝承伤/max(1,死亡数)，伤转＝英雄伤害/金币，视野＝客户端视野得分。缺项显示 —，不生成完整位置表现分。</p></details>`:'';
 const r=single?review(data,current.match,current.player):null;
 const lab=single&&window.REVIEW_LAB?window.REVIEW_LAB.summaryHTML(data,current.match,current.player):'';
 return `<section class="community-panel performance-panel">
 <div class="performance-player"><div><span class="performance-eyebrow">${single?'单局表现':'当天整体表现'}</span><h3>${esc(ctx.name)}</h3><p>${esc(caption(ctx))}</p></div><span class="performance-result ${s.wins===s.games?'won':''}">${single?(current.player.win?'胜利':'失利'):`${s.wins} 胜 ${s.losses} 负`}</span></div>
 ${single?`<div class="performance-hero"><img src="${esc(data.iconData?.[current.player.championId]||(ctx.dataset==='scrim'?'assets/':'../assets/')+'champion-'+current.player.championId+'.png')}" alt="${esc(h)}"><b>${esc(h)}</b><span>${ROLES[current.player.role]||'未确认位置'} · ${Math.floor(current.match.duration/60)}:${String(current.match.duration%60).padStart(2,'0')}</span></div>`:''}
 <div class="performance-stats">${stat(single?'K / D / A':'全天 K / D / A',`${s.kills} / ${s.deaths} / ${s.assists}`,'汇总 KDA '+fmt(s.kda,2))}${stat('伤害 / 分',fmt(s.dpm,0),'伤害占比 '+pct(s.damageShare))}${stat('参团率',pct(s.kp),'按实际队伍击杀计算')}${stat(single?'经济':'场均经济',fmt(s.gold/s.games,0),'经济占比 '+pct(s.goldShare))}${stat('场均视野',fmt(s.vision),'客户端视野得分')}${stat('15 分钟金币差',(s.gd15>0?'+':'')+fmt(s.gd15,0),`${s.gdSamples} / ${s.games} 场有效`)}</div>
 ${lab}<div class="performance-radar-heading"><div><h4>位置雷达</h4><small>${single?'按本局实际位置展示':'切换位置查看雷达；右侧评分涵盖当天全部出场'}</small></div><button id="performance-save" class="text-button" ${!radar?'disabled':''}>下载 SVG ↗</button></div>
 <div class="performance-role-tabs" aria-label="雷达位置">${roles}</div>
 ${radar?`<div class="performance-chart-head"><span>${ROLES[ctx.role]} · ${radar.sides[0].rows} 场</span><span>位置表现分 <b>${fmt(score)}</b> / 100</span></div><div class="performance-chart">${R.svg(radar)}</div><div class="performance-legend">${radar.sides.map((x,i)=>`<span class="side-${i}">● ${esc(x.name)} · ${x.rows} 场</span>`).join('')}</div><p id="performance-axis-note" class="footnote">点击雷达轴，查看实值与位置权重</p><label class="performance-compare">加入同位置好友对比<select id="performance-compare"><option value="">仅看当前玩家</option>${ctx.comparisonChoices.map(p=>`<option value="${esc(p.key)}" ${p.key===ctx.compare?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><p class="footnote">对比取${single?'同一局':'同一天'}同位置出场；正在评价的仍是 ${esc(ctx.name)}。<a href="#radar">更多场次雷达对比 ↗</a></p>${axisTable}`:`<div class="performance-no-position">位置尚未确认，先看上方基础数据和下方逐局记录。</div>`}
 ${single?`<div class="performance-review"><small>本局赛后锐评</small>${r?`<h4>${esc(r.title)}</h4><p>${esc(r.roast)}</p>${r.reason?`<details><summary>查看点评依据</summary><p>${esc(r.reason)}</p></details>`:''}`:'<p>该选手本局锐评待生成。</p>'}</div><button type="button" id="performance-back-day" class="performance-back">返回这一天的整体表现 ↗</button>`:''}
 </section>`;
}
function games(data,ctx){
 if(!ctx.rows.length)return '';
 const rows=ctx.scope==='day'?ctx.rows:data.matches.flatMap(match=>C.dayKey(match)===ctx.day?match.players.filter(p=>p.key===ctx.playerKey).map(player=>({match,player})):[]);
 return `<section class="community-panel performance-games"><div class="community-heading"><div><h3>${ctx.day} · ${esc(ctx.name)}的逐局记录</h3><p>04:00 到次日 04:00 · 全部 ${rows.length} 场</p></div></div><div class="table-wrap"><table><thead><tr><th>比赛</th><th>英雄 / 位置</th><th>胜负</th><th>K / D / A</th><th>位置表现分</th><th>赛后锐评</th><th>评价</th></tr></thead><tbody>${[...rows].reverse().map(({match:m,player:p})=>{
 const r=review(data,m,p),score=R.ROLE_CONFIG[p.role]?F.model(data,[m],p.role,[p.key]).sides[0].positionScore:null;
 return `<tr class="${ctx.scope==='match'&&ctx.game?.number===m.number?'performance-current-game':''}"><td><b>${ctx.dataset==='scrim'?'G':'F'}${m.number}</b><small>${esc(m.date)} ${esc(m.start)}</small></td><td>${esc(hero(data,p))}<small>${ROLES[p.role]||'未确认位置'}</small></td><td class="${p.win?'positive':'negative'}">${p.win?'胜':'负'}</td><td>${p.kills} / ${p.deaths} / ${p.assists}</td><td>${fmt(score)}</td><td class="performance-game-review">${r?`<details><summary>${esc(r.title)}</summary><p>${esc(r.roast)}</p>${r.reason?`<small>${esc(r.reason)}</small>`:''}</details>`:'锐评待生成'}</td><td><button type="button" data-performance-game="${m.number}" class="text-button">查看并评价这局</button></td></tr>`;
 }).join('')}</tbody></table></div></section>`;
}
window.PERFORMANCE={context,summary,review,caption,render,games,ROLES};
})();
