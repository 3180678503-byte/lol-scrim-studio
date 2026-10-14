import importlib.util,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'skills/lol-scrim-update/scripts'))
from collection_window import parse_window,in_window,before_window
spec=importlib.util.spec_from_file_location('cohort_to_flex',ROOT/'tools/cohort_to_flex.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
daily_spec=importlib.util.spec_from_file_location('run_daily_flex',ROOT/'tools/run_daily_flex.py');daily=importlib.util.module_from_spec(daily_spec);daily_spec.loader.exec_module(daily)

class DailyCollection(unittest.TestCase):
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
