import http.client,importlib.util,shutil,subprocess,sys,tempfile,unittest
from unittest.mock import MagicMock
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'skills/lol-scrim-update/scripts'))
from collection_window import parse_window,in_window,before_window
spec=importlib.util.spec_from_file_location('cohort_to_flex',ROOT/'tools/cohort_to_flex.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
daily_spec=importlib.util.spec_from_file_location('run_daily_flex',ROOT/'tools/run_daily_flex.py');daily=importlib.util.module_from_spec(daily_spec);daily_spec.loader.exec_module(daily)

class DailyCollection(unittest.TestCase):
    def test_truncated_response_is_retryable(self):
        import collect
        client=MagicMock()
        response=client.open.return_value.__enter__.return_value
        response.read.side_effect=http.client.IncompleteRead(b'partial')
        with self.assertRaisesRegex(RuntimeError,'Connection or JSON error'):
            collect.read(client,'https://example.test/history','test')
        with self.assertRaisesRegex(RuntimeError,'Connection or JSON error'):
            client.open.side_effect=http.client.RemoteDisconnected('closed')
            collect.read(client,'https://example.test/history','test')

    def test_isolated_publish_preserves_dirty_source(self):
        git=shutil.which('git')
        if not git:self.skipTest('git unavailable')
        def run(args,label='',cwd=None):
            return subprocess.run([str(a) for a in args],cwd=cwd,check=True,capture_output=True,text=True).stdout.strip()
        with tempfile.TemporaryDirectory() as temp:
            source=Path(temp)/'source';target=Path(temp)/'private-publish'
            source.mkdir();run([git,'init',source])
            for key,value in [('user.name','Test'),('user.email','test@example.test')]:
                run([git,'-C',source,'config',key,value])
            (source/'data.txt').write_text('committed')
            run([git,'-C',source,'add','.']);run([git,'-C',source,'commit','-m','initial'])
            (source/'data.txt').write_text('pending edit')
            (source/'draft.txt').write_text('private draft')
            before=run([git,'-C',source,'status','--porcelain'])
            daily.create_publish_checkout(source,target,git,'https://github.com/example/test.git',run)
            run([git,'-C',target,'checkout','--detach','HEAD'])
            self.assertEqual((target/'data.txt').read_text(),'committed')
            self.assertFalse((target/'draft.txt').exists())
            self.assertEqual(run([git,'-C',target,'status','--porcelain']),'')
            self.assertEqual(run([git,'-C',target,'config','user.name']),'Test')
            self.assertEqual(run([git,'-C',source,'status','--porcelain']),before)
            self.assertEqual((source/'data.txt').read_text(),'pending edit')

    def test_last_completed_business_day(self):
        import datetime as dt
        start,end,window=daily.period_window(now=dt.datetime(2026,10,15,4,0,tzinfo=daily.ZONE))
        self.assertEqual(start.isoformat(),'2026-10-14T04:00:00+08:00')
        self.assertEqual(end.isoformat(),'2026-10-15T04:00:00+08:00')
        self.assertEqual(window['start'],'2026-10-13T04:00:00+08:00')
        start,end,_=daily.period_window(now=dt.datetime(2026,10,15,3,59,tzinfo=daily.ZONE))
        self.assertEqual(start.date().isoformat(),'2026-10-13')
        self.assertEqual(end.date().isoformat(),'2026-10-14')
        _,_,window=daily.period_window(now=dt.datetime(2026,10,15,4,0,tzinfo=daily.ZONE),last_success='2026-10-10')
        self.assertEqual(window['start'],'2026-10-10T04:00:00+08:00')
    def test_boundary_and_paging(self):
        w=parse_window('2026-10-14T04:00:00+08:00','2026-10-15T04:00:00+08:00')
        self.assertTrue(in_window({'gameCreation':w['startMs']},w))
        self.assertFalse(in_window({'gameCreation':w['endMs']},w))
        self.assertFalse(in_window({'gameCreation':w['startMs']-1},w))
        self.assertFalse(before_window([{'gameCreation':w['startMs']},{'gameCreation':w['startMs']-1}],w))
        self.assertTrue(before_window([{'gameCreation':w['startMs']-1}],w))
        self.assertFalse(before_window([{}],w))
        with self.assertRaises(ValueError):parse_window('2026-10-14T04:00:00','2026-10-15T04:00:00')
        with self.assertRaises(ValueError):parse_window('2026-10-14T04:00:00+08:00',None)
    def test_self_allies_only_and_dedup(self):
        def game(gid,rows):return {'summary':{'platformId':'HN1','gameId':gid,'queueId':440,'participants':[{'puuid':uid,'teamId':team} for uid,team in rows]}}
        together=game(1,[('me',100),('friend',100),('stranger',100)])
        enemy=game(2,[('me',100),('friend',200)])
        absent=game(3,[('friend',100)])
        raw={'self':{'puuid':'me'},'targets':[{'puuid':'me'},{'puuid':'friend'}],'collectedAt':'now','games':[together,together,enemy,absent]}
        requested=[]
        result=module.convert(raw,lambda key:requested.append(key) or {'frames':[]})
        self.assertEqual(len(result['summaries']),2)
        self.assertEqual(len(result['matches']),1)
        self.assertEqual(result['matches'][0]['trackedPuuids'],['me','friend'])
        self.assertEqual(requested,['HN1:1'])

if __name__=='__main__':unittest.main()
