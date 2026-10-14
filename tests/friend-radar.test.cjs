const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');global.window={};require(path.join(__dirname,'..','radar.js'));require(path.join(__dirname,'..','friend-radar.js'));
const R=window.FRIEND_RADAR;
// Different gold totals deliberately distinguish averaging per-game conversion from dividing totals.
const p=(key,damage,gold,extra={})=>({key,name:key,role:'MIDDLE',isSelf:false,damage,gold,deaths:1,damageTaken:10,damageShare:.2,kp:.5,cs:100,kills:1,assists:1,win:true,championId:1,...extra});
const fixture={matches:[{number:1,players:[p('a',100,100),p('b',300,100),p('self',1,1,{isSelf:true})]},{number:2,players:[p('a',300,600),p('b',400,100),p('wrong',999,1,{role:'TOP'}),p('unknown',999,1,{role:'UNKNOWN'})]}]};
const m=R.model(fixture,fixture.matches,'MIDDLE',['a','b']);assert.equal(m.referenceRows,5);assert.equal(m.sides[0].raw[1],.75);assert.equal(m.sides[0].scores[1],25);assert.equal(m.sides[1].scores[1],80);assert.equal(m.sides[0].rows,2);assert.equal((window.SCRIM_RADAR.svg({...m,sides:[m.sides[0]]}).match(/class="radar-area"/g)||[]).length,1);
assert(R.players(fixture,fixture.matches,'MIDDLE').some(p=>p.key==='self'));assert.equal(R.model(fixture,fixture.matches,'MIDDLE',['self']).sides[0].rows,1);
const optout={...fixture,radarIncludeSelf:false};assert.equal(R.model(optout,optout.matches,'MIDDLE',['a']).referenceRows,4);assert(!R.players(optout,optout.matches,'MIDDLE').some(p=>p.key==='self'));
const empty=R.model(fixture,[],'MIDDLE',['a','b']);assert.equal(empty.sides[0].rows,0);assert.equal(empty.sides[0].positionScore,null);const missing=structuredClone(fixture);missing.matches.forEach(g=>g.players.filter(p=>p.key==='a').forEach(p=>p.damage=null));assert.equal(R.model(missing,missing.matches,'MIDDLE',['a']).sides[0].positionScore,null);
assert.match(R.exportSVG(m),/>a · 2 场/);assert.match(R.exportSVG(m),/>b · 2 场/);
const selected=R.model(fixture,[fixture.matches[0]],'MIDDLE',['a','b']);assert.equal(selected.referenceRows,m.referenceRows);assert.equal(selected.sides[0].rows,1);
const sparse={matches:[{number:1,players:[p('a',100,100)]}]};assert.equal(R.model(sparse,sparse.matches,'MIDDLE',['a']).sides[0].positionScore,null);
console.log(JSON.stringify({selfIncluded:true,perGameConversion:true,sharedRoleBaseline:true,sameRoleOnly:true,emptyAndMissing:true,singlePolygon:true}));
