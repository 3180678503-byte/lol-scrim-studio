export const LIMITS={fileBytes:100000000,totalBytes:10000000000,posterBytes:120000,duration:180,uploadsPerDay:5};
export const CATEGORIES={highlight:'神操作',funny:'下饭操作',teamwork:'默契配合',meme:'整活现场'};
export class ApiError extends Error{constructor(message,status=400){super(message);this.status=status;}}
export function validateMoment(raw,catalog){
 if(!raw||typeof raw!=='object')throw new ApiError('请填写视频信息');
 const title=typeof raw.title==='string'?raw.title.trim():'';if(!title||title.length>80)throw new ApiError('标题需要 1–80 个字');
 const description=typeof raw.description==='string'?raw.description.trim():'';if(description.length>1000)throw new ApiError('说明最多 1000 字');
 if(!Object.hasOwn(CATEGORIES,raw.category))throw new ApiError('请选择视频分类');
 const members=new Set(catalog.members.map(p=>p.key));
 if(!Array.isArray(raw.players)||raw.players.some(p=>typeof p!=='string'))throw new ApiError('请选择视频中的玩家');
 const players=[...new Set(raw.players)];if(!players.length||players.length>10||players.some(p=>!members.has(p)))throw new ApiError('请选择 1–10 位名单玩家');
 // Old clips are valid without a match, date, or hero.
 const matchKey=typeof raw.matchKey==='string'&&raw.matchKey.trim()?raw.matchKey.trim():null;
 if(matchKey&&!Object.hasOwn(catalog.matches,matchKey))throw new ApiError('未找到该比赛；也可以选择不关联比赛');
 let occurredOn=typeof raw.occurredOn==='string'&&raw.occurredOn.trim()?raw.occurredOn.trim():null;
 if(occurredOn&&(!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)||!Number.isFinite(Date.parse(occurredOn+'T00:00:00Z'))||new Date(occurredOn+'T00:00:00Z').toISOString().slice(0,10)!==occurredOn))throw new ApiError('日期格式不正确，不记得可以留空');
 const hero=typeof raw.hero==='string'?raw.hero.trim():'';if(hero.length>40)throw new ApiError('英雄名称最多 40 字');
 if(!Number.isInteger(raw.size)||raw.size<12||raw.size>LIMITS.fileBytes)throw new ApiError('视频最大 100 MB');
 if(!Number.isFinite(raw.duration)||raw.duration<=0||raw.duration>LIMITS.duration+.1)throw new ApiError('视频最长 3 分钟，请先剪辑片段');
 if(raw.mime!=='video/mp4')throw new ApiError('请上传 MP4 视频');
 return {title,description,category:raw.category,players,matchKey,occurredOn,hero,size:raw.size,duration:raw.duration,mime:'video/mp4'};
}
export function parseRange(header,size){
 if(!header)return null;
 const match=/^bytes=(\d*)-(\d*)$/.exec(header);if(!match||!size||!match[1]&&!match[2])throw new ApiError('视频范围无效',416);
 let start,end;if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)throw new ApiError('视频范围无效',416);start=Math.max(0,size-suffix);end=size-1;}else{start=Number(match[1]);end=match[2]?Number(match[2]):size-1;}
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)throw new ApiError('视频范围无效',416);
 end=Math.min(end,size-1);return {offset:start,length:end-start+1};
}
const encoder=new TextEncoder();
export async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function equals(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=await hash(a),y=await hash(b);let diff=0;for(let i=0;i<x.length;i++)diff|=x.charCodeAt(i)^y.charCodeAt(i);return diff===0;}
function base64url(value){return btoa(value).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
export async function signSession(payload,secret){
 const body=base64url(String.fromCharCode(...encoder.encode(JSON.stringify(payload))));const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(body)));
 return body+'.'+base64url(String.fromCharCode(...signature));
}
export async function readSession(token,secret,now=Date.now()){
 if(typeof token!=='string'||token.length>4000||!secret)throw new ApiError('请先选择 ID 并输入群口令',401);
 const [body,signature,...rest]=token.split('.');if(!body||!signature||rest.length)throw new ApiError('登录已过期，请重新输入群口令',401);
 try{
  const text=new TextDecoder().decode(Uint8Array.from(atob(body.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0)));const payload=JSON.parse(text);
  const expected=await signSession(payload,secret);
  if(!await equals(expected,token)||!Number.isFinite(payload.exp)||payload.exp<now||typeof payload.playerKey!=='string')throw Error();
  return payload;
 }catch{throw new ApiError('登录已过期，请重新输入群口令',401);}
}
export const dayStart=now=>Math.floor((now+8*3600000)/86400000)*86400000-8*3600000;
