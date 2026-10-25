"""Collect a selected friend cohort's own flex histories, de-duplicate and cache timelines."""
import argparse,base64,datetime as dt,hashlib,json,os,re,threading,time,urllib.parse
from concurrent.futures import ThreadPoolExecutor,as_completed
from pathlib import Path
import collect
from collect_flex import write
from collection_window import parse_window,in_window,before_window

def main():
    a=argparse.ArgumentParser(description=__doc__);a.add_argument('--roster',required=True);a.add_argument('--output',required=True);a.add_argument('--report',required=True);a.add_argument('--timeline-cache',required=True);a.add_argument('--reuse');a.add_argument('--max-per-account',type=int,default=1000);a.add_argument('--page-size',type=int,default=100);a.add_argument('--workers',type=int,default=4)
    a.add_argument('--since');a.add_argument('--until');args=a.parse_args()
    try:window=parse_window(args.since,args.until)
    except ValueError as e:a.error(str(e))
    if not 1<=args.max_per_account<=1000 or not 1<=args.workers<=4:a.error('max-per-account 1..1000; workers 1..4')
    if not 1<=args.page_size<=100:a.error('page-size 1..100')
    if Path(args.output).exists():a.error('Choose a new timestamped private output')
    roster=json.loads(Path(args.roster).read_text(encoding='utf-8'));requested={f['puuid'] for f in roster['selected']}
    port,pw=collect.credentials();local=collect.opener(True);basic='Basic '+base64.b64encode(('riot:'+pw).encode()).decode()
    def lcu(path):return collect.read(local,'https://127.0.0.1:'+port+path,basic)
    self_player=lcu('/lol-summoner/v1/current-summoner');friends=lcu('/lol-chat/v1/friends')
    if self_player['puuid']!=roster['self']['puuid']:raise RuntimeError('Logged-in account changed; reconcile the roster')
    selected=[f for f in friends if f.get('puuid') in requested]
    if len(selected)!=len(requested):raise RuntimeError('Selected friend roster changed; do not silently expand or shrink scope')
    history=lcu('/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=19');platform=history['platformId']
    cfg=json.loads((Path(os.environ['APPDATA'])/'league-akari/AkariConfig/akari-api-main/config/v1/sgp/league-servers.json').read_text(encoding='utf-8'))
    base=cfg['servers']['TENCENT_'+platform]['matchHistory'];url=urllib.parse.urlparse(base)
    if url.scheme!='https' or not (url.hostname or '').endswith('.lol.qq.com') or url.username or url.password:raise RuntimeError('Unexpected destination')
    bearer='Bearer '+lcu('/entitlements/v1/token')['accessToken'];auth_lock=threading.Lock();thread=threading.local()
    def get(path):
        nonlocal bearer
        if not hasattr(thread,'client'):thread.client=collect.opener()
        for attempt in range(2):
            try:return collect.read(thread.client,base.rstrip('/')+path,bearer)
            except RuntimeError as e:
                if attempt or str(e) in ['HTTP 403','HTTP 404']:raise
                time.sleep(1)
                if str(e)=='HTTP 401':
                    with auth_lock:bearer='Bearer '+lcu('/entitlements/v1/token')['accessToken']
    targets=[dict(self_player,isSelf=True)]+[dict(f,isSelf=False) for f in selected]
    account_cache=Path(args.output).parent/(Path(args.output).stem+'-accounts');account_cache.mkdir(parents=True,exist_ok=True)
    def history_for(t):
        cached=account_cache/(hashlib.sha256(t['puuid'].encode()).hexdigest()+'.json')
        if cached.exists():
            value=json.loads(cached.read_text(encoding='utf-8'));return t,value['games'],value['info']
        games=[];seen=set();pages=[];stop='max_games';error=None;excluded=0
        for start in range(0,args.max_per_account,args.page_size):
            count=min(args.page_size,args.max_per_account-start)
            path='/match-history-query/v1/products/lol/player/'+t['puuid']+'/SUMMARY?'+urllib.parse.urlencode({'startIndex':start,'count':count,'tag':'q_440'})
            try:payload=get(path)
            except RuntimeError as e:error=str(e);stop='error';break
            page=[g.get('json',g) for g in payload.get('games',[])];page=[s for s in page if isinstance(s,dict)]
            fresh=[s for s in page if s.get('gameId') is not None and str(s['gameId']) not in seen]
            valid=[s for s in fresh if s.get('queueId')==440 and s.get('mapId')==11 and len(s.get('participants',[]))==10 and len(s.get('teams',[]))==2 and s.get('gameCreation') and s.get('gameDuration')]
            if any(not any(p.get('puuid')==t['puuid'] for p in s['participants']) for s in valid):
                error='Queried account missing from match';stop='error';break
            for s in valid:
                if not s.get('platformId'):s['platformId']=platform
            excluded+=len(fresh)-len(valid)
            included=[s for s in valid if in_window(s,window)]
            games.extend(included);seen.update(str(g['gameId']) for g in fresh);pages.append({'start':start,'returned':len(page),'confirmedFlex':len(included),'queueCounts':{str(q):sum(s.get('queueId')==q for s in page) for q in {s.get('queueId') for s in page}}})
            if before_window(page,window):stop='before_window';break
            if len(page)<count or not fresh:stop='short_page' if len(page)<count else 'repeated_page';break
            time.sleep(.15)
        info={'name':t.get('gameName',t.get('displayName','')),'count':len(games),'excludedNonFlex':excluded,'pages':pages,'stopReason':stop,'error':error}
        write(cached,{'games':collect.strip_secrets(games),'info':info})
        return t,games,info
    report={'phase':'summaries','accounts':[],'requestedFriends':len(selected),'completedAccounts':0,'maxPerAccount':args.max_per_account,'uniqueGames':0,'timelines':0,'timelineErrors':0}
    if window:report['window']=window
    write(args.report,report);unique={};sources={}
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for future in as_completed([pool.submit(history_for,t) for t in targets]):
            t,games,info=future.result();report['accounts'].append(info);report['completedAccounts']+=1
            for s in games:
                key=s['platformId']+':'+str(s['gameId']);unique.setdefault(key,s);sources.setdefault(key,set()).add(t['puuid'])
            report['uniqueGames']=len(unique);write(args.report,report)
    export={'collectedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'self':self_player,'friends':friends,'targets':targets,'games':[{'summary':s,'sources':sorted(sources[key])} for key,s in sorted(unique.items())],'timelineCache':str(Path(args.timeline_cache).resolve())}
    if window:export['window']=window
    try:export['champions']={str(c['id']):{k:c[k] for k in ['id','name','alias'] if k in c} for c in lcu('/lol-game-data/assets/v1/champion-summary.json') if c.get('id',0)>0}
    except RuntimeError:export['champions']={}
    write(args.output,collect.strip_secrets(export));cache=Path(args.timeline_cache);cache.mkdir(parents=True,exist_ok=True)
    def cache_path(key):
        if not re.fullmatch(r'[A-Z0-9]+:[0-9]+',key):raise RuntimeError('Invalid match key')
        return cache/(key.replace(':','_')+'.json')
    if args.reuse:
        old=json.loads(Path(args.reuse).read_text(encoding='utf-8'))
        for item in old['matches']:
            s=item['sgp_summary'];key=s['platformId']+':'+str(s['gameId']);detail=item.get('sgp_details',{})
            if key in unique and detail.get('frames') and not cache_path(key).exists():write(cache_path(key),collect.strip_secrets(detail))
    report.update(phase='timelines',rawAccountMatches=sum(x['count'] for x in report['accounts']),duplicateMatches=sum(x['count'] for x in report['accounts'])-len(unique))
    def timeline(key):
        path=cache_path(key)
        if path.exists():
            try:
                if json.loads(path.read_text(encoding='utf-8')).get('frames'):return key,True,'cache'
            except (OSError,ValueError):pass
        try:
            result=get('/match-history-query/v1/products/lol/'+key.replace(':','_')+'/DETAILS');detail=result.get('json',result)
            if not detail.get('frames'):return key,False,'empty'
            write(path,collect.strip_secrets(detail));return key,True,'fetched'
        except RuntimeError as e:return key,False,str(e)
    errors=[]
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for index,future in enumerate(as_completed([pool.submit(timeline,key) for key in unique])):
            key,success,status=future.result();report['timelines' if success else 'timelineErrors']+=1
            if not success:errors.append({'matchKey':key,'error':status})
            if index%20==0:report['processedTimelines']=index+1;write(args.report,report)
    report.update(phase='complete',processedTimelines=len(unique),timelineFailures=errors,oldest=min(s['gameCreation'] for s in unique.values()) if unique else None,newest=max(s['gameCreation'] for s in unique.values()) if unique else None)
    write(args.report,report);print(json.dumps({k:report[k] for k in ['phase','completedAccounts','uniqueGames','rawAccountMatches','duplicateMatches','timelines','timelineErrors']}))

if __name__=='__main__':
    try:main()
    except (RuntimeError,KeyError,OSError,ValueError) as e:raise SystemExit(str(e) if isinstance(e,RuntimeError) else type(e).__name__+'; inspect local configuration')
