const assert=require('node:assert/strict');global.window={SCORE_CORE:require('../score-core.js')};require('../radar.js');require('../friend-radar.js');
const R=window.FRIEND_RADAR,S=window.SCORE_CORE;
const p=(key,extra={})=>({key,name:key,id:key,role:'MIDDLE',isSelf:false,damage:20000,gold:12000,deaths:2,damageTaken:10000,damageShare:.2,kp:.5,teamKills:20,vision:20,wardsKilled:1,cc:30,cs:100,kills:4,assists:6,win:true,championId:99,gd15:100,xpd15:100,sampleTime15:900,...extra});
const fixture={matches:Array.from({length:8},(_,i)=>({number:i+1,matchKey:'HN1:'+i,patch:'16.20.1',duration:1800,players:[p('a',{damage:10000+i*1000}),p('b'),p('self',{isSelf:true}),p('other',{role:'TOP'}),p('unknown',{role:'UNKNOWN'})]}))};
const ctx=S.context(fixture);for(const m of fixture.matches)for(const p of m.players){p.performance=S.compute(ctx,m,p);p.score=p.performance.score;}
const m=R.model(fixture,fixture.matches,'MIDDLE',['a','b']);assert.equal(m.referenceRows,24);assert.equal(m.axes.length,5);assert.equal(m.sides[0].positionScore,S.aggregate(fixture.matches.map(m=>m.players[0])).score);assert.equal(m.sides[0].rows,8);
assert.equal((window.SCRIM_RADAR.svg({...m,sides:[m.sides[0]]}).match(/class="radar-area"/g)||[]).length,1);
assert(R.players(fixture,fixture.matches,'MIDDLE').some(p=>p.key==='self'));
const optout={...fixture,radarIncludeSelf:false};assert(!R.players(optout,optout.matches,'MIDDLE').some(p=>p.key==='self'));
assert.equal(R.model(fixture,[],'MIDDLE',['a']).sides[0].positionScore,null);
const selected=R.model(fixture,[fixture.matches[0]],'MIDDLE',['a','b']);assert.equal(selected.sides[0].positionScore,fixture.matches[0].players[0].score);assert.equal(selected.referenceRows,m.referenceRows);
assert.match(R.exportSVG(m),/>a · 8 场/);assert.match(R.exportSVG(m),/>b · 8 场/);
console.log('five-dimension radar, same-role comparison, stored-score parity, empty rows and SVG passed');
