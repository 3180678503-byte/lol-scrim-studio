(function(){
'use strict';
const requests=new Map();
function changed(){window.dispatchEvent(new Event('scrim-details-ready'));}
function ensure(data,m,force=false){
 if(!m?.detailUrl||m._detailLoaded)return Promise.resolve(true);
 const url=new URL(m.detailUrl,location.href).href;
 if(!force&&requests.has(url))return requests.get(url);
 m._detailError=false;
 const task=(async()=>{
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),20000);
  try{
   const response=await fetch(url,{signal:abort.signal,cache:force?'reload':'default'});
   if(!response.ok)throw new Error('Match details unavailable');
   const body=await response.json(),full=body.match;
   if(body.schemaVersion!==1||full?.matchKey!==m.matchKey)throw new Error('Invalid match details');
   if(data.scoring?.baselineVersion&&full.players.some(p=>p.performance?.baselineVersion!==data.scoring.baselineVersion))throw new Error('Match version changed');
   Object.assign(m,full);m._detailLoaded=true;m._detailError=false;changed();return true;
  }catch{m._detailError=true;changed();return false;}finally{clearTimeout(timer);}
 })();requests.set(url,task);return task;
}
function notice(data,m){
 if(!m?.detailUrl||m._detailLoaded)return '';
 return m._detailError?`<p class="notice">本场详细数据暂未加载，基础战绩和评分仍可查看。<button type="button" data-retry-details="${m.number}">重试加载</button></p>`:'<p class="notice">正在加载本场事件与评分明细…基础战绩和评分已就绪。</p>';
}
document.addEventListener('click',e=>{const button=e.target.closest('[data-retry-details]');if(!button)return;const data=window.SCRIM_DATA,m=data?.matches.find(m=>m.number===Number(button.dataset.retryDetails));if(m){ensure(data,m,true);changed();}});
window.MATCH_DATA={ensure,notice};
})();
