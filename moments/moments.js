(() => {
'use strict';
const $=id=>document.getElementById(id),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=(window.MOMENTS_CONFIG?.apiBase||'').replace(/\/$/,'');
const CATEGORIES={highlight:'神操作',funny:'下饭操作',teamwork:'默契配合',meme:'整活现场'},SESSION_KEY='scrim-moments-session-v1',OWNER_KEY='scrim-moments-owners-v1';
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))||fallback;}catch{return fallback;}},save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
let session=read(SESSION_KEY,null);if(session?.expiresAt<Date.now())session=null;
const owners=read(OWNER_KEY,{}),query=new URLSearchParams(location.search),state={members:window.COMMUNITY_MEMBERS||[],matches:{},storageReady:false,items:[],nextOffset:null,loading:false,uploading:false,filterPlayer:query.get('player')||'',category:query.get('category')||'',search:query.get('search')||'',sort:query.get('sort')==='hot'?'hot':'new',watch:null,adminKey:'',file:null,fileURL:null,duration:0,fileVersion:0,galleryVersion:0};
const pendingLikes=new Set();
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
 $('session-label').textContent=session?'当前署名：'+name(session.playerKey)+' · 已解锁上传、点赞与评论':'浏览无需登录 · 上传与互动前选择自己的 ID';
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
async function refreshUsage(){try{const u=await request('/usage');$('storage-label').textContent=`已用及预留 ${fileSize(u.allocatedBytes)} / ${fileSize(u.totalBytes)} · ${u.published} 条名场面`;$('storage-bar').style.width=Math.min(100,u.allocatedBytes/u.totalBytes*100)+'%';}catch{$('storage-label').textContent='视频空间暂时无法读取';}}
function card(item){
 const selected=session&&item.likes.includes(session.playerKey);
 return `<article class="clip-card"><button class="clip-cover ${esc(item.category)}" type="button" data-watch="${item.id}" aria-label="播放 ${esc(item.title)}">${item.hasPoster?`<img src="${endpoint(item.id,'poster')}" alt="${esc(item.title)}的封面" loading="lazy">`:`<span class="cover-word">${CATEGORIES[item.category]||'名场面'}</span>`}<span class="play-icon">▶</span><span class="clip-duration">${duration(item.duration)}</span></button><div class="clip-body"><div class="clip-meta"><span class="category ${esc(item.category)}">${CATEGORIES[item.category]||'名场面'}</span><small>${date(item.createdAt)}</small></div><button class="clip-title" data-watch="${item.id}" type="button">${esc(item.title)}</button><div class="clip-players">${item.players.map(key=>`<button data-filter-player="${esc(key)}" type="button">${esc(name(key))}</button>`).join('')}</div><div class="clip-bottom"><small>${esc(name(item.uploaderKey))} 上传</small><div><button data-like="${item.id}" class="${selected?'liked':''}" type="button" aria-pressed="${!!selected}">♡ ${item.likes.length}</button><button data-watch="${item.id}" type="button">评论 ${item.commentCount}</button></div></div></div></article>`;
}
function bindCards(){
 $('gallery').querySelectorAll('[data-watch]').forEach(b=>b.onclick=()=>openWatch(b.dataset.watch));
 $('gallery').querySelectorAll('[data-like]').forEach(b=>b.onclick=()=>toggleLike(b.dataset.like));
 $('gallery').querySelectorAll('[data-filter-player]').forEach(b=>b.onclick=()=>{state.filterPlayer=b.dataset.filterPlayer;$('filter-player').value=state.filterPlayer;loadGallery();});
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
 try{const value=await request('/moments?'+params);if(version!==state.galleryVersion)return;state.items=append?[...new Map([...state.items,...value.items].map(x=>[x.id,x])).values()]:value.items;state.nextOffset=value.nextOffset;$('result-count').textContent=value.total+' 条视频';renderGallery();}
 catch(error){if(version!==state.galleryVersion)return;$('gallery').innerHTML=`<div class="empty"><h3>暂时无法读取视频</h3><p>${esc(error.message)}</p><button id="retry-gallery" type="button">重新加载</button></div>`;$('retry-gallery').onclick=()=>loadGallery();}
 finally{state.loading=false;$('load-more').disabled=false;}
}
function needSession(){if(session&&session.expiresAt>Date.now())return true;$('login-error').textContent='';$('login-dialog').showModal();return false;}
function openUpload(){if(!state.storageReady){toast('视频空间暂未开通，暂不能上传');return;}if(!needSession())return;for(const input of $('upload-players').querySelectorAll('input'))if(![...$('upload-players').querySelectorAll('input')].some(x=>x.checked)&&input.value===session.playerKey)input.checked=true;$('upload-error').textContent='';$('upload-dialog').showModal();}
async function toggleLike(id){
 if(!needSession()||pendingLikes.has(id))return;const item=state.items.find(x=>x.id===id)||state.watch;if(!item)return;
 const liked=!item.likes.includes(session.playerKey);pendingLikes.add(id);try{await request('/moments/'+id+'/likes',{method:'POST',auth:true,json:{liked}});item.likes=liked?[...new Set([...item.likes,session.playerKey])]:item.likes.filter(x=>x!==session.playerKey);renderGallery();if(state.watch?.id===id){state.watch.likes=item.likes;renderWatchInteractions();}}catch(e){toast(e.message);}finally{pendingLikes.delete(id);}
}
function renderWatchInteractions(){
 if(!state.watch)return;const m=state.watch,liked=session&&m.likes.includes(session.playerKey);
 $('watch-like').textContent=(liked?'♥':'♡')+' '+m.likes.length+' 赞';$('watch-like').classList.toggle('liked',!!liked);
 $('watch-identity').textContent=session?'以 '+name(session.playerKey)+' 评论':'评论前请选择自己的 ID';$('comment-body').disabled=!session;
 $('watch-delete').hidden=!(owners[m.id]||state.adminKey);
}
async function openWatch(id){
 try{
  const m=await request('/moments/'+id);state.watch=m;const link=new URL(location.href);link.search='';link.searchParams.set('clip',id);
  $('watch-content').innerHTML=`<video id="watch-video" src="${endpoint(id,'video')}" ${m.hasPoster?`poster="${endpoint(id,'poster')}"`:''} controls playsinline preload="metadata"></video><div class="watch-info"><span class="category ${esc(m.category)}">${CATEGORIES[m.category]}</span><h2>${esc(m.title)}</h2><div class="clip-players">${m.players.map(key=>`<a href="?player=${encodeURIComponent(key)}">${esc(name(key))}</a>`).join('')}</div><p class="clip-description">${esc(m.description)}</p><p class="muted">${esc(name(m.uploaderKey))} 上传于 ${date(m.createdAt)} · ${fileSize(m.size)}${m.occurredOn?' · 发生日期 '+esc(m.occurredOn):''}${m.hero?' · '+esc(m.hero):''}${m.matchKey?' · 已关联 '+esc(state.matches[m.matchKey]?.label||m.matchKey):' · 未关联比赛'}</p><div class="watch-actions"><button id="watch-like" type="button"></button><button id="watch-share" type="button">复制分享链接</button><button id="watch-delete" type="button" hidden>删除视频</button></div><section class="comments"><h3>群友评论</h3><p id="watch-identity" class="muted"></p><form id="comment-form"><textarea id="comment-body" maxlength="500" rows="2" placeholder="这波你怎么评价？"></textarea><div><button id="comment-login" type="button">选择我的 ID</button><button id="comment-submit" class="primary" type="submit">发表评论</button></div></form><div id="comment-list">正在读取评论…</div></section></div>`;
  renderWatchInteractions();$('watch-dialog').showModal();$('watch-like').onclick=()=>toggleLike(id);$('comment-login').onclick=()=>{$('login-error').textContent='';$('login-dialog').showModal();};
  $('watch-share').onclick=async()=>{try{await navigator.clipboard.writeText(link.href);toast('分享链接已复制');}catch{prompt('复制这个链接',link.href);}};
  $('watch-delete').onclick=async()=>{if(!confirm('删除这段视频及其评论？'))return;try{await request('/moments/'+id,{method:'DELETE',headers:{...(owners[id]?{'X-Owner-Token':owners[id]}:{}),...(state.adminKey?{'X-Admin-Key':state.adminKey}:{})}});delete owners[id];save(OWNER_KEY,owners);$('watch-dialog').close();toast('视频已删除');await Promise.all([loadGallery(),refreshUsage()]);}catch(e){toast(e.message);}};
  $('comment-form').onsubmit=async e=>{e.preventDefault();if(!needSession())return;const body=$('comment-body').value.trim();if(!body)return;$('comment-submit').disabled=true;try{await request('/moments/'+id+'/comments',{method:'POST',auth:true,json:{body,requestId:crypto.randomUUID()}});$('comment-body').value='';await loadComments(id);const item=state.items.find(x=>x.id===id);if(item)item.commentCount++;renderGallery();}catch(error){toast(error.message);}finally{if($('comment-submit'))$('comment-submit').disabled=false;}};
  await loadComments(id);
 }catch(error){toast(error.message);}
}
async function loadComments(id){try{const value=await request('/moments/'+id+'/comments');if(state.watch?.id!==id)return;$('comment-list').innerHTML=value.comments.length?value.comments.map(c=>`<article class="comment"><b>${esc(name(c.playerKey))}</b><small>${date(c.createdAt)}</small><p>${esc(c.body)}</p></article>`).join(''):'<p class="muted">还没有评论，第一张嘴留给你。</p>';}catch(e){if($('comment-list'))$('comment-list').textContent=e.message;}}
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
  const cover=await poster();reservation=await request('/moments',{method:'POST',auth:true,json:{title:$('upload-title').value,description:$('upload-description').value,category:$('upload-category').value,players,matchKey:$('upload-match').value||null,occurredOn:$('upload-date').value||null,hero:$('upload-hero').value,size:state.file.size,duration:state.duration,mime:'video/mp4'}});
  owners[reservation.id]=reservation.ownerToken;save(OWNER_KEY,owners);await uploadFile(reservation,state.file);published=true;
  if(cover)try{await request('/moments/'+reservation.id+'/poster',{method:'PUT',headers:{'Content-Type':'image/jpeg','X-Owner-Token':reservation.ownerToken},body:cover});}catch{}
  $('upload-progress').querySelector('progress').value=100;$('upload-dialog').close();$('upload-form').reset();resetFile();$('file-info').textContent='';state.filterPlayer='';state.category='';state.search='';$('filter-player').value='';$('filter-category').value='';$('filter-search').value='';toast('视频已发布，相关玩家的分类里都能看到');await Promise.all([loadGallery(),refreshUsage()]);
 }catch(error){$('upload-error').textContent=error.message;if(reservation&&!published)try{await request('/moments/'+reservation.id,{method:'DELETE',headers:{'X-Owner-Token':reservation.ownerToken}});delete owners[reservation.id];save(OWNER_KEY,owners);}catch{}await refreshUsage();}
 finally{state.uploading=false;$('upload-submit').disabled=!state.storageReady;$('upload-progress').hidden=true;for(const field of $('upload-form').querySelectorAll('input,select,textarea'))field.disabled=false;}
};
$('login-form').onsubmit=async e=>{e.preventDefault();$('login-submit').disabled=true;$('login-error').textContent='';try{session=await request('/session',{method:'POST',json:{playerKey:$('login-player').value,code:$('group-code').value}});save(SESSION_KEY,session);$('group-code').value='';$('login-dialog').close();renderSession();renderGallery();renderWatchInteractions();toast('当前署名：'+name(session.playerKey));}catch(error){$('login-error').textContent=error.message;}finally{$('login-submit').disabled=false;}};
$('open-upload').onclick=openUpload;$('open-login').onclick=()=>{$('login-error').textContent='';$('login-dialog').showModal();};$('logout').onclick=()=>{session=null;save(SESSION_KEY,null);renderSession();renderGallery();renderWatchInteractions();};
for(const [id,key] of [['filter-player','filterPlayer'],['filter-category','category'],['filter-sort','sort']])$(id).onchange=()=>{state[key]=$(id).value;loadGallery();};
$('filter-category').value=state.category;$('filter-sort').value=state.sort;$('filter-search').value=state.search;$('search-form').onsubmit=e=>{e.preventDefault();state.search=$('filter-search').value.trim();loadGallery();};$('load-more').onclick=()=>loadGallery(true);
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{if(b.dataset.close==='upload-dialog'&&state.uploading){toast('视频正在上传，请等待完成');return;}$(b.dataset.close).close();});
$('upload-dialog').addEventListener('cancel',e=>{if(state.uploading){e.preventDefault();toast('视频正在上传，请等待完成');}});
$('watch-dialog').addEventListener('close',()=>{const video=$('watch-video');if(video){video.pause();video.removeAttribute('src');video.load();}state.watch=null;});
$('open-admin').onclick=()=>$('admin-dialog').showModal();$('admin-form').onsubmit=e=>{e.preventDefault();state.adminKey=$('admin-key').value;$('admin-key').value='';$('admin-dialog').close();renderWatchInteractions();toast('管理口令已用于本次会话，删除时会校验');};
async function init(){renderMembers();renderSession();try{const c=await request('/catalog');state.members=c.members;state.matches=c.matches||{};state.storageReady=c.storageReady;if(session&&!state.members.some(p=>p.key===session.playerKey)){session=null;save(SESSION_KEY,null);}renderMembers();renderSession();if(!state.storageReady){$('service-note').textContent='视频空间正在准备，暂不能上传。开通后即可在这里发布名场面。';$('service-note').hidden=false;}}catch{$('service-note').textContent='暂时无法连接名场面服务，请稍后刷新。';$('service-note').hidden=false;}
 await Promise.all([loadGallery(),refreshUsage()]);if(query.get('clip'))await openWatch(query.get('clip'));
}
init();
})();
