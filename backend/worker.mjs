import Core from '../community-core.js';
import manifest from './manifest.json' with {type:'json'};
import {predictionRoute,syncPredictions} from './predictions.mjs';
let cachedCatalog=null,catalogExpires=0;
async function catalogFor(env){
 if(!env.MANIFEST_URL)return manifest;if(cachedCatalog&&Date.now()<catalogExpires)return cachedCatalog;
 try{const response=await fetch(env.MANIFEST_URL,{cf:{cacheTtl:60,cacheEverything:true}});if(response.ok){const value=await response.json();if(value.schemaVersion===1&&Array.isArray(value.members)&&value.matches&&value.days){cachedCatalog=value;catalogExpires=Date.now()+60000;return value;}}}catch{}
 return cachedCatalog||manifest;
}
const targetFrom=u=>({kind:u.searchParams.get('kind'),playerKey:u.searchParams.get('playerKey'),matchKey:u.searchParams.get('matchKey'),dataset:u.searchParams.get('dataset'),day:u.searchParams.get('day')});
async function reviews(db,target,catalog=manifest){
 const members=new Map(catalog.members.map(m=>[m.key,m.name])),id=Core.validateTarget(target,catalog),[votes,comments,total]=await db.batch([db.prepare('SELECT rater_key,stars,updated_at FROM votes WHERE target_id=? ORDER BY updated_at DESC').bind(id),db.prepare('SELECT id,rater_key,body,created_at FROM comments WHERE target_id=? ORDER BY created_at DESC,id DESC LIMIT 100').bind(id),db.prepare('SELECT COUNT(*) AS total FROM comments WHERE target_id=?').bind(id)]);
 const validVotes=votes.results.filter(v=>members.has(v.rater_key)),validComments=comments.results.filter(c=>members.has(c.rater_key)),histogram=[1,2,3,4,5].map(star=>({stars:star,count:validVotes.filter(v=>v.stars===star).length}));
 return {targetId:id,mean:validVotes.length?validVotes.reduce((n,v)=>n+v.stars,0)/validVotes.length:null,voteCount:validVotes.length,histogram,votes:validVotes.map(v=>({raterKey:v.rater_key,name:members.get(v.rater_key),stars:v.stars,updatedAt:new Date(v.updated_at).toISOString()})),comments:validComments.map(c=>({id:c.id,raterKey:c.rater_key,name:members.get(c.rater_key),comment:c.body,createdAt:new Date(c.created_at).toISOString()})),commentCount:total.results[0].total};
}
export default {
 async scheduled(event,env,ctx){ctx.waitUntil(syncPredictions(env));},
 async fetch(request,env){
  const origin=request.headers.get('Origin'),allowed=(env.ALLOWED_ORIGINS||'https://3180678503-byte.github.io').split(',').map(s=>s.trim()),cors=origin&&allowed.includes(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{};
  const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store',...cors}});
  if(origin&&!allowed.includes(origin))return response({error:'此来源无法提交或读取评分'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,X-Prediction-Key','Access-Control-Max-Age':'86400'}});
  const url=new URL(request.url);
  const catalog=await catalogFor(env);
  if(request.method==='GET'&&url.pathname==='/health')return response({ok:true,schemaVersion:1,members:catalog.members.length});
  try{
   if(url.pathname==='/predictions')return response(await predictionRoute(request,env,catalog));
   if(request.method==='GET'&&url.pathname==='/reviews')return response(await reviews(env.DB,targetFrom(url),catalog));
   if(request.method==='POST'&&url.pathname==='/entries'){
    if(!request.headers.get('content-type')?.startsWith('application/json'))return response({error:'需要 JSON 请求'},415);
    if(Number(request.headers.get('content-length'))>12000)return response({error:'提交内容过长'},413);
    const body=await request.text();if(body.length>12000)return response({error:'提交内容过长'},413);let raw;try{raw=JSON.parse(body);}catch{return response({error:'提交格式错误'},400);}
    const entry=Core.validateEntry(raw,catalog),now=Date.now(),existing=await env.DB.prepare('SELECT request_id FROM submissions WHERE request_id=?').bind(entry.requestId).first();
    if(existing)return response(await reviews(env.DB,entry.target,catalog));
    const recent=await env.DB.prepare('SELECT COUNT(*) AS n FROM submissions WHERE rater_key=? AND created_at>?').bind(entry.raterKey,now-60000).first();if(recent.n>=12)return response({error:'提交太频繁，请一分钟后再试'},429);
    const statements=[env.DB.prepare('INSERT OR IGNORE INTO submissions(request_id,rater_key,created_at) VALUES(?,?,?)').bind(entry.requestId,entry.raterKey,now)];
    if(entry.stars!==null)statements.push(env.DB.prepare('INSERT INTO votes(target_id,rater_key,stars,updated_at) VALUES(?,?,?,?) ON CONFLICT(target_id,rater_key) DO UPDATE SET stars=excluded.stars,updated_at=excluded.updated_at').bind(entry.targetId,entry.raterKey,entry.stars,now));
    if(entry.comment)statements.push(env.DB.prepare('INSERT OR IGNORE INTO comments(id,target_id,rater_key,body,created_at) VALUES(?,?,?,?,?)').bind(entry.requestId,entry.targetId,entry.raterKey,entry.comment,now));
    await env.DB.batch(statements);return response(await reviews(env.DB,entry.target,catalog),201);
   }
   return response({error:'没有这个接口'},404);
  }catch(e){if(e.message?.includes('D1')||e.message?.includes('SQLITE'))return response({error:'数据存储暂时不可用，请稍后重试'},503);return response({error:e.message||'提交失败'},e.status||400);}
 }
};
export {reviews};
