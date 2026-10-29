"""Publish a small startup dataset and load full match evidence on demand."""
import copy
import hashlib
import json
import re

def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)

def write_public_assets(site, data, javascript):
    if data.get('datasetType') not in ['flex', 'friends-flex']:
        (site/'data.js').write_text(javascript(data), encoding='utf-8')
        return
    startup=copy.deepcopy(data)
    details=site/'matches'
    details.mkdir(exist_ok=True)
    for full,small in zip(data['matches'],startup['matches']):
        name=re.sub(r'[^A-Za-z0-9_-]', '-', full['matchKey'])+'.json'
        content=encode({'schemaVersion':1,'match':full})
        digest=hashlib.sha256(content.encode('utf-8')).hexdigest()[:12]
        (details/name).write_text(content,encoding='utf-8')
        small['detailUrl']='matches/'+name+'?v='+digest
        small['timelineAvailable']=bool(full.get('frames'))
        small['events']=[]
        small['frames']=[]
        small.pop('sourcePlayers',None)
        if small.get('reviewTimeline'):
            small['reviewTimeline']={'coverage':small['reviewTimeline'].get('coverage'), 'events':[]}
        small.pop('performanceAwards',None)
        for player in small['players']:
            player.pop('scoreMetrics',None)
            player.pop('reviewPhases',None)
            performance=player.get('performance')
            if performance:
                performance['axes']=[{'score':a['score'],'n':a['n']} for a in performance['axes']]
                performance['compact']=True
    startup['delivery']={'version':'match-details-v1','mode':'summary-first','fullData':'data.json'}
    script=javascript(startup)
    # data.js remains a small compatibility entry for cached HTML and existing tools.
    for filename in ['data.js','overview-data.js']:
        (site/filename).write_text(script,encoding='utf-8')
    manifest={'schemaVersion':1,'dataset':data['datasetType'],'matches':len(data['matches']),
              'matchKeys':[m['matchKey'] for m in data['matches']],
              'latestStartedAt':max(m['createdAt'] for m in data['matches']),
              'scoringVersion':data.get('scoring',{}).get('version'),
              'baselineVersion':data.get('scoring',{}).get('baselineVersion')}
    (site/'data-manifest.json').write_text(encode(manifest),encoding='utf-8')
