import {fetchOfficial, SOURCE_URL} from './predictions-source.mjs';
const LOCK_LEAD = 300000, MAX_AGE = 600000;
const all = async statement => (await statement.all()).results;
const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };
export const dayOf = timestamp => new Date(timestamp + 8 * 3600000).toISOString().slice(0, 10);
async function ownerHash(key) {
  if (!/^[a-zA-Z0-9_-]{32,100}$/.test(key || '')) fail('浏览器编辑凭据无效，请刷新页面');
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)))].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function storeEvents(db, events, now = Date.now()) {
  if (!events.length || events.length > 500) throw new Error('赛程数量异常');
  const statements = events.map(e => db.prepare(`INSERT INTO prediction_events
    (id,tournament,season,stage,start_at,lock_at,best_of,state,signature,data,winner_id,loser_wins,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
    tournament=excluded.tournament,season=excluded.season,stage=excluded.stage,start_at=excluded.start_at,
    lock_at=MIN(prediction_events.lock_at,excluded.lock_at),best_of=excluded.best_of,state=excluded.state,
    signature=excluded.signature,data=excluded.data,winner_id=excluded.winner_id,loser_wins=excluded.loser_wins,updated_at=excluded.updated_at`)
    .bind(e.id,e.tournament,e.season,e.stage,e.startAt,e.state === 'unstarted' ? e.startAt - LOCK_LEAD : Math.min(now,e.startAt - LOCK_LEAD),e.bestOf,e.state,e.signature,JSON.stringify(e),e.winnerId,e.loserWins,now));
  statements.push(db.prepare(`INSERT INTO prediction_sync(id,attempted_at,success_at,error) VALUES(1,?,?,NULL)
    ON CONFLICT(id) DO UPDATE SET attempted_at=excluded.attempted_at,success_at=excluded.success_at,error=NULL`).bind(now,now));
  await db.batch(statements);
}

export async function syncPredictions(env, now = Date.now(), fetcher = fetch) {
  const db = env.DB, sync = await db.prepare('SELECT * FROM prediction_sync WHERE id=1').first();
  // Poll every two minutes near matches; otherwise every eight minutes.
  const active = await db.prepare("SELECT id FROM prediction_events WHERE state='inProgress' OR (state='unstarted' AND start_at BETWEEN ? AND ?) LIMIT 1").bind(now - 3600000,now + 3600000).first();
  if (sync && now - sync.attempted_at < (active || sync.error ? 100000 : 480000)) return;
  try { await storeEvents(db, await fetchOfficial(fetcher), now); }
  catch (error) {
    console.error('Official prediction schedule sync failed:', error.message);
    await db.prepare(`INSERT INTO prediction_sync(id,attempted_at,error) VALUES(1,?,?)
      ON CONFLICT(id) DO UPDATE SET attempted_at=excluded.attempted_at,error=excluded.error`).bind(now,'官方赛程暂未同步成功，保留上次数据').run();
  }
}

export function standings(events, picks, members) {
  const allowed = new Map(members.map(m => [m.key,m.name])), byEvent = new Map(events.map(e => [e.id,e])), rows = new Map();
  for (const p of picks) {
    const e = byEvent.get(p.event_id);
    if (!e || !allowed.has(p.member_key) || !e.winner_id || e.state !== 'completed' || e.signature !== p.signature) continue;
    if (!rows.has(p.member_key)) rows.set(p.member_key,{memberKey:p.member_key,name:allowed.get(p.member_key),played:0,winnerCorrect:0,exactScore:0});
    const r=rows.get(p.member_key); r.played++;
    if (p.winner_id === e.winner_id) { r.winnerCorrect++; if(e.best_of>1 && p.loser_wins===e.loser_wins) r.exactScore++; }
  }
  const result=[...rows.values()].map(r=>({...r,hitRate:r.winnerCorrect/r.played})).sort((a,b)=>b.winnerCorrect-a.winnerCorrect || b.exactScore-a.exactScore || b.hitRate-a.hitRate || a.name.localeCompare(b.name));
  for (let i=0;i<result.length;i++) { const a=result[i],b=result[i-1]; a.rank=b&&a.winnerCorrect===b.winnerCorrect&&a.exactScore===b.exactScore&&a.hitRate===b.hitRate?b.rank:i+1; }
  return result;
}

export async function predictionData(db, catalog, query, key, now=Date.now()) {
  const events=await all(db.prepare('SELECT * FROM prediction_events ORDER BY start_at,id'));
  const picks=await all(db.prepare('SELECT * FROM predictions'));
  const sync=await db.prepare('SELECT * FROM prediction_sync WHERE id=1').first();
  const member=query.get('member') || '', hash=key ? await ownerHash(key) : '';
  const allowed=new Map(catalog.members.map(m=>[m.key,m.name]));
  const season=query.get('season') || events.at(-1)?.season || '';
  const current=events.filter(e=>e.season===season);
  const day=query.get('day'), stage=query.get('stage');
  const selected=current.filter(e=>(!day || dayOf(e.start_at)===day)&&(!stage || e.stage===stage));
  const visible=selected.map(e=>{
    const data=JSON.parse(e.data), locked=now>=e.lock_at || e.state!=='unstarted';
    const ballots=picks.filter(p=>p.event_id===e.id && p.signature===e.signature && allowed.has(p.member_key));
    const own=ballots.find(p=>p.member_key===member&&p.owner_hash===hash);
    const changed=picks.some(p=>p.event_id===e.id&&p.member_key===member&&p.owner_hash===hash&&p.signature!==e.signature);
    const stale=!sync?.success_at || now-sync.success_at>MAX_AGE;
    return {...data,day:dayOf(e.start_at),lockAt:e.lock_at,locked,canVote:!locked&&data.ready&&!stale,participation:ballots.length,
      mine:own?{winnerId:own.winner_id,loserWins:own.loser_wins,updatedAt:own.updated_at}:null,changed,
      ballots:locked?ballots.map(p=>({memberKey:p.member_key,name:allowed.get(p.member_key),winnerId:p.winner_id,loserWins:p.loser_wins})):[],
      support:locked?data.teams.map(t=>({teamId:t.id,count:ballots.filter(p=>p.winner_id===t.id).length})):[]};
  });
  return {serverTime:now,source:SOURCE_URL,lastSyncAt:sync?.success_at||null,syncError:sync?.error||null,stale:!sync?.success_at||now-sync.success_at>MAX_AGE,
    season,seasons:[...new Set(events.map(e=>e.season))].sort().reverse(),days:[...new Set(current.map(e=>dayOf(e.start_at)))],stages:[...new Set(current.map(e=>e.stage))],
    members:catalog.members.map(m=>({key:m.key,name:m.name})),events:visible,leaderboard:standings(selected,picks,catalog.members)};
}

export async function submitPrediction(db,catalog,body,key,now=Date.now()) {
  if (!catalog.members.some(m=>m.key===body.memberKey)) fail('请先选择自己的 ID');
  if (!/^\d{10,30}$/.test(body.eventId||'')) fail('比赛无效');
  const hash=await ownerHash(key);
  const e=await db.prepare('SELECT * FROM prediction_events WHERE id=?').bind(body.eventId).first();
  if (!e) fail('比赛尚未同步',404);
  if (e.state!=='unstarted' || now>=e.lock_at) fail('本场已封盘，无法提交或修改',409);
  const sync=await db.prepare('SELECT success_at FROM prediction_sync WHERE id=1').first();
  if (!sync?.success_at || now-sync.success_at>MAX_AGE) fail('官方赛程同步超过十分钟，请稍后重试',503);
  const data=JSON.parse(e.data), needed=Math.floor(e.best_of/2)+1;
  if (!data.ready || body.signature!==e.signature) fail('对阵或赛制已更新，请刷新后重新预测',409);
  if (!data.teams.some(t=>t.id===body.winnerId) || !Number.isInteger(body.loserWins) || body.loserWins<0 || body.loserWins>=needed) fail('请选择合法的胜者和比分');
  // One atomic statement guards both the deadline and the original browser's editing credential.
  const result=await db.prepare(`INSERT INTO predictions(event_id,member_key,owner_hash,signature,winner_id,loser_wins,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM prediction_events WHERE id=? AND state='unstarted' AND lock_at>? AND signature=?)
    ON CONFLICT(event_id,member_key) DO UPDATE SET signature=excluded.signature,winner_id=excluded.winner_id,loser_wins=excluded.loser_wins,updated_at=excluded.updated_at
    WHERE predictions.owner_hash=excluded.owner_hash`).bind(e.id,body.memberKey,hash,e.signature,body.winnerId,body.loserWins,now,now,e.id,now,e.signature).run();
  const changes=result.meta?.changes ?? result.changes;
  if (!changes) fail('该 ID 已在其他浏览器提交，或本场刚刚封盘；请使用原浏览器修改',409);
  return {ok:true,eventId:e.id,updatedAt:now};
}

export async function predictionRoute(request,env,catalog) {
  const url=new URL(request.url), key=request.headers.get('X-Prediction-Key') || '';
  if (request.method==='GET'&&url.pathname==='/predictions') return predictionData(env.DB,catalog,url.searchParams,key);
  if (request.method==='POST'&&url.pathname==='/predictions') {
    if (!request.headers.get('Content-Type')?.includes('application/json')) fail('仅接受 JSON');
    const text=await request.text(); if(text.length>4000) fail('提交内容过长');
    let body;try{body=JSON.parse(text);}catch{fail('JSON 格式无效');}
    if (!body || typeof body!=='object' || Array.isArray(body)) fail('预测格式无效');
    return submitPrediction(env.DB,catalog,body,key);
  }
  fail('接口不存在',404);
}
