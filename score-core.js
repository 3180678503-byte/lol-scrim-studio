(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SCORE_CORE=api;})(typeof window==='object'?window:globalThis,()=>{
'use strict';
const VERSION='role-duty-v2.0';
const DIMENSIONS=[['lane','对位发育'],['combat','战斗参与'],['conversion','资源转化'],['vision','视野支援'],['survival','生存风险']];
const WEIGHTS={TOP:[25,25,20,10,20],JUNGLE:[15,25,20,25,15],MIDDLE:[25,30,20,10,15],BOTTOM:[20,35,25,5,15],UTILITY:[10,15,10,45,20]};
// Editable duty overrides. Unlisted champions use their position's output/support profile.
const TANKS=new Set([12,14,20,31,32,33,36,44,54,57,72,78,89,98,111,113,154,201,223,412,516,526,875]);
const ENCHANTERS=new Set([16,26,37,40,43,117,267,350,427,902]);
const SUPPORT_DAMAGE=new Set([25,50,63,99,101,143,161,235,555]);
const finite=Number.isFinite,mean=a=>{const v=a.filter(finite);return v.length?v.reduce((s,x)=>s+x,0)/v.length:null;};
const round=x=>finite(x)?Math.round(x*10)/10:null;
const patch=m=>String(m.patch||'unknown').split('.').slice(0,2).join('.');
const patchOrder=v=>{const a=v.split('.').map(Number);return a.length===2&&a.every(finite)?a[0]*1000+a[1]:null;};
const METRICS={gd15:['15分钟金币差','金币'],xpd15:['15分钟经验差','经验'],gd10:['10分钟金币差','金币'],xpd10:['10分钟经验差','经验'],dpm:['英雄伤害/分','/分'],kp:['参团率','%'],ccpm:['控制/分×参团','秒/分'],dpg:['英雄伤害/金币','伤害/金币'],ccgold:['每千金币控制×参团','秒/千金币'],participationGold:['每千金币参与击杀','次/千金币'],vision:['视野得分/分','/分'],wardsKilled:['排眼/10分钟','个/10分'],survival:['阵亡/10分钟','次/10分']};
function profile(p){if(p.role==='BOTTOM')return 'damage';if(ENCHANTERS.has(p.championId))return 'enchanter';if(TANKS.has(p.championId))return 'tank';if(p.role==='UTILITY')return SUPPORT_DAMAGE.has(p.championId)?'damage':'support';return 'damage';}
const PROFILE_LABELS={tank:'坦克/开团',enchanter:'功能/保护',support:'功能辅助',damage:'输出'};
function value(m,p,k){
 const min=m.duration/60;if(!(min>0))return null;
 const rate=(field,mul=1)=>finite(p[field])?p[field]/min*mul:null;
 if(['gd10','gd15','xpd10','xpd15'].includes(k)){const t=k.endsWith('10')?600:900;return m.duration>=t&&finite(p['sampleTime'+t/60])&&Math.abs(p['sampleTime'+t/60]-t)<=5&&finite(p[k])?p[k]:null;}
 if(k==='dpm')return rate('damage');if(k==='ccpm'){const kp=value(m,p,'kp');return finite(p.cc)&&finite(kp)?p.cc/min*kp:null;}if(k==='vision')return rate('vision');if(k==='wardsKilled')return rate('wardsKilled',10);if(k==='survival')return rate('deaths',10);
 if(k==='kp')return p.teamKills>0&&finite(p.kills)&&finite(p.assists)?(p.kills+p.assists)/p.teamKills:null;
 if(!(p.gold>0))return null;
 if(k==='dpg')return finite(p.damage)?p.damage/p.gold:null;
 if(k==='ccgold'){const kp=value(m,p,'kp');return finite(p.cc)&&finite(kp)?p.cc/p.gold*1000*kp:null;}
 if(k==='participationGold')return finite(p.kills)&&finite(p.assists)?(p.kills+p.assists)/p.gold*1000:null;
 return null;
}
function definitions(m,p){
 if(!WEIGHTS[p.role])return [];
 const duty=profile(p),t=m.duration>=900?'15':'10';
 const combat=duty==='tank'?[['ccpm',.6],['kp',.4]]:duty==='enchanter'||duty==='support'?[['kp',1]]:[['dpm',.7],['kp',.3]];
 return [
  [['gd'+t,.6],['xpd'+t,.4]],combat,
  [[duty==='tank'?'ccgold':duty==='enchanter'||duty==='support'?'participationGold':'dpg',1]],
  p.role==='UTILITY'?[['vision',.7],['wardsKilled',.3]]:[['vision',1]],
  [['survival',1]]
 ];
}
const contexts=new WeakMap();
function context(data){
 if(contexts.has(data))return contexts.get(data);
 const seen=new Set(),rows=[];
 for(const m of data.matches||[]){if(seen.has(m.matchKey))continue;seen.add(m.matchKey);for(const p of m.players||[])if(WEIGHTS[p.role])rows.push({m,p,patch:patch(m),duty:profile(p)});}
 const ctx={data,rows,pools:new Map()};contexts.set(data,ctx);return ctx;
}
function pool(ctx,m,p,k,hero=false){
 const mp=patch(m),duty=profile(p),bucket=hero?p.championId:((k==='ccpm'||k==='ccgold'||k==='participationGold'||k==='dpg'||k==='dpm')?duty:'all');
 const key=[p.role,mp,k,hero?'hero':'role',bucket].join('|');
 if(ctx.pools.has(key))return ctx.pools.get(key);
 const order=patchOrder(mp),all=ctx.rows.filter(r=>r.p.role===p.role&&(hero?r.p.championId===p.championId:true)).map(r=>({...r,v:value(r.m,r.p,k)})).filter(r=>finite(r.v));
 const preferred=all.filter(r=>bucket==='all'||hero||r.duty===duty),historical=preferred.filter(r=>r.patch===mp||(order!=null&&patchOrder(r.patch)!=null&&patchOrder(r.patch)<order));
 const dutyFallback=!hero&&bucket!=='all'&&(historical.length<30||new Set(historical.map(r=>r.p.key)).size<3);
 const eligible=dutyFallback?all:preferred;
 // Current patch first, then up to two preceding observed patches; never later patches.
 const previous=[...new Set(eligible.map(r=>r.patch).filter(x=>order!=null&&patchOrder(x)!=null&&patchOrder(x)<order))].sort((a,b)=>patchOrder(b)-patchOrder(a));
 let chosen=eligible.filter(r=>r.patch===mp),scope=[mp];
 const enough=rs=>rs.length>=30&&new Set(rs.map(r=>r.p.key)).size>=3;
 for(const pp of previous.slice(0,2)){if(enough(chosen))break;scope.push(pp);chosen.push(...eligible.filter(r=>r.patch===pp));}
 // Small cohorts (including custom games) retain a marked, broader historical fallback.
 if(!hero&&!enough(chosen)){scope=[mp,...previous];chosen=eligible.filter(r=>scope.includes(r.patch));}
 chosen.sort((a,b)=>a.v-b.v);
 const counts=new Map();for(const r of chosen)counts.set(r.p.key,(counts.get(r.p.key)||0)+1);
 const prefix=[0],byMatch=new Map();for(const r of chosen){r.w=1/counts.get(r.p.key);prefix.push(prefix.at(-1)+r.w);const rs=byMatch.get(r.m.matchKey)||[];rs.push(r);byMatch.set(r.m.matchKey,rs);}
 const result={rows:chosen,prefix,byMatch,scope,counts,dutyFallback};ctx.pools.set(key,result);return result;
}
function bound(rows,v,upper){let lo=0,hi=rows.length;while(lo<hi){const mid=(lo+hi)>>1;if(rows[mid].v<v||(upper&&rows[mid].v===v))lo=mid+1;else hi=mid;}return lo;}
function percentile(ref,v,matchKey){
 const excluded=ref.byMatch.get(matchKey)||[],n=ref.rows.length-excluded.length,lo=bound(ref.rows,v,false),hi=bound(ref.rows,v,true);
 let total=ref.prefix.at(-1),less=ref.prefix[lo],equal=ref.prefix[hi]-ref.prefix[lo];
 for(const r of excluded){total-=r.w;if(r.v<v)less-=r.w;else if(r.v===v)equal-=r.w;}
 const removed=new Map();for(const r of excluded)removed.set(r.p.key,(removed.get(r.p.key)||0)+1);
 const players=ref.counts.size-[...removed].filter(([key,count])=>ref.counts.get(key)===count).length;
 return {score:n>=5&&players>=2&&total>0?100*(less+equal/2)/total:null,n,players};
}
function compute(ctx,m,p){
 const config=WEIGHTS[p.role],duty=profile(p),defs=definitions(m,p),axes=[];
 if(!config)return {version:VERSION,score:null,coverage:0,role:p.role,patch:patch(m),profile:duty,profileLabel:PROFILE_LABELS[duty],axes:[],samples:0,reason:'位置未确认'};
 defs.forEach((def,i)=>{
  const metrics=def.map(([key,share])=>{
   const v=value(m,p,key),base=pool(ctx,m,p,key),b=finite(v)?percentile(base,v,m.matchKey):{score:null,n:0,players:0};
   const h=finite(v)?percentile(pool(ctx,m,p,key,true),v,m.matchKey):{score:null,n:0,players:0};
   const alpha=finite(h.score)&&h.n>=20&&h.players>=3?Math.min(.5,h.n/(h.n+30)):0;
   let score=finite(b.score)?b.score*(1-alpha)+(h.score??0)*alpha:null;
   if(key==='survival'&&finite(score))score=100-score;
   return {key,label:METRICS[key][0],unit:METRICS[key][1],value:v,score,share,n:b.n,players:b.players,patches:base.scope,dutyFallback:base.dutyFallback,heroShare:alpha,heroSamples:h.n,lower:key==='survival'};
  });
  const score=metrics.every(a=>finite(a.score))?metrics.reduce((s,a)=>s+a.score*a.share,0):null;
  axes.push({key:DIMENSIONS[i][0],label:DIMENSIONS[i][1],unit:'分',weight:config[i],value:score,score,n:Math.min(...metrics.map(a=>a.n)),metrics,contribution:finite(score)?score*config[i]/100:null});
 });
 const coverage=axes.filter(a=>finite(a.score)).reduce((s,a)=>s+a.weight,0),score=coverage===100?round(axes.reduce((s,a)=>s+a.contribution,0)):null;
 return {version:VERSION,score,coverage,role:p.role,patch:patch(m),profile:duty,profileLabel:PROFILE_LABELS[duty],axes,samples:Math.min(...axes.map(a=>a.n)),reason:score==null?'指标缺失或参照不足':null};
}
function score(data,m,p){return p.performance?.version===VERSION?p.performance:compute(context(data),m,p);}
function aggregate(rows){const valid=rows.filter(r=>finite(r.score)),n=valid.length,average=mean(valid.map(r=>r.score));return {score:average,rankScore:average==null?null:50+n/(n+10)*(average-50),scoreSamples:n,provisional:n<5};}
function radarSide(data,rows,role){
 const models=rows.map(r=>score(data,r.match,r.player)),complete=models.filter(x=>finite(x.score)),used=complete.length?complete:models;
 const scores=DIMENSIONS.map((_,i)=>mean(used.map(x=>x.axes[i]?.score))),coverage=scores.reduce((s,x,i)=>s+(finite(x)?WEIGHTS[role][i]:0),0),summary=aggregate(models);
 return {raw:scores,scores,coverage,positionScore:summary.score,rankScore:summary.rankScore,scoredRows:summary.scoreSamples,samples:DIMENSIONS.map((_,i)=>used.filter(x=>finite(x.axes[i]?.score)).length),baselineSamples:DIMENSIONS.map((_,i)=>Math.min(...used.map(x=>x.axes[i]?.n??0))),legacyScore:mean(rows.map(r=>r.player.legacyScore)),models};
}
const radarAxes=role=>DIMENSIONS.map(([key,label],i)=>({key,label,unit:'分',weight:WEIGHTS[role]?.[i]??0}));
return {VERSION,DIMENSIONS,WEIGHTS,PROFILE_LABELS,profile,value,definitions,context,compute,score,aggregate,mean,round,radarSide,radarAxes};
});
