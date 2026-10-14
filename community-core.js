(function(){
'use strict';
function targetId(t){if(t.kind==='match')return ['match',t.matchKey,t.playerKey].join('|');if(t.kind==='day')return ['day',t.dataset,t.day,t.playerKey].join('|');throw new Error('Unknown rating scope');}
function validateTarget(t,manifest){if(!t||typeof t!=='object')throw new Error('请选择评分对象');const index=manifest.members.findIndex(m=>m.key===t.playerKey);if(index<0)throw new Error('该玩家不在当前名单中');let allowed;
 if(t.kind==='match'&&typeof t.matchKey==='string')allowed=manifest.matches[t.matchKey];
 else if(t.kind==='day'&&typeof t.day==='string'&&typeof t.dataset==='string')allowed=manifest.days[t.dataset]?.[t.day];
 if(!Array.isArray(allowed)||!allowed.includes(index))throw new Error('该玩家没有这场或这一天的比赛记录');return targetId(t);
}
function validateEntry(value,manifest){const target=validateTarget(value.target,manifest);if(!manifest.members.some(m=>m.key===value.raterKey))throw new Error('请先选择你自己的 ID');const stars=value.stars??null;if(stars!==null&&(!Number.isInteger(stars)||stars<1||stars>5))throw new Error('评分必须是 1 到 5 星');const comment=typeof value.comment==='string'?value.comment.trim():'';if(comment.length>1000)throw new Error('评论最多 1000 字');if(stars===null&&!comment)throw new Error('请选择星级或填写评论');if(typeof value.requestId!=='string'||!/^[A-Za-z0-9_-]{16,80}$/.test(value.requestId))throw new Error('提交标识无效，请刷新后重试');return {targetId:target,target:value.target,raterKey:value.raterKey,stars,comment,requestId:value.requestId};}
const api={targetId,validateTarget,validateEntry};if(typeof module!=='undefined'&&module.exports)module.exports=api;globalThis.COMMUNITY_CORE=api;
})();
