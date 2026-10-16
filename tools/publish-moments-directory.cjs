// Publish generated public metadata only. GitHub credentials stay in memory.
const {spawnSync}=require('node:child_process'),path=require('node:path');
const cwd=path.resolve(__dirname,'..'),gh=process.argv[2]||'gh',allowed=p=>p==='moments/catalog.json'||/^moments\/covers\/[a-f0-9-]{36}\.jpg$/.test(p);
function git(args,env=process.env){const r=spawnSync('git',args,{cwd,env,encoding:'utf8',windowsHide:true,timeout:60000});if(r.status!==0)throw Error('Git operation failed');return r.stdout.trimEnd();}
try{
 if(git(['branch','--show-current'])!=='main')throw Error('Directory publisher requires main');
 const dirty=git(['status','--porcelain','-z']).split('\0').filter(Boolean).map(s=>s.slice(3));
 // Git may summarize a new directory. Enumerate new files to check each path.
 const newFiles=git(['ls-files','--others','--exclude-standard','-z']).split('\0').filter(Boolean);
 if(dirty.some(p=>p!=='moments/covers/'&&!allowed(p))||newFiles.some(p=>!allowed(p)))throw Error('Other changes are pending; directory publication deferred');
 if(dirty.length){git(['add','--all','--','moments/catalog.json','moments/covers']);if(git(['diff','--cached','--name-only']).split('\n').filter(Boolean).some(p=>!allowed(p)))throw Error('Unrelated staged files');if(git(['diff','--cached','--name-only']))git(['commit','-m','Update public Bilibili video directory']);}
 if(git(['rev-list','--count','origin/main..HEAD'])==='0'){console.log('Directory unchanged');process.exit(0);}
 if(git(['diff','--name-only','origin/main..HEAD']).split('\n').filter(Boolean).some(p=>!allowed(p)))throw Error('Only generated directory commits may be pushed automatically');
 const login=spawnSync(gh,['auth','token','--hostname','github.com'],{encoding:'utf8',windowsHide:true});if(login.status!==0)throw Error('GitHub login required');
 const token=login.stdout.trim(),remote='https://github.com/3180678503-byte/lol-scrim-studio.git',env={...process.env,STUDIO_GIT_AUTH:'AUTHORIZATION: basic '+Buffer.from('x-access-token:'+token).toString('base64'),GIT_TERMINAL_PROMPT:'0'};
 git(['-c','credential.helper=','--config-env=http.'+remote+'.extraHeader=STUDIO_GIT_AUTH','push','origin','main'],env);console.log('Public directory published');
}catch(e){console.error(e.message);process.exitCode=2;}
