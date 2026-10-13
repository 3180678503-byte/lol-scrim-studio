"""One bounded post-batch retry of transient failures in a captured friend cohort."""
import argparse,base64,json,os,re,urllib.parse
from concurrent.futures import ThreadPoolExecutor,as_completed
from pathlib import Path
import collect
from collect_flex import write

def main():
    a=argparse.ArgumentParser(description=__doc__);a.add_argument('--input',required=True);a.add_argument('--report',required=True);a.add_argument('--workers',type=int,default=4);args=a.parse_args()
    if not 1<=args.workers<=4:a.error('workers 1..4')
    report_path=Path(args.report);report=json.loads(report_path.read_text(encoding='utf-8'))
    if report.get('phase')!='complete':raise RuntimeError('Wait for the primary collection to finish')
    if report.get('retryAttempted',0):raise RuntimeError('This batch already received its final retry')
    transient={'Connection or JSON error','HTTP 429','HTTP 500','HTTP 502','HTTP 503','HTTP 504'}
    wanted=[f for f in report.get('timelineFailures',[]) if f['error'] in transient]
    if not wanted:print(json.dumps({'pendingTransientFailures':0}));return
    raw=json.loads(Path(args.input).read_text(encoding='utf-8'));valid={i['summary']['platformId']+':'+str(i['summary']['gameId']) for i in raw['games']}
    if any(f['matchKey'] not in valid or not re.fullmatch('[A-Z0-9]+:[0-9]+',f['matchKey']) for f in wanted):raise RuntimeError('Failure outside captured cohort')
    port,pw=collect.credentials();local=collect.opener(True);basic='Basic '+base64.b64encode(('riot:'+pw).encode()).decode()
    def lcu(path):return collect.read(local,'https://127.0.0.1:'+port+path,basic)
    if lcu('/lol-summoner/v1/current-summoner')['puuid']!=raw['self']['puuid']:raise RuntimeError('Logged-in account changed')
    platform=lcu('/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=19')['platformId']
    cfg=json.loads((Path(os.environ['APPDATA'])/'league-akari/AkariConfig/akari-api-main/config/v1/sgp/league-servers.json').read_text(encoding='utf-8'));base=cfg['servers']['TENCENT_'+platform]['matchHistory'];u=urllib.parse.urlparse(base)
    if u.scheme!='https' or not (u.hostname or '').endswith('.lol.qq.com') or u.username or u.password:raise RuntimeError('Unexpected destination')
    bearer='Bearer '+lcu('/entitlements/v1/token')['accessToken'];cache=Path(raw['timelineCache'])
    report.update(phase='retry_timelines',retryAttempted=len(wanted),retryRecovered=0);write(report_path,report)
    def retry(f):
        try:
            result=collect.read(collect.opener(),base.rstrip('/')+'/match-history-query/v1/products/lol/'+f['matchKey'].replace(':','_')+'/DETAILS',bearer);detail=result.get('json',result)
            if detail.get('frames'):write(cache/(f['matchKey'].replace(':','_')+'.json'),collect.strip_secrets(detail));return None
            return dict(f,error='empty')
        except RuntimeError as e:return dict(f,error=str(e))
    remaining=[f for f in report['timelineFailures'] if f not in wanted]
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for future in as_completed([pool.submit(retry,f) for f in wanted]):
            failed=future.result()
            if failed:remaining.append(failed)
            else:report['retryRecovered']+=1;report['timelines']+=1;report['timelineErrors']-=1
            write(report_path,report)
    report.update(phase='complete',timelineFailures=remaining);write(report_path,report);print(json.dumps({k:report[k] for k in ['timelines','timelineErrors','retryAttempted','retryRecovered']}))

if __name__=='__main__':main()
