"""Collect a four-AM flex day, validate in staging, then publish public artifacts."""
import argparse,base64,datetime as dt,hashlib,json,os,shutil,subprocess,sys,tempfile,urllib.parse,urllib.request
from pathlib import Path

ZONE=dt.timezone(dt.timedelta(hours=8))
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
sys.path.insert(0,str(ROOT/'skills/lol-scrim-update/scripts'))
from collection_window import parse_window,in_window
from collect_flex import write
from league_client_session import ClientSession,WindowsBackend

def period_window(day=None,now=None,last_success=None):
    now=now or dt.datetime.now(ZONE)
    if day:
        start=dt.datetime.combine(dt.date.fromisoformat(day),dt.time(4),ZONE)
        end=start+dt.timedelta(days=1)
    else:
        end=now.astimezone(ZONE).replace(hour=4,minute=0,second=0,microsecond=0)
        if end>now:end-=dt.timedelta(days=1)
        start=end-dt.timedelta(days=1)
    collect_from=start-dt.timedelta(days=1)
    if last_success:
        previous=dt.datetime.combine(dt.date.fromisoformat(last_success),dt.time(4),ZONE)
        collect_from=min(collect_from,previous)
    return start,end,parse_window(collect_from.isoformat(),end.isoformat())

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--site',default=str(ROOT));p.add_argument('--private-root',required=True);p.add_argument('--roster')
    p.add_argument('--node',default=shutil.which('node'));p.add_argument('--git',default=shutil.which('git'));p.add_argument('--gh',default=shutil.which('gh'))
    p.add_argument('--day');p.add_argument('--dry-run',action='store_true');p.add_argument('--prepare-only',action='store_true');p.add_argument('--input');p.add_argument('--publish',action='store_true')
    p.add_argument('--auto-launch',action='store_true');p.add_argument('--wegame');p.add_argument('--league-lockfile',default=os.environ.get('LEAGUE_LOCKFILE_PATH'))
    p.add_argument('--client-wait-seconds',type=int,default=300);p.add_argument('--keep-client',action='store_true')
    p.add_argument('--close-after-notice',action='store_true');p.add_argument('--close-notice-seconds',type=int,default=120)
    args=p.parse_args()
    if args.input and args.publish:p.error('Fixture imports cannot publish')
    if args.prepare_only and args.publish:p.error('prepare-only cannot publish')
    if args.auto_launch and args.input:p.error('Fixture imports cannot launch a client')
    if args.auto_launch and (not args.wegame or not args.league_lockfile):p.error('auto-launch requires WeGame executable and League lockfile paths')
    if not 15<=args.client_wait_seconds<=600:p.error('client-wait-seconds must be 15..600')
    if not 1<=args.close_notice_seconds<=600:p.error('close-notice-seconds must be 1..600')
    if args.close_after_notice and not args.auto_launch:p.error('close-after-notice requires client lifecycle management via auto-launch')
    site=Path(args.site).resolve();private=Path(args.private_root).resolve();roster=Path(args.roster).resolve() if args.roster else private/'friend-roster-current.json'
    if private==site or site in private.parents:p.error('Private output must be outside the public repository')
    state_file=private/'daily/state.json'
    previous=json.loads(state_file.read_text(encoding='utf-8')).get('lastSuccessfulDay') if state_file.exists() and not args.input else None
    start,end,window=period_window(args.day,last_success=previous);day=start.date().isoformat()
    plan={'day':day,'start':start.isoformat(),'end':end.isoformat(),'collectFrom':window['start'],'collectUntil':window['end'],'site':str(site),'roster':str(roster),'publish':args.publish,'catchUpDays':1}
    plan.update(autoLaunchWeGame=args.auto_launch,closeOwnedClient=not args.keep_client,clientWaitSeconds=args.client_wait_seconds)
    plan.update(closeAfterNotice=args.close_after_notice,closeNoticeSeconds=args.close_notice_seconds)
    if args.dry_run:
        plan['rosterAccounts']=len(json.loads(roster.read_text(encoding='utf-8'))['selected'])+1
        print(json.dumps(plan,ensure_ascii=False));return
    if not args.node or not Path(args.node).exists():raise RuntimeError('Node runtime unavailable')
    if not roster.exists():raise RuntimeError('Confirmed private roster unavailable')
    daily=private/'daily';daily.mkdir(parents=True,exist_ok=True)
    # Use a Windows byte lock as well as the scheduler's IgnoreNew setting.
    lock=(daily/'run.lock').open('a+b');lock.seek(0);lock.write(b'0');lock.flush();lock.seek(0)
    if os.name=='nt':
        import msvcrt
        try:msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
        except OSError:raise RuntimeError('Another daily sync is already running') from None
    run_id=day+'-'+dt.datetime.now(ZONE).strftime('%Y%m%dT%H%M%S%f')
    run_dir=daily/run_id;run_dir.mkdir(exist_ok=False)
    record={**plan,'runId':run_id,'status':'running','steps':[]};write(run_dir/'result.json',record)
    auth_env=os.environ.copy();secret_values=[];session=None
    if args.league_lockfile:auth_env['LEAGUE_LOCKFILE_PATH']=args.league_lockfile
    def run(command,label,cwd=site,timeout=1200):
        result=subprocess.run([str(x) for x in command],cwd=cwd,env=auth_env,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=timeout,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        output=(result.stdout+'\n'+result.stderr).strip()
        for value in secret_values:output=output.replace(value,'[redacted]')
        with (run_dir/'steps.log').open('a',encoding='utf-8') as log:log.write(label+'\n'+output+'\n')
        record['steps'].append({'step':label,'exitCode':result.returncode});write(run_dir/'result.json',record)
        if result.returncode:raise RuntimeError(label+' failed; inspect private steps.log')
        return result.stdout.strip()
    def git(*arguments):return run([args.git,'-C',site,*arguments],'git '+arguments[0])
    try:
        if args.publish:
            if not args.git or not args.gh:raise RuntimeError('Git or GitHub CLI unavailable')
            if git('status','--porcelain'):raise RuntimeError('Working tree has uncommitted changes; preserve them and retry after review')
            remote=git('remote','get-url','origin');parsed=urllib.parse.urlparse(remote)
            if parsed.scheme!='https' or parsed.hostname!='github.com' or parsed.username or parsed.password:raise RuntimeError('Expected a plain GitHub HTTPS remote')
            token_result=subprocess.run([args.gh,'auth','token','--hostname','github.com'],capture_output=True,text=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            if token_result.returncode:raise RuntimeError('GitHub CLI authorization unavailable')
            token=token_result.stdout.strip();header='AUTHORIZATION: basic '+base64.b64encode(('x-access-token:'+token).encode()).decode()
            secret_values=[token,header];auth_env.update(SCRIM_DAILY_AUTH_HEADER=header,GIT_TERMINAL_PROMPT='0',GH_TOKEN=token)
            def git_network(*arguments):return git('-c','credential.helper=','--config-env=http.'+remote+'.extraHeader=SCRIM_DAILY_AUTH_HEADER',*arguments)
            if git('branch','--show-current')!='main':raise RuntimeError('Daily publishing requires the main branch')
            git_network('pull','--ff-only','origin','main')
            base_head=git('rev-parse','HEAD')
        scripts=site/'skills/lol-scrim-update/scripts'
        capture=run_dir/'cohort.json';report=run_dir/'collection-report.json'
        if args.input:
            raw=json.loads(Path(args.input).read_text(encoding='utf-8'));raw['window']=window
            raw['games']=[g for g in raw['games'] if in_window(g['summary'],window)]
            write(capture,raw)
            accounts=[{'name':t.get('gameName',t.get('displayName','')),'count':sum(t['puuid'] in g.get('sources',[]) for g in raw['games']),'stopReason':'fixture','error':None} for t in raw['targets']]
            count=sum(a['count'] for a in accounts)
            write(report,{'completedAccounts':len(accounts),'requestedFriends':len(accounts)-1,'maxPerAccount':1000,'rawAccountMatches':count,'duplicateMatches':max(0,count-len(raw['games'])),'accounts':accounts,'window':window})
        else:
            if args.auto_launch:
                expected=json.loads(roster.read_text(encoding='utf-8'))['self']['puuid']
                session=ClientSession(WindowsBackend(args.league_lockfile,args.wegame),expected,args.client_wait_seconds,not args.keep_client,args.close_notice_seconds if args.close_after_notice else None)
                record['clientSession']=session.events;write(run_dir/'result.json',record)
                session.open()
            try:
                run([sys.executable,scripts/'collect_friends_flex.py','--roster',roster,'--output',capture,'--report',report,'--timeline-cache',private/'cohort-timelines','--since',window['start'],'--until',window['end'],'--max-per-account','1000','--workers','4'],'collect current flex window')
            finally:
                if session:session.close();write(run_dir/'result.json',record)
        raw=json.loads(capture.read_text(encoding='utf-8'));collection=json.loads(report.read_text(encoding='utf-8'))
        expected=len(raw['targets']);accounts=collection.get('accounts',[])
        if collection.get('phase') not in ['complete',None] or len(accounts)!=expected or any(a.get('error') or a.get('stopReason') in ['max_games','error'] for a in accounts):raise RuntimeError('Account histories are incomplete; do not publish this run')
        if any(not in_window(g['summary'],window) for g in raw['games']):raise RuntimeError('Out-of-window game in the private capture')
        record.update(queriedAccounts=expected,collectedGames=len(raw['games']),timelineErrors=collection.get('timelineErrors',0))
        flex_raw=run_dir/'flex.json';run([sys.executable,site/'tools/cohort_to_flex.py','--input',capture,'--output',flex_raw],'reuse cohort for allied flex')
        before={folder:json.loads((site/folder/'data.json').read_text(encoding='utf-8')) for folder in ['friends','flex']}
        with tempfile.TemporaryDirectory(prefix='stage-',dir=run_dir) as temp:
            stage=Path(temp)/'site'
            shutil.copytree(site,stage,ignore=shutil.ignore_patterns('.git','.wrangler','node_modules','__pycache__','*.pyc','.env*','wrangler.deploy.jsonc'))
            staged_scripts=stage/'skills/lol-scrim-update/scripts'
            if raw['games']:run([sys.executable,staged_scripts/'merge_friends_flex.py','--site',stage/'friends','--input',capture,'--report',report],'merge friends',cwd=stage)
            if json.loads(flex_raw.read_text(encoding='utf-8'))['matches']:run([sys.executable,staged_scripts/'merge_flex.py','--site',stage/'flex','--input',flex_raw,'--scrim-site',stage],'merge allied flex',cwd=stage)
            for folder in ['friends','flex']:
                after=json.loads((stage/folder/'data.json').read_text(encoding='utf-8'))
                old_keys={m['matchKey'] for m in before[folder]['matches']};new_keys={m['matchKey'] for m in after['matches']}
                if not old_keys<=new_keys:raise RuntimeError('Incremental import removed existing games')
                old_numbers={m['matchKey']:m['number'] for m in before[folder]['matches']}
                if any(m['matchKey'] in old_numbers and m['number']!=old_numbers[m['matchKey']] for m in after['matches']):raise RuntimeError('Stable match numbers changed')
                record[folder]={'added':len(new_keys-old_keys),'total':len(new_keys)}
                if raw['games']:run([sys.executable,staged_scripts/'review_flex.py','--site',stage/folder],'review '+folder,cwd=stage)
            run([args.node,stage/'tools/build-community-manifest.cjs'],'update rating catalog',cwd=stage)
            run([args.node,stage/'tools/export-flex-reports.cjs'],'update daily and weekly reports',cwd=stage)
            for folder in ['','friends','flex']:
                run([sys.executable,staged_scripts/'build.py','--site',stage/folder,'--resource-root',stage,'--download-icons'],'validate and build '+(folder or 'scrim'),cwd=stage)
            if (site/'data.json').read_bytes()!=(stage/'data.json').read_bytes():raise RuntimeError('Scrim history changed during flex update')
            paths=[Path(f) for f in ['friends/data.json','friends/data.js','flex/data.json','flex/data.js','community-meta.js','backend/manifest.json']]
            for folder in ['friends/reports','flex/reports','assets']:
                paths.extend(p.relative_to(stage) for p in (stage/folder).rglob('*') if p.is_file())
            changed=[rel for rel in paths if not (site/rel).exists() or hashlib.sha256((site/rel).read_bytes()).digest()!=hashlib.sha256((stage/rel).read_bytes()).digest()]
            record['changedFiles']=len(changed)
            if args.publish and (git('status','--porcelain') or git('rev-parse','HEAD')!=base_head):raise RuntimeError('Repository changed during collection; preserve current edits and retry after review')
            if not args.prepare_only:
                for rel in changed:(site/rel).parent.mkdir(parents=True,exist_ok=True);shutil.copy2(stage/rel,site/rel)
            if args.publish and changed:
                # All historical reports are regenerated together. Their file
                # list can exceed Windows' command-line limit, so Git reads
                # the exact UTF-8, NUL-delimited paths from a private file.
                pathspec=run_dir/'publish-paths.nul'
                pathspec.write_bytes(b''.join(str(rel).replace('\\','/').encode('utf-8')+b'\0' for rel in changed))
                git('add','--pathspec-from-file='+str(pathspec),'--pathspec-file-nul')
                git('diff','--cached','--check')
                git('commit','-m','Update friends flex day '+day)
                # Rebase only this validated commit if a collaborator pushed meanwhile.
                git_network('fetch','origin','main');git('rebase','origin/main');git_network('push','origin','main')
                commit=git('rev-parse','HEAD');record['commit']=commit
                repo=remote.removesuffix('.git').removeprefix('https://github.com/')
                import time
                built=False
                for attempt in range(12):
                    response=run([args.gh,'api','repos/'+repo+'/pages/builds/latest','--jq','{status,commit,error:.error.message}'],'check Pages build',timeout=60)
                    build=json.loads(response)
                    if build.get('commit')==commit and build.get('status')=='built':built=True;break
                    if build.get('commit')==commit and build.get('status')=='errored':raise RuntimeError('GitHub Pages build failed')
                    time.sleep(10)
                if not built:raise RuntimeError('Pages build not confirmed within two minutes')
                owner,project=repo.split('/');base='https://'+owner+'.github.io/'+project+'/'
                for folder in ['friends/','flex/']:
                    request=urllib.request.Request(base+folder+'?daily='+commit,headers={'User-Agent':'Mozilla/5.0'})
                    with urllib.request.urlopen(request,timeout=30) as response:
                        if response.status!=200:raise RuntimeError('Public website verification failed')
                    request=urllib.request.Request(base+folder+'data.json?daily='+commit,headers={'User-Agent':'Mozilla/5.0'})
                    with urllib.request.urlopen(request,timeout=30) as response:public=json.load(response)
                    expected_keys={m['matchKey'] for m in json.loads((stage/folder/'data.json').read_text(encoding='utf-8'))['matches']}
                    public_keys={m['matchKey'] for m in public['matches']}
                    if not expected_keys<=public_keys or len(public_keys)!=len(public['matches']):raise RuntimeError('Published data is incomplete or duplicated')
                record['website']=base+'friends/'
            record['status']='prepared' if args.prepare_only else 'published' if args.publish and changed else 'no-public-changes' if args.publish else 'updated-locally'
        write(run_dir/'result.json',record);write(daily/'latest-result.json',record)
        if args.publish:write(daily/'state.json',{'lastSuccessfulDay':day,'lastSuccessfulRun':run_id,'updatedAt':dt.datetime.now(ZONE).isoformat()})
        print(json.dumps(record,ensure_ascii=False))
    except Exception as e:
        record.update(status='failed',error=str(e));write(run_dir/'result.json',record);write(daily/'latest-result.json',record)
        raise RuntimeError(str(e)) from None
    finally:
        if session:
            session.close();write(run_dir/'result.json',record);write(daily/'latest-result.json',record)
        lock.close()

if __name__=='__main__':
    try:main()
    except (RuntimeError,OSError,ValueError) as e:raise SystemExit(str(e))
