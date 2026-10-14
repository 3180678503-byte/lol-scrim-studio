const fs=require('node:fs'),path=require('node:path'),C=require('../report-core.js');
const root=path.resolve(__dirname,'..'),now=Date.now(),outputs=[];
for(const folder of ['friends','flex']){
 const site=path.join(root,folder),data=JSON.parse(fs.readFileSync(path.join(site,'data.json'),'utf8')),out=path.join(site,'reports');fs.mkdirSync(out,{recursive:true});const index={schemaVersion:1,dataset:data.datasetType,generatedAt:new Date(now).toISOString(),timeZone:'Asia/Shanghai',cutoffHour:4,weekStart:'Monday',daily:[],weekly:[]};
 for(const kind of ['daily','weekly']){
  const list=C.periods(data.matches,kind);fs.mkdirSync(path.join(out,kind),{recursive:true});
  for(const period of list){const p=C.payload(C.model(data,data.matches,{kind,period,now}));fs.writeFileSync(path.join(out,kind,period+'.txt'),p.text+'\n');fs.writeFileSync(path.join(out,kind,period+'.json'),JSON.stringify(p));index[kind].push({period:p.period,start:p.start,end:p.end,complete:p.complete,matches:p.matches,txt:kind+'/'+period+'.txt',json:kind+'/'+period+'.json'});}
  const latest=index[kind].find(p=>p.complete)||index[kind][0],current=C.payload(C.model(data,data.matches,{kind,period:C.dayKey(now),now}));
  for(const ext of ['txt','json']){
   if(latest)fs.copyFileSync(path.join(out,kind,latest.period+'.'+ext),path.join(out,'latest-'+kind+'.'+ext));
   fs.writeFileSync(path.join(out,'current-'+kind+'.'+ext),ext==='txt'?current.text+'\n':JSON.stringify(current));
  }
  index['latest'+(kind==='daily'?'Daily':'Weekly')]=latest?.period||null;
 }
 fs.writeFileSync(path.join(out,'index.json'),JSON.stringify(index));outputs.push({folder,daily:index.daily.length,weekly:index.weekly.length,latestDaily:index.latestDaily,latestWeekly:index.latestWeekly});
}
console.log(JSON.stringify({reports:outputs}));
