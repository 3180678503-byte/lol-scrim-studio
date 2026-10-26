(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.REVIEW_CORE=api;})(typeof window==='object'?window:globalThis,()=>{
'use strict';
const ROLES={TOP:'上单',JUNGLE:'打野',MIDDLE:'中单',BOTTOM:'射手',UTILITY:'辅助',UNKNOWN:'未确认位置'};
const CONFIG={TOP:{gd15:25,xpd15:10,dpm:20,kp:15,vision:10,survival:20},JUNGLE:{gd15:15,dpm:15,kp:30,vision:20,survival:20},MIDDLE:{gd15:20,xpd15:10,dpm:30,kp:20,survival:20},BOTTOM:{gd15:20,csm:20,dpm:35,kp:10,survival:15},UTILITY:{kp:35,vision:35,cc:20,survival:10}};
const METRICS={gd15:{label:'15 分钟金币差',unit:'金币'},xpd15:{label:'15 分钟经验差',unit:'经验'},dpm:{label:'分均英雄伤害',unit:'/分'},kp:{label:'参团率',unit:'%'},vision:{label:'分均视野得分',unit:'/分'},survival:{label:'每 10 分钟阵亡',unit:'次',lower:true},csm:{label:'分均补刀',unit:'/分'},cc:{label:'分均控制时长',unit:'秒/分'}};
const finite=Number.isFinite,mean=xs=>{const v=xs.filter(finite);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
const patch=m=>{const s=String(m.patch||'').split('.');return s.length>=2?s.slice(0,2).join('.'):'未知版本';};
const time=s=>`${Math.floor(Math.max(0,s)/60)}:${String(Math.floor(Math.max(0,s)%60)).padStart(2,'0')}`;
const signed=x=>(x>0?'+':'')+Math.round(x).toLocaleString('zh-CN');
function value(m,p,key){
 const min=m.duration/60;if(!(min>0))return null;
 if(key==='dpm')return finite(p.damage)?p.damage/min:null;
 if(key==='vision')return finite(p.vision)?p.vision/min:null;
 if(key==='survival')return finite(p.deaths)?p.deaths/min*10:null;
 if(key==='csm')return finite(p.cs)?p.cs/min:null;
 if(key==='cc')return finite(p.cc)?p.cc/min:null;
 if(key==='kp')return p.teamKills>0&&finite(p.kills)&&finite(p.assists)?(p.kills+p.assists)/p.teamKills:null;
 if(key==='gd15'||key==='xpd15')return m.duration>=900&&finite(p.sampleTime15)&&Math.abs(p.sampleTime15-900)<=5&&finite(p[key])?p[key]:null;
 return null;
}
const caches=new WeakMap();
function reference(data,m,p,mode){
 let cache=caches.get(data);if(!cache){cache=new Map();caches.set(data,cache);}
 const key=[mode,p.role,patch(m),mode==='hero'?p.championId:''].join('|');
 if(!cache.has(key)){
  const seen=new Set(),rows=[];
  for(const game of data.matches){if(seen.has(game.matchKey))continue;seen.add(game.matchKey);if(patch(game)!==patch(m))continue;for(const player of game.players)if(player.role===p.role&&(mode!=='hero'||player.championId===p.championId))rows.push({match:game,player});}
  cache.set(key,{rows,metrics:Object.fromEntries(Object.keys(CONFIG[p.role]||{}).map(metric=>[metric,rows.map(r=>value(r.match,r.player,metric)).filter(finite).sort((a,b)=>a-b)]))});
 }
 return cache.get(key);
}
function lowerBound(a,x,upper=false){let lo=0,hi=a.length;while(lo<hi){const mid=(lo+hi)>>1;if(a[mid]<x||upper&&a[mid]===x)lo=mid+1;else hi=mid;}return lo;}
function calibrated(data,m,p,mode='role'){
 const shared=typeof module==='object'&&module.exports?require('./score-core.js'):globalThis.SCORE_CORE;
 return {...shared.score(data,m,p),mode:'unified'};
}
function legacyCalibrated(data,m,p,mode='role'){
 const config=CONFIG[p.role];if(!config)return {score:null,coverage:0,axes:[],samples:0,patch:patch(m),mode,role:p.role};
 const pool=reference(data,m,p,mode),included=pool.rows.some(r=>r.match.matchKey===m.matchKey&&r.player.id===p.id),axes=[];
 for(const [key,weight] of Object.entries(config)){
  const v=value(m,p,key),a=pool.metrics[key],subtract=included&&finite(v)?1:0,n=a.length-subtract;
  let score=null;if(finite(v)&&n>=5){const less=lowerBound(a,v),equal=lowerBound(a,v,true)-less-subtract;score=(less+equal/2)/n*100;if(METRICS[key].lower)score=100-score;}
  axes.push({key,...METRICS[key],weight,value:v,score,n,contribution:score==null?null:score*weight/100});
 }
 const coverage=axes.filter(a=>finite(a.score)).reduce((n,a)=>n+a.weight,0);
 return {score:coverage===100?axes.reduce((n,a)=>n+a.contribution,0):null,coverage,axes,samples:pool.rows.length-(included?1:0),patch:patch(m),mode,role:p.role};
}
const events=m=>(m.reviewTimeline?.events||m.events||[]).filter(e=>finite(e.seconds)&&e.seconds>=0&&e.seconds<=m.duration+2).slice().sort((a,b)=>a.seconds-b.seconds);
function eventName(e){if(e.type==='CHAMPION_KILL')return e.shutdown>0?'终结击杀':'击杀';if(e.type==='BUILDING_KILL')return e.building==='INHIBITOR_BUILDING'?'水晶':'防御塔';return ({BARON_NASHOR:'大龙',DRAGON:e.subtype==='ELDER_DRAGON'?'远古龙':'小龙',RIFTHERALD:'峡谷先锋',HORDE:'虚空巢虫',ATAKHAN:'厄塔汗'})[e.monster]||'史诗野怪';}
const objective=e=>e.type==='BUILDING_KILL'||e.type==='ELITE_MONSTER_KILL';
function frameRows(m){return [...new Map((m.frames||[]).filter(f=>finite(f.seconds)&&finite(f.gap)&&f.seconds>=0&&f.seconds<=m.duration).map(f=>[f.seconds,f])).values()].sort((a,b)=>a.seconds-b.seconds);}
function turningPoints(m){
 const frames=frameRows(m),ev=events(m),candidates=[];
 for(let i=0;i<frames.length-1;i++){
  const a=frames[i];let b=frames[i+1];for(const f of frames.slice(i+1)){if(f.seconds-a.seconds>150)break;if(Math.abs(f.seconds-a.seconds-120)<Math.abs(b.seconds-a.seconds-120))b=f;}
  const span=b.seconds-a.seconds;if(span<90||span>150)continue;
  const delta=b.gap-a.gap;if(Math.abs(delta)<200)continue;
  candidates.push({kind:'economy',start:a.seconds,end:b.seconds,seconds:b.seconds,before:a.gap,after:b.gap,delta,team:delta>0?100:200,weight:Math.abs(delta),events:ev.filter(e=>e.seconds>a.seconds&&e.seconds<=b.seconds)});
 }
 const chosen=[];for(const candidate of candidates.sort((a,b)=>b.weight-a.weight)){if(chosen.every(p=>candidate.end<=p.start||candidate.start>=p.end))chosen.push(candidate);if(chosen.length===3)break;}
 // Resources fill remaining slots; the gold values always come from real frames.
 for(const event of ev.filter(e=>e.type==='ELITE_MONSTER_KILL'&&['BARON_NASHOR','DRAGON','ATAKHAN'].includes(e.monster)).reverse()){
  if(chosen.length===3)break;if(chosen.some(p=>event.seconds>=p.start-30&&event.seconds<=p.end+30))continue;
  const before=frames.filter(f=>f.seconds<=event.seconds).at(-1),after=frames.find(f=>f.seconds>=event.seconds);
  chosen.push({kind:'objective',start:event.seconds,end:event.seconds,seconds:event.seconds,before:before&&event.seconds-before.seconds<=90?before.gap:null,after:after&&after.seconds-event.seconds<=90?after.gap:null,team:event.team,events:[event]});
 }
 return chosen.sort((a,b)=>a.seconds-b.seconds).map((p,index)=>({...p,index:index+1}));
}
function review(m,p){
 const ev=events(m),kills=ev.filter(e=>e.type==='CHAMPION_KILL'),resources=ev.filter(objective),facts=[];
 const gd15=value(m,p,'gd15');
 const gained=kills.filter(e=>e.killer===p.id&&e.shutdown>0).sort((a,b)=>b.shutdown-a.shutdown)[0];
 const lost=kills.filter(e=>e.victim===p.id&&e.shutdown>0).sort((a,b)=>b.shutdown-a.shutdown)[0];
 if(gained)facts.push({kind:'good',seconds:gained.seconds,text:`${time(gained.seconds)} 收下额外终结赏金 ${signed(gained.shutdown)} 金币。`});
 const followups=[];
 for(const kill of kills.filter(e=>e.killer===p.id||e.assists?.includes(p.id))){const resource=resources.find(e=>e.team===p.team&&e.seconds>kill.seconds&&e.seconds<=kill.seconds+90);if(resource)followups.push({kill,resource});}
 if(followups.length){const f=followups.find(f=>f.resource.monster==='BARON_NASHOR')||followups[0];facts.push({kind:'good',seconds:f.kill.seconds,text:`${time(f.kill.seconds)} 参与击杀后 ${Math.round(f.resource.seconds-f.kill.seconds)} 秒，本队拿到${eventName(f.resource)}（${time(f.resource.seconds)}）。`});}
 if(finite(gd15))facts.push({kind:gd15>=0?'good':'issue',seconds:900,text:`15:00 同位置金币差 ${signed(gd15)}，经验差 ${finite(p.xpd15)?signed(p.xpd15):'缺失'}。`});
 if(lost)facts.push({kind:'issue',seconds:lost.seconds,text:`${time(lost.seconds)} 阵亡，送出额外终结赏金 ${signed(lost.shutdown)} 金币。`});
 const before=[];
 for(const death of kills.filter(e=>e.victim===p.id)){const resource=resources.find(e=>e.team&&e.team!==p.team&&e.type==='ELITE_MONSTER_KILL'&&['DRAGON','BARON_NASHOR','ATAKHAN'].includes(e.monster)&&e.seconds>death.seconds&&e.seconds<=death.seconds+60);if(resource)before.push({death,resource});}
 if(before.length){const f=before.find(f=>f.resource.monster==='BARON_NASHOR')||before[0];facts.push({kind:'issue',seconds:f.death.seconds,text:`${time(f.death.seconds)} 阵亡后 ${Math.round(f.resource.seconds-f.death.seconds)} 秒，对方拿到${eventName(f.resource)}（${time(f.resource.seconds)}）。`});}
 if(!facts.some(f=>f.kind==='good')&&p.teamKills>0){const kp=value(m,p,'kp');if(kp>=.6)facts.push({kind:'good',seconds:null,text:`参与本队 ${p.kills+p.assists}/${p.teamKills} 次击杀，参团率 ${(kp*100).toFixed(1)}%。`});}
 const poolGood=facts.filter(f=>f.kind==='good'),poolIssue=facts.filter(f=>f.kind==='issue');
 const evidence=[...poolGood.slice(0,2),...poolIssue.slice(-2)].sort((a,b)=>(a.seconds??Infinity)-(b.seconds??Infinity));
 let title='本局账本',roast='面板已经摆上桌，关键节点请按时间对账。';
 if(lost&&gd15>0&&lost.seconds>900){title='先当股东，再开融资';roast='前半场是公司股东，后半场给对面开了融资渠道；终结赏金到账得比工资还准时。';}
 else if(before.length&&followups.length){title='功过都能查到流水';roast='拆塔拿龙时有你，资源前掉人也有你；这把财务报表，收入和支出都挺热闹。';}
 else if(before.length){title='资源团前提前下班';roast='资源还没进背包，人先进入观战席；队友准备开会，你把椅子搬回了泉水。';}
 else if(gained){title='赏金到账，业务办成';roast='对面攒了半天的年终奖，让你一键提现；这波不是查水表，是查余额。';}
 else if(followups.length){title='人头能兑现';roast='参与击杀还顺手收资源，账上有流水、地图有资产；这波业务闭环做得明明白白。';}
 else if(gd15>=800){title='对线账本翻红';roast='十五分钟已经把对位打成了分期付款，接下来该让这份优势在地图上继续收利息。';}
 else if(gd15!=null&&gd15<=-800){title='对线资金外流';roast='十五分钟的账本翻开一看，对位像拿了补贴，你像负责拨款的。';}
 else if(poolGood.length){title='团战签到员';roast='本队多数人头都有你的签名，至少这把团战点名不用替你答到。';}
 return {title,roast,evidence,followups:followups.length,objectiveDeaths:before.length,coverage:m.reviewTimeline?.coverage||null,phases:p.reviewPhases||[]};
}
return {ROLES,CONFIG,METRICS,patch,time,signed,value,calibrated,legacyCalibrated,events,eventName,frameRows,turningPoints,review,mean};
});
