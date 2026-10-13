"""Collect up to 1000 self-account flex summaries; match current friends on allied side."""
import argparse,base64,datetime as dt,json,os,time,urllib.parse
from pathlib import Path
import collect

def write(path,data):
    Path(path).parent.mkdir(parents=True,exist_ok=True)
    temp=Path(str(path)+'.tmp');temp.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8');temp.replace(path)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output',required=True);p.add_argument('--report',required=True)
    p.add_argument('--max-games',type=int,default=1000);p.add_argument('--timeline-limit',type=int,default=1000)
    p.add_argument('--akari-config',default=str(Path(os.environ.get('APPDATA',''))/'league-akari/AkariConfig/akari-api-main/config/v1/sgp/league-servers.json'))
    args=p.parse_args()
    if not 1<=args.max_games<=1000 or not 0<=args.timeline_limit<=1000:p.error('Bounds must be within 1000')
    if Path(args.output).exists():p.error('Output exists; use a new timestamped private export')
    port,password=collect.credentials();client=collect.opener(True)
    auth='Basic '+base64.b64encode(('riot:'+password).encode()).decode()
    def lcu(path):return collect.read(client,'https://127.0.0.1:'+port+path,auth)
    self_player=lcu('/lol-summoner/v1/current-summoner');friends=lcu('/lol-chat/v1/friends')
    if not isinstance(friends,list):raise RuntimeError('Friend list unavailable; do not infer friends from old scrim roster')
    puuid=self_player['puuid'];friends_by_id={f['puuid']:f for f in friends if f.get('puuid')}
    history=lcu('/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=19')
    platform=history.get('platformId')
    if not platform:raise RuntimeError('Missing actual platformId')
    config=json.loads(Path(args.akari_config).read_text(encoding='utf-8'))
    base=config['servers']['TENCENT_'+platform]['matchHistory']
    parsed=urllib.parse.urlparse(base)
    if parsed.scheme!='https' or not (parsed.hostname or '').endswith('.lol.qq.com') or parsed.username or parsed.password:raise RuntimeError('Unexpected server destination')
    remote=collect.opener();bearer='Bearer '+lcu('/entitlements/v1/token')['accessToken']
    report={'phase':'summaries','player':self_player.get('gameName',self_player.get('displayName')),'platformId':platform,'destination':base,'friendCount':len(friends),'maxGames':args.max_games,'pages':[],'summaryCount':0,'friendGames':0,'timelineCount':0,'failedTimelines':0,'bounded':False}
    export={'collectedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'self':self_player,'friends':friends,'summaries':[],'matches':[],'champions':{}}
    try:export['champions']={str(c['id']):{k:c[k] for k in ['id','name','alias'] if k in c} for c in lcu('/lol-game-data/assets/v1/champion-summary.json') if c.get('id',0)>0}
    except RuntimeError:pass
    seen=set()
    for start in range(0,args.max_games,100):
        count=min(100,args.max_games-start)
        path='/match-history-query/v1/products/lol/player/'+puuid+'/SUMMARY?'+urllib.parse.urlencode({'startIndex':start,'count':count,'tag':'q_440'})
        try:payload=collect.read(remote,base.rstrip('/')+path,bearer)
        except RuntimeError as e:
            report['summaryError']=str(e);report['bounded']=True;break
        page=[g.get('json',g) for g in payload.get('games',[]) if g.get('json',g)]
        new=[g for g in page if str(g.get('gameId')) not in seen and g.get('queueId')==440]
        report['pages'].append({'startIndex':start,'requested':count,'returned':len(page),'newFlex':len(new)})
        if any(g.get('queueId')!=440 for g in page):raise RuntimeError('Server queue filter ignored; stop rather than mislabel games')
        export['summaries'].extend(collect.strip_secrets(new));seen.update(str(g['gameId']) for g in new)
        report['summaryCount']=len(export['summaries']);write(args.report,report);write(args.output,collect.strip_secrets(export))
        if not new or len(page)<count:
            report['stopReason']='empty_page' if not page else 'short_page' if len(page)<count else 'repeated_page';break
        time.sleep(.15)
    else:report['bounded']=True;report['stopReason']='max_games'
    relevant=[]
    participants_seen=set()
    for s in export['summaries']:
        mine=next((q for q in s['participants'] if q.get('puuid')==puuid),None)
        if not mine:continue
        tracked=[q for q in s['participants'] if q['teamId']==mine['teamId'] and (q.get('puuid')==puuid or q.get('puuid') in friends_by_id)]
        if not any(q.get('puuid')!=puuid for q in tracked):continue
        relevant.append((s,tracked));participants_seen.update(q.get('puuid') for q in tracked)
    report.update(friendGames=len(relevant),trackedPlayers=len(participants_seen),phase='timelines')
    when=lambda s:dt.datetime.fromtimestamp(s['gameCreation']/1000,dt.timezone(dt.timedelta(hours=8))).isoformat()
    if export['summaries']:report.update(newest=when(max(export['summaries'],key=lambda s:s['gameCreation'])),oldest=when(min(export['summaries'],key=lambda s:s['gameCreation'])))
    if relevant:report.update(newestFriendGame=when(max((s for s,t in relevant),key=lambda s:s['gameCreation'])),oldestFriendGame=when(min((s for s,t in relevant),key=lambda s:s['gameCreation'])))
    for index,(summary,tracked) in enumerate(relevant):
        gid=str(summary['gameId']);item={'sgp_summary':summary,'trackedPuuids':[q['puuid'] for q in tracked],'selfPuuid':puuid,'timeline':{},'platformId':platform}
        if index<args.timeline_limit:
            for attempt in range(2):
                try:
                    payload=collect.read(remote,base.rstrip('/')+'/match-history-query/v1/products/lol/'+platform+'_'+gid+'/DETAILS',bearer)
                    item['sgp_details']=payload.get('json',payload);break
                except RuntimeError as e:
                    item['timelineError']=str(e)
                    if attempt==0:
                        time.sleep(1)
                        if str(e)=='HTTP 401':bearer='Bearer '+lcu('/entitlements/v1/token')['accessToken']
            if item.get('sgp_details',{}).get('frames'):report['timelineCount']+=1;item.pop('timelineError',None)
            else:report['failedTimelines']+=1
        export['matches'].append(collect.strip_secrets(item));report['processedFriendGames']=len(export['matches'])
        if index%10==0 or index==len(relevant)-1:write(args.report,report);write(args.output,collect.strip_secrets(export))
        time.sleep(.1)
    report['phase']='complete';write(args.report,report);write(args.output,collect.strip_secrets(export));print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':
    try:main()
    except (RuntimeError,KeyError,OSError,ValueError) as e:raise SystemExit(str(e) if isinstance(e,RuntimeError) else type(e).__name__+'; inspect local configuration')
