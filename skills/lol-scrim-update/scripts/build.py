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
    a=argparse.ArgumentParser(description=__doc__);a.add_argument('--site',required=True);a.add_argument('--html');a.add_argument('--download-icons',action='store_true');args=a.parse_args()
    site=Path(args.site); data=json.loads((site/'data.json').read_text(encoding='utf-8'))
    check(data)
    keys=[m['matchKey'] for m in data['matches']]
    numbers=[m['number'] for m in data['matches']]
    if len(keys)!=len(set(keys)) or len(numbers)!=len(set(numbers)) or not keys:
        raise ValueError('Duplicate or empty matches')
    for m in data['matches']:
        if len(m['players'])!=10 or len({p['key'] for p in m['players']})!=10:
            raise ValueError('Expected ten uniquely named participants')
        for t in m['teams']:
            if t['kills']!=sum(p['kills'] for p in m['players'] if p['team']==t['id']):
                raise ValueError('Team kill totals mismatch')
    def js(value):
        return 'window.SCRIM_DATA='+json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False).replace('<','\\u003c').replace('\u2028','\\u2028').replace('\u2029','\\u2029')+';'
    (site/'data.js').write_text(js(data),encoding='utf-8')
    missing=[]
    for cid in data['champions']:
        if not str(cid).isdigit():
            raise ValueError('Invalid champion id')
        asset=site/'assets'/('champion-'+cid+'.png')
        if not asset.exists() and args.download_icons:
            try:
                with urllib.request.urlopen('https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/'+cid+'.png',timeout=15) as response:
                    content=response.read(2000000)
                if not content.startswith(b'\x89PNG\r\n\x1a\n'):
                    raise ValueError('Unexpected image content')
                asset.parent.mkdir(parents=True,exist_ok=True);asset.write_bytes(content)
            except (OSError,ValueError):
                pass
        if not (site/'assets'/('champion-'+cid+'.png')).exists(): missing.append(cid)
    if args.html:
        portable=dict(data)
        portable['iconData']={cid:'data:image/png;base64,'+base64.b64encode((site/'assets'/('champion-'+cid+'.png')).read_bytes()).decode() for cid in data['champions'] if cid not in missing}
        html=(site/'index.html').read_text(encoding='utf-8')
        for name in ['styles.css','awards.css','extension.css']:
            tag='<link rel="stylesheet" href="'+name+'">'
            if tag in html:
                html=html.replace(tag,'<style>'+(site/name).read_text(encoding='utf-8')+'</style>')
        html=html.replace('<script src="data.js"></script>','<script>'+js(portable)+'</script>')
        html=html.replace('<script src="app.js"></script>','<script>'+(site/'app.js').read_text(encoding='utf-8').replace('</script','<\\/script')+'</script>')
        target=Path(args.html);target.parent.mkdir(parents=True,exist_ok=True);target.write_text(html,encoding='utf-8')
    print(json.dumps({'matches':len(keys),'missingChampionIcons':missing,'offlineHtml':bool(args.html)}))

if __name__=='__main__': main()
