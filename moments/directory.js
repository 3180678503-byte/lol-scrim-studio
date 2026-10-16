(function(root){
'use strict';
const videoURL=item=>item.archive?.state==='ready'&&/^BV[A-Za-z0-9]{10}$/.test(item.archive.bvid||'')?'https://www.bilibili.com/video/'+item.archive.bvid+'/':null;
function page(catalog,filters={}){
 const query=(filters.search||'').toLocaleLowerCase();
 const items=catalog.items.filter(m=>(!filters.player||m.players.includes(filters.player))&&(!filters.category||m.category===filters.category)&&(!query||[m.title,m.description,m.hero].join(' ').toLocaleLowerCase().includes(query))).sort((a,b)=>(filters.sort==='old'?1:-1)*(a.createdAt-b.createdAt)||a.id.localeCompare(b.id));
 const offset=Math.max(0,Number(filters.offset)||0),rows=items.slice(offset,offset+12);
 return {items:rows,total:items.length,nextOffset:offset+rows.length<items.length?offset+rows.length:null};
}
const model={videoURL,page};if(typeof module==='object'&&module.exports)module.exports=model;else root.MOMENTS_DIRECTORY=model;
})(typeof window!=='undefined'?window:globalThis);
