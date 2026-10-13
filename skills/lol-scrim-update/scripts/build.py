"""Validate public payload, write data.js and optionally a fully offline HTML."""
import argparse, base64, json, re, urllib.request
from pathlib import Path

DENIED = {'puuid','accountid','summonerid','accesstoken','refreshtoken','token','jwt','mucjwtdto','authorization','password','remoting-auth-token','participantidentities'}

def check(value):
    if isinstance(value, dict):
        if any(k.lower() in DENIED for k in value):
            raise ValueError('Private field present in public data')
        for v in value.values(): check(v)
    elif isinstance(value, list):
        for v in value: check(v)
    elif isinstance(value, str) and re.search(r'eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.', value):
        raise ValueError('Possible JWT in public data')

def main():
    a=argparse.ArgumentParser(description=__doc__);a.add_argument('--site',required=True);a.add_argument('--html');a.add_argument('--download-icons',action='store_true');a.add_argument('--resource-root');args=a.parse_args()
    site=Path(args.site); data=json.loads((site/'data.json').read_text(encoding='utf-8'))
    resources=Path(args.resource_root) if args.resource_root else site
    check(data)
    keys=[m['matchKey'] for m in data['matches']]
    numbers=[m['number'] for m in data['matches']]
    if len(keys)!=len(set(keys)) or len(numbers)!=len(set(numbers)) or not keys:
        raise ValueError('Duplicate or empty matches')
    for m in data['matches']:
        if data.get('datasetType')=='friends-flex':
            if not 1<=len(m['players'])<=10 or len({p['key'] for p in m['players']})!=len(m['players']) or sum(p.get('isSelf',False) for p in m['players'])>1 or any(p['key'] not in {c['key'] for c in data['cohort']} for p in m['players']) or m.get('queueId')!=440:
                raise ValueError('Invalid cohort-only flex game')
            for p in m['players']:
                team=next(t for t in m['teams'] if t['id']==p['team'])
                if p['win']!=team['win'] or p['teamKills']!=team['kills']:raise ValueError('Player team context mismatch')
        elif data.get('datasetType')=='flex':
            if not 2<=len(m['players'])<=5 or len({p['key'] for p in m['players']})!=len(m['players']) or sum(p.get('isSelf',False) for p in m['players'])!=1 or any(p['team']!=m['allyTeam'] for p in m['players']) or m.get('queueId')!=440:
                raise ValueError('Invalid allied friend-only flex game')
        elif len(m['players'])!=10 or len({p['key'] for p in m['players']})!=10:
            raise ValueError('Expected ten uniquely named participants')
        for t in m['teams']:
            kills=sum(p['kills'] for p in m['players'] if p['team']==t['id'])
            if t['kills']<kills or data.get('datasetType') not in ['flex','friends-flex'] and t['kills']!=kills:
                raise ValueError('Team kill totals mismatch')
    def js(value):
        return 'window.SCRIM_DATA='+json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False).replace('<','\\u003c').replace('\u2028','\\u2028').replace('\u2029','\\u2029')+';'
    (site/'data.js').write_text(js(data),encoding='utf-8')
    missing=[]
    for cid in data['champions']:
        if not str(cid).isdigit():
            raise ValueError('Invalid champion id')
        asset=resources/'assets'/('champion-'+cid+'.png')
        if not asset.exists() and args.download_icons:
            alias=data['champions'][cid].get('alias','')
            urls=['https://game.gtimg.cn/images/lol/act/img/champion/'+alias+'.png'] if re.fullmatch('[A-Za-z0-9]+',alias) else []
            urls.append('https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/'+cid+'.png')
            for url in urls:
                try:
                    with urllib.request.urlopen(url,timeout=15) as response:
                        content=response.read(2000000)
                    if not content.startswith(b'\x89PNG\r\n\x1a\n'):raise ValueError('Unexpected image content')
                    asset.parent.mkdir(parents=True,exist_ok=True);asset.write_bytes(content);break
                except (OSError,ValueError):pass
        if not asset.exists(): missing.append(cid)
    if args.html:
        portable=dict(data)
        portable['iconData']={cid:'data:image/png;base64,'+base64.b64encode((resources/'assets'/('champion-'+cid+'.png')).read_bytes()).decode() for cid in data['champions'] if cid not in missing}
        html=(site/'index.html').read_text(encoding='utf-8')
        html=re.sub(r'<link rel="stylesheet" href="([^"]+)">',lambda m:'<style>'+(site/m[1]).read_text(encoding='utf-8')+'</style>',html)
        html=html.replace('<script src="data.js"></script>','<script>'+js(portable)+'</script>')
        html=re.sub(r'<script src="([^"]+)"></script>',lambda m:'<script>'+(site/m[1]).read_text(encoding='utf-8').replace('</script','<\\/script')+'</script>',html)
        target=Path(args.html);target.parent.mkdir(parents=True,exist_ok=True);target.write_text(html,encoding='utf-8')
    print(json.dumps({'matches':len(keys),'missingChampionIcons':missing,'offlineHtml':bool(args.html)}))

if __name__=='__main__': main()
