const fs=require('node:fs'),path=require('node:path'),C=require('../report-core.js');
const root=path.resolve(__dirname,'..'),now=Date.now(),outputs=[];
for(const folder of ['friends','flex']){
 const site=path.join(root,folder),data=JSON.parse(fs.readFileSync(path.join(site,'data.json'),'utf8')),out=path.join(site,'reports');fs.mkdirSync(out,{recursive:true});const index={schemaVersion:2,contentMode:'data-only',dataset:data.datasetType,generatedAt:new Date(now).toISOString(),timeZone:'Asia/Shanghai',cutoffHour:4,weekStart:'Monday',botPrompt:'bot-prompt.txt',daily:[],weekly:[]};fs.writeFileSync(path.join(out,'bot-prompt.txt'),C.BOT_PROMPT+'\n');
 for(const kind of ['daily','weekly']){
  const list=C.periods(data.matches,kind);fs.mkdirSync(path.join(out,kind),{recursive:true});
  for(const period of list){const m=C.model(data,data.matches,{kind,period,now}),p=C.payload(m);fs.writeFileSync(path.join(out,kind,period+'.txt'),p.text+'\n');fs.writeFileSync(path.join(out,kind,period+'.json'),JSON.stringify(p));fs.writeFileSync(path.join(out,kind,period+'.bot.json'),JSON.stringify(C.botData(m)));index[kind].push({period:p.period,start:p.start,end:p.end,complete:p.complete,matches:p.matches,txt:kind+'/'+period+'.txt',json:kind+'/'+period+'.json',botJson:kind+'/'+period+'.bot.json'});}
  const latest=index[kind].find(p=>p.complete)||index[kind][0],current=C.payload(C.model(data,data.matches,{kind,period:C.dayKey(now),now}));
  for(const ext of ['txt','json','bot.json']){
   if(latest)fs.copyFileSync(path.join(out,kind,latest.period+'.'+ext),path.join(out,'latest-'+kind+'.'+ext));
   fs.writeFileSync(path.join(out,'current-'+kind+'.'+ext),ext==='txt'?current.text+'\n':JSON.stringify(ext==='bot.json'?C.botData(current):current));
  }
  index['latest'+(kind==='daily'?'Daily':'Weekly')]=latest?.period||null;
 }
 fs.writeFileSync(path.join(out,'index.json'),JSON.stringify(index));outputs.push({folder,daily:index.daily.length,weekly:index.weekly.length,latestDaily:index.latestDaily,latestWeekly:index.latestWeekly});
}
console.log(JSON.stringify({reports:outputs}));
