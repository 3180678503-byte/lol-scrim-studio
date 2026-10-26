const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),S=require('../score-core.js');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2),at=args.indexOf('--dataset'),siteAt=args.indexOf('--site'),site=siteAt>=0?path.resolve(args[siteAt+1]):null,folders=site?[path.basename(site)]:at<0?['friends','flex','']: [args[at+1]==='scrim'?'':args[at+1]];
const read=folder=>JSON.parse(fs.readFileSync(path.join(root,folder,'data.json'),'utf8'));
function awardRecords(matches){
 const result=[];
 for(const [category,outcome,best] of [['mvp','all',true],['svp','losses',true],['winWorst','wins',false],['loseWorst','losses',false]]){
  const groups=new Map();for(const m of matches)for(const p of m.players){if((outcome!=='all'&&p.win!==(outcome==='wins'))||(matches.length===1&&category==='mvp'&&!p.win))continue;const rs=groups.get(p.key)||[];rs.push({m,p});groups.set(p.key,rs);}
  const candidates=[...groups].map(([key,rows])=>({key,rows,...S.aggregate(rows.map(r=>r.p))})).filter(r=>r.scoreSamples>0);
  const minimum=Math.min(5,...[Math.max(0,...candidates.map(c=>c.scoreSamples))]);
  const ranked=candidates.filter(c=>c.scoreSamples>=minimum).sort((a,b)=>(best?-1:1)*((matches.length===1?a.score:a.rankScore)-(matches.length===1?b.score:b.rankScore))||a.key.localeCompare(b.key));
  if(!ranked.length)continue;
  const r=ranked[0],ps=r.rows.map(r=>r.p),p=ps.at(-1),sum=k=>ps.reduce((s,p)=>s+(p[k]||0),0),avg=k=>S.mean(ps.map(p=>p[k])),minutes=r.rows.reduce((s,r)=>s+r.m.duration/60,0),teams=new Set(ps.map(p=>p.team));
  const stats={games:ps.length,kills:sum('kills'),deaths:sum('deaths'),assists:sum('assists'),dpm:sum('damage')/minutes,kp:sum('teamKills')?(sum('kills')+sum('assists'))/sum('teamKills'):null,damageShare:sum('damage')/sum('teamDamage'),goldShare:sum('gold')/sum('teamGold'),gd15:avg('gd15'),csd15:avg('csd15')};
  const dims=S.DIMENSIONS.map(([key,label],i)=>({label,score:S.mean(ps.map(p=>p.performance.axes[i]?.score))})).filter(a=>a.score!=null).sort((a,b)=>best?b.score-a.score:a.score-b.score),axis=dims[0];
  result.push({category,key:r.key,name:p.name,team:teams.size===1?p.team:null,championId:matches.length===1?p.championId:null,title:`${({mvp:'MVP',svp:'SVP',winWorst:'胜方最低分',loseWorst:'败方最低分'})[category]} · ${axis?.label||'综合表现'}`,reason:`位置职责表现均分 ${S.round(r.score)}，稳健榜分 ${S.round(r.rankScore)}；${r.scoreSamples}/${ps.length} 场计分。${stats.kills}/${stats.deaths}/${stats.assists}，DPM ${Math.round(stats.dpm)}。`,roast:axis?(best?`${axis.label}拿到 ${Math.round(axis.score)} 分，这份面板可以带进群里开会。数据先上桌，队友的嘴再硬也得先看附件。`:`${axis.label}只有 ${Math.round(axis.score)} 分。复盘不用四处找突破口，面板已经给你画好重点了，下把按错题本逐条补课。`):'当前维度资料不足，先展示已有统计。',alternative:ranked[1]?`备选 ${ranked[1].rows.at(-1).p.name}：表现均分 ${S.round(ranked[1].score)}，稳健榜分 ${S.round(ranked[1].rankScore)}。`:'当前只有一位计分候选。',scope:matches.length===1?'match':outcome,stats,matchNumbers:r.rows.map(r=>r.m.number),score:r.score,rankScore:r.rankScore,scoreVersion:S.VERSION,provisional:r.scoreSamples<5});
 }
 return result;
}
function main(){
let reference=null;
const outputs=[];
for(const folder of folders){
 const file=path.join(site||path.join(root,folder),'data.json'),data=JSON.parse(fs.readFileSync(file,'utf8'));
 if(folder==='friends')reference=data;
 const referenceFile=path.join(site?path.dirname(site):root,'friends','data.json');
 const base=data.datasetType==='flex'?(reference||(fs.existsSync(referenceFile)?JSON.parse(fs.readFileSync(referenceFile,'utf8')):data)):data,ctx=S.context(base);
 const signature=base.matches.map(m=>[m.matchKey,m.patch,m.duration,...m.players.map(p=>[p.id,p.key,p.role,p.championId,p.kills,p.deaths,p.assists,p.teamKills,p.damage,p.gold,p.cc,p.vision,p.wardsKilled,p.gd10,p.xpd10,p.sampleTime10,p.gd15,p.xpd15,p.sampleTime15])]);
 const baselineVersion=crypto.createHash('sha256').update(JSON.stringify(signature)).digest('hex').slice(0,12);
 let complete=0;
 for(const m of data.matches){
  for(const p of m.players){
   if(!Object.hasOwn(p,'legacyScore'))p.legacyScore=p.score??null;
   p.performance=S.compute(ctx,m,p);p.score=p.performance.score;
   p.performance.baselineVersion=baselineVersion;
   p.scoreMetrics=Object.fromEntries(p.performance.axes.map(a=>[a.key,a.score]));
   if(p.score!=null)complete++;
  }
  const sides={};
  for(const team of [100,200]){
   const all=m.players.filter(p=>p.team===team),ranked=all.filter(p=>Number.isFinite(p.score)).sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key));
   if(!all.length)continue;
   sides[team]={best:ranked[0]?.key??null,worst:ranked.length>=2?ranked.at(-1).key:null,alternative:ranked[1]?.key??null,category:all[0]?.win?'mvp':'svp',candidateCount:all.length,scoredCount:ranked.length,version:S.VERSION};
  }
  m.performanceAwards=sides;
  if(data.datasetType==='friends-flex')m.friendAwardsByTeam=sides;
  else if(data.datasetType==='flex')m.friendAwards=sides[m.allyTeam]||sides[m.players[0]?.team];
 }
 data.scoring={type:'群友位置职责表现分',version:S.VERSION,baselineVersion,referenceDataset:folder==='flex'?'friends-flex':data.datasetType||'scrim',referenceGames:base.matches.length,weights:S.WEIGHTS,dimensions:S.DIMENSIONS,rankPriorGames:10,
  methodology:'五维度加权；按位置与指标职责选择本版本参照，不足30人次/3位玩家时逐步扩展历史版本（不使用后续版本）；每项至少5个其他出场和2位玩家，排除本场整局。每玩家参照贡献上限1。同英雄至少20个其他样本及3位玩家后，按n/(n+30)、最高50%混合修正。缺项不转移权重、不默认50分；完整才出总分。胜负不加减分，KDA不参与计分。',
  limits:'坦克使用参团约束后的控制及控制/金币，功能辅助使用参团及参与击杀/金币，输出职责使用DPM及伤害/金币；这些为可观测代理指标。治疗含自疗，不计入保护评分。榜单同时显示均分及收缩分50+n/(n+10)*(均分-50)，不足5场标记暂定。'};
 if(!data.datasetType&&data.awards){
  if(!data.legacyAwards)data.legacyAwards=structuredClone(data.awards);
  data.awards.matches=Object.fromEntries(data.matches.map(m=>[String(m.number),awardRecords([m])]));
  data.awards.overall=awardRecords(data.matches);
  for(const collection of data.awards.collections||[])collection.records=awardRecords(data.matches.filter(m=>collection.matchKeys.includes(m.matchKey)));
  data.awards.methodology='位置职责评分 v2 自动候选，单局按表现分，合并按稳健榜分；每侧分别评选。完整公式见评分说明，原版人工点评保存在 legacyAwards。';
 }
 fs.writeFileSync(file,JSON.stringify(data));outputs.push({dataset:folder||'scrim',matches:data.matches.length,complete,total:data.matches.reduce((s,m)=>s+m.players.length,0),baselineVersion});
}
console.log(JSON.stringify({version:S.VERSION,datasets:outputs}));
}
if(require.main===module)main();
module.exports={awardRecords};
