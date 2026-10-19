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
function hash(value){let h=2166136261;for(const c of value)h=Math.imul(h^c.codePointAt(0),16777619);return h>>>0;}
function commentary(p,m,used=new Set()){
 const support=p.roles.length===1&&p.roles[0]==='辅助',carry=p.roles.length>0&&p.roles.every(r=>['中单','射手'].includes(r)),hero=p.heroes[0]?.name||'英雄';
 const f={hero,games:p.games,wins:p.wins,losses:p.losses,kda:format(p.kda,2),dpm:format(p.dpm,0),kp:percent(p.kp),vision:format(p.vspm,2),cs:format(p.csm),share:percent(p.damageShare),gold:percent(p.goldShare),gap:format(Math.abs(p.gd15??0),0),deaths:format(p.deaths/p.games),assists:format(p.assists/p.games),kdaLine:`${p.kills}/${p.deaths}/${p.assists}`};
 let family,variants;
 if(p.games>=3&&p.wr>=.8&&p.score>=55){family='winning';variants=[
  `${f.games}把赢${f.wins}把，匹配按钮今天兼职提款机。`,
  `${f.wins}胜${f.losses}负，“再来一把”被你说成了进货。`,
  `${f.games}场收了${f.wins}张胜利，排位结算像在盖公章。`,
  `${f.wins}胜到手，今天的上分申请基本走了绿色通道。`,
  `${f.games}场赢${f.wins}场，建议把结算界面设成群头像。`,
  `${f.wins}胜${f.losses}负，排位这门生意今天做得有点顺。`];
 }else if(p.score>=65&&p.wr<.5){family='strong-loss';const stat=support?`视野/分${f.vision}`:`DPM ${f.dpm}`;variants=[
  `${stat}，数据交了作业，胜利给你退了课。`,
  `${stat}还只赢${f.wins}把，结算系统建议查查快递。`,
  `${stat}，输出单和胜负单疑似没装在同一个信封。`,
  `${stat}，输赢另说，这份面板不用撤回。`,
  `${stat}，打完${f.losses}场败局还得负责群里答辩。`,
  `${stat}，结算没给分，群里这张图得给个座位。`];
 }else if(carry&&p.goldShare!=null&&p.damageShare!=null&&p.goldShare-p.damageShare>=.08&&p.goldShare>=.23&&p.score!=null&&p.score<50){family='expensive';variants=[
  `经济${f.gold}、伤害${f.share}，预算像大片，成片像预告。`,
  `吃${f.gold}经济打${f.share}伤害，这笔采购得补张说明。`,
  `经济${f.gold}、伤害${f.share}，装备栏的发票比伤害表响。`,
  `${f.gold}经济换${f.share}伤害，财务看完想开复盘会。`,
  `经济${f.gold}、伤害${f.share}，钱到账了，货还在路上。`,
  `${f.gold}经济、${f.share}伤害，出装像投资，回报像试用。`];
 }else if(p.score!=null&&p.score<40&&p.losses>0&&p.wr<=.5){family='rough';variants=[
  `场均倒地${f.deaths}次，泉水门禁今天认识你了。`,
  `${f.losses}负、KDA ${f.kda}，这份战报建议搭配降压茶。`,
  `场均${f.deaths}死，复活倒计时快被你玩成节拍器。`,
  `KDA ${f.kda}，战绩截图在群里属于主动投案。`,
  `${f.wins}胜${f.losses}负，结算图刚发出来，锅先自己找座。`,
  `KDA ${f.kda}，英雄还在峡谷，面板已经进了会场。`].filter((_,i)=>p.deaths/p.games>=7||![0,2].includes(i));
 }else if(p.games>=3&&p.wr<=.25){family='losing';variants=[
  `${f.games}场输了${f.losses}场，“最后一把”明显超期服役。`,
  `${f.losses}场败局，失败结算图快攒出一套连环画。`,
  `${f.games}场赢${f.wins}场，排位分今天主要负责流通。`,
  `${f.losses}负到账，再来一把已经不像邀请，像续费。`,
  `${f.games}场${f.losses}负，胜利两个字今天属于稀缺掉落。`,
  `${f.losses}场败局，建议把“再来”按钮先借给群友保管。`];
 }else if(support&&p.vspm!=null&&p.vspm>=1.4){family='vision';variants=[
  `视野/分${f.vision}，峡谷地图被你装成了监控室。`,
  `每分钟${f.vision}视野，这把辅助兼任物业安防。`,
  `视野/分${f.vision}，你在打排位，也在给峡谷布天网。`,
  `每分钟${f.vision}视野，插眼像交作业，一格没空。`,
  `视野/分${f.vision}，这份地图照明电费该找谁报销？`,
  `每分钟${f.vision}视野，辅助工资不高，摄像头倒没少装。`];
 }else if(support){family='support';variants=[
  `场均${f.assists}助攻，击杀名单旁边总有你的小字署名。`,
  `击杀参与${f.kp}，助攻这一栏是你的考勤表。`,
  `场均${f.assists}助攻，人头没记你，劳务费得算你。`,
  `视野/分${f.vision}，辅助的账本不能只翻人头那一页。`,
  `击杀参与${f.kp}，名字不在击杀位，也在联合出品里。`,
  `场均${f.assists}助攻，结算表里的幕后名单挺长。`];
 }else if(p.gd15!=null&&p.gdSamples>0&&p.gd15<=-600&&p.score!=null&&p.score<55){family='lane-down';variants=[
  `15分钟平均落后${f.gap}金，对线账单先别点已读。`,
  `15分钟均差−${f.gap}金，补发工资的申请写好了吗？`,
  `对线15分钟平均欠${f.gap}金，兵线经济学需要补考。`,
  `15分钟均落后${f.gap}金，这条路的收费站疑似开反了。`,
  `15分钟平均少${f.gap}金，对位工资条看完有点沉默。`,
  `15分钟均差−${f.gap}金，对线阶段先交了一笔学费。`];
 }else if(p.gd15!=null&&p.gdSamples>0&&p.gd15>=600){family='lane-up';variants=[
  `15分钟平均领先${f.gap}金，对位工资条看完想换岗。`,
  `15分钟均多${f.gap}金，对线像开了个收费站。`,
  `平均15分钟赚出${f.gap}金差，兵线这门生意有点门道。`,
  `15分钟平均领先${f.gap}金，对线账本可以当群聊封面。`,
  `15分钟均差+${f.gap}金，先把对位的预算压缩了。`,
  `15分钟平均多${f.gap}金，对线阶段已经开始查账。`];
 }else if((p.damageShare!=null&&p.damageShare>=.3&&p.dpm>=700)||(carry&&p.dpm>=1000)){family='damage';variants=[
  `DPM ${f.dpm}，伤害统计表正在申请加班费。`,
  `DPM ${f.dpm}，结算面板终于有一栏敢开大字号。`,
  `全队${f.share}伤害由你签收，输出单确实够厚。`,
  `DPM ${f.dpm}，伤害那一栏的进度条有点挤。`,
  `全队${f.share}伤害，结算图的火力栏目可以单独开版。`,
  `DPM ${f.dpm}，${f.hero}这份伤害报表不太省墨。`];
 }else if(p.roles.length>0&&p.roles.every(r=>['中单','射手','打野'].includes(r))&&p.kp!=null&&p.kp<.38&&p.score!=null&&p.score<50){family='low-kp';variants=[
  `击杀参与${f.kp}，联合出品名单上你的字号有点小。`,
  `击杀参与${f.kp}，全队击杀的签收单漏了不少页。`,
  `击杀参与${f.kp}，结算合影里先找找自己站哪。`,
  `击杀参与${f.kp}，这份出勤记录还得补几次签。`,
  `击杀参与${f.kp}，人头流水账里你的笔迹偏少。`,
  `击杀参与${f.kp}，群聊点名时记得先带上面板。`];
 }else if(p.csm!=null&&p.csm>=8){family='farm';variants=[
  `每分钟${f.cs}刀，小兵看见你得先拿个号。`,
  `每分钟${f.cs}刀，补兵像流水线，漏一个都算工伤。`,
  `每分钟${f.cs}刀，峡谷秋收这一块你有承包合同。`,
  `每分钟${f.cs}刀，小兵进场前得先签收购协议。`,
  `每分钟${f.cs}刀，兵线的账比群收款还清楚。`,
  `每分钟${f.cs}刀，补兵键今天属于高频作业设备。`];
 }else if(p.deaths/p.games<=2&&p.kda>=4&&p.kp>=.5){family='survival';variants=[
  `场均${f.deaths}死、参与${f.kp}，命保住了，活也没少干。`,
  `场均只倒${f.deaths}次，泉水老板今天没怎么见着你。`,
  `KDA ${f.kda}、参与${f.kp}，这份保险买得有技术含量。`,
  `场均${f.deaths}死，复活倒计时今天拿的是底薪。`,
  `KDA ${f.kda}、参与${f.kp}，生存和出勤都没请假。`,
  `场均${f.deaths}死、参与${f.kp}，结算单比较耐看。`];
 }else if(p.games===1){family='single';variants=[
  `${f.hero} ${f.kdaLine}，这张结算图够群里审一轮。`,
  `${f.hero} ${f.kdaLine}，一把素材，群里能剪出三集。`,
  `${f.hero} ${f.kdaLine}，战报先存档，弹幕交给群友。`,
  `${f.hero} ${f.kdaLine}，英雄选完了，群聊人设还在投票。`,
  `${f.hero} ${f.kdaLine}，样本就一把，截图已经入会。`,
  `${f.hero} ${f.kdaLine}，数据摆上桌，群里开始举牌。`];
 }else{family='regular';variants=[
  `DPM ${f.dpm}，面板先摆桌上，群聊别光拼嗓门。`,
  `击杀参与${f.kp}，今天的出勤账本交给群友查。`,
  `常用${f.hero}，${f.games}场履历写完，群里开始阅卷。`,
  `DPM ${f.dpm}，结算图已装订，等群里各位评委发言。`,
  `击杀参与${f.kp}，比赛打完了，群里的加时赛刚开。`,
  `场均${f.assists}助攻，峡谷里的劳务清单已送群审。`,
  `DPM ${f.dpm}，战报可以复制，群里的嘴替不能静音。`,
  `${f.games}场、KDA ${f.kda}，战绩写完了，答辩还没散场。`];}
 // A stable day/week rotation keeps reloads identical and consecutive issues
 // different. Exhaust alternatives before repeating a joke within one issue.
 const day=Math.floor(Date.parse(m.period+'T00:00:00Z')/DAY),cycle=m.kind==='weekly'?Math.floor(day/7):day;
 let index=(cycle+hash(`${m.dataset}:${m.kind}:${p.key}:${family}`))%variants.length;
 for(let n=0;n<variants.length&&used.has(family+':'+index);n++)index=(index+1)%variants.length;
 const template=family+':'+index;used.add(template);
 return {key:p.key,name:p.name,family,template,roast:variants[index]};
}
function comments(m){const used=new Set();return m.players.map(p=>commentary(p,m,used));}
function text(m,detail='brief'){
 const title=m.kind==='weekly'?'周报':'日报',lastDay=new Date(Date.parse(m.end)-DAY+8*HOUR).toISOString().slice(0,10),dataset=m.dataset==='friends-flex'?'好友全量':'本人同队';
 const endLabel=lastDay.startsWith(m.period.slice(0,4))?lastDay.slice(5):lastDay;
 const label=m.kind==='weekly'?`${m.period}～${endLabel}`:m.period;
 const lines=[`【灵排${title}｜${label}${m.complete?'':'｜进行中'}】`];
 if(!m.matches){lines.push('本期暂无已入库对局。');return lines.join('\n');}
 lines.push(`${dataset} · ${m.matches}场 · ${m.activePlayers}人 · ${m.appearances}人次（${m.wins}胜${m.losses}负）`);
 const seen=new Set(),honors=[];
 if(m.playerFilter==='all'&&m.players.filter(p=>p.games>=m.minimumGames).length>=2){
  for(const [key,label,best] of [['overall','面板领跑',true],['svp','败局救火',true],['loseWorst','败局压力',false],['winWorst','胜局后座',false]]){
   const p=m.honors[key];if(!p||seen.has(p.key)||(best?p.score<60:p.score>=45))continue;
   honors.push(`${label} ${p.name}（${format(p.score)}）`);seen.add(p.key);if(honors.length>=2&&detail!=='full')break;
  }
 }
 if(honors.length)lines.push('规则榜：'+honors.join(' · '));
 lines.push('');const roasts=comments(m);
 for(const [i,p] of m.players.entries()){
  lines.push(`${p.name}｜${p.wins}胜${p.losses}负 · KDA ${format(p.kda,2)}。${roasts[i].roast}`);
  if(detail==='full')lines.push(`  ${p.roles.join('/')} · ${format(p.score)}分 · 胜率${percent(p.wr)} · K/D/A 合计 ${p.kills}/${p.deaths}/${p.assists} · DPM ${format(p.dpm,0)} · 击杀参与${percent(p.kp)} · 伤害/经济占比${percent(p.damageShare)}/${percent(p.goldShare)} · 补刀/分${format(p.csm)} · 视野/分${format(p.vspm,2)} · GD@15 ${p.gd15==null?'—':(p.gd15>0?'+':'')+format(p.gd15,0)}（${p.gdSamples}场） · 常用${p.heroes.map(h=>h.name+' '+h.games+'场').join('/')}。`);
 }
 return lines.join('\n');
}
function segments(value,limit=1800){const out=[];let lines=[],length=0;const flush=()=>{if(lines.length){out.push(lines.join('\n'));lines=[];length=0;}};for(const line of value.split('\n')){const chars=[...line];if(length+chars.length+(lines.length?1:0)>limit)flush();while(chars.length>limit){out.push(chars.splice(0,limit).join(''));}if(chars.length||!line){if(lines.length)length++;lines.push(chars.join(''));length+=chars.length;}}flush();return out;}
function payload(m,detail='brief'){const value=text(m,detail);return {...m,detail,commentary:comments(m),text:value,segments:segments(value)};}
const api={timestamp,dayKey,weekKey,windowFor,periods,model,text,segments,payload,commentary,comments};if(typeof module!=='undefined'&&module.exports)module.exports=api;if(typeof window!=='undefined')window.FLEX_REPORT_CORE=api;
})();
