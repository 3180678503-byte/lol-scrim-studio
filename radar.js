(() => {
'use strict';
const COLORS=['#29b6f6','#ff805c'],ROLE={TOP:'上单',JUNGLE:'打野',MIDDLE:'中单',BOTTOM:'射手',UTILITY:'辅助'};
const BASE_AXES=[
 {key:'share',label:'伤害占比',unit:'%',get:p=>p.damageShare},
 {key:'tank',label:'每死承伤',unit:'伤害',get:p=>p.damageTaken==null?null:p.damageTaken/Math.max(1,p.deaths)},
 {key:'gold',label:'经济',unit:'金币',get:p=>p.gold},
 {key:'cs',label:'补刀',unit:'个',get:p=>p.cs},
 {key:'takedowns',label:'参与击杀',unit:'次',get:p=>p.kills+p.assists},
 {key:'kp',label:'参团率',unit:'%',get:p=>p.kp},
 {key:'survival',label:'生存',unit:'负阵亡数',get:p=>-p.deaths},
 {key:'damage',label:'伤害',unit:'伤害',get:p=>p.damage}
];
// Clockwise axis order follows the referenced post-game video. Weights are studio defaults.
const EXTRA_AXES={
 conversion:{key:'conversion',label:'伤转',unit:'%',get:p=>p.damage==null||!(p.gold>0)?null:p.damage/p.gold},
 vision:{key:'vision',label:'视野',unit:'视野得分',get:p=>p.vision}
};
const ROLE_CONFIG={
 TOP:{weights:[10,25,10,10,5,10,20,10],focus:'承伤与生存'},
 JUNGLE:{weights:[10,15,10,5,15,25,15,5],focus:'参团与节奏'},
 MIDDLE:{weights:[20,20,10,10,10,10,10,10],focus:'输出与伤害转化'},
 BOTTOM:{weights:[20,20,10,15,10,10,10,5],focus:'输出、伤害转化与补刀'},
 UTILITY:{weights:[5,15,5,25,15,20,10,5],focus:'视野与参团'}
};
function roleAxes(role){const axes=BASE_AXES.slice();if(['MIDDLE','BOTTOM'].includes(role))axes[1]=EXTRA_AXES.conversion;if(role==='UTILITY')axes[3]=EXTRA_AXES.vision;return axes.map((a,i)=>({...a,weight:ROLE_CONFIG[role].weights[i]}));}
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,a,avg=false)=>v==null?'—':a.unit==='%'?(v*100).toFixed(1)+'%':v.toLocaleString('zh-CN',{maximumFractionDigits:avg?1:0});
const avg=values=>{const a=values.filter(v=>v!=null&&Number.isFinite(v));return a.length?a.reduce((s,v)=>s+v,0)/a.length:null;};
const settings={mode:'single',role:'JUNGLE'};
function percentile(v,pool){if(v==null||pool.length<2)return null;const lower=pool.filter(x=>x<v).length,equal=pool.filter(x=>x===v).length;return 100*(lower+equal/2)/pool.length;}
function model(data,matches,game,options=settings){
 const role=options.role,mode=options.mode,AXES=roleAxes(role),poolRows=data.matches.flatMap(m=>m.players.filter(p=>p.role===role));
 const pools=AXES.map(a=>poolRows.map(a.get).filter(v=>v!=null&&Number.isFinite(v))),selected=mode==='single'?[game]:matches;
 const sides=[100,200].map(team=>{
  const rows=selected.flatMap(m=>m.players.filter(p=>p.team===team&&p.role===role).map(p=>({...p,matchNumber:m.number})));
  const exact=rows.length===1?rows[0]:null,raw=AXES.map(a=>avg(rows.map(a.get))),scores=AXES.map((a,i)=>avg(rows.map(p=>percentile(a.get(p),pools[i]))));
  const awards=mode==='single'?data.awards?.matches?.[String(game.number)]||[]:[];
  const award=exact?(awards.find(r=>r.key===exact.key&&['mvp','svp'].includes(r.category))||awards.find(r=>r.key===exact.key)):null;
  const coverage=scores.reduce((n,v,i)=>n+(v==null?0:AXES[i].weight),0),positionScore=coverage===100?scores.reduce((n,v,i)=>n+v*AXES[i].weight/100,0):null;
  return {positionScore,coverage,team,rows:rows.length,name:exact?exact.name:(team===100?'蓝侧':'红侧')+ROLE[role]+'均值',key:exact?.key||null,championId:exact?.championId||null,names:[...new Set(rows.map(p=>p.name))],heroes:[...new Set(rows.map(p=>p.championId))],raw,scores,samples:AXES.map((a,i)=>rows.filter(p=>a.get(p)!=null&&percentile(a.get(p),pools[i])!=null).length),kills:avg(rows.map(p=>p.kills)),deaths:avg(rows.map(p=>p.deaths)),assists:avg(rows.map(p=>p.assists)),goldShare:avg(rows.map(p=>p.goldShare)),wins:rows.filter(p=>p.win).length,award:award?.category||null,title:award?.title||null,roast:award?.roast||null};
 });
 sides.forEach((side,i)=>{if(!side.roast){const lead=AXES.map((a,k)=>({label:a.label,diff:side.scores[k]!=null&&sides[1-i].scores[k]!=null?side.scores[k]-sides[1-i].scores[k]:null})).filter(a=>a.diff>0).sort((a,b)=>b.diff-a.diff).slice(0,2);side.title=lead.length?'面板亮点：'+lead.map(a=>a.label).join(' / '):'先把面板摆出来';side.roast=lead.length?`这组的${lead.map(a=>a.label).join('、')}更突出。群里复盘记得带上这张图，发言先把证据贴好。`:'这组的八项数据都在图上了。下局先把短板补圆，再来群里争第一把交椅。';}});
 return {weightSource:'studio-default-v1',focus:ROLE_CONFIG[role].focus,mode,role,roleName:ROLE[role],gameNumber:game.number,title:mode==='single'?`G${game.number} · ${ROLE[role]}对位`:`所选 ${matches.length} 场 · ${ROLE[role]}均值`,date:mode==='single'?game.date:matches.length?matches[0].date+(matches.at(-1).date===matches[0].date?'':' 至 '+matches.at(-1).date):'',start:mode==='single'?game.start:'',duration:mode==='single'?game.duration:null,winner:mode==='single'?game.winner:null,matchNumbers:selected.map(m=>m.number),referenceGames:data.matches.length,referenceRows:poolRows.length,axes:AXES.map((a,i)=>({key:a.key,label:a.label,unit:a.unit,weight:a.weight,poolSamples:pools[i].length})),sides};
}
function svg(m){
 const AXES=m.axes;
 const cx=320,cy=255,r=155,point=(i,k=1)=>{const t=-Math.PI/2+i*Math.PI/4;return [cx+Math.cos(t)*r*k,cy+Math.sin(t)*r*k];},coords=a=>a.map(p=>p.map(v=>v.toFixed(2)).join(',')).join(' ');
 let html=`<svg class="radar-svg" viewBox="0 0 640 550" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(m.title)}八项数据雷达，同位置历史百分位"><rect width="640" height="550" fill="#2b2e36"/>`;
 [20,40,60,80,100].forEach(k=>{html+=`<polygon points="${coords(AXES.map((_,i)=>point(i,k/100)))}" fill="none" stroke="#7a8291" stroke-opacity="${k===100?.6:.3}" stroke-width="1"/>`;});
 AXES.forEach((_,i)=>{const p=point(i);html+=`<line x1="${cx}" y1="${cy}" x2="${p[0]}" y2="${p[1]}" stroke="#768090" stroke-opacity=".25"/>`;});
 m.sides.map((_,i)=>i).reverse().forEach(side=>{const s=m.sides[side],valid=s.scores.every(v=>v!=null),points=s.scores.map((v,i)=>v==null?null:point(i,v/100));
  if(valid)html+=`<polygon class="radar-area" points="${coords(points)}" fill="${COLORS[side]}" fill-opacity=".28" stroke="${COLORS[side]}" stroke-width="2.8"/>`;
  else{points.forEach((p,i)=>{const next=points[(i+1)%8];if(p&&next)html+=`<line x1="${p[0]}" y1="${p[1]}" x2="${next[0]}" y2="${next[1]}" stroke="${COLORS[side]}" stroke-width="2.8"/>`;});}
  points.forEach((p,i)=>{if(p)html+=`<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="${COLORS[side]}"><title>${esc(s.name)} · ${AXES[i].label} ${fmt(s.raw[i],m.axes[i],m.mode==='series')} · 百分位 ${s.scores[i].toFixed(1)}</title></circle>`;});
 });
 html+=`<text x="${cx}" y="${cy-6}" text-anchor="middle" fill="#c6ccd5" opacity=".5" font-size="14">同位置</text><text x="${cx}" y="${cy+16}" text-anchor="middle" fill="#c6ccd5" opacity=".5" font-size="13">0–100</text>`;
 AXES.forEach((a,i)=>{const theta=-Math.PI/2+i*Math.PI/4,x=cx+Math.cos(theta)*211,y=cy+Math.sin(theta)*211,anchor=Math.cos(theta)>.3?'start':Math.cos(theta)<-.3?'end':'middle';
  html+=`<g class="radar-axis" tabindex="0" data-radar-axis="${i}" aria-label="${esc(a.label+'，'+m.sides.map(s=>s.name+' '+fmt(s.raw[i],a,m.mode==='series')).join('，'))}"><title>${a.label} · ${a.unit}；参照 ${m.axes[i].poolSamples} 条同位置样本</title><text x="${x}" y="${y}" text-anchor="${anchor}" fill="#f3f5fa" font-size="18" font-weight="700">${a.label}</text><text x="${x}" y="${y+23}" text-anchor="${anchor}" fill="${COLORS[0]}" font-size="17">${fmt(m.sides[0].raw[i],m.axes[i],m.mode==='series')}</text>${m.sides.length===2?`<text x="${x}" y="${y+44}" text-anchor="${anchor}" fill="${COLORS[1]}" font-size="17">${fmt(m.sides[1].raw[i],m.axes[i],m.mode==='series')}</text>`:''}</g>`;
 });
 return html+'</svg>';
}
function sideCard(m,i,data,helpers){const s=m.sides[i],side=i===0?'蓝侧':'红侧',win=m.winner===s.team,hname=id=>data.champions[String(id)]?.title||data.champions[String(id)]?.name||'未知英雄';
 const awards={mvp:'MVP',svp:'SVP',winWorst:'搭车位',loseWorst:'背锅位'},kda=s.rows?((s.kills+s.assists)*s.rows)/Math.max(1,s.deaths*s.rows):null;
 return `<article class="radar-person radar-person-${i}"><div class="radar-side-label">${side} · ${m.roleName}${m.winner===s.team?' <b>胜</b>':''}<span>${s.award?awards[s.award]:''}</span></div><div class="radar-avatar">${s.championId?helpers.avatar(s.championId,'radar-hero'):`<span class="radar-hero-placeholder">${m.roleName}</span>`}</div><h3>${s.key?helpers.playerButton(s.key,s.name):esc(s.name)}</h3><p class="radar-champ">${s.championId?esc(hname(s.championId)):s.rows+' 条出场 · '+s.wins+' 胜'}</p><div class="radar-kda">${s.rows?`${s.kills.toFixed(m.mode==='series'?1:0)}<em>/</em>${s.deaths.toFixed(m.mode==='series'?1:0)}<em>/</em>${s.assists.toFixed(m.mode==='series'?1:0)}`:'—'}</div><p class="radar-kda-caption">${m.mode==='series'?'场均 K / D / A':'K / D / A'} · KDA ${kda==null?'—':kda.toFixed(2)}</p><p class="radar-position-score">位置表现分 <b>${s.positionScore==null?'—':s.positionScore.toFixed(1)}</b><small> / 100 · ${m.focus}${s.coverage<100?' · 数据覆盖 '+s.coverage+'%':''}</small></p><div class="radar-stats"><span>伤害占比<b>${fmt(s.raw[0],m.axes[0])}</b></span><span>经济占比<b>${s.goldShare==null?'—':(100*s.goldShare).toFixed(1)+'%'}</b></span><span>参团率<b>${fmt(s.raw[5],m.axes[5])}</b></span><span>出场<b>${s.rows} 场</b></span></div><div class="radar-roast"><small>原创锐评</small><h4>${esc(s.title)}</h4><p>${esc(s.roast)}</p></div>${m.mode==='series'?`<p class="radar-roster">实际选手：${s.names.map(esc).join(' / ')||'暂无'}</p>`:''}</article>`;
}
let active=null;
function render(data,matches,game,appState,helpers){
 const m=model(data,matches,game);active=m;
 return `<div class="section-head"><div><h2>赛后雷达 · 对位一眼看懂</h2><p>蓝橙双人对位 · 五位置独立指标与权重 · 同位置历史百分位</p></div></div><div class="radar-controls"><label>图表范围 <select id="radar-mode"><option value="single" ${settings.mode==='single'?'selected':''}>单局对位</option><option value="series" ${settings.mode==='series'?'selected':''}>所选场次合并</option></select></label><label>位置 <select id="radar-role">${Object.entries(ROLE).map(([key,name])=>`<option value="${key}" ${settings.role===key?'selected':''}>${name}</option>`).join('')}</select></label>${settings.mode==='single'?`<label>比赛 <select id="radar-game">${data.matches.map(m=>`<option value="${m.number}" ${m.number===game.number?'selected':''}>G${m.number} · ${m.date} ${m.start}</option>`).join('')}</select></label>`:''}<a class="radar-png-pack" href="https://3180678503-byte.github.io/lol-scrim-studio/radar-samples/scrim-radars-25.zip" download>下载 25 张试作 PNG ↗</a><button class="primary-button" id="radar-save-svg">下载图表 SVG</button></div><div class="radar-broadcast" id="radar-capture"><div class="radar-broadcast-head"><span>蓝侧 ${m.winner===100?'· 胜':''}</span><div><strong>${esc(m.title)}</strong><small>${esc(m.date)}${m.start?' · '+m.start:''}</small></div><span>红侧 ${m.winner===200?'· 胜':''}</span></div><div class="radar-stage">${sideCard(m,0,data,helpers)}<div class="radar-center">${svg(m)}<p id="radar-axis-note">悬停或点选坐标轴可查看指标说明</p><div class="radar-legend"><span style="color:${COLORS[0]}">● 蓝侧</span><span style="color:${COLORS[1]}">● 红侧</span><span>轮廓越向外，该指标的同位置相对表现越高</span></div></div>${sideCard(m,1,data,helpers)}</div></div><details class="radar-methods"><summary>查看${m.roleName}指标、权重与得分明细</summary><p>八个轴分别使用各自的位置样本百分位，50 为该指标的中游参照；同值取并列中点。参照池固定为本页全部 ${m.referenceGames} 场中的 ${m.referenceRows} 条${m.roleName}出场记录。单局显示实值；合并图显示每局实值均值与每局百分位均值。蓝红代表每场地图侧，合并名单按实际位置显示。</p><p>视频位置轴：上单、打野用每死承伤与补刀；中单、射手用伤转与补刀；辅助用每死承伤与视野。伤转＝英雄伤害 ÷ 获得金币；视野使用客户端视野得分 visionScore。生存＝负阵亡数；每死承伤＝总承伤 ÷ max(1,死亡数)。</p><p>位置表现分＝Σ（各轴同位置百分位 × 该位置权重），范围 0–100；每个位置权重合计 100%。以下权重是本站配置，视频未给出八轴数值权重。轮廓使用百分位，权重用于位置表现分。缺项断开连线，得分显示 —，同时展示有效权重覆盖。此分数与现有灵排综合分分别定义。</p><div class="table-wrap"><table><thead><tr><th>指标</th><th>${m.roleName}权重</th><th>蓝侧实值</th><th>红侧实值</th><th>蓝 / 红百分位</th><th>加权贡献 蓝 / 红</th><th>有效出场 蓝 / 红</th></tr></thead><tbody>${m.axes.map((a,i)=>`<tr><td>${a.label}</td><td>${a.weight}%</td><td>${fmt(m.sides[0].raw[i],m.axes[i],m.mode==='series')}</td><td>${fmt(m.sides[1].raw[i],m.axes[i],m.mode==='series')}</td><td>${m.sides.map(s=>s.scores[i]==null?'—':s.scores[i].toFixed(1)).join(' / ')}</td><td>${m.sides.map(s=>s.scores[i]==null?'—':(s.scores[i]*a.weight/100).toFixed(2)).join(' / ')}</td><td>${m.sides[0].samples[i]} / ${m.sides[1].samples[i]}</td></tr>`).join('')}</tbody></table></div><p><a href="https://www.bilibili.com/video/BV19kpz64EYW" target="_blank" rel="noopener">参考视频：BRO 3-1 LGD 赛后数据雷达图 ↗</a> · 此处使用本次内战真实数据与原有原创锐评。</p></details>`;
}
function bind(appState,rerender){
 const el=id=>document.getElementById(id);
 if(el('radar-mode'))el('radar-mode').onchange=e=>{settings.mode=e.target.value;rerender();};
 if(el('radar-role'))el('radar-role').onchange=e=>{settings.role=e.target.value;rerender();};
 if(el('radar-game'))el('radar-game').onchange=e=>{appState.match=Number(e.target.value);rerender();};
 document.querySelectorAll('[data-radar-axis]').forEach(g=>{const explain=()=>{const i=Number(g.dataset.radarAxis),a=active.axes[i];el('radar-axis-note').textContent=`${a.label} · ${a.unit} · ${active.roleName}权重 ${a.weight}% · 蓝侧 ${fmt(active.sides[0].raw[i],a,active.mode==='series')} / 红侧 ${fmt(active.sides[1].raw[i],a,active.mode==='series')} · 参照 ${active.axes[i].poolSamples} 条同位置记录`;};g.onmouseenter=explain;g.onclick=explain;g.onfocus=explain;});
 if(el('radar-save-svg'))el('radar-save-svg').onclick=()=>{const value=svg(active).replace('<svg ','<svg style="font-family:Microsoft YaHei,Arial,sans-serif" '),url=URL.createObjectURL(new Blob([value],{type:'image/svg+xml;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='内战雷达_'+active.title.replace(/[\\/:*?"<>|]/g,'_')+'.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);};
}
window.SCRIM_RADAR={model,render,bind,svg,ROLE_CONFIG,metrics:roleAxes,axes:role=>roleAxes(role).map(({get,...a})=>a),settings};
})();
