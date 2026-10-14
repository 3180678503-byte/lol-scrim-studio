"""Reuse a private cohort export for the separate self-and-allied-friends dataset."""
import argparse,json,re,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'skills/lol-scrim-update/scripts'))
from collect_flex import write
from collection_window import in_window

def convert(raw,read_timeline):
    owner=raw['self']['puuid']
    friends=[p for p in raw['targets'] if p['puuid']!=owner]
    allowed={p['puuid'] for p in friends}|{owner}
    export={'collectedAt':raw['collectedAt'],'self':raw['self'],'friends':friends,'summaries':[],'matches':[],'champions':raw.get('champions',{})}
    if raw.get('window'):export['window']=raw['window']
    seen=set()
    for game in raw['games']:
        s=game['summary'];key=s['platformId']+':'+str(s['gameId'])
        if key in seen or s.get('queueId')!=440 or not in_window(s,raw.get('window')):continue
        seen.add(key)
        mine=next((p for p in s['participants'] if p.get('puuid')==owner),None)
        if not mine:continue
        export['summaries'].append(s)
        tracked=[p for p in s['participants'] if p['teamId']==mine['teamId'] and p.get('puuid') in allowed]
        if len(tracked)<2:continue
        export['matches'].append({'sgp_summary':s,'sgp_details':read_timeline(key),'trackedPuuids':[p['puuid'] for p in tracked],'selfPuuid':owner,'platformId':s['platformId']})
    return export

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--input',required=True);parser.add_argument('--output',required=True);args=parser.parse_args()
    if Path(args.output).exists():parser.error('Choose a new timestamped private output')
    raw=json.loads(Path(args.input).read_text(encoding='utf-8'));cache=Path(raw['timelineCache'])
    def read_timeline(key):
        if not re.fullmatch(r'[A-Z0-9]+:[0-9]+',key):raise ValueError('Invalid match key')
        path=cache/(key.replace(':','_')+'.json')
        return json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
    result=convert(raw,read_timeline);write(args.output,result)
    print(json.dumps({'selfFlex':len(result['summaries']),'alliedFriendGames':len(result['matches'])}))

if __name__=='__main__':main()
