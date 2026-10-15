"""Normalize flex independently; publish only self/current friends on allied side."""
import argparse,copy,json
from pathlib import Path
import merge
import roster_policy
import review_timeline

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--site',required=True);p.add_argument('--input',required=True);p.add_argument('--scrim-site');p.add_argument('--champion-metadata');args=p.parse_args()
    site=Path(args.site);site.mkdir(parents=True,exist_ok=True)
    raw=merge.load(args.input);self_id=raw['self']['puuid'];friends={f['puuid']:f for f in raw['friends'] if f.get('puuid')}
    current={}
    for s in sorted(raw['summaries'],key=lambda s:s['gameCreation']):
        for q in s['participants']:
            if q.get('puuid')==self_id or q.get('puuid') in friends:
                current[q['puuid']]=(q.get('riotIdGameName') or q.get('summonerName'),q.get('riotIdTagline',''))
    for uid,f in friends.items():
        if f.get('gameName') and f.get('gameTag'):current[uid]=(f['gameName'],f['gameTag'])
    current[self_id]=(raw['self'].get('gameName',raw['self'].get('displayName')),raw['self'].get('tagLine',''))
    if (site/'data.json').exists():data=merge.load(site/'data.json')
    else:data={'schemaVersion':2,'datasetType':'flex','region':'艾欧尼亚','mode':'灵活排位 · 好友同队','champions':{},'matches':[],'awards':{'matches':{},'collections':[]},'sources':[]}
    focus_key=current[self_id][0]+'#'+current[self_id][1]
    if data.get('datasetType')!='flex':raise ValueError('Do not import flex into the scrim dataset')
    if data.get('focusPlayerKey') and data['focusPlayerKey']!=focus_key:
        raise ValueError('Different focus account; use a separate dataset or explicitly reconcile an account rename')
    if args.scrim_site:
        scrim=merge.load(Path(args.scrim_site)/'data.json');data['champions'].update(copy.deepcopy(scrim['champions']));data['sources']=scrim['sources']
    known={m['matchKey']:m for m in data['matches']};previous_keys=set(known);added=[]
    names={cid:c.get('name',cid) for cid,c in raw.get('champions',{}).items()}
    for item in sorted(raw['matches'],key=lambda i:i['sgp_summary']['gameCreation']):
        summary=copy.deepcopy(item['sgp_summary']);mine=next((p for p in summary['participants'] if p.get('puuid')==self_id),None)
        if not mine or summary.get('queueId')!=440:continue
        tracked={q['participantId'] for q in summary['participants'] if q['teamId']==mine['teamId'] and (q.get('puuid')==self_id or q.get('puuid') in friends)}
        if len(tracked)<2:continue
        # Stabilize renamed friends using private PUUID matching; publish only current Riot IDs.
        original_names={}
        for q in summary['participants']:
            if q['participantId'] in tracked:
                original_names[q['participantId']]=q.get('riotIdGameName','')
                q['riotIdGameName'],q['riotIdTagline']=current[q['puuid']]
        detail=copy.deepcopy(summary)
        for team in detail['teams']:
            objectives=team.get('objectives',{})
            for field,obj in [('towerKills','tower'),('dragonKills','dragon'),('baronKills','baron'),('riftHeraldKills','riftHerald'),('hordeKills','horde')]:team[field]=objectives.get(obj,{}).get('kills',0)
            team['firstBlood']=objectives.get('champion',{}).get('first',False);team['firstTower']=objectives.get('tower',{}).get('first',False)
        m,champions=merge.normalize({'detail':detail,'sgp_summary':summary,'sgp_details':item.get('sgp_details',{}),'platformId':summary['platformId']},names,{}, {},{},mode='flex')
        m.update(queueId=440,allyTeam=mine['teamId'],selfWin=mine['win'],trackedCount=len(tracked))
        m['players']=[q for q in m['players'] if q['id'] in tracked]
        review_timeline.redact(m)
        for q in m['players']:
            q['isSelf']=q['id']==mine['participantId']
            if original_names[q['id']] and original_names[q['id']]!=q['name']:q['nameAtMatch']=original_names[q['id']]
        for frame in m['frames']:frame['players']={pid:row for pid,row in frame['players'].items() if int(pid) in tracked}
        # Resource events retain only anonymous participant numbers; no strangers' names or profiles.
        for cid,c in champions.items():data['champions'].setdefault(cid,c)
        if m['matchKey'] in known:
            old=known[m['matchKey']];m['number']=old['number']
            review_timeline.preserve(old,m)
            if len(m['frames'])<len(old.get('frames',[])):
                for field in ['frames','events','timelineSource','detailedEventCount','peakBlue','peakRed','gd15Blue']:m[field]=old[field]
                for q in m['players']:
                    previous=next((p for p in old['players'] if p['id']==q['id']),None)
                    if previous:
                        for field in ['gd10','csd10','xpd10','sampleTime10','gd15','csd15','xpd15','sampleTime15']:q[field]=previous[field]
        else:m['number']=max([0]+[x['number'] for x in known.values()])+1;added.append(m['matchKey'])
        known[m['matchKey']]=m
    data['matches']=sorted(known.values(),key=lambda m:m['createdAt']);data['sampleSize']=len(data['matches'])
    data.update(datasetType='flex',schemaVersion=2,platformId=raw['matches'][0]['platformId'] if raw['matches'] else '',focusPlayer=current[self_id][0],focusPlayerKey=focus_key,friendScope='采集时客户端好友列表 + 本人；仅本人所在队伍，且至少一位当时的好友同队；不等于已证实共同组队。历史导入保留各次名单快照对应的比赛。',friendSnapshotAt=raw['collectedAt'])
    data['region']='艾欧尼亚' if data['platformId']=='HN1' else data['platformId']
    dates=sorted({m['date'] for m in data['matches']});data['date']=dates[-1] if dates else ''
    data['sessions']=[{'id':date,'date':date,'label':date+' 好友灵排','matchKeys':[m['matchKey'] for m in data['matches'] if m['date']==date]} for date in dates]
    data['rosters']={str(t):sorted({q['name'] for m in data['matches'] for q in m['players'] if q['team']==t}) for t in [100,200]}
    data['collection']={'queriedFlex':len(raw['summaries']),'importedFriendGames':len(data['matches']),'excludedNoFriend':len(raw['summaries'])-len(raw['matches']),'currentFriends':len(raw['friends']),'trackedPlayers':len({q['key'] for m in data['matches'] for q in m['players']}),'timelineGames':sum(bool(m['frames']) for m in data['matches']),'oldest':data['matches'][0]['createdAt'] if data['matches'] else None,'newest':data['matches'][-1]['createdAt'] if data['matches'] else None}
    if args.champion_metadata:
        for c in merge.load(args.champion_metadata)['hero']:
            cid=str(c['heroId'])
            if cid in data['champions']:data['champions'][cid].update(name=c['name'],title=c['title'],alias=c['alias'])
    roster_policy.apply(data,roster_policy.load_policy(site));merge.save(site/'data.json',data);print(json.dumps({'total':len(data['matches']),'added':len({m['matchKey'] for m in data['matches']}-previous_keys),'collection':data['collection']},ensure_ascii=False))

if __name__=='__main__':main()
