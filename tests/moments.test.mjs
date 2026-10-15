import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import Worker,{cleanup} from '../backend/moments-worker.mjs';
import {LIMITS,validateMoment,parseRange,signSession,readSession,dayStart} from '../backend/moments-core.mjs';
import catalog from '../backend/manifest.json' with {type:'json'};

export function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync(new URL('../backend/moments-schema.sql',import.meta.url),'utf8'));
 class Statement{constructor(sql){this.sql=sql;this.params=[];}bind(...p){this.params=p;return this;}first(){return Promise.resolve(sqlite.prepare(this.sql).get(...this.params)||null);}all(){return Promise.resolve({results:sqlite.prepare(this.sql).all(...this.params)});}run(){const r=sqlite.prepare(this.sql).run(...this.params);return Promise.resolve({meta:{changes:Number(r.changes)}});}}
 const DB={prepare:sql=>new Statement(sql),batch:async ss=>{sqlite.exec('BEGIN');try{const result=[];for(const s of ss)result.push(/^\s*SELECT/.test(s.sql)?await s.all():await s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const objects=new Map(),MEDIA={async put(key,value,options){const data=new Uint8Array(await new Response(value).arrayBuffer());const object={size:data.length,httpEtag:'"'+data.length+'"',data,options};objects.set(key,object);return object;},async head(key){return objects.get(key)||null;},async get(key,options){const obj=objects.get(key);if(!obj)return null;const range=options?.range,bytes=range?obj.data.slice(range.offset,range.offset+range.length):obj.data;return {...obj,body:new Blob([bytes]).stream(),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};},async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key);}};
 const env={DB,MEDIA,GROUP_CODE:'test-only-group-code',SESSION_SECRET:'test-only-session-secret',ADMIN_KEY:'test-only-admin-key',ALLOWED_ORIGINS:'https://3180678503-byte.github.io'};
 return {sqlite,env,objects};
}

export async function checks(){
 const {sqlite,env,objects}=fixture(),member=catalog.members[0].key,other=catalog.members[1].key;
 const fetch=async(path,{method='GET',json,headers={},body}={})=>Worker.fetch(new Request('https://moments.test'+path,{method,headers:{Origin:env.ALLOWED_ORIGINS,...(json!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:json!==undefined?JSON.stringify(json):body}),env);
 const login=await fetch('/session',{method:'POST',json:{playerKey:member,code:env.GROUP_CODE}});assert.equal(login.status,200);const session=await login.json(),auth={Authorization:'Bearer '+session.token};
 assert.equal((await readSession(session.token,env.SESSION_SECRET)).playerKey,member);
 await assert.rejects(readSession(session.token+'x',env.SESSION_SECRET));
 const expired=await signSession({playerKey:member,exp:Date.now()-1},env.SESSION_SECRET);await assert.rejects(readSession(expired,env.SESSION_SECRET));
 assert.equal((await fetch('/session',{method:'POST',json:{playerKey:member,code:'wrong'}})).status,401);
 const valid={title:'很久以前的一波配合',description:'忘记是哪场比赛了',category:'teamwork',players:[member,other],matchKey:null,occurredOn:null,hero:'',size:32,duration:1,mime:'video/mp4'};
 assert.equal(validateMoment(valid,catalog).matchKey,null);assert.equal(validateMoment({...valid,occurredOn:''},catalog).occurredOn,null);
 for(const bad of [{players:[]},{players:['unknown']},{size:LIMITS.fileBytes+1},{duration:181},{occurredOn:'2026-02-30'},{matchKey:'UNKNOWN:1'}])assert.throws(()=>validateMoment({...valid,...bad},catalog));
 assert.equal((await fetch('/moments',{method:'POST',json:valid})).status,401);
 const reserve=await fetch('/moments',{method:'POST',headers:auth,json:valid});assert.equal(reserve.status,201);const ticket=await reserve.json();
 const invalid=new Uint8Array(32);let r=await fetch('/moments/'+ticket.id+'/upload',{method:'PUT',headers:{'X-Upload-Token':ticket.uploadToken,'Content-Type':'video/mp4','Content-Length':'32'},body:invalid});assert.equal(r.status,400);assert.equal(objects.size,0);
 const video=new Uint8Array(32);video.set([0,0,0,32,102,116,121,112,105,115,111,109]);
 assert.equal((await fetch('/moments/'+ticket.id+'/upload',{method:'PUT',headers:{'X-Upload-Token':'wrong','Content-Type':'video/mp4','Content-Length':'32'},body:video})).status,403);
 r=await fetch('/moments/'+ticket.id+'/upload',{method:'PUT',headers:{'X-Upload-Token':ticket.uploadToken,'Content-Type':'video/mp4','Content-Length':'32'},body:video});assert.equal(r.status,201);
 for(const key of [member,other]){const list=await (await fetch('/moments?player='+encodeURIComponent(key))).json();assert.equal(list.total,1);assert.deepEqual(new Set(list.items[0].players),new Set([member,other]));assert.equal(list.items[0].matchKey,null);assert.equal(list.items[0].occurredOn,null);}
 assert.equal(objects.size,1,'multi-ID clips store one file');
 r=await fetch('/moments/'+ticket.id+'/video',{headers:{Range:'bytes=4-7'}});assert.equal(r.status,206);assert.equal(r.headers.get('Content-Range'),'bytes 4-7/32');assert.equal(await r.text(),'ftyp');
 assert.equal((await fetch('/moments/'+ticket.id+'/video',{headers:{Range:'bytes=99-100'}})).status,416);
 assert.deepEqual(parseRange('bytes=-4',32),{offset:28,length:4});assert.throws(()=>parseRange('bytes=2-1',32));
 const jpeg=new Uint8Array([255,216,255,217]);assert.equal((await fetch('/moments/'+ticket.id+'/poster',{method:'PUT',headers:{'X-Owner-Token':ticket.ownerToken,'Content-Type':'image/jpeg','Content-Length':'4'},body:jpeg})).status,200);
 assert.equal(objects.size,2);
 const like=()=>fetch('/moments/'+ticket.id+'/likes',{method:'POST',headers:auth,json:{liked:true}});await like();await like();assert.equal((await (await fetch('/moments/'+ticket.id)).json()).likes.length,1);
 const comment={body:'<img src=x onerror=alert(1)>',requestId:crypto.randomUUID()};for(let n=0;n<2;n++)assert.equal((await fetch('/moments/'+ticket.id+'/comments',{method:'POST',headers:auth,json:comment})).status,201);
 const comments=await (await fetch('/moments/'+ticket.id+'/comments')).json();assert.equal(comments.comments.length,1);assert.equal(comments.comments[0].body,comment.body);
 assert.equal((await fetch('/moments/'+ticket.id,{method:'DELETE',headers:{'X-Owner-Token':'wrong'}})).status,403);
 const invalidOrigin=await Worker.fetch(new Request('https://moments.test/moments',{headers:{Origin:'https://evil.invalid'}}),env);assert.equal(invalidOrigin.status,403);
 const before=await (await fetch('/usage')).json();assert.equal(before.published,1);assert.equal(before.allocatedBytes,32+LIMITS.posterBytes);
 // Simultaneous reservations use one atomic SQL statement for the total quota.
 sqlite.prepare('UPDATE moments SET size=? WHERE id=?').run(LIMITS.totalBytes-LIMITS.posterBytes-40,ticket.id);
 const tooFull=await fetch('/moments',{method:'POST',headers:auth,json:valid});assert.equal(tooFull.status,507);
 sqlite.prepare('UPDATE moments SET size=? WHERE id=?').run(LIMITS.totalBytes-2*LIMITS.posterBytes-32,ticket.id);
 const competing=await Promise.all([fetch('/moments',{method:'POST',headers:auth,json:valid}),fetch('/moments',{method:'POST',headers:auth,json:valid})]);assert.deepEqual(competing.map(r=>r.status).sort(),[201,507]);
 const held=await competing.find(r=>r.status===201).json();assert.equal((await fetch('/moments/'+held.id,{method:'DELETE',headers:{'X-Owner-Token':held.ownerToken}})).status,200);
 assert.equal((await fetch('/moments/'+ticket.id,{method:'DELETE',headers:{'X-Admin-Key':env.ADMIN_KEY}})).status,200);assert.equal(objects.size,0);
 assert.equal((await fetch('/moments/'+ticket.id+'/video')).status,404);assert.equal((await (await fetch('/usage')).json()).allocatedBytes,0);
 // A pending upload can be cancelled using its owner token.
 const pending=await (await fetch('/moments',{method:'POST',headers:auth,json:valid})).json();assert.equal((await fetch('/moments/'+pending.id,{method:'DELETE',headers:{'X-Owner-Token':pending.ownerToken}})).status,200);
 const expiredUpload=await (await fetch('/moments',{method:'POST',headers:auth,json:valid})).json();sqlite.prepare('UPDATE moments SET expires_at=? WHERE id=?').run(Date.now()-1,expiredUpload.id);await cleanup(env);assert.equal(sqlite.prepare('SELECT status FROM moments WHERE id=?').get(expiredUpload.id).status,'expired');
 assert.equal((await (await Worker.fetch(new Request('https://moments.test/health'),{...env,MEDIA:undefined})).json()).storageReady,false);
 const boundary=Date.parse('2026-10-15T00:00:00+08:00');assert.equal(dayStart(boundary),boundary);assert.equal(dayStart(boundary-1),boundary-86400000);
 const five=await Promise.all(Array.from({length:5},()=>fetch('/moments',{method:'POST',headers:auth,json:valid})));assert(five.every(r=>r.status===201));assert.equal((await fetch('/moments',{method:'POST',headers:auth,json:valid})).status,429);
 assert.equal((await fetch('/session',{method:'POST',json:{data:'x'.repeat(20000)}})).status,413);
 sqlite.close();return {oldClipsWithoutMatch:true,multiplePlayersOneFile:true,unicodeIdentity:true,signedSession:true,streamUpload:true,MP4Validation:true,rangePlayback:true,poster:true,likes:true,idempotentComments:true,ownerAndAdminDeletion:true,quota:true,concurrentQuota:true,dailyLimit:true,boundedInput:true,cancelAndCleanup:true,cors:true};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await checks()));
