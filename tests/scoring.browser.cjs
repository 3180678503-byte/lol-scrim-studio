const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+decodeURIComponent(pathname)+(pathname.endsWith('/')?'index.html':''));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
 try{
  for(const folder of ['','friends/','flex/']){
   for(const view of ['players','radar','lab','awards','methods','performance']){
    await page.goto(base+'/'+folder+'#'+view,{waitUntil:'load'});await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>window.SCORE_CORE.VERSION),'role-duty-v2.0');
    const body=await page.locator('body').innerText();assert(!body.includes('undefined'),'undefined in '+folder+view+' '+body.match(/.{0,60}undefined.{0,60}/g)?.join(' / ')+' errors:'+errors.join(';'));
    if(view==='radar'){assert.equal(await page.locator('.radar-svg .radar-axis').count(),5);}
   }
   const parity=await page.evaluate(()=>{const d=window.SCRIM_DATA,m=d.matches.find(m=>m.players.some(p=>Number.isFinite(p.score))),p=m.players.find(p=>Number.isFinite(p.score)),r=window.FRIEND_RADAR.model(d,[m],p.role,[p.key]).sides[0],v=window.REVIEW_CORE.calibrated(d,m,p);return {stored:p.score,radar:r.positionScore,review:v.score};});
   assert.equal(parity.stored,parity.radar);assert.equal(parity.stored,parity.review);
  }
  await page.goto(base+'/friends/#radar');await page.waitForTimeout(250);
  await page.selectOption('#friend-radar-mode','compare');await page.click('#friend-radar-swap');assert.equal(await page.locator('.radar-person').count(),2);
  const out=process.env.SCORE_SCREENSHOTS;if(out){fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'friends-desktop.png'),fullPage:true});}
  await page.setViewportSize({width:390,height:844});await page.reload();await page.waitForTimeout(250);if(out)await page.screenshot({path:path.join(out,'friends-mobile.png'),fullPage:true});
  assert.equal(errors.length,0,errors.join('\n'));console.log(JSON.stringify({pages:18,scoreParity:true,sameRoleComparison:true,swap:true,mobile:true,pageErrors:errors}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
