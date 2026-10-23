import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {database,fixture} from './predictions.test.mjs';
import {storeEvents} from '../backend/predictions.mjs';
import Worker from '../backend/worker.mjs';
import manifest from '../backend/manifest.json' with {type:'json'};
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),{DB,sqlite}=database(),now=Date.now();
let events=[fixture('111111111111',1,now+3600000),fixture('222222222222',3,now+3600000),fixture('333333333333',5,now+3600000)];
await storeEvents(DB,events,now);
let base;
const server=http.createServer(async(req,res)=>{try{
 if(req.url.startsWith('/api/')){
  const body=[];for await(const c of req)body.push(c);
  const result=await Worker.fetch(new Request(base+req.url.replace('/api',''),{method:req.method,headers:req.headers,...(body.length?{body:Buffer.concat(body)}:{})}),{DB,ALLOWED_ORIGINS:base});
  res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());return;
 }
 const url=new URL(req.url,base);
 if(url.pathname==='/community-config.js'){res.setHeader('Content-Type','text/javascript');res.end(`window.COMMUNITY_CONFIG={apiBase:${JSON.stringify(base+'/api')},identityStorageKey:'scrim-community-id-v1'};`);return;}
 const rel=decodeURIComponent(url.pathname).replace(/^\//,'')+(url.pathname.endsWith('/')?'index.html':'');
 const full=path.resolve(root,rel);if(!full.startsWith(root)||!fs.existsSync(full)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(full)]||'application/octet-stream')+';charset=utf-8');res.end(fs.readFileSync(full));
}catch(e){res.writeHead(500);res.end(e.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.EDGE_PATH?{executablePath:process.env.EDGE_PATH}:{})});
const errors=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/predictions/');await page.waitForSelector('.prediction-match');assert.equal(await page.locator('.prediction-match').count(),3);
 await page.selectOption('#identity',manifest.members[0].key);await page.waitForFunction(()=>!document.querySelector('#refresh').disabled);
 const bo1=page.locator('[data-event="111111111111"]');await bo1.locator('[data-winner="100"]').click();await bo1.locator('.submit-pick').click();await page.waitForFunction(()=>document.querySelector('#feedback').textContent.includes('已保存'));await bo1.locator('.mine-pick').waitFor();
 assert.match(await bo1.locator('.mine-pick').textContent(),/AAA 1:0/);
 await bo1.locator('[data-winner="200"]').click();await bo1.locator('.submit-pick').click();await page.waitForFunction(()=>document.querySelector('[data-event="111111111111"] .mine-pick')?.textContent.includes('BBB 1:0'));
 const bo3=page.locator('[data-event="222222222222"]');await bo3.locator('[data-winner="100"]').click();await bo3.locator('select').selectOption('1');await bo3.locator('.submit-pick').click();await page.waitForFunction(()=>document.querySelector('[data-event="222222222222"] .mine-pick')?.textContent.includes('2:1'));
 const ctx2=await browser.newContext({viewport:{width:390,height:844}}),p2=await ctx2.newPage();p2.on('pageerror',e=>errors.push(e.message));await p2.goto(base+'/predictions/');await p2.waitForSelector('.prediction-match');await p2.selectOption('#identity',manifest.members[1].key);await p2.waitForFunction(()=>!document.querySelector('#refresh').disabled);
 assert.equal(await p2.locator('.mine-pick').count(),0);assert.equal(await p2.locator('.ballots').count(),0);
 const other=p2.locator('[data-event="222222222222"]');await other.locator('[data-winner="200"]').click();await other.locator('select').selectOption('0');await other.locator('.submit-pick').click();await p2.waitForFunction(()=>document.querySelector('[data-event="222222222222"] .mine-pick')?.textContent.includes('BBB 2:0'));
 assert(await p2.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile must not overflow');
 // Real endpoint and real SQLite settle the simulated games; no production votes are created.
 events=events.map(e=>({...e,state:'completed',winnerId:'100',loserWins:e.bestOf===3?1:0,teams:e.teams.map(t=>({...t,wins:t.id==='100'?Math.floor(e.bestOf/2)+1:e.bestOf===3?1:0,outcome:t.id==='100'?'win':'loss'}))}));await storeEvents(DB,events,Date.now());
 await page.click('#refresh');await page.waitForSelector('.ballots');assert.equal(await page.locator('.submit-pick').count(),0);
 await page.locator('[data-tab="board"]').click();await page.waitForSelector('.prediction-board');const row=await page.locator('.prediction-board tbody tr').first().textContent();assert.match(row,new RegExp(manifest.members[0].name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 assert.equal(await page.locator('.prediction-board tbody tr').count(),2);
 await page.locator('[data-tab="mine"]').click();assert.equal(await page.locator('.prediction-match').count(),2);
 await page.reload();await page.waitForSelector('.prediction-match');assert.equal(await page.locator('#identity').inputValue(),manifest.members[0].key,'identity and editing key survive reload');
 // Capture a clean preview with actual official fixtures after removing all local test ballots.
 const livePath=path.resolve(root,'../../outputs/predictions/live-official-events.json');
 if(fs.existsSync(livePath)){sqlite.exec('DELETE FROM predictions;DELETE FROM prediction_events;DELETE FROM prediction_sync;');await storeEvents(DB,JSON.parse(fs.readFileSync(livePath,'utf8')));await page.goto(base+'/predictions/');await page.waitForSelector('.prediction-match');await page.screenshot({path:path.resolve(root,'../../outputs/predictions/desktop.png'),fullPage:true});await p2.goto(base+'/predictions/');await p2.waitForSelector('.prediction-match');await p2.screenshot({path:path.resolve(root,'../../outputs/predictions/mobile.png'),fullPage:true});assert(await p2.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 assert.deepEqual(errors,[]);console.log('PASS browser: desktop/mobile, ID selection, BO1/BO3 voting, editing, two browsers, private ballots, persistence, result settlement, leaderboard, filters, no horizontal overflow or JS errors');
}finally{await browser.close();server.close();sqlite.close();}
