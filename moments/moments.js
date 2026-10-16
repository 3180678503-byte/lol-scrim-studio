(() => {
'use strict';
const $=id=>document.getElementById(id),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=(window.MOMENTS_CONFIG?.apiBase||'').replace(/\/$/,'');
const CATEGORIES={highlight:'神操作',funny:'下饭操作',teamwork:'默契配合',meme:'整活现场'},SESSION_KEY='scrim-moments-session-v1',OWNER_KEY='scrim-moments-owners-v1';
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))||fallback;}catch{return fallback;}},save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
let session=read(SESSION_KEY,null);if(session?.expiresAt<Date.now())session=null;
const owners=read(OWNER_KEY,{}),query=new URLSearchParams(location.search),state={members:window.COMMUNITY_MEMBERS||[],matches:{},storageReady:false,items:[],nextOffset:null,loading:false,uploading:false,filterPlayer:query.get('player')||'',category:query.get('category')||'',search:query.get('search')||'',sort:query.get('sort')==='old'?'old':'new',watch:null,adminKey:'',file:null,fileURL:null,duration:0,fileVersion:0,galleryVersion:0};
let directoryCatalog=null;
async function readDirectory(){if(!directoryCatalog){const response=await fetch(window.MOMENTS_CONFIG.directoryCatalog,{cache:'no-cache'});if(!response.ok)throw Error('名场面目录暂时无法读取');directoryCatalog=await response.json();if(directoryCatalog.schemaVersion!==1||!Array.isArray(directoryCatalog.items))throw Error('名场面目录格式不正确');}return directoryCatalog;}
const name=key=>state.members.find(p=>p.key===key)?.name||key?.split('#')[0]||'未知玩家';
const fileSize=n=>n>=1e9?(n/1e9).toFixed(2)+' GB':n>=1e6?(n/1e6).toFixed(1)+' MB':Math.round(n/1000)+' KB';
const duration=n=>Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0');
const date=n=>new Date(n).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});
const endpoint=(id,action='')=>api+'/moments/'+id+(action?'/'+action:'');
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4500);}
async function request(path,options={}){
 const headers=new Headers(options.headers);if(options.json!==undefined){headers.set('Content-Type','application/json');options.body=JSON.stringify(options.json);}
 if(options.auth){if(!session||session.expiresAt<Date.now()){session=null;save(SESSION_KEY,null);renderSession();throw Error('请先选择 ID 并输入群口令');}headers.set('Authorization','Bearer '+session.token);}
 const response=await fetch(api+path,{...options,headers});let value;try{value=await response.json();}catch{throw Error('服务暂时不可用，请稍后重试');}
 if(!response.ok){if(response.status===401&&options.auth){session=null;save(SESSION_KEY,null);renderSession();}throw Error(value.error||'操作失败，请稍后重试');}return value;
}
function renderSession(){
 $('session-label').textContent=session?'当前署名：'+name(session.playerKey)+' · 可以上传新片':'浏览无需登录 · 视频互动请前往 B站';
 $('open-login').textContent=session?'切换 ID':'选择我的 ID';$('logout').hidden=!session;
 $('open-upload').disabled=!state.storageReady;$('upload-submit').disabled=!state.storageReady||state.uploading;
}
function renderMembers(){
 const options=state.members.map(p=>`<option value="${esc(p.key)}">${esc(p.name)}</option>`).join('');
 $('filter-player').innerHTML='<option value="">所有玩家</option>'+options;$('filter-player').value=state.filterPlayer;
 if(!$('filter-player').value)state.filterPlayer='';
 $('login-player').innerHTML='<option value="">请选择</option>'+options;$('login-player').value=session?.playerKey||'';
 $('upload-players').innerHTML=state.members.map(p=>`<label><input type="checkbox" name="players" value="${esc(p.key)}"><span>${esc(p.name)}</span></label>`).join('');
 $('upload-match').innerHTML='<option value="">不关联比赛 / 记不清了</option>'+Object.entries(state.matches).sort((a,b)=>String(b[1].createdAt).localeCompare(String(a[1].createdAt))).map(([key,m])=>`<option value="${esc(key)}">${esc(m.date)} ${esc(m.start)} · ${esc(m.label)}</option>`).join('');
}
async function refreshUsage(){$('storage-label').textContent='本站只保留封面与目录 · 视频、点赞和评论在 B站';$('storage-bar').parentElement.hidden=true;}
function card(item){
 const url=window.MOMENTS_DIRECTORY.videoURL(item),poster=item.posterPath;
 const cover=poster?`<img src="${esc(poster)}" alt="${esc(item.title)}的封面" loading="lazy">`:`<span class="cover-word">${CATEGORIES[item.category]||'名场面'}</span>`;
 const thumb=`${cover}<span class="play-icon">${url?'↗':'…'}</span><span class="clip-duration">${duration(item.duration)}</span>`;
 const remove=owners[item.id]||state.adminKey?`<button data-remove="${esc(item.id)}" type="button">移出网站目录</button>`:'';
 return `<article class="clip-card">${url?`<a class="clip-cover ${esc(item.category)}" href="${url}" target="_blank" rel="noopener noreferrer" aria-label="在 B站观看 ${esc(item.title)}">${thumb}</a>`:`<div class="clip-cover ${esc(item.category)}">${thumb}</div>`}<div class="clip-body"><div class="clip-meta"><span class="category ${esc(item.category)}">${CATEGORIES[item.category]||'名场面'}</span><small>${date(item.createdAt)}</small></div>${url?`<a class="clip-title" href="${url}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a>`:`<span class="clip-title">${esc(item.title)}</span>`}<p class="archive-status">${url?'B站观看与互动':'等待 B站投稿 / 审核'}</p><div class="clip-players">${item.players.map(key=>`<button data-filter-player="${esc(key)}" type="button">${esc(name(key))}</button>`).join('')}</div>${item.hero?`<p class="muted">英雄：${esc(item.hero)}</p>`:''}<div class="clip-bottom"><small>${esc(name(item.uploaderKey))} 上传</small></div><div class="clip-links">${url?`<a href="${url}" target="_blank" rel="noopener noreferrer">去 B站观看 ↗</a><a href="${url}#reply" target="_blank" rel="noopener noreferrer">评论 / 点赞 ↗</a>`:''}${remove}</div></div></article>`;
}
function bindCards(){
 $('gallery').querySelectorAll('[data-filter-player]').forEach(b=>b.onclick=()=>{state.filterPlayer=b.dataset.filterPlayer;$('filter-player').value=state.filterPlayer;loadGallery();});
 $('gallery').querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{if(!confirm('移出网站目录？B站稿件仍然保留。'))return;try{await request('/moments/'+b.dataset.remove,{method:'DELETE',headers:{...(owners[b.dataset.remove]?{'X-Owner-Token':owners[b.dataset.remove]}:{}),...(state.adminKey?{'X-Admin-Key':state.adminKey}:{})}});directoryCatalog.items=directoryCatalog.items.filter(m=>m.id!==b.dataset.remove);await loadGallery();toast('已移出，公开目录会在下次同步时更新');}catch(e){toast(e.message);}});
}
function renderGallery(){
 $('gallery').innerHTML=state.items.length?state.items.map(card).join(''):`<div class="empty"><span>▶</span><h3>${state.filterPlayer||state.category||state.search?'还没找到这类名场面':'第一段名场面，等你开张。'}</h3><p>高光值得留档，下饭值得反复播放。老视频也可以不关联比赛。</p>${state.storageReady?'<button id="empty-upload" class="primary" type="button">上传第一段</button>':''}</div>`;
 if($('empty-upload'))$('empty-upload').onclick=openUpload;bindCards();$('load-more').hidden=state.nextOffset==null;
 $('results-title').textContent=state.filterPlayer?name(state.filterPlayer)+' 的名场面':'全部名场面';
}
async function loadGallery(append=false){
 const version=++state.galleryVersion;state.loading=true;$('load-more').disabled=true;
 const params=new URLSearchParams();for(const [key,v] of Object.entries({player:state.filterPlayer,category:state.category,search:state.search,sort:state.sort,offset:append?state.nextOffset||0:0}))if(v)params.set(key,v);
 if(!append){const u=new URL(location.href);for(const key of ['player','category','search','sort'])u.searchParams.delete(key);for(const key of ['player','category','search','sort'])if(params.has(key))u.searchParams.set(key,params.get(key));history.replaceState(null,'',u);$('gallery').innerHTML='<div class="empty">正在读取名场面…</div>';}
 try{const value=window.MOMENTS_DIRECTORY.page(await readDirectory(),Object.fromEntries(params));if(version!==state.galleryVersion)return;state.items=append?[...new Map([...state.items,...value.items].map(x=>[x.id,x])).values()]:value.items;state.nextOffset=value.nextOffset;$('result-count').textContent=value.total+' 条视频';renderGallery();}
 catch(error){if(version!==state.galleryVersion)return;$('gallery').innerHTML=`<div class="empty"><h3>暂时无法读取视频</h3><p>${esc(error.message)}</p><button id="retry-gallery" type="button">重新加载</button></div>`;$('retry-gallery').onclick=()=>loadGallery();}
 finally{state.loading=false;$('load-more').disabled=false;}
}
function needSession(){if(session&&session.expiresAt>Date.now())return true;$('login-error').textContent='';$('login-dialog').showModal();return false;}
function openUpload(){if(!state.storageReady){toast('视频空间暂未开通，暂不能上传');return;}if(!needSession())return;for(const input of $('upload-players').querySelectorAll('input'))if(![...$('upload-players').querySelectorAll('input')].some(x=>x.checked)&&input.value===session.playerKey)input.checked=true;$('upload-error').textContent='';$('upload-dialog').showModal();}
async function openWatch(id){const item=(await readDirectory()).items.find(m=>m.id===id),url=item&&window.MOMENTS_DIRECTORY.videoURL(item);if(url)location.replace(url);else toast('视频正在等待 B站投稿或审核');}
function resetFile(){if(state.fileURL)URL.revokeObjectURL(state.fileURL);state.fileURL=null;state.file=null;state.duration=0;$('upload-preview').pause();$('upload-preview').removeAttribute('src');$('upload-preview').load();$('upload-preview').hidden=true;}
$('upload-file').onchange=async()=>{
 const version=++state.fileVersion;resetFile();$('upload-error').textContent='';const file=$('upload-file').files[0];if(!file)return;
 if(!/\.mp4$/i.test(file.name)||file.size>100000000||file.size<12){$('upload-error').textContent='请选择不超过 100 MB 的 MP4 视频';$('upload-file').value='';return;}
 state.file=file;state.fileURL=URL.createObjectURL(file);const video=$('upload-preview');video.src=state.fileURL;video.hidden=false;$('file-info').textContent='正在读取视频时长…';
 try{await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('读取视频超时，请尝试重新导出为 MP4')),15000);video.onloadedmetadata=()=>{clearTimeout(timeout);resolve();};video.onerror=()=>{clearTimeout(timeout);reject(Error('浏览器无法读取此视频，请重新导出为 MP4'));};});if(version!==state.fileVersion)return;if(!Number.isFinite(video.duration)||video.duration<=0||video.duration>180.1)throw Error('视频最长 3 分钟，请先剪辑片段');state.duration=video.duration;$('file-info').textContent=file.name+' · '+fileSize(file.size)+' · '+duration(video.duration);}
 catch(e){if(version===state.fileVersion){resetFile();$('upload-file').value='';$('upload-error').textContent=e.message;$('file-info').textContent='';}}
};
async function poster(){
 try{const video=$('upload-preview');if(!video.videoWidth)return null;await new Promise(resolve=>{const timer=setTimeout(resolve,1800);video.onseeked=()=>{clearTimeout(timer);resolve();};video.currentTime=Math.min(.5,state.duration/2);});const canvas=document.createElement('canvas');canvas.width=Math.min(640,video.videoWidth);canvas.height=Math.round(canvas.width*video.videoHeight/video.videoWidth);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.65));return blob&&blob.size<=120000?blob:null;}catch{return null;}
}
function uploadFile(reservation,file){return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('PUT',endpoint(reservation.id,'upload'));xhr.setRequestHeader('Content-Type','video/mp4');xhr.setRequestHeader('X-Upload-Token',reservation.uploadToken);xhr.timeout=1800000;xhr.upload.onprogress=e=>{if(e.lengthComputable){const n=Math.min(99,Math.round(e.loaded/e.total*100));$('upload-progress').querySelector('progress').value=n;$('upload-progress').querySelector('span').textContent=n+'% · 上传中，请保持页面打开';}};xhr.onload=()=>{let value;try{value=JSON.parse(xhr.responseText);}catch{}if(xhr.status>=200&&xhr.status<300)resolve(value);else reject(Error(value?.error||'上传失败，请重试'));};xhr.onerror=()=>reject(Error('网络中断，请检查网络后重试'));xhr.ontimeout=()=>reject(Error('上传超时，请检查网络后重试'));xhr.send(file);});}
$('upload-form').onsubmit=async e=>{
 e.preventDefault();if(state.uploading||!needSession())return;const players=[...$('upload-players').querySelectorAll('input:checked')].map(x=>x.value);
 if(!state.file||!state.duration){$('upload-error').textContent='请先选择可读取的 MP4 视频';return;}if(!players.length||players.length>10){$('upload-error').textContent='请选择 1–10 位相关玩家';return;}
 state.uploading=true;$('upload-submit').disabled=true;$('upload-error').textContent='';$('upload-progress').hidden=false;for(const field of $('upload-form').querySelectorAll('input,select,textarea'))field.disabled=true;let reservation=null,published=false;
 try{
  const cover=await poster();reservation=await request('/moments',{method:'POST',auth:true,json:{...window.MOMENTS_ARCHIVE.fields(),title:$('upload-title').value,description:$('upload-description').value,category:$('upload-category').value,players,matchKey:$('upload-match').value||null,occurredOn:$('upload-date').value||null,hero:$('upload-hero').value,size:state.file.size,duration:state.duration,mime:'video/mp4'}});
  owners[reservation.id]=reservation.ownerToken;save(OWNER_KEY,owners);await uploadFile(reservation,state.file);published=true;
  if(cover)try{await request('/moments/'+reservation.id+'/poster',{method:'PUT',headers:{'Content-Type':'image/jpeg','X-Owner-Token':reservation.ownerToken},body:cover});}catch{}
  $('upload-progress').querySelector('progress').value=100;$('upload-dialog').close();$('upload-form').reset();resetFile();$('file-info').textContent='';state.filterPlayer='';state.category='';state.search='';$('filter-player').value='';$('filter-category').value='';$('filter-search').value='';toast('视频已进入投稿队列，B站审核通过后会自动更新目录');await Promise.all([loadGallery(),refreshUsage()]);
 }catch(error){$('upload-error').textContent=error.message;if(reservation&&!published)try{await request('/moments/'+reservation.id,{method:'DELETE',headers:{'X-Owner-Token':reservation.ownerToken}});delete owners[reservation.id];save(OWNER_KEY,owners);}catch{}await refreshUsage();}
 finally{state.uploading=false;$('upload-submit').disabled=!state.storageReady;$('upload-progress').hidden=true;for(const field of $('upload-form').querySelectorAll('input,select,textarea'))field.disabled=false;}
};
$('login-form').onsubmit=async e=>{e.preventDefault();$('login-submit').disabled=true;$('login-error').textContent='';try{session=await request('/session',{method:'POST',json:{playerKey:$('login-player').value,code:$('group-code').value}});save(SESSION_KEY,session);$('group-code').value='';$('login-dialog').close();renderSession();renderGallery();toast('当前署名：'+name(session.playerKey));}catch(error){$('login-error').textContent=error.message;}finally{$('login-submit').disabled=false;}};
$('open-upload').onclick=openUpload;$('open-login').onclick=()=>{$('login-error').textContent='';$('login-dialog').showModal();};$('logout').onclick=()=>{session=null;save(SESSION_KEY,null);renderSession();renderGallery();};
for(const [id,key] of [['filter-player','filterPlayer'],['filter-category','category'],['filter-sort','sort']])$(id).onchange=()=>{state[key]=$(id).value;loadGallery();};
$('filter-category').value=state.category;$('filter-sort').value=state.sort;$('filter-search').value=state.search;$('search-form').onsubmit=e=>{e.preventDefault();state.search=$('filter-search').value.trim();loadGallery();};$('load-more').onclick=()=>loadGallery(true);
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{if(b.dataset.close==='upload-dialog'&&state.uploading){toast('视频正在上传，请等待完成');return;}$(b.dataset.close).close();});
$('upload-dialog').addEventListener('cancel',e=>{if(state.uploading){e.preventDefault();toast('视频正在上传，请等待完成');}});
$('open-admin').onclick=()=>$('admin-dialog').showModal();$('admin-form').onsubmit=e=>{e.preventDefault();state.adminKey=$('admin-key').value;$('admin-key').value='';$('admin-dialog').close();renderGallery();toast('管理口令已用于本次会话，删除时会校验');};
async function init(){renderMembers();renderSession();try{const c=await readDirectory();state.members=c.members;state.matches=c.matches||{};state.storageReady=!!api;window.MOMENTS_ARCHIVE.setup(true);if(session&&!state.members.some(p=>p.key===session.playerKey)){session=null;save(SESSION_KEY,null);}renderMembers();renderSession();if(!state.storageReady){$('service-note').textContent='视频空间正在准备，暂不能上传。开通后即可在这里发布名场面。';$('service-note').hidden=false;}}catch{$('service-note').textContent='暂时无法连接名场面服务，请稍后刷新。';$('service-note').hidden=false;}
 await Promise.all([loadGallery(),refreshUsage()]);if(query.get('clip'))await openWatch(query.get('clip'));
}
init();
})();
