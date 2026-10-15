import manifest from './manifest.json' with {type:'json'};
import {LIMITS,CATEGORIES,ApiError,validateMoment,parseRange,hash,equals,signSession,readSession,dayStart} from './moments-core.mjs';
let catalogCache=null,catalogUntil=0;
async function catalogFor(env){
 if(!env.MANIFEST_URL)return manifest;
 if(catalogCache&&catalogUntil>Date.now())return catalogCache;
 try{const r=await fetch(env.MANIFEST_URL,{cf:{cacheTtl:60,cacheEverything:true}});if(r.ok){const d=await r.json();if(d.schemaVersion===1&&Array.isArray(d.members)&&d.matches){catalogCache=d;catalogUntil=Date.now()+60000;return d;}}}catch{}
 return catalogCache||manifest;
}
const statement=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const get=(env,sql,...args)=>statement(env,sql,...args).first();
const run=(env,sql,...args)=>statement(env,sql,...args).run();
const changes=result=>Number(result?.meta?.changes??result?.changes??0);
// Expired reservations keep their allocation until cleanup has removed the files.
const activeWhere="status IN ('ready','pending','uploading')";
async function usage(env){const row=await get(env,`SELECT COALESCE(SUM(size+?),0) AS bytes,COUNT(*) AS count,SUM(CASE WHEN status='ready' THEN 1 ELSE 0 END) AS published FROM moments WHERE ${activeWhere}`,LIMITS.posterBytes);return {allocatedBytes:row.bytes,published:row.published||0,totalBytes:LIMITS.totalBytes};}
async function jsonBody(request,max=16000){
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new ApiError('需要 JSON 请求',415);
 if(Number(request.headers.get('content-length'))>max)throw new ApiError('提交内容过长',413);
 const reader=request.body?.getReader(),chunks=[];let size=0;
 if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new ApiError('提交内容过长',413);}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError('提交格式错误');}
}
async function authenticate(request,env,catalog){const session=await readSession(request.headers.get('Authorization')?.replace(/^Bearer /,''),env.SESSION_SECRET);if(!catalog.members.some(p=>p.key===session.playerKey))throw new ApiError('该 ID 已不在当前名单中',403);return session;}
async function findMoment(env,id,ready=false){const m=await get(env,'SELECT * FROM moments WHERE id=?',id);if(!m||['deleted','expired'].includes(m.status)||ready&&m.status!=='ready')throw new ApiError('视频不存在或已删除',404);return m;}
async function owned(request,env,m){if(env.ADMIN_KEY&&await equals(request.headers.get('X-Admin-Key'),env.ADMIN_KEY))return true;const token=request.headers.get('X-Owner-Token');if(!token||!await equals(await hash(token),m.owner_hash))throw new ApiError('需要本视频的管理凭证，或管理员口令',403);return true;}
async function publicMoment(env,m){
 const [players,likes,comments]=await env.DB.batch([statement(env,'SELECT player_key FROM moment_players WHERE moment_id=?',m.id),statement(env,'SELECT player_key FROM moment_likes WHERE moment_id=?',m.id),statement(env,'SELECT COUNT(*) AS n FROM moment_comments WHERE moment_id=?',m.id)]);
 return {id:m.id,uploaderKey:m.uploader_key,title:m.title,description:m.description,category:m.category,players:players.results.map(x=>x.player_key),matchKey:m.match_key,occurredOn:m.occurred_on,hero:m.hero,size:m.size,duration:m.duration,createdAt:m.created_at,hasPoster:m.poster_size>0,likes:likes.results.map(x=>x.player_key),commentCount:comments.results[0].n};
}
async function cleanup(env,now=Date.now()){
 const expired=await statement(env,"SELECT id FROM moments WHERE status IN ('pending','uploading') AND expires_at<=? LIMIT 100",now).all();
 if(env.MEDIA)for(const m of expired.results){await env.MEDIA.delete(['videos/'+m.id+'.mp4','posters/'+m.id+'.jpg']);await run(env,"UPDATE moments SET status='expired' WHERE id=? AND status IN ('pending','uploading')",m.id);}
 await run(env,'DELETE FROM moment_auth_attempts WHERE created_at<?',now-86400000);
}
export default {
 async fetch(request,env){
  const origin=request.headers.get('Origin'),allowed=(env.ALLOWED_ORIGINS||'https://3180678503-byte.github.io').split(',').map(x=>x.trim()),cors=origin&&allowed.includes(origin)?{'Access-Control-Allow-Origin':origin,Vary:'Origin'}:{};
  const respond=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store',...cors,...extra}});
  if(origin&&!allowed.includes(origin))return respond({error:'此来源无法访问名场面'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'GET,HEAD,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type,X-Upload-Token,X-Owner-Token,X-Admin-Key,Range','Access-Control-Expose-Headers':'Content-Range,Accept-Ranges,ETag','Access-Control-Max-Age':'86400'}});
  const url=new URL(request.url),now=Date.now();
  try{
   const catalog=await catalogFor(env),storageReady=!!(env.MEDIA&&env.GROUP_CODE&&env.SESSION_SECRET);
   if(request.method==='GET'&&url.pathname==='/health')return respond({ok:true,storageReady,limits:LIMITS});
   if(request.method==='GET'&&url.pathname==='/catalog')return respond({storageReady,limits:LIMITS,categories:CATEGORIES,members:catalog.members,matches:catalog.matchMeta||{}});
   if(request.method==='GET'&&url.pathname==='/usage')return respond(await usage(env));
   if(request.method==='POST'&&url.pathname==='/session'){
    if(!env.GROUP_CODE||!env.SESSION_SECRET)throw new ApiError('上传空间正在准备，请稍后再试',503);
    const raw=await jsonBody(request),fingerprint=await hash((request.headers.get('CF-Connecting-IP')||'local')+env.SESSION_SECRET);
    const count=await get(env,'SELECT COUNT(*) AS n FROM moment_auth_attempts WHERE fingerprint=? AND created_at>?',fingerprint,now-600000);if(count.n>=30)throw new ApiError('口令尝试过多，请十分钟后再试',429);
    await run(env,'INSERT INTO moment_auth_attempts(fingerprint,created_at) VALUES(?,?)',fingerprint,now);
    if(!catalog.members.some(p=>p.key===raw.playerKey)||!await equals(raw.code,env.GROUP_CODE))throw new ApiError('ID 或群口令不正确',401);
    const exp=now+7*86400000,token=await signSession({playerKey:raw.playerKey,exp},env.SESSION_SECRET);return respond({token,playerKey:raw.playerKey,expiresAt:exp});
   }
   if(request.method==='GET'&&url.pathname==='/moments'){
    const filters=["status='ready'"],args=[];const player=url.searchParams.get('player'),category=url.searchParams.get('category'),search=url.searchParams.get('search')?.trim().slice(0,80);
    if(player){filters.push('EXISTS(SELECT 1 FROM moment_players p WHERE p.moment_id=m.id AND p.player_key=?)');args.push(player);}
    if(category){if(!Object.hasOwn(CATEGORIES,category))throw new ApiError('分类不存在');filters.push('category=?');args.push(category);}
    if(search){filters.push('(title LIKE ? OR description LIKE ? OR hero LIKE ?)');args.push(...Array(3).fill('%'+search+'%'));}
    const offset=Math.min(100000,Math.max(0,Number(url.searchParams.get('offset'))||0))|0,where=filters.join(' AND '),order=url.searchParams.get('sort')==='hot'?"(SELECT COUNT(*) FROM moment_likes l WHERE l.moment_id=m.id) DESC,created_at DESC,id DESC":'created_at DESC,id DESC';
    const rows=await statement(env,`SELECT * FROM moments m WHERE ${where} ORDER BY ${order} LIMIT 12 OFFSET ?`,...args,offset).all(),total=await get(env,`SELECT COUNT(*) AS n FROM moments m WHERE ${where}`,...args);
    const items=[];for(const row of rows.results)items.push(await publicMoment(env,row));return respond({items,total:total.n,offset,nextOffset:offset+rows.results.length<total.n?offset+rows.results.length:null});
   }
   if(request.method==='POST'&&url.pathname==='/moments'){
    if(!storageReady)throw new ApiError('视频空间暂未开通，暂不能上传',503);
    const session=await authenticate(request,env,catalog),raw=validateMoment(await jsonBody(request),catalog),id=crypto.randomUUID(),uploadToken=crypto.randomUUID()+crypto.randomUUID(),ownerToken=crypto.randomUUID()+crypto.randomUUID();
    const columns=['id','uploader_key','title','description','category','match_key','occurred_on','hero','size','duration','mime','status','upload_hash','owner_hash','created_at','expires_at'];
    const values=[id,session.playerKey,raw.title,raw.description,raw.category,raw.matchKey,raw.occurredOn,raw.hero,raw.size,raw.duration,raw.mime,'pending',await hash(uploadToken),await hash(ownerToken),now,now+3600000];
    const result=await run(env,`INSERT INTO moments (${columns.join(',')}) SELECT ${columns.map(()=>'?').join(',')} WHERE (SELECT COALESCE(SUM(size+?),0) FROM moments WHERE ${activeWhere})+?<=? AND (SELECT COUNT(*) FROM moments WHERE uploader_key=? AND created_at>=? AND status NOT IN ('deleted','expired'))<?`,...values,LIMITS.posterBytes,raw.size+LIMITS.posterBytes,LIMITS.totalBytes,session.playerKey,dayStart(now),LIMITS.uploadsPerDay);
    if(!changes(result)){const count=await get(env,"SELECT COUNT(*) AS n FROM moments WHERE uploader_key=? AND created_at>=? AND status NOT IN ('deleted','expired')",session.playerKey,dayStart(now));throw new ApiError(count.n>=LIMITS.uploadsPerDay?'今天已达到 5 条上传额度，明天再来':'视频空间已满，请联系管理员清理',count.n>=LIMITS.uploadsPerDay?429:507);}
    await env.DB.batch(raw.players.map(key=>statement(env,'INSERT INTO moment_players(moment_id,player_key) VALUES(?,?)',id,key)));
    return respond({id,uploadToken,ownerToken,expiresAt:now+3600000},201);
   }
   const route=/^\/moments\/([a-f0-9-]{36})(?:\/(video|poster|upload|likes|comments))?$/.exec(url.pathname);
   if(!route)throw new ApiError('没有这个接口',404);
   const [,id,action]=route;
   if(request.method==='PUT'&&action==='upload'){
    if(!env.MEDIA)throw new ApiError('视频空间暂未开通',503);
    const m=await findMoment(env,id);if(m.expires_at<now||m.status==='ready')throw new ApiError(m.status==='ready'?'视频已经上传完成':'上传链接已过期',409);
    if(!await equals(await hash(request.headers.get('X-Upload-Token')||''),m.upload_hash))throw new ApiError('上传凭证无效',403);
    if(Number(request.headers.get('Content-Length'))!==m.size||request.headers.get('Content-Type')!=='video/mp4')throw new ApiError('视频大小或格式与提交信息不同',400);
    const lock=await run(env,"UPDATE moments SET status='uploading' WHERE id=? AND status='pending'",id);if(!changes(lock))throw new ApiError('视频正在上传，请稍后重试',409);
    try{
     const object=await env.MEDIA.put('videos/'+id+'.mp4',request.body,{httpMetadata:{contentType:'video/mp4'}});
     if(!object||object.size!==m.size)throw new ApiError('视频上传不完整，请重试');
     const prefix=await env.MEDIA.get('videos/'+id+'.mp4',{range:{offset:0,length:32}}),bytes=new Uint8Array(await prefix.arrayBuffer());
     if(new TextDecoder().decode(bytes.slice(4,8))!=='ftyp')throw new ApiError('文件不是可识别的 MP4 视频');
     const complete=await run(env,"UPDATE moments SET status='ready' WHERE id=? AND status='uploading' AND expires_at>?",id,Date.now());if(!changes(complete))throw new ApiError('该上传已取消或过期',409);
     return respond({ok:true,id},201);
    }catch(error){await env.MEDIA.delete('videos/'+id+'.mp4');await run(env,"UPDATE moments SET status='pending' WHERE id=? AND status='uploading'",id);throw error;}
   }
   if(request.method==='PUT'&&action==='poster'){
    const m=await findMoment(env,id,true);await owned(request,env,m);const size=Number(request.headers.get('Content-Length'));
    if(!Number.isInteger(size)||size<2||size>LIMITS.posterBytes||request.headers.get('Content-Type')!=='image/jpeg')throw new ApiError('封面格式或大小不正确');
    const object=await env.MEDIA.put('posters/'+id+'.jpg',request.body,{httpMetadata:{contentType:'image/jpeg'}});
    const prefix=await env.MEDIA.get('posters/'+id+'.jpg',{range:{offset:0,length:2}}),bytes=new Uint8Array(await prefix.arrayBuffer());
    if(!object||object.size!==size||bytes[0]!==255||bytes[1]!==216){await env.MEDIA.delete('posters/'+id+'.jpg');throw new ApiError('封面格式不正确');}
    const result=await run(env,"UPDATE moments SET poster_size=? WHERE id=? AND status='ready'",size,id);if(!changes(result)){await env.MEDIA.delete('posters/'+id+'.jpg');throw new ApiError('视频已删除',404);}return respond({ok:true});
   }
   if(['GET','HEAD'].includes(request.method)&&['video','poster'].includes(action)){
    const m=await findMoment(env,id,true);if(!env.MEDIA)throw new ApiError('视频空间暂不可用',503);
    if(action==='poster'&&!m.poster_size)throw new ApiError('没有封面',404);
    const key=(action==='video'?'videos/':'posters/')+id+(action==='video'?'.mp4':'.jpg'),head=await env.MEDIA.head(key);if(!head)throw new ApiError('视频文件暂不可用',404);
    let range;try{range=parseRange(request.headers.get('Range'),head.size);}catch(e){return new Response(null,{status:416,headers:{...cors,'Content-Range':'bytes */'+head.size}});}
    const headers=new Headers({...cors,'Content-Type':action==='video'?'video/mp4':'image/jpeg','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes','Cache-Control':'public,max-age=600','ETag':head.httpEtag,'Content-Length':String(range?.length||head.size)});
    if(range)headers.set('Content-Range',`bytes ${range.offset}-${range.offset+range.length-1}/${head.size}`);
    if(!range&&request.headers.get('If-None-Match')===head.httpEtag)return new Response(null,{status:304,headers});
    if(request.method==='HEAD')return new Response(null,{status:range?206:200,headers});
    const object=await env.MEDIA.get(key,range?{range}:undefined);if(!object)throw new ApiError('视频文件暂不可用',404);return new Response(object.body,{status:range?206:200,headers});
   }
   if(request.method==='DELETE'&&!action){if(!env.MEDIA)throw new ApiError('视频空间暂不可用，请稍后再试',503);const m=await findMoment(env,id);await owned(request,env,m);await run(env,"UPDATE moments SET status='uploading',expires_at=0 WHERE id=?",id);await env.MEDIA.delete(['videos/'+id+'.mp4','posters/'+id+'.jpg']);await run(env,"UPDATE moments SET status='deleted' WHERE id=?",id);await env.DB.batch(['moment_players','moment_likes','moment_comments'].map(table=>statement(env,`DELETE FROM ${table} WHERE moment_id=?`,id)));return respond({ok:true});}
   const m=await findMoment(env,id,true);
   if(request.method==='GET'&&!action)return respond(await publicMoment(env,m));
   if(request.method==='GET'&&action==='comments'){const rows=await statement(env,'SELECT id,player_key AS playerKey,body,created_at AS createdAt FROM moment_comments WHERE moment_id=? ORDER BY created_at DESC,id DESC LIMIT 100',id).all();return respond({comments:rows.results});}
   if(request.method==='POST'&&action==='likes'){
    const session=await authenticate(request,env,catalog),raw=await jsonBody(request);if(typeof raw.liked!=='boolean')throw new ApiError('点赞状态不正确');
    if(raw.liked)await run(env,'INSERT OR IGNORE INTO moment_likes(moment_id,player_key,created_at) VALUES(?,?,?)',id,session.playerKey,now);else await run(env,'DELETE FROM moment_likes WHERE moment_id=? AND player_key=?',id,session.playerKey);return respond({ok:true});
   }
   if(request.method==='POST'&&action==='comments'){
    const session=await authenticate(request,env,catalog),raw=await jsonBody(request),body=typeof raw.body==='string'?raw.body.trim():'';
    if(!body||body.length>500||typeof raw.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(raw.requestId))throw new ApiError('评论需要 1–500 字');
    const count=await get(env,'SELECT COUNT(*) AS n FROM moment_comments WHERE player_key=? AND created_at>?',session.playerKey,now-60000);if(count.n>=6)throw new ApiError('评论太快了，请一分钟后再试',429);
    await run(env,'INSERT OR IGNORE INTO moment_comments(id,moment_id,player_key,body,created_at) VALUES(?,?,?,?,?)',raw.requestId,id,session.playerKey,body,now);return respond({ok:true},201);
   }
   throw new ApiError('没有这个接口',404);
  }catch(error){if(error instanceof ApiError)return respond({error:error.message},error.status);return respond({error:'名场面服务暂时不可用，请稍后重试'},503);}
 },
 async scheduled(event,env){await cleanup(env);}
};
export {cleanup};
