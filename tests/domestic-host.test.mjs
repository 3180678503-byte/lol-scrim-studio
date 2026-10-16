import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createHost} from '../server/serve.mjs';
import catalog from '../backend/manifest.json' with {type:'json'};
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'studio-host-')),publicDir=path.join(directory,'public'),dataDir=path.join(directory,'data');fs.mkdirSync(publicDir);fs.writeFileSync(path.join(publicDir,'index.html'),'<h1>Studio</h1>');
const secrets={GROUP_CODE:'test-only-group',SESSION_SECRET:'test-only-session',ADMIN_KEY:'test-only-admin',ARCHIVE_KEY:'test-only-archive'};
const host=createHost({dataDir,publicDir,secrets,origin:'https://studio.test'});host.server.listen(0,'127.0.0.1');await once(host.server,'listening');const base='http://127.0.0.1:'+host.server.address().port;
const call=(url,{json,headers,...options}={})=>fetch(base+url,{...options,headers:{Origin:'https://studio.test',...(json?{'Content-Type':'application/json'}:{}),...headers},...(json?{body:JSON.stringify(json)}:{})});
try{
 assert.equal((await call('/')).status,200);assert.equal((await call('/.env')).status,404);assert.equal((await call('/backend/moments.deploy.jsonc')).status,404);assert.equal((await call('/%2e%2e%2f.env')).status,404);
 assert((await(await call('/moments-config.js')).text()).includes("apiBase:'/api/moments'"));assert.equal((await call('/api/community/health')).status,200);
 const session=await(await call('/api/moments/session',{method:'POST',json:{playerKey:catalog.members[0].key,code:secrets.GROUP_CODE}})).json(),auth={Authorization:'Bearer '+session.token};
 const ticket=await(await call('/api/moments/moments',{method:'POST',headers:auth,json:{title:'国内迁移验证',description:'',category:'funny',players:[catalog.members[0].key],hero:'芮尔',size:32,duration:1,mime:'video/mp4',archiveRequested:true,archiveConsent:'bilibili-public-v1'}})).json();assert(ticket.id);
 const bytes=new Uint8Array(32);bytes.set([0,0,0,32,102,116,121,112]);assert.equal((await call('/api/moments/moments/'+ticket.id+'/upload',{method:'PUT',headers:{'X-Upload-Token':ticket.uploadToken,'Content-Type':'video/mp4','Content-Length':'32'},body:bytes})).status,201);
 const ranged=await call('/api/moments/moments/'+ticket.id+'/video',{headers:{Range:'bytes=0-7'}});assert.equal(ranged.status,206);assert.equal((await ranged.arrayBuffer()).byteLength,8);
 const directorySnapshot=await(await call('/moments/catalog.json')).json();assert.equal(directorySnapshot.items[0].id,ticket.id);assert(!JSON.stringify(directorySnapshot).includes('owner_hash'));assert(!Object.hasOwn(directorySnapshot.items[0],'likes'));assert(!Object.hasOwn(directorySnapshot.items[0],'commentCount'));
 assert.equal((await call('/api/moments/moments/'+ticket.id+'/poster',{method:'PUT',headers:{'X-Owner-Token':ticket.ownerToken,'Content-Type':'image/jpeg'},body:Uint8Array.from([255,216,255,217])})).status,200);
 assert.equal((await call('/moments/covers/'+ticket.id+'.jpg')).status,200);
 assert.equal((await call('/api/moments/archive/claim',{method:'POST',json:{}})).status,403);const claim=await(await call('/api/moments/archive/claim',{method:'POST',headers:{'X-Archive-Key':secrets.ARCHIVE_KEY},json:{}})).json();assert.equal(claim.job.hero,'芮尔');
 const game=Object.keys(catalog.matches)[0],target={kind:'match',matchKey:game,playerKey:catalog.members[catalog.matches[game][0]].key};
 const review=await call('/api/community/entries',{method:'POST',json:{target,raterKey:catalog.members[0].key,stars:5,comment:'迁移验证',requestId:'domestic_test_12345678'}});assert.equal(review.status,201);assert.equal((await review.json()).mean,5);assert.equal(host.database.prepare('SELECT COUNT(*) AS n FROM votes').get().n,1);
 assert.equal(fs.statSync(path.join(dataDir,'media/videos',ticket.id+'.mp4')).size,32);assert.equal(host.database.prepare('SELECT COUNT(*) AS n FROM moment_archives').get().n,1);
 console.log(JSON.stringify({sameOriginAPIs:true,privateFilesHidden:true,sqlitePersistence:true,uploadAndRange:true,queueAndMetadata:true,communityPreserved:true}));
}finally{host.server.closeAllConnections();await new Promise(resolve=>host.server.close(resolve));host.database.close();fs.rmSync(directory,{recursive:true,force:true});}
