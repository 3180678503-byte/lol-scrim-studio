const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../review-core.js');
const p=(id,extra={})=>({id,key:'player'+id,name:'player'+id,team:100,role:'BOTTOM',championId:1,kills:3,deaths:2,assists:4,teamKills:10,damage:12000,vision:20,cs:150,cc:50,gd15:100,xpd15:100,sampleTime15:900,...extra});
const m=(id,players=[p(1)],extra={})=>({matchKey:'HN1:'+id,number:id,duration:1200,patch:'16.20.3',players,frames:[],events:[],teams:[{id:100,kills:10},{id:200,kills:10}],...extra});
test('calibration excludes current appearance, isolates role/patch and needs five other valid rows',()=>{
 const target=m(1),refs=Array.from({length:5},(_,i)=>m(i+2,[p(1,{damage:10000+i*1000})]));
 const d={matches:[target,...refs,m(9,[p(1,{damage:99999})],{patch:'16.19.1'}),m(10,[p(1,{role:'TOP',damage:999999})])]};
 const model=C.calibrated(d,target,target.players[0]);assert.equal(model.samples,5);assert.equal(model.coverage,100);assert(model.score>=0&&model.score<=100);assert.equal(model.axes.find(a=>a.key==='dpm').score,50);
 const sparse=C.calibrated({matches:[target,...refs.slice(0,4)]},target,target.players[0]);assert.equal(sparse.score,null);assert.equal(sparse.coverage,0);
 const heroSparse={matches:[target,...refs.map((g,i)=>({...g,players:[{...g.players[0],championId:i?2:1}]}))]};assert.equal(C.calibrated(heroSparse,target,target.players[0],'hero').score,null);
 assert.equal(C.calibrated(d,target,p(1,{role:'UNKNOWN'})).score,null);
});
test('minute metrics preserve equal pace across lengths; short games cannot invent GD15',()=>{
 const a=m(1),b=m(2,[p(1,{damage:24000,vision:40,cs:300,cc:100,deaths:4})],{duration:2400});
 for(const metric of ['dpm','vision','survival','csm','cc'])assert.equal(C.value(a,a.players[0],metric),C.value(b,b.players[0],metric));
 assert.equal(C.value({...a,duration:850},p(1),'gd15'),null);assert.equal(C.value(a,p(1,{sampleTime15:8990}),'gd15'),null);
 assert.equal(C.value(a,p(1,{damage:null}),'dpm'),null);assert.equal(C.value(a,p(1,{teamKills:0}),'kp'),null);
});
test('duplicate games do not inflate references, and death percentile is reversed',()=>{
 const target=m(1,[p(1,{deaths:0})]),refs=Array.from({length:5},(_,i)=>m(i+2,[p(1)]));
 const model=C.calibrated({matches:[target,target,...refs,...refs]},target,target.players[0]);assert.equal(model.samples,5);assert.equal(model.axes.find(a=>a.key==='survival').score,100);
});
test('turning points use actual nonoverlapping windows and do not invent missing frames',()=>{
 const game=m(1,undefined,{duration:900,frames:Array.from({length:16},(_,i)=>({seconds:i*60,gap:i<4?0:i<8?3000:i<12?-1000:5000})),events:[]});
 const points=C.turningPoints(game);assert.equal(points.length,3);
 for(const point of points){assert.equal(point.kind,'economy');assert.equal(point.delta,point.after-point.before);assert(point.end-point.start>=90&&point.end-point.start<=150);}
 for(let i=1;i<points.length;i++)assert(points[i].start>=points[i-1].end);
 assert.deepEqual(C.turningPoints(m(2)),[]);
 const resource=m(3,undefined,{events:[{type:'ELITE_MONSTER_KILL',seconds:1000,team:100,monster:'BARON_NASHOR'}]});const point=C.turningPoints(resource)[0];assert.equal(point.before,null);assert.equal(point.after,null);
});
test('reviews connect correct player and team with bounded event windows',()=>{
 const player=p(1,{gd15:900}),game=m(1,[player],{reviewTimeline:{coverage:{frames:21,killEvents:3,expectedKills:20},events:[
 {type:'CHAMPION_KILL',seconds:600,team:100,killer:2,victim:null,assists:[1],shutdown:0},
 {type:'ELITE_MONSTER_KILL',seconds:650,team:100,monster:'DRAGON'},
 {type:'CHAMPION_KILL',seconds:1000,team:200,killer:null,victim:1,assists:[],shutdown:700},
 {type:'ELITE_MONSTER_KILL',seconds:1050,team:200,monster:'BARON_NASHOR'}]}});
 const r=C.review(game,player);assert.equal(r.followups,1);assert.equal(r.objectiveDeaths,1);assert.match(r.title,/融资/);assert(r.evidence.some(e=>e.text.includes('700')));assert(r.evidence.some(e=>e.text.includes('50 秒')));
 const unrelated=C.review(game,p(9,{gd15:null}));assert.equal(unrelated.followups,0);assert.equal(unrelated.objectiveDeaths,0);assert(!unrelated.evidence.some(e=>e.text.includes('终结')));
});
test('every role has 100 percent explicit weights and no missing metric turns into zero',()=>{
 for(const cfg of Object.values(C.CONFIG))assert.equal(Object.values(cfg).reduce((a,b)=>a+b,0),100);
 const target=m(1,[p(1,{sampleTime15:null})]),data={matches:[target,...Array.from({length:8},(_,i)=>m(i+2))]};const model=C.calibrated(data,target,target.players[0]);assert.equal(model.score,null);assert.equal(model.coverage,80);assert.equal(model.axes.find(a=>a.key==='gd15').value,null);
});
