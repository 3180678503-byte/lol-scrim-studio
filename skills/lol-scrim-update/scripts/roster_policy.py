"""Apply a confirmed roster exclusion policy to flex imports without changing team totals."""
import hashlib,json
from pathlib import Path
import review_timeline

def load_policy(site):
    site=Path(site)
    for path in [site/'roster-policy.json',site.parent/'roster-policy.json']:
        if path.exists():return json.loads(path.read_text(encoding='utf-8'))
    return {}

def excluded(key,policy):
    return hashlib.sha256(key.encode('utf-8')).hexdigest() in policy.get('excludedKeyHashes',[])

def apply(data,policy):
    if data.get('datasetType') not in ['flex','friends-flex']:return {'removedPlayers':0,'removedGames':0}
    all_rows=[p for m in data['matches'] for p in m['players']]+data.get('cohort',[])
    names={p['name'] for p in all_rows if excluded(p['key'],policy)}
    old_count=len(data['matches']);removed=0;kept=[]
    for m in data['matches']:
        ids={p['id'] for p in m['players'] if excluded(p['key'],policy)}
        removed+=len(ids);m['players']=[p for p in m['players'] if p['id'] not in ids]
        review_timeline.redact(m)
        if not m['players'] or data['datasetType']=='flex' and not any(not p.get('isSelf') for p in m['players']):continue
        m['trackedCount']=len(m['players'])
        if 'sourcePlayers' in m:m['sourcePlayers']=[p for p in m['sourcePlayers'] if not excluded(p['key'],policy)]
        for frame in m.get('frames',[]):
            if 'players' in frame:frame['players']={pid:p for pid,p in frame['players'].items() if int(pid) not in ids}
        if data['datasetType']=='friends-flex':
            mine=next((p for p in m['players'] if p.get('isSelf')),None)
            sides=sorted({p['team'] for p in m['players']},key=lambda side:-sum(p['team']==side for p in m['players']))
            m.update(trackedTeams=sides,selfPresent=bool(mine),selfWin=mine['win'] if mine else None,allyTeam=mine['team'] if mine else sides[0])
        kept.append(m)
    data['radarIncludeSelf']=policy.get('includeSelfInRadar',True);data['matches']=kept;data['sampleSize']=len(kept);data['date']=kept[-1]['date'] if kept else ''
    data['sessions']=[{'id':date,'date':date,'label':date+' 灵排','matchKeys':[m['matchKey'] for m in kept if m['date']==date]} for date in sorted({m['date'] for m in kept})]
    c=data['collection'];c.update(trackedPlayers=len({p['key'] for m in kept for p in m['players']}),timelineGames=sum(bool(m.get('frames')) for m in kept),oldest=kept[0]['createdAt'] if kept else None,newest=kept[-1]['createdAt'] if kept else None)
    if data['datasetType']=='friends-flex':
        data['cohort']=[p for p in data['cohort'] if not excluded(p['key'],policy)]
        accounts=[a for a in c.get('accounts',[]) if a['name'] not in names]
        raw=sum(len(m['sourcePlayers']) for m in kept) if all('sourcePlayers' in m for m in kept) else sum(a['count'] for a in accounts)
        c.update(accounts=accounts,queriedAccounts=len(accounts),requestedFriends=sum(not p.get('isSelf') for p in data['cohort']),rawAccountMatches=raw,duplicateMatches=max(0,raw-sum(bool(m.get('sourcePlayers',[])) for m in kept)),uniqueGames=len(kept),playerGames=sum(len(m['players']) for m in kept),withoutSelf=sum(not m['selfPresent'] for m in kept),groupGames=sum(any(sum(p['team']==side for p in m['players'])>=2 for side in m['trackedTeams']) for m in kept))
        data['friendScope']=f"已确认的 {c['requestedFriends']} 位好友及本人各自的灵排；包括本人不在场和单人参与的灵排；只统计这份名单。"
    else:
        data['rosters']={str(side):sorted({p['name'] for m in kept for p in m['players'] if p['team']==side}) for side in [100,200]}
        c.update(importedFriendGames=len(kept),excludedNoFriend=max(0,c.get('queriedFlex',len(kept))-len(kept)))
        data['friendScope']='已确认好友名单 + 本人；仅本人所在队伍，且至少一位名单好友同队。按仓库名单排除规则过滤每次导入。'
    return {'removedPlayers':removed,'removedGames':old_count-len(kept)}
