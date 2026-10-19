const assert=require('node:assert/strict'),C=require('../report-core.js');
assert.equal(C.dayKey(Date.parse('2026-10-13T03:59:59+08:00')),'2026-10-12');assert.equal(C.dayKey(Date.parse('2026-10-13T04:00:00+08:00')),'2026-10-13');assert.equal(C.dayKey(Date.parse('2026-10-14T03:59:59+08:00')),'2026-10-13');
assert.equal(C.weekKey('2026-10-11'),'2026-10-05');assert.equal(C.weekKey('2026-10-12'),'2026-10-12');assert.equal(C.weekKey(C.dayKey(Date.parse('2026-10-12T03:59:59+08:00'))),'2026-10-05');
const p=(key,win,damage)=>({key,name:key,win,damage,team:100,role:'JUNGLE',kills:2,deaths:1,assists:3,teamKills:10,teamDamage:damage*5,teamGold:50000,gold:10000,vision:10,cs:100,score:60,championId:1,gd15:null});
const match=(id,time,duration,player)=>({matchKey:String(id),number:id,createdAt:time,duration,players:[player]}),data={datasetType:'friends-flex',champions:{'1':{title:'英雄'}},matches:[match(1,'2026-10-13T03:59:59+08:00',1200,p('a',false,1000)),match(2,'2026-10-13T04:00:00+08:00',600,p('a',true,1000)),match(3,'2026-10-14T03:59:59+08:00',1200,p('a',false,4000)),match(4,'2026-10-14T04:00:00+08:00',600,p('b',true,1000))]};
const m=C.model(data,data.matches,{kind:'daily',period:'2026-10-13',now:Date.parse('2026-10-14T04:00:00+08:00')});assert.equal(m.matches,2);assert.deepEqual(m.matchKeys,['2','3']);assert.equal(m.players[0].dpm,5000/30);assert.equal(m.wins,1);assert.equal(m.losses,1);assert(m.complete);assert.equal(C.model(data,data.matches,{kind:'daily',period:'2026-10-13',player:'b'}).matches,0);
assert.equal(C.model(data,[...data.matches,data.matches[2]],{kind:'daily',period:'2026-10-13'}).matches,2);assert.match(C.text(m),/灵排日报｜2026-10-13/);assert.equal(m.start,'2026-10-12T20:00:00.000Z');assert.equal(m.end,'2026-10-13T20:00:00.000Z');
const body='一段话\n\n第二段\n第三段';assert.equal(C.segments(body,9).join('\n'),body);assert(C.segments('😀'.repeat(100),10).every(s=>[...s].length<=10));
const snapshot={...m,sourceUpdatedAt:'PRIVATE-SNAPSHOT-NOT-FOR-CHAT'};
for(const detail of ['brief','full']){
 const value=C.text(snapshot,detail);assert.doesNotMatch(value,/快照|PRIVATE-SNAPSHOT|按对局开始|数据范围|席位按|门槛/);
 assert.match(value,/2场 · 1人 · 2人次（1胜1负）/);assert.match(value,/a｜1胜1负 · KDA/);
}
assert.match(C.text(snapshot,'full'),/K\/D\/A 合计/);
const out=C.payload(snapshot);assert.equal(out.sourceUpdatedAt,snapshot.sourceUpdatedAt);assert.equal(out.commentary.length,m.players.length);assert(out.text.includes(out.commentary[0].roast));assert.deepEqual(out.players,m.players);
const base={...m.players[0],key:'friend',name:'群友',games:5,wins:1,losses:4,wr:.2,score:50,roles:['中单'],heroes:[{name:'阿狸',games:5}],gd15:null,gdSamples:0};
const dayRoasts=new Set(),weekRoasts=new Set();
for(let i=0;i<6;i++){
 const daily={...m,period:`2026-10-${String(13+i).padStart(2,'0')}`};
 const roast=C.commentary(base,daily);assert.equal(roast.family,'losing');assert.equal(C.commentary(base,daily).roast,roast.roast);dayRoasts.add(roast.roast);
 const period=new Date(Date.parse('2026-10-12T00:00:00Z')+i*7*86400000).toISOString().slice(0,10);weekRoasts.add(C.commentary(base,{...m,kind:'weekly',period}).roast);
}
assert.equal(dayRoasts.size,6);assert.equal(weekRoasts.size,6);
const varied=C.comments({...m,players:Array.from({length:6},(_,i)=>({...base,key:'friend'+i}))});assert.equal(new Set(varied.map(r=>r.template)).size,6);
const vision={...base,roles:['辅助'],games:4,wins:2,losses:2,wr:.5,score:65,vspm:2,kp:.7,dpm:120,damageShare:.06};assert.equal(C.commentary(vision,m).family,'vision');assert.match(C.commentary(vision,m).roast,/视野/);
assert.equal(C.commentary({...base,wins:0,wr:0,score:80,dpm:1200},m).family,'strong-loss');
assert.equal(C.commentary({...base,wins:2,losses:3,wr:.4,score:45,goldShare:.3,damageShare:.12},m).family,'expensive');
assert.notEqual(C.commentary({...base,wins:2,losses:3,wr:.4,score:45,goldShare:.3,damageShare:.12,roles:['上单']},m).family,'expensive');
assert.equal(C.commentary({...base,wins:2,wr:.4,score:45,gd15:-800,gdSamples:2},m).family,'lane-down');
assert.notEqual(C.commentary({...base,score:null,wins:2,wr:.4,kp:.2,gd15:-800,gdSamples:2},m).family,'lane-down');
assert.notEqual(C.commentary({...base,score:null,wins:2,wr:.4,kp:.2},m).family,'rough');
assert.notEqual(C.commentary({...base,roles:['未确认位置'],score:45,wins:2,wr:.4,kp:.2},m).family,'low-kp');
assert.doesNotMatch(C.commentary({...base,wins:0,score:30,deaths:5},m).roast,/门禁|节拍器/);
const empty=C.model(data,data.matches,{kind:'daily',period:'2026-11-01'});assert.match(C.text(empty),/暂无已入库对局/);assert.equal(C.payload(empty).commentary.length,0);
const newYear=C.model(data,[],{kind:'weekly',period:'2026-12-28'});assert.match(C.text(newYear),/2026-12-28～2027-01-03/);
console.log(JSON.stringify({fourAMBoundary:true,mondayFourAM:true,weightedMinutes:true,dedup:true,personalOutcomes:true,segments:true,compactText:true,noSnapshot:true,stableReload:true,rotatingDailyAndWeekly:true,noRepeatedJokesPerIssue:true,roleAware:true,missingScoreAndTimeline:true,emptyAndNewYear:true}));
