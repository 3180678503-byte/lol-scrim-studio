import {ApiError,hash,equals} from './moments-core.mjs';

export const ARCHIVE_CONSENT='bilibili-public-v1';
export const ALLOCATED_SIZE="CASE WHEN EXISTS(SELECT 1 FROM moment_archives a WHERE a.moment_id=moments.id AND a.source_deleted_at>0) THEN 0 ELSE size END";
const stmt=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const first=(env,sql,...args)=>stmt(env,sql,...args).first();
const changes=r=>Number(r?.meta?.changes??0);
const validBV=x=>typeof x==='string'&&/^BV[1-9A-HJ-NP-Za-km-z]{10}$/.test(x);
const leaseMs=30*60000;

export async function archiveFor(env,id){
 const a=await first(env,'SELECT state,bvid,source_deleted_at FROM moment_archives WHERE moment_id=?',id);
 return a?{state:a.state,bvid:a.state==='ready'?a.bvid:null,sourceAvailable:!a.source_deleted_at}:null;
}
export async function enqueueArchive(env,id,now){
 await stmt(env,"INSERT INTO moment_archives(moment_id,state,consent_version,consent_at,updated_at) VALUES(?,'queued',?,?,?)",id,ARCHIVE_CONSENT,now,now).run();
}
export async function archiveRoute(request,env,url,jsonBody,now=Date.now()){
 if(!url.pathname.startsWith('/archive/'))return null;
 if(!env.ARCHIVE_KEY||!await equals(request.headers.get('X-Archive-Key'),env.ARCHIVE_KEY))throw new ApiError('需要转存服务凭证',403);
 if(url.pathname==='/archive/jobs'&&request.method==='GET'){
  const rows=await stmt(env,"SELECT a.moment_id AS id,a.state,a.bvid,a.attempts,a.ready_at AS readyAt,a.source_deleted_at AS sourceDeletedAt,a.error_code AS errorCode,m.title,m.description,m.category,m.size,m.duration FROM moment_archives a JOIN moments m ON m.id=a.moment_id WHERE m.status='ready' AND (a.state!='ready' OR a.source_deleted_at=0) ORDER BY a.updated_at LIMIT 200").all();
  return {items:rows.results};
 }
 if(url.pathname==='/archive/claim'&&request.method==='POST'){
  const token=crypto.randomUUID()+crypto.randomUUID(),tokenHash=await hash(token);
  // Only an interrupted download can be retried automatically. A submission may
  // already exist on Bilibili, so an expired submitting lease stays for review.
  const job=await first(env,"SELECT a.moment_id FROM moment_archives a JOIN moments m ON m.id=a.moment_id WHERE m.status='ready' AND a.attempts<5 AND ((a.state IN ('queued','failed') AND a.retry_after<=?) OR (a.state='processing' AND a.lease_until<?)) ORDER BY a.updated_at LIMIT 1",now,now);
  if(!job)return {job:null};
  const r=await stmt(env,"UPDATE moment_archives SET state='processing',lease_hash=?,lease_until=?,attempts=attempts+1,updated_at=? WHERE moment_id=? AND ((state IN ('queued','failed') AND retry_after<=?) OR (state='processing' AND lease_until<?))",tokenHash,now+leaseMs,now,job.moment_id,now,now).run();
  if(!changes(r))return {job:null};
  const m=await first(env,'SELECT id,title,description,hero,category,size,duration FROM moments WHERE id=?',job.moment_id);
  return {job:{...m,leaseToken:token,expiresAt:now+leaseMs}};
 }
 const route=/^\/archive\/jobs\/([a-f0-9-]{36})\/(source|heartbeat|submitting|submitted|failed|verified|release)$/.exec(url.pathname);
 if(!route)throw new ApiError('没有这个转存接口',404);
 const [,id,action]=route,a=await first(env,"SELECT a.* FROM moment_archives a JOIN moments m ON m.id=a.moment_id WHERE a.moment_id=? AND m.status='ready'",id);
 if(!a)throw new ApiError('转存任务不存在或视频已删除',404);
 const raw=request.method==='POST'?await jsonBody(request):{};
 if(['source','heartbeat','submitting','failed'].includes(action)){
  const token=request.headers.get('X-Archive-Lease')||raw.leaseToken;
  if(!token||!await equals(await hash(token),a.lease_hash)||a.lease_until<now)throw new ApiError('转存租约已过期',409);
 }
 if(action==='source'&&request.method==='GET'){
  if(a.state!=='processing')throw new ApiError('当前任务不能下载原片',409);
  const object=await env.MEDIA.get('videos/'+id+'.mp4');if(!object)throw new ApiError('未找到原片',404);
  return new Response(object.body,{headers:{'Content-Type':'video/mp4','Content-Length':String(object.size),'Cache-Control':'no-store'}});
 }
 if(request.method!=='POST')throw new ApiError('请求方法不正确',405);
 if(action==='heartbeat'){
  if(!['processing','submitting'].includes(a.state))throw new ApiError('任务状态已改变',409);
  await stmt(env,'UPDATE moment_archives SET lease_until=?,updated_at=? WHERE moment_id=?',now+leaseMs,now,id).run();return {ok:true};
 }
 if(action==='submitting'){
  if(a.state!=='processing')throw new ApiError('任务已经提交或需核对',409);
  await stmt(env,"UPDATE moment_archives SET state='submitting',updated_at=? WHERE moment_id=? AND state='processing'",now,id).run();return {ok:true};
 }
 if(action==='submitted'){
  if(!validBV(raw.bvid)||!Number.isSafeInteger(raw.ownerMid)||raw.ownerMid<1)throw new ApiError('BV 号或投稿账号不正确');
  if(!['submitting','manual','submitted'].includes(a.state))throw new ApiError('当前任务不能登记投稿',409);
  if(a.bvid&&a.bvid!==raw.bvid)throw new ApiError('该任务已绑定其他稿件',409);
  await stmt(env,"UPDATE moment_archives SET state='submitted',bvid=?,owner_mid=?,error_code='',updated_at=? WHERE moment_id=?",raw.bvid,raw.ownerMid,now,id).run();return {ok:true};
 }
 if(action==='failed'){
  if(!['processing','submitting'].includes(a.state))throw new ApiError('当前任务不能重试',409);
  const state=a.state==='submitting'?'manual':'failed';
  await stmt(env,'UPDATE moment_archives SET state=?,retry_after=?,error_code=?,updated_at=? WHERE moment_id=?',state,now+30*60000,state==='manual'?'submission_uncertain':'download_failed',now,id).run();return {ok:true,state};
 }
 if(action==='verified'){
  if(!['submitted','ready'].includes(a.state)||raw.bvid!==a.bvid||raw.ownerMid!==a.owner_mid||raw.state!==0||!Number.isSafeInteger(raw.cid)||raw.cid<1||!Number.isSafeInteger(raw.checkedAt)||Math.abs(now-raw.checkedAt)>5*60000)throw new ApiError('需要近期公开稿件验证，且投稿账号必须匹配',409);
  await stmt(env,"UPDATE moment_archives SET state='ready',ready_at=CASE WHEN ready_at=0 THEN ? ELSE ready_at END,verified_at=?,updated_at=? WHERE moment_id=?",now,now,now,id).run();return {ok:true};
 }
 if(action==='release'){
  if(a.source_deleted_at)return {ok:true,alreadyReleased:true};
  if(a.state!=='ready'||a.ready_at>now-86400000||a.verified_at<now-10*60000||!/^([a-f0-9]{64})$/.test(raw.localBackupSha256||''))throw new ApiError('原片需至少保留一天、近期验证通过并保留本地备份',409);
  await env.MEDIA.delete('videos/'+id+'.mp4');
  await stmt(env,'UPDATE moment_archives SET source_deleted_at=?,backup_sha256=?,updated_at=? WHERE moment_id=?',now,raw.localBackupSha256,now,id).run();return {ok:true};
 }
 throw new ApiError('没有这个转存接口',404);
}
