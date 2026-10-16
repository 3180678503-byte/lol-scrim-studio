// Portable host for the existing APIs. All persistent data stays in DATA_DIR.
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import Moments from '../backend/moments-worker.mjs';
import Community from '../backend/worker.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function directoryFor(env){
 const request=url=>Moments.fetch(new Request('https://api.local'+url),env).then(r=>r.json()),catalog=await request('/catalog'),items=[];let offset=0;
 do{const page=await request('/moments?offset='+offset);for(const m of page.items){const item=Object.fromEntries(['id','uploaderKey','title','description','category','players','matchKey','occurredOn','hero','duration','createdAt'].map(k=>[k,m[k]]));item.archive={state:m.archive?.state||'queued',bvid:m.archive?.state==='ready'?m.archive.bvid:null};item.posterPath=m.hasPoster?'covers/'+m.id+'.jpg':null;items.push(item);}offset=page.nextOffset;}while(offset!==null);
 return {schemaVersion:1,members:catalog.members,matches:catalog.matches,items};
}
export function sqliteBinding(db){
 const prepare=sql=>{let params=[];return {bind(...args){params=args;return this;},first(){return db.prepare(sql).get(...params)||null;},all(){return {results:db.prepare(sql).all(...params)};},run(){return {meta:{changes:Number(db.prepare(sql).run(...params).changes)}};},sql};};
 return {prepare,batch(statements){db.exec('BEGIN');try{const result=statements.map(s=>/^\s*(SELECT|WITH|PRAGMA)\b/i.test(s.sql)?s.all():s.run());db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}};
}
export class FileMedia {
 constructor(directory){this.directory=path.resolve(directory);}
 file(key){if(!/^(videos|posters)\/[a-f0-9-]{36}\.(mp4|jpg)$/.test(key))throw Error('Invalid media key');return path.join(this.directory,key);}
 async head(key){try{const s=await fsp.stat(this.file(key));return {size:s.size,httpEtag:'"'+s.size+'-'+Math.trunc(s.mtimeMs)+'"'};}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 async get(key,options){const info=await this.head(key);if(!info)return null;const filename=this.file(key),r=options?.range,start=r?.offset||0,end=r?Math.min(info.size-1,start+r.length-1):info.size-1;
  const stream=()=>Readable.toWeb(fs.createReadStream(filename,{start,end}));return {...info,body:stream(),arrayBuffer:async()=>{const data=await new Response(stream()).arrayBuffer();return data;}};
 }
 async put(key,body){const filename=this.file(key),temporary=filename+'.'+crypto.randomUUID()+'.tmp',limit=key.startsWith('posters/')?120000:100000000;let bytes=0;await fsp.mkdir(path.dirname(filename),{recursive:true});
  try{await pipeline(Readable.fromWeb(body),new Transform({transform(chunk,encoding,done){bytes+=chunk.length;done(bytes>limit?Error('Media too large'):null,chunk);}}),fs.createWriteStream(temporary,{flags:'wx'}));await fsp.rename(temporary,filename);return this.head(key);}finally{await fsp.rm(temporary,{force:true});}
 }
 async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])await fsp.rm(this.file(key),{force:true});}
}
const types={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.mjs':'text/javascript;charset=utf-8','.json':'application/json;charset=utf-8','.css':'text/css;charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.txt':'text/plain;charset=utf-8','.csv':'text/csv;charset=utf-8'};
export function createHost(options={}){
 const data=path.resolve(options.dataDir||process.env.DATA_DIR||path.join(root,'private-data')),publicRoot=path.resolve(options.publicDir||process.env.PUBLIC_DIR||path.join(root,'public'));
 fs.mkdirSync(data,{recursive:true});const databaseFile=path.join(data,'studio.sqlite'),fresh=!fs.existsSync(databaseFile),database=new DatabaseSync(databaseFile);
 if(fresh&&options.importSql)database.exec(fs.readFileSync(options.importSql,'utf8'));
 database.exec(fs.readFileSync(path.join(root,'backend/schema.sql'),'utf8'));database.exec(fs.readFileSync(path.join(root,'backend/moments-schema.sql'),'utf8'));database.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
 const secrets=options.secrets||process.env,origin=options.origin||process.env.SITE_ORIGIN||'http://localhost:8080';
 for(const key of ['GROUP_CODE','SESSION_SECRET','ADMIN_KEY','ARCHIVE_KEY'])if(!secrets[key]){database.close();throw Error('Missing required configuration: '+key);}
 const env={DB:sqliteBinding(database),MEDIA:new FileMedia(path.join(data,'media')),ALLOWED_ORIGINS:origin,...Object.fromEntries(['GROUP_CODE','SESSION_SECRET','ADMIN_KEY','ARCHIVE_KEY'].map(k=>[k,secrets[k]]))};
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost'),route=url.pathname;
   const api=route==='/api/moments'||route.startsWith('/api/moments/')?['/api/moments',Moments]:route==='/api/community'||route.startsWith('/api/community/')?['/api/community',Community]:null;
   if(api){
    if(Number(req.headers['content-length']||0)>100000000){res.writeHead(413);res.end();return;}
    const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):v);
    // Ignore a caller-supplied CF header; use the actual connection address.
    headers.set('CF-Connecting-IP',req.socket.remoteAddress||'local');
    const body=!['GET','HEAD'].includes(req.method)?Readable.toWeb(req):undefined;
    const request=new Request('https://api.local'+(route.slice(api[0].length)||'/')+url.search,{method:req.method,headers,body,...(body?{duplex:'half'}:{})});
    const response=await api[1].fetch(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body&&req.method!=='HEAD')await pipeline(Readable.fromWeb(response.body),res);else res.end();return;
   }
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
   if(route==='/moments/catalog.json'){const body=JSON.stringify(await directoryFor(env));res.writeHead(200,{'Content-Type':types['.json'],'Cache-Control':'no-store'});res.end(req.method==='HEAD'?'':body);return;}
   const cover=/^\/moments\/covers\/([a-f0-9-]{36})\.jpg$/.exec(route);
   if(cover){const response=await Moments.fetch(new Request('https://api.local/moments/'+cover[1]+'/poster',{method:req.method}),env);res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body&&req.method!=='HEAD')await pipeline(Readable.fromWeb(response.body),res);else res.end();return;}
   const config=route==='/moments-config.js'?"window.MOMENTS_CONFIG={apiBase:'/api/moments',directoryCatalog:'catalog.json'};":route==='/community-config.js'?"window.COMMUNITY_CONFIG={apiBase:'/api/community',identityStorageKey:'scrim-community-id-v1'};":null;
   if(config!==null){res.writeHead(200,{'Content-Type':types['.js'],'Cache-Control':'no-store'});res.end(req.method==='HEAD'?'':config);return;}
   let relative=decodeURIComponent(route);if(relative.split(/[\\/]/).some(part=>part.startsWith('.'))||relative.includes('\\')||/^\/(backend|server|tools|tests|private-data)(\/|$)/.test(relative)){res.writeHead(404);res.end();return;}
   if(relative.endsWith('/'))relative+='index.html';const file=path.resolve(publicRoot,'.'+relative),extension=path.extname(file).toLowerCase();
   if(!file.startsWith(publicRoot+path.sep)||!types[extension]){res.writeHead(404);res.end();return;}
   const stat=await fsp.stat(file).catch(()=>null);if(!stat?.isFile()){res.writeHead(404);res.end();return;}
   res.writeHead(200,{'Content-Type':types[extension],'Content-Length':stat.size,'X-Content-Type-Options':'nosniff','Cache-Control':['.html','.json','.js'].includes(extension)?'no-cache':'public,max-age=86400'});if(req.method==='HEAD')res.end();else await pipeline(fs.createReadStream(file),res);
  }catch{if(!res.headersSent)res.writeHead(503,{'Content-Type':'application/json;charset=utf-8'});res.end('{"error":"服务暂时无法处理请求，请稍后重试"}');}
 });
 const cleanupTimer=setInterval(()=>Moments.scheduled({},env).catch(()=>{}),3600000);cleanupTimer.unref();server.once('close',()=>clearInterval(cleanupTimer));
 return {server,database,env};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {server,database}=createHost({importSql:process.env.IMPORT_SQL});server.listen(Number(process.env.PORT||8080),process.env.BIND||'127.0.0.1',()=>console.log('Studio host ready'));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{database.close();process.exit(0);}));
}
