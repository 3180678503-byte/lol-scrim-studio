"""Bounded WeGame-only startup and graceful cleanup of this run's client."""
import base64,json,os,subprocess,time,urllib.request,threading
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'skills/lol-scrim-update/scripts'))
import collect

CLIENTS={'leagueclient.exe','leagueclientux.exe'}

class WindowsBackend:
    def __init__(self,lockfile,wegame):
        self.lockfile=Path(lockfile);self.wegame=Path(wegame)
        self.local=collect.opener(True)
    def processes(self):
        command="[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,@{n='Birth';e={$_.CreationDate.ToUniversalTime().ToString('o')}} | ConvertTo-Json -Compress"
        result=subprocess.run(['powershell.exe','-NoProfile','-Command',command],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=30,creationflags=subprocess.CREATE_NO_WINDOW)
        if result.returncode:raise RuntimeError('Cannot inspect client ownership')
        rows=json.loads(result.stdout.lstrip('\ufeff'));return {r['ProcessId']:{'pid':r['ProcessId'],'parent':r['ParentProcessId'],'name':r['Name'].lower(),'birth':r['Birth']} for r in rows}
    def connection(self):
        pid,port,token=collect.connection_credentials(str(self.lockfile))
        process=self.processes().get(pid)
        if not process or process['name']!='leagueclient.exe':raise RuntimeError('Stale client lockfile')
        return process,port,'Basic '+base64.b64encode(('riot:'+token).encode()).decode()
    def probe(self,expected):
        process,port,auth=self.connection()
        def get(path):return collect.read(self.local,'https://127.0.0.1:'+port+path,auth)
        player=get('/lol-summoner/v1/current-summoner')
        if not player.get('puuid'):raise RuntimeError('Waiting for WeGame login')
        if player['puuid']!=expected:raise RuntimeError('Logged-in account differs from the confirmed roster')
        if not get('/entitlements/v1/token').get('accessToken'):raise RuntimeError('Waiting for server authentication')
        if not isinstance(get('/lol-chat/v1/friends'),list):raise RuntimeError('Waiting for friend list')
        return {**process,'phase':get('/lol-gameflow/v1/gameflow-phase')}
    def launch(self):
        if self.wegame.name.lower()!='wegame.exe' or not self.wegame.is_file():raise RuntimeError('Configure the official WeGame executable; independent launchers are not allowed')
        env=os.environ.copy();env['SCRIM_WEGAME_PATH']=str(self.wegame)
        command="Start-Process -FilePath $env:SCRIM_WEGAME_PATH -ArgumentList 'wegame://action=StartFor&game_id=26' -WindowStyle Hidden"
        result=subprocess.run(['powershell.exe','-NoProfile','-Command',command],env=env,capture_output=True,timeout=30,creationflags=subprocess.CREATE_NO_WINDOW)
        if result.returncode:raise RuntimeError('WeGame startup failed')
        last='Waiting for signed-in WeGame'
        for _ in range(24):
            time.sleep(3);rows=self.processes()
            if any(p['name'] in CLIENTS for p in rows.values()):return {'method':'WeGame startup'}
            wegame=[p for p in rows.values() if p['name']=='wegame.exe']
            if len(wegame)!=1:continue
            # Run desktop APIs in a fresh process to attach to the active desktop.
            result=subprocess.run([sys.executable,str(Path(__file__).with_name('wegame_ui.py')),'--wegame-pid',str(wegame[0]['pid'])],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=30,creationflags=subprocess.CREATE_NO_WINDOW)
            if not result.returncode:return json.loads(result.stdout)
            last=result.stdout.strip() or result.stderr.strip() or 'WeGame launch control unavailable'
            if 'locked' in last or 'administrator level' in last:break
        raise RuntimeError(last)
    def quit(self,pid,birth,expected):
        state=self.probe(expected)
        if state['pid']!=pid or state['birth']!=birth:raise RuntimeError('Client instance changed before quit')
        if state['phase']!='None':raise RuntimeError('Client became active before quit')
        process,port,auth=self.connection()
        if process['pid']!=pid or process['birth']!=birth:raise RuntimeError('Client instance changed before quit')
        request=urllib.request.Request('https://127.0.0.1:'+port+'/process-control/v1/process/quit',headers={'Authorization':auth},method='POST',data=b'')
        with self.local.open(request,timeout=10) as response:response.read()
    def get_phase(self):
        _,port,auth=self.connection()
        return collect.read(self.local,'https://127.0.0.1:'+port+'/lol-gameflow/v1/gameflow-phase',auth)
    def force_close(self,pid,birth,expected,allow_active=False):
        rows=self.processes();process=rows.get(pid)
        if not process or process['birth']!=birth or process['name']!='leagueclient.exe':
            raise RuntimeError('Client changed before forced close')
        try:state=self.probe(expected)
        except (RuntimeError,OSError,ValueError) as error:
            if not allow_active or 'differs from' in str(error):raise
            state={'pid':pid,'birth':birth,'phase':'unavailable'}
        if state['pid']!=pid or state['birth']!=birth or (not allow_active and state['phase']!='None'):raise RuntimeError('Client changed before forced close')
        if not allow_active and any(p['name']=='league of legends.exe' for p in rows.values()):raise RuntimeError('An actual game is running')
        # The same End Task operation as Task Manager, restricted to this PID tree.
        result=subprocess.run(['taskkill.exe','/PID',str(pid),'/T','/F'],capture_output=True,timeout=15,creationflags=subprocess.CREATE_NO_WINDOW)
        if result.returncode and pid in self.processes():raise RuntimeError('Owned client could not be ended')
    def close_notice(self,seconds):
        result=subprocess.run([sys.executable,str(Path(__file__).with_name('client_close_prompt.py')),'--seconds',str(seconds)],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=seconds+15,creationflags=subprocess.CREATE_NO_WINDOW)
        if result.returncode:raise RuntimeError('Close notice unavailable; keep the client open')
        return json.loads(result.stdout)['decision']
    def sleep(self,seconds):time.sleep(seconds)
    def clock(self):return time.monotonic()

class ClientSession:
    def __init__(self,backend,expected,timeout=300,close_owned=True,notice_seconds=None):
        self.backend=backend;self.expected=expected;self.timeout=timeout;self.close_owned=close_owned
        self.owned=None;self.events=[];self.initial=set();self.active_seen=False;self.finished=False
        self.stop_monitor=threading.Event();self.monitor=None
        self.notice_seconds=notice_seconds;self.managed=None
    def open(self):
        before=self.backend.processes();self.initial=set(before)
        self.preexisting=any(p['name'] in CLIENTS for p in before.values())
        self.events.append({'action':'reuse-existing' if self.preexisting else 'launch-wegame'})
        if not self.preexisting:self.events.append(self.backend.launch())
        deadline=self.backend.clock()+self.timeout;last='Waiting for League client login'
        while self.backend.clock()<deadline:
            try:
                state=self.backend.probe(self.expected)
                self.managed=(state['pid'],state['birth'])
                if not self.preexisting and state['pid'] not in self.initial:self.owned=(state['pid'],state['birth'])
                self.observe(state['phase']);self.events.append({'action':'ready','owned':bool(self.owned),'phase':state['phase']})
                if self.owned and self.notice_seconds is None and hasattr(self.backend,'get_phase'):
                    self.monitor=threading.Thread(target=self.watch_activity,daemon=True);self.monitor.start()
                return state
            except (RuntimeError,OSError,ValueError) as e:
                last=str(e)
                if 'differs from' in last:raise RuntimeError(last) from None
            self.backend.sleep(3)
        raise RuntimeError('WeGame login not ready after '+str(self.timeout)+' seconds: '+last)
    def observe(self,phase):
        if phase!='None':self.active_seen=True
    def watch_activity(self):
        while not self.stop_monitor.wait(5):
            try:self.observe(self.backend.get_phase())
            except (RuntimeError,OSError,ValueError):self.active_seen=True
    def close(self):
        if self.finished:return
        self.finished=True
        self.stop_monitor.set()
        if self.monitor:
            self.monitor.join(timeout=20)
            if self.monitor.is_alive():self.active_seen=True
        if self.managed and self.close_owned and self.notice_seconds is not None:
            pid,birth=self.managed
            try:
                process=self.backend.processes().get(pid)
                if not process or process['birth']!=birth:self.events.append({'action':'already-exited-or-replaced'});return
                self.events.append({'action':'close-notice','seconds':self.notice_seconds})
                decision=self.backend.close_notice(self.notice_seconds)
                self.events.append({'action':'close-notice-result','decision':decision})
                if decision=='cancel':self.events.append({'action':'kept-by-user'});return
                if decision not in ['close','timeout']:raise RuntimeError('Unknown close notice response')
                self.backend.force_close(pid,birth,self.expected,allow_active=True)
                self.events.append({'action':'ended-notified-client','owned':bool(self.owned),'method':'Task Manager End Task equivalent'})
            except (RuntimeError,OSError,ValueError):self.events.append({'action':'keep-client-notice-or-close-failed'})
            return
        if not self.owned or not self.close_owned:
            self.events.append({'action':'keep-existing' if not self.owned else 'keep-client'});return
        pid,birth=self.owned
        try:
            rows=self.backend.processes();process=rows.get(pid)
            if not process or process['birth']!=birth:self.events.append({'action':'already-exited-or-replaced'});return
            state=self.backend.probe(self.expected);self.observe(state['phase'])
            if state['pid']!=pid or state['birth']!=birth or self.active_seen or any(p['name']=='league of legends.exe' for p in rows.values()):
                self.events.append({'action':'keep-active-client','phase':state['phase']});return
            self.backend.quit(pid,birth,self.expected)
            for _ in range(10):
                if pid not in self.backend.processes():self.events.append({'action':'closed-owned-client'});return
                self.backend.sleep(2)
            state=self.backend.probe(self.expected);self.observe(state['phase'])
            if self.active_seen:self.events.append({'action':'keep-active-client','phase':state['phase']});return
            self.backend.force_close(pid,birth,self.expected)
            self.events.append({'action':'ended-owned-client','method':'Task Manager End Task equivalent'})
        except (RuntimeError,OSError,ValueError):self.events.append({'action':'keep-client-cleanup-unverified'})
