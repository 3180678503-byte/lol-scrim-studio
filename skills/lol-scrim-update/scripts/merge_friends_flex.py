"""Normalize independent friend-account histories into one de-duplicated cohort dataset."""
import argparse,copy,json
from pathlib import Path
import merge

def main():
    a=argparse.ArgumentParser(description=__doc__);a.add_argument('--site',required=True);a.add_argument('--input',required=True);a.add_argument('--report',required=True);a.add_argument('--champion-metadata');args=a.parse_args()
    site=Path(args.site);site.mkdir(parents=True,exist_ok=True);raw=merge.load(args.input);report=merge.load(args.report)
    selected={t['puuid']:t for t in raw['targets']};owner=raw['self']['puuid'];current={}
    for item in sorted(raw['games'],key=lambda i:i['summary']['gameCreation']):
        for p in item['summary']['participants']:
            if p.get('puuid') in selected:current[p['puuid']]=(p.get('riotIdGameName') or p.get('summonerName',''),p.get('riotIdTagline',''))
    for uid,t in selected.items():
        name=t.get('gameName',t.get('displayName'));tag=t.get('gameTag',t.get('tagLine'))
        if name and tag:current[uid]=(name,tag)
    names={cid:c.get('name',cid) for cid,c in raw.get('champions',{}).items()};cache=Path(raw['timelineCache'])
    d=merge.load(site/'data.json') if (site/'data.json').exists() else {'schemaVersion':2,'datasetType':'friends-flex','matches':[],'champions':{}}
    if d.get('datasetType')!='friends-flex':raise ValueError('Friend cohort needs its own dataset')
    known={m['matchKey']:m for m in d['matches']};added=0
    for item in sorted(raw['games'],key=lambda i:i['summary']['gameCreation']):
        s=copy.deepcopy(item['summary']);key=s['platformId']+':'+str(s['gameId']);tracked={p['participantId'] for p in s['participants'] if p.get('puuid') in selected}
        if not tracked or s['queueId']!=440:continue
        is_self=next((p['participantId'] for p in s['participants'] if p.get('puuid')==owner),None)
        source_players=[{'key':current[uid][0]+'#'+current[uid][1],'name':current[uid][0]} for uid in item['sources'] if uid in current]
        for p in s['participants']:
            if p['participantId'] in tracked:p['riotIdGameName'],p['riotIdTagline']=current[p['puuid']]
        detail=copy.deepcopy(s)
        for t in detail['teams']:
            objects=t.get('objectives',{})
            for field,obj in [('towerKills','tower'),('dragonKills','dragon'),('baronKills','baron'),('riftHeraldKills','riftHerald'),('hordeKills','horde')]:t[field]=objects.get(obj,{}).get('kills',0)
            t['firstBlood']=objects.get('champion',{}).get('first',False);t['firstTower']=objects.get('tower',{}).get('first',False)
        path=cache/(key.replace(':','_')+'.json');timeline=merge.load(path) if path.exists() else {}
        m,champions=merge.normalize({'detail':detail,'sgp_summary':s,'sgp_details':timeline,'platformId':s['platformId']},names,{},{},{},mode='flex')
        m['players']=[p for p in m['players'] if p['id'] in tracked]
        for p in m['players']:p['isSelf']=p['id']==is_self
        owner_row=next((p for p in m['players'] if p['isSelf']),None)
        sides=sorted({p['team'] for p in m['players']},key=lambda side:-sum(p['team']==side for p in m['players']))
        m.update(queueId=440,trackedCount=len(tracked),selfPresent=bool(owner_row),selfWin=owner_row['win'] if owner_row else None,allyTeam=owner_row['team'] if owner_row else sides[0],sourcePlayers=source_players,trackedTeams=sides)
        # Public charts need team totals; exact matchup values were computed before redaction.
        for frame in m['frames']:frame.pop('players',None)
        m['events']=[e for e in m['events'] if e['type']!='CHAMPION_KILL']
        if key in known:
            old=known[key];m['number']=old['number']
            if len(old.get('frames',[]))>len(m['frames']):
                for field in ['frames','events','timelineSource','detailedEventCount','peakBlue','peakRed','gd15Blue']:m[field]=old[field]
                for p in m['players']:
                    previous=next((q for q in old['players'] if q['id']==p['id']),None)
                    if previous:
                        for field in ['gd10','gd15','csd10','csd15','xpd10','xpd15','sampleTime10','sampleTime15']:p[field]=previous[field]
        else:m['number']=max([0]+[old['number'] for old in known.values()])+1;added+=1
        known[key]=m
        for cid,c in champions.items():d['champions'].setdefault(cid,c)
    d['matches']=sorted(known.values(),key=lambda m:m['createdAt']);d['sampleSize']=len(d['matches']);d['mode']='好友全量灵排';d['date']=d['matches'][-1]['date'] if d['matches'] else ''
    d['focusPlayer']=current[owner][0];d['focusPlayerKey']=current[owner][0]+'#'+current[owner][1]
    d['cohort']=[{'key':name+'#'+tag,'name':name,'isSelf':uid==owner} for uid,(name,tag) in current.items()]
    d['friendSnapshotAt']=raw['collectedAt'];d['friendScope']=f'指定的 {len(selected)-1} 位历史同队好友及本人各自的灵排；包括本人不在场和单人参与的灵排；只统计这份选手名单。'
    d['sessions']=[{'id':date,'date':date,'label':date+' 灵排','matchKeys':[m['matchKey'] for m in d['matches'] if m['date']==date]} for date in sorted({m['date'] for m in d['matches']})]
    d['collection']={'queriedAccounts':report['completedAccounts'],'requestedFriends':report['requestedFriends'],'maxPerAccount':report['maxPerAccount'],'rawAccountMatches':report['rawAccountMatches'],'duplicateMatches':report['duplicateMatches'],'uniqueGames':len(d['matches']),'trackedPlayers':len(d['cohort']),'playerGames':sum(len(m['players']) for m in d['matches']),'timelineGames':sum(bool(m['frames']) for m in d['matches']),'withoutSelf':sum(not m['selfPresent'] for m in d['matches']),'groupGames':sum(any(sum(p['team']==side for p in m['players'])>=2 for side in m['trackedTeams']) for m in d['matches']),'accounts':report['accounts'],'oldest':d['matches'][0]['createdAt'] if d['matches'] else None,'newest':d['matches'][-1]['createdAt'] if d['matches'] else None}
    if args.champion_metadata:
        for c in merge.load(args.champion_metadata)['hero']:
            if str(c['heroId']) in d['champions']:d['champions'][str(c['heroId'])].update(name=c['name'],title=c['title'],alias=c['alias'])
    merge.save(site/'data.json',d);print(json.dumps({'uniqueGames':len(known),'added':added,'withoutSelf':d['collection']['withoutSelf'],'timelines':d['collection']['timelineGames']}))

if __name__=='__main__':main()
