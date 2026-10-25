const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'backend/manifest.json'),'utf8'));
const entries=Object.entries(manifest.matchMeta).sort((a,b)=>a[1].createdAt.localeCompare(b[1].createdAt));
const [oldKey,oldMatch]=entries[0],[latestKey,latestMatch]=entries.at(-1),extraKey='HN1:9876543210';
const stale={schemaVersion:1,members:manifest.members,matches:{[oldKey]:oldMatch},items:[]};
let requests=0,fail=false;
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/moments/catalog.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(stale));return;}
 if(pathname==='/backend/manifest.json'){
  requests++;if(fail){res.writeHead(503);res.end();return;}
  const data=structuredClone(manifest);if(requests>1)data.matchMeta[extraKey]={...latestMatch,label:'刷新后新增比赛'};
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return;
 }
 const file=path.resolve(root,'.'+decodeURIComponent(pathname)+(pathname.endsWith('/')?'index.html':''));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(session=>localStorage.setItem('scrim-moments-session-v1',JSON.stringify(session)),{playerKey:manifest.members[0].key,expiresAt:Date.now()+3600000,token:'local-browser-test'});
  await page.goto('http://127.0.0.1:'+server.address().port+'/moments/');
  const select=page.locator('#upload-match');
  await page.waitForFunction(key=>[...document.querySelector('#upload-match').options].some(o=>o.value===key),latestKey);
  assert.equal(await select.locator('option').count(),entries.length+1);
  await select.selectOption(latestKey,{force:true});
  await page.locator('#open-upload').click();
  await page.waitForFunction(key=>[...document.querySelector('#upload-match').options].some(o=>o.value===key),extraKey);
  assert.equal(await select.inputValue(),latestKey);
  assert.equal(await page.locator('#upload-dialog').evaluate(d=>d.open),true);
  await select.selectOption('',{force:true});await page.keyboard.press('Escape');fail=true;
  await page.locator('#open-upload').click();
  await page.waitForFunction(()=>!document.querySelector('#toast').hidden&&document.querySelector('#toast').textContent.includes('无法刷新'));
  assert.equal(await select.inputValue(),'');
  assert.equal(await select.locator('option').count(),entries.length+2);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({staleVideoSnapshotIgnored:true,latestMatchVisible:latestMatch.createdAt,refreshOnOpen:true,selectionPreserved:true,optionalMatch:true,networkFailureKeepsOptions:true}));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
