(function(){
 const content=document.getElementById('content');
 function failed(){if(content&&!window.SCRIM_READY)content.innerHTML='<section class="notice">战绩加载暂未完成，请检查网络后刷新重试。<button type="button" id="retry-startup">重新加载</button></section>';}
 window.addEventListener('error',e=>{if(e.target?.tagName==='SCRIPT')failed();},true);
 setTimeout(()=>{if(!window.SCRIM_READY)failed();},15000);
 document.addEventListener('click',e=>{if(e.target.id==='retry-startup')location.reload();});
})();
