(() => {
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={queued:'等待同步 B站',processing:'正在转存 B站',submitting:'正在投稿',submitted:'B站审核 / 转码中',ready:'B站长期播放',failed:'转存稍后重试',manual:'投稿结果待群主核对'};
window.MOMENTS_ARCHIVE={
 setup(enabled){
  document.getElementById('archive-options').hidden=!enabled;
  document.getElementById('upload-archive').checked=!!enabled;
  this.updateConsent();
 },
 updateConsent(){
  const selected=document.getElementById('upload-archive').checked&&!document.getElementById('archive-options').hidden;
  document.getElementById('archive-consent-label').hidden=!selected;
  document.getElementById('archive-consent').required=selected;
 },
 fields(){
  const selected=document.getElementById('upload-archive').checked&&!document.getElementById('archive-options').hidden;
  if(selected&&!document.getElementById('archive-consent').checked)throw Error('请确认同意以群主 B站账号公开发布');
  return {archiveRequested:selected,archiveConsent:selected?'bilibili-public-v1':null};
 },
 badge(m){return m.archive?'<p class="archive-status">'+esc(labels[m.archive.state]||'等待转存')+'</p>':'';},
 player(m,original){
  const a=m.archive;if(a?.state!=='ready'||!/^BV[A-Za-z0-9]{10}$/.test(a.bvid||''))return original;
  return `<div class="archive-player"><iframe id="watch-bilibili" title="B站视频播放器" src="https://player.bilibili.com/player.html?bvid=${encodeURIComponent(a.bvid)}&autoplay=0&danmaku=0" allow="fullscreen; autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe><div class="archive-player-actions"><a href="https://www.bilibili.com/video/${a.bvid}/" target="_blank" rel="noopener noreferrer">在 B站打开 ↗</a>${a.sourceAvailable?'<button type="button" id="watch-original-toggle">切换本站原片播放</button>':''}</div>${a.sourceAvailable?'<div id="watch-original" hidden>'+original+'</div>':''}</div>`;
 },
 bindPlayer(){const b=document.getElementById('watch-original-toggle');if(b)b.onclick=()=>{const original=document.getElementById('watch-original'),frame=document.getElementById('watch-bilibili');original.hidden=!original.hidden;frame.hidden=!original.hidden;if(original.hidden)document.getElementById('watch-video')?.pause();b.textContent=original.hidden?'切换本站原片播放':'切换 B站播放';};},
 deletePrompt(m){return m.archive&&['submitting','submitted','ready','manual'].includes(m.archive.state)?'删除本站归档和评论？B站稿件需要群主在创作中心另行删除。':'删除这段视频及其评论？';}
};
document.getElementById('upload-archive').addEventListener('change',()=>window.MOMENTS_ARCHIVE.updateConsent());
document.getElementById('upload-form').addEventListener('reset',()=>setTimeout(()=>window.MOMENTS_ARCHIVE.updateConsent(),0));
})();
