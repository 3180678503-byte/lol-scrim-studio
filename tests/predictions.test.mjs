import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {parseOfficialPage} from '../backend/predictions-source.mjs';
import {storeEvents,submitPrediction,predictionData,syncPredictions,dayOf} from '../backend/predictions.mjs';
import Worker from '../backend/worker.mjs';
import manifest from '../backend/manifest.json' with {type:'json'};

export function database(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(fs.readFileSync(new URL('../backend/schema.sql',import.meta.url),'utf8'));
 sqlite.exec(fs.readFileSync(new URL('../backend/predictions.sql',import.meta.url),'utf8'));
 class Statement{constructor(sql){this.sql=sql;this.params=[];}bind(...values){this.params=values;return this;}async first(){return sqlite.prepare(this.sql).get(...this.params)||null;}async all(){return {results:sqlite.prepare(this.sql).all(...this.params)};}async run(){const r=sqlite.prepare(this.sql).run(...this.params);return {meta:{changes:Number(r.changes)}};}}
 const DB={prepare:sql=>new Statement(sql),batch:async statements=>{sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(/^SELECT/.test(s.sql)?await s.all():await s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 return {DB,sqlite};
}

export function fixture(id,bestOf,startAt){return {id:String(id),tournament:'official-test',season:'2026',stage:'Swiss',startAt,bestOf,state:'unstarted',teams:[{id:'100',code:'AAA',name:'Alpha',image:'',wins:0,outcome:null},{id:'200',code:'BBB',name:'Beta',image:'',wins:0,outcome:null}],ready:true,signature:'100:200:'+bestOf,winnerId:null,loserWins:null};}

async function test(){
 const {DB,sqlite}=database(),now=Date.now(),a=manifest.members[0].key,b=manifest.members[1].key,c=manifest.members[2].key,cat=manifest;
 const key='test_browser_a_12345678901234567890',other='test_browser_b_12345678901234567890';
 const events=[fixture('111111111111',1,now+3600000),fixture('222222222222',3,now+7200000),fixture('333333333333',5,now+10800000)];
 const body=(e,memberKey=a,winnerId='100',loserWins=0)=>({eventId:e.id,memberKey,winnerId,loserWins,signature:e.signature});
 await storeEvents(DB,events,now);
 await submitPrediction(DB,cat,body(events[0]),key,now);
 await submitPrediction(DB,cat,body(events[0],a,'200'),key,now+1);
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM predictions').first()).n,1,'retry/update must never duplicate');
 assert.equal((await DB.prepare('SELECT winner_id FROM predictions').first()).winner_id,'200');
 await assert.rejects(submitPrediction(DB,cat,body(events[0]),other,now),/其他浏览器/);
 await submitPrediction(DB,cat,body(events[0],b,'100'),other,now);
 let data=await predictionData(DB,cat,new URLSearchParams({member:a}),key,now);
 assert.equal(data.events[0].mine.winnerId,'200');assert.equal(data.events[0].participation,2);assert.deepEqual(data.events[0].ballots,[]);assert.deepEqual(data.events[0].support,[]);
 data=await predictionData(DB,cat,new URLSearchParams({member:a}),other,now);assert.equal(data.events[0].mine,null,'ID alone cannot read a private ballot');
 assert.equal((await predictionData(DB,cat,new URLSearchParams({member:a}),'',now)).events[0].mine,null);
 await assert.rejects(submitPrediction(DB,cat,body(events[0],a,'100',1),key,now),/合法/);
 await assert.rejects(submitPrediction(DB,cat,body(events[1],a,'100',2),key,now),/合法/);
 await assert.rejects(submitPrediction(DB,cat,body(events[2],a,'100',3),key,now),/合法/);
 await assert.rejects(submitPrediction(DB,cat,body(events[0],'unknown'),key,now),/ID/);
 await assert.rejects(submitPrediction(DB,cat,{...body(events[0]),signature:'wrong'},key,now),/对阵/);
 await assert.rejects(submitPrediction(DB,cat,body(events[0]),key,events[0].startAt-300000),/封盘/);
 data=await predictionData(DB,cat,new URLSearchParams(),'',events[0].startAt-300000);assert.equal(data.events[0].ballots.length,2);assert.deepEqual(data.events[0].support.map(x=>x.count),[1,1]);
 await assert.rejects(submitPrediction(DB,cat,body(events[2]),key,now+600001),/十分钟/);
 await submitPrediction(DB,cat,body(events[1],a,'100',1),key,now);await submitPrediction(DB,cat,body(events[1],b,'100',0),other,now);
 await submitPrediction(DB,cat,body(events[2],a,'100',2),key,now);await submitPrediction(DB,cat,body(events[2],b,'100',2),other,now);await submitPrediction(DB,cat,body(events[2],c,'100',2),key,now);
 const complete=(e,winnerId,loserWins)=>({...e,state:'completed',winnerId,loserWins,teams:e.teams.map(t=>({...t,wins:t.id===winnerId?Math.floor(e.bestOf/2)+1:loserWins,outcome:t.id===winnerId?'win':'loss'}))});
 await storeEvents(DB,[complete(events[0],'100',0),complete(events[1],'100',1),complete(events[2],'100',2)],now+1000);
 data=await predictionData(DB,cat,new URLSearchParams(),'',now+1000);
 assert.deepEqual(data.leaderboard.map(r=>[r.memberKey,r.winnerCorrect,r.exactScore,r.played]),[[b,3,1,3],[a,2,2,3],[c,1,1,1]]);
 // Winner corrections recalculate immediately, without adding another award.
 await storeEvents(DB,[complete(events[0],'200',0)],now+2000);
 data=await predictionData(DB,cat,new URLSearchParams(),'',now+2000);assert.equal(data.leaderboard[0].memberKey,a);assert.equal(data.leaderboard[0].winnerCorrect,3);
 // Cancellation removes that event from settled denominators.
 await storeEvents(DB,[{...events[0],state:'void'}],now+3000);
 data=await predictionData(DB,cat,new URLSearchParams(),'',now+3000);assert.equal(data.leaderboard.find(r=>r.memberKey===a).played,2);
 await storeEvents(DB,[{...events[0],state:'unstarted',startAt:now+99999999}],now+4000);
 await assert.rejects(submitPrediction(DB,cat,body(events[0]),key,now+4000),/封盘/,'postponement cannot reopen a locked match');
 const changed={...events[1],signature:'100:300:3',teams:[events[1].teams[0],{...events[1].teams[1],id:'300'}]};
 await storeEvents(DB,[changed],now+5000);data=await predictionData(DB,cat,new URLSearchParams({member:a}),key,now+5000);assert(data.events.find(e=>e.id===changed.id).changed);assert.equal(data.leaderboard.find(r=>r.memberKey===a).played,1);
 // A separate tournament demonstrates exact ties and day/stage filtering.
 const tie=fixture('444444444444',3,now+20000000);await storeEvents(DB,[tie],now+5000);await submitPrediction(DB,cat,body(tie,a,'100',1),key,now+5000);await submitPrediction(DB,cat,body(tie,b,'100',1),other,now+5000);await storeEvents(DB,[{...complete(tie,'100',1),stage:'Final',season:'2027'}],now+6000);
 data=await predictionData(DB,cat,new URLSearchParams({season:'2027',stage:'Final',day:dayOf(tie.startAt)}),'',now+6000);assert.equal(data.events.length,1);assert.deepEqual(data.leaderboard.map(r=>r.rank),[1,1]);
 assert.equal(dayOf(Date.parse('2026-10-23T16:00:00Z')),'2026-10-24');
 // The fetch boundary uses safe parsing, and invalid scores never settle.
 const raw={__typename:'EventMatch',id:'999999999999',startTime:new Date(now+3600000).toISOString(),state:'completed',blockName:'Swiss',league:{slug:'worlds'},tournament:{id:'x',name:'2026'},matchTeams:[{teamId:'100',code:'AAA',name:'undefined literal',image:'javascript:alert(1)',result:{gameWins:1,outcome:'win'}},{teamId:'200',code:'BBB',result:{gameWins:1,outcome:'loss'}}],match:{state:'completed',strategy:{count:3}}};
 const html='<script>(window[Symbol.for("ApolloSSRDataTransport")]??=[]).push('+JSON.stringify({rehydrate:{events:[raw,raw]}}).replace('"rehydrate":','"unused":undefined,"rehydrate":')+')</script>';
 const parsed=parseOfficialPage(html);assert.equal(parsed.length,1);assert.equal(parsed[0].winnerId,null);assert.equal(parsed[0].teams[0].name,'undefined literal');assert.equal(parsed[0].teams[0].image,'');assert.throws(()=>parseOfficialPage('<script>alert(1)</script>'),/未找到/);
 const pageFor=event=>'<script>(window[Symbol.for("ApolloSSRDataTransport")]??=[]).push('+JSON.stringify({events:[event]})+')</script>';
 const withGames={...raw,match:{state:'completed',strategy:{count:3},games:[{vods:[{label:'} quoted brace { and \\"'}]}]}};
 assert.deepEqual(parseOfficialPage(pageFor(withGames)),parsed,'prefix optimization must preserve every normalized field');
 const reordered={...raw,match:{games:withGames.match.games,strategy:{count:3},state:'completed'}};
 assert.deepEqual(parseOfficialPage(pageFor(reordered)),parsed,'reordered upstream keys use safe balanced fallback');
 const early=fixture('555555555555',3,now+20000000);await storeEvents(DB,[early],now+10000);await storeEvents(DB,[{...early,state:'inProgress'}],now+10001);
 await assert.rejects(submitPrediction(DB,cat,body(early),key,now+10002),/封盘/,'official early starts must close voting');
 const future=fixture('666666666666',3,now+20000000);await storeEvents(DB,[future],now+11000);await submitPrediction(DB,cat,body(future),key,now+11000);
 const updated={...future,signature:'100:300:3',teams:[future.teams[0],{...future.teams[1],id:'300'}]};await storeEvents(DB,[updated],now+12000);await submitPrediction(DB,cat,body(updated,a,'300',1),key,now+12000);
 assert.equal((await DB.prepare('SELECT signature FROM predictions WHERE event_id=?').bind(future.id).first()).signature,updated.signature,'new opponents can be re-predicted before lock');
 const before=(await DB.prepare('SELECT success_at FROM prediction_sync').first()).success_at;
 await syncPredictions({DB},now+2000000,async()=>new Response('bad',{status:500}));assert.equal((await DB.prepare('SELECT success_at FROM prediction_sync').first()).success_at,before);
 const env={DB,ALLOWED_ORIGINS:'https://3180678503-byte.github.io'};
 const response=await Worker.fetch(new Request('https://api.test/predictions'),env);assert.equal(response.status,200);
 assert.equal((await Worker.fetch(new Request('https://api.test/predictions',{headers:{Origin:'https://evil.test'}}),env)).status,403);
 const opts=await Worker.fetch(new Request('https://api.test/predictions',{method:'OPTIONS',headers:{Origin:'https://3180678503-byte.github.io'}}),env);assert.match(opts.headers.get('Access-Control-Allow-Headers'),/X-Prediction-Key/);
 assert.equal((await Worker.fetch(new Request('https://api.test/predictions',{method:'POST',headers:{'Content-Type':'application/json'},body:'null'}),env)).status,400);
 sqlite.close();console.log('PASS predictions: updates, ownership, hidden ballots, cutoff, stale data, legal BO scores, results, corrections, cancellation, changed teams, ties, filters, safe official parser, sync failure, CORS');
}
if(process.argv[1]&&new URL(import.meta.url).pathname.replace(/^\//,'').toLowerCase()===process.argv[1].replaceAll('\\','/').toLowerCase())await test();
