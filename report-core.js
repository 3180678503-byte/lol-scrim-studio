(function(){
'use strict';
const DAY=86400000,HOUR=3600000,ROLE={TOP:'上单',JUNGLE:'打野',MIDDLE:'中单',BOTTOM:'射手',UTILITY:'辅助',UNKNOWN:'未确认位置'};
const mean=values=>{const vs=values.filter(v=>v!=null&&Number.isFinite(v));return vs.length?vs.reduce((a,v)=>a+v,0)/vs.length:null;};
const format=(v,n=1)=>v==null?'—':v.toLocaleString('zh-CN',{maximumFractionDigits:n}),percent=v=>v==null?'—':(v*100).toFixed(1)+'%';
function timestamp(m){const v=typeof m.createdAt==='number'?m.createdAt:Date.parse(m.createdAt);return Number.isFinite(v)?v:Date.parse(m.date+'T'+m.start+':00+08:00');}
function dayKey(value){const ms=typeof value==='number'?value:timestamp(value);return Number.isFinite(ms)?new Date(ms+4*HOUR).toISOString().slice(0,10):null;}
function weekKey(day){const d=new Date(day+'T00:00:00Z');return new Date(d.getTime()-((d.getUTCDay()+6)%7)*DAY).toISOString().slice(0,10);}
function windowFor(kind,period){const day=kind==='weekly'?weekKey(period):period,start=Date.parse(day+'T04:00:00+08:00');if(!Number.isFinite(start))throw new Error('Invalid report date');return {period:day,start,end:start+(kind==='weekly'?7:1)*DAY};}
function periods(matches,kind){return [...new Set(matches.map(dayKey).filter(Boolean).map(d=>kind==='weekly'?weekKey(d):d))].sort().reverse();}
function summarize(rows,data){
 const total=field=>rows.reduce((n,r)=>n+(r.player[field]||0),0),mins=rows.reduce((n,r)=>n+r.match.duration/60,0),kills=total('kills'),deaths=total('deaths'),assists=total('assists'),heroes=new Map();
 rows.forEach(({player:p})=>heroes.set(p.championId,(heroes.get(p.championId)||0)+1));const wins=rows.filter(r=>r.player.win).length;
 return {key:rows[0].player.key,name:rows.at(-1).player.name,games:rows.length,wins,losses:rows.length-wins,wr:wins/rows.length,kills,deaths,assists,kda:(kills+assists)/Math.max(1,deaths),dpm:mins?total('damage')/mins:null,csm:mins?total('cs')/mins:null,vspm:mins?total('vision')/mins:null,kp:total('teamKills')?(kills+assists)/total('teamKills'):null,damageShare:total('teamDamage')?total('damage')/total('teamDamage'):null,goldShare:total('teamGold')?total('gold')/total('teamGold'):null,score:mean(rows.map(r=>r.player.score)),gd15:mean(rows.map(r=>r.player.gd15)),gdSamples:rows.filter(r=>r.player.gd15!=null).length,roles:[...new Set(rows.map(r=>ROLE[r.player.role]||r.player.role))],heroes:[...heroes].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([id,games])=>({id,name:data.champions[String(id)]?.title||data.champions[String(id)]?.name||String(id),games})),matchNumbers:rows.map(r=>r.match.number)};
}
function model(data,matches,{kind='daily',period,player='all',now=Date.now()}={}){
 const w=windowFor(kind,period),selected=[...new Map(matches.filter(m=>timestamp(m)>=w.start&&timestamp(m)<w.end&&(player==='all'||m.players.some(p=>p.key===player))).map(m=>[m.matchKey,m])).values()],groups=new Map(),all=[];
 selected.forEach(m=>m.players.filter(p=>player==='all'||p.key===player).forEach(p=>{const rows=groups.get(p.key)||[];rows.push({player:p,match:m});groups.set(p.key,rows);all.push(p);}));
 const players=[...groups.values()].map(rows=>summarize(rows,data)).sort((a,b)=>b.games-a.games||(b.score??0)-(a.score??0)),minimum=kind==='weekly'?5:2;
 const award=(scope,best)=>{const rows=[...groups.values()].map(rs=>rs.filter(r=>scope==='all'||r.player.win===(scope==='wins'))).filter(rs=>rs.length>=minimum).map(rs=>summarize(rs,data)).filter(p=>p.score!=null).sort((a,b)=>(best?-1:1)*(a.score-b.score)||b.games-a.games||a.key.localeCompare(b.key));return rows[0]||null;};
 const wins=all.filter(p=>p.win).length;return {schemaVersion:1,dataset:data.datasetType||'scrim',kind,period:w.period,start:new Date(w.start).toISOString(),end:new Date(w.end).toISOString(),timeZone:'Asia/Shanghai',cutoffHour:4,weekStart:'Monday',complete:w.end<=now,sourceUpdatedAt:data.friendSnapshotAt||null,playerFilter:player,matches:selected.length,matchKeys:selected.map(m=>m.matchKey),appearances:all.length,wins,losses:all.length-wins,activePlayers:players.length,groupGames:selected.filter(m=>[100,200].some(side=>m.players.filter(p=>p.team===side).length>=2)).length,minimumGames:minimum,players,honors:{overall:award('all',true),svp:award('losses',true),winWorst:award('wins',false),loseWorst:award('losses',false)}};
}
function text(m,detail='brief'){
 const title=m.kind==='weekly'?'周报':'日报',endDay=new Date(Date.parse(m.end)+8*HOUR).toISOString().slice(0,10),dataset=m.dataset==='friends-flex'?'好友全量灵排':'本人同队灵排';
 const lines=[`【灵排${title}｜${m.period}${m.complete?'':'｜进行中'}】`,`北京时间 ${m.period} 04:00 ～ ${endDay} 04:00；按对局开始时间归属。`,`数据范围：${dataset}，${m.playerFilter==='all'?'本人及已确认好友':'指定玩家'}。`,''];
 if(!m.matches){lines.push('本期已入库战绩为 0 场。');return lines.join('\n');}
 lines.push(`本期 ${m.matches} 场去重对局，${m.activePlayers} 人出战，${m.appearances} 条个人出场（${m.wins} 胜 / ${m.losses} 负）。其中 ${m.groupGames} 场有至少两位名单选手同侧。`,'');
 const honors=[['overall','面板领跑','司机把方向盘握住了，乘客先把五星好评安排上。'],['svp','败局救火','救护车开到了，水晶还是办了出院。'],['winWorst','胜局后座','这一趟坐得挺稳，下车记得给车主说声谢谢。'],['loseWorst','败局压力位','先把面板复盘明白，再去群里抢麦。']];
 if(m.playerFilter==='all'){
  for(const [key,label,roast] of honors){const p=m.honors[key];if(p)lines.push(`${label}：${p.name}，${p.games} 场 ${p.wins} 胜 ${p.losses} 负，规则分 ${format(p.score)}，KDA ${format(p.kda,2)}。${roast}`);}
  if(!m.honors.overall)lines.push(`本期没有选手达到 ${m.minimumGames} 场门槛，先看个人面板。`);
  lines.push(`以上席位按对应全部/胜局/败局的规则分均值比较，至少 ${m.minimumGames} 场。`,'');
 }
 lines.push('玩家战报：');
 for(const p of m.players){
  lines.push(`${p.name}：${p.games} 场 ${p.wins} 胜 ${p.losses} 负，胜率 ${percent(p.wr)}；KDA ${format(p.kda,2)}，DPM ${format(p.dpm,0)}，参团 ${percent(p.kp)}，规则分 ${format(p.score)}。`);
  if(detail==='full')lines.push(`  位置 ${p.roles.join('/')}；K/D/A 合计 ${p.kills}/${p.deaths}/${p.assists}；伤害占比 ${percent(p.damageShare)}，经济占比 ${percent(p.goldShare)}，补刀/分 ${format(p.csm)}，视野/分 ${format(p.vspm,2)}；GD@15 ${p.gd15==null?'—':(p.gd15>0?'+':'')+format(p.gd15,0)}（${p.gdSamples} 场）；常用 ${p.heroes.map(h=>h.name+' '+h.games+' 场').join(' / ')}。`);
 }
 if(m.sourceUpdatedAt)lines.push('',`战绩快照：${m.sourceUpdatedAt}。`);
 return lines.join('\n');
}
function segments(value,limit=1800){const out=[];let lines=[],length=0;const flush=()=>{if(lines.length){out.push(lines.join('\n'));lines=[];length=0;}};for(const line of value.split('\n')){const chars=[...line];if(length+chars.length+(lines.length?1:0)>limit)flush();while(chars.length>limit){out.push(chars.splice(0,limit).join(''));}if(chars.length||!line){if(lines.length)length++;lines.push(chars.join(''));length+=chars.length;}}flush();return out;}
function payload(m,detail='brief'){const value=text(m,detail);return {...m,detail,text:value,segments:segments(value)};}
const api={timestamp,dayKey,weekKey,windowFor,periods,model,text,segments,payload};if(typeof module!=='undefined'&&module.exports)module.exports=api;if(typeof window!=='undefined')window.FLEX_REPORT_CORE=api;
})();
