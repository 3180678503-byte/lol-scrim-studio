const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),root=path.resolve(__dirname,'..');
let failDetails=true,failStartup=false,detailRequests=0;
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname.includes('/matches/')){detailRequests++;if(failDetails){res.writeHead(503);res.end();return;}}
 if(failStartup&&pathname==='/friends/overview-data.js'){res.writeHead(503);res.end();return;}
 const file=path.resolve(root,'.'+decodeURIComponent(pathname)+(pathname.endsWith('/')?'index.html':''));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
(async()=>{
 const startup=fs.readFileSync(path.join(root,'friends/overview-data.js')),gzip=zlib.gzipSync(startup).length;assert(gzip<2500000);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
  const page=await browser.newPage();await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
  await page.goto(base+'/friends/#overview');assert.equal(detailRequests,0);assert(await page.evaluate(()=>window.SCRIM_READY));
  const before=await page.evaluate(()=>window.SCRIM_DATA.matches.at(-1).players.map(p=>p.score));
  await page.click('[data-view="lab"]');await page.waitForSelector('[data-retry-details]');assert.equal(await page.evaluate(()=>window.SCRIM_DATA.matches.at(-1)._detailLoaded===true),false);
  failDetails=false;await page.click('[data-retry-details]');await page.waitForFunction(()=>window.SCRIM_DATA.matches.at(-1)._detailLoaded);
  const after=await page.evaluate(()=>({scores:window.SCRIM_DATA.matches.at(-1).players.map(p=>p.score),metrics:window.SCRIM_DATA.matches.at(-1).players[0].performance.axes[0].metrics.length,events:window.SCRIM_DATA.matches.at(-1).reviewTimeline.events.length}));
  assert.deepEqual(after.scores,before);assert(after.metrics>0);assert(after.events>0);
  await page.goto(base+'/friends/#review');await page.waitForFunction(()=>window.SCRIM_DATA.matches.at(-1)._detailLoaded);assert(await page.locator('.summary-chart').count()>0);
  const fresh=await browser.newPage();await fresh.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
  failStartup=true;await fresh.goto(base+'/friends/#overview');await fresh.waitForSelector('#retry-startup');assert.match(await fresh.locator('#content').innerText(),/战绩加载暂未完成/);
  failStartup=false;await fresh.click('#retry-startup');await fresh.waitForFunction(()=>window.SCRIM_READY);
  console.log(JSON.stringify({startupBytes:startup.length,startupGzipBytes:gzip,noDetailsOnStartup:true,detailsOnDemand:true,scoresUnchanged:true,detailRetry:true,startupRetry:true}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
