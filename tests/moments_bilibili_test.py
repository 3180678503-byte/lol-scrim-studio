import importlib.util
import json
import pathlib
import tempfile
import time
import unittest

spec = importlib.util.spec_from_file_location('uploader', pathlib.Path(__file__).parents[1] / 'tools' / 'moments_bilibili.py')
u = importlib.util.module_from_spec(spec)
spec.loader.exec_module(u)
ID = '11111111-1111-4111-8111-111111111111'
BV = 'BV1xx411c7mD'


class API:
    def __init__(self):
        self.calls = []
    def request(self, path, payload=None, target=None, lease=None):
        self.calls.append((path, payload))
        if target:
            pathlib.Path(target).write_bytes(b'\x00\x00\x00\x20ftyp' + b'0' * 24)
            return 32
        return {'ok': True}


class Checks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)
        self.cookie = self.root / 'cookies.json'
        u.save_json(self.cookie, {'token_info': {'mid': 123}, 'cookie_info': {'cookies': []}})
        self.cfg = {'privateRoot': str(self.root), 'cookiePath': str(self.cookie), 'biliupPath': 'biliup.exe', 'retainDays': 7}
        self.api = API()
        self.job = {'id': ID, 'size': 32, 'title': '" & $(secret) <script>', 'description': '测试', 'leaseToken': 'private'}
    def tearDown(self):
        self.temp.cleanup()
    def runner(self, result=(0, '{"code":0,"data":{"bvid":"' + BV + '"}}')):
        return u.Runner(self.cfg, api=self.api, execute=lambda command: result)
    def test_submit_receipt_and_no_duplicate(self):
        r = self.runner()
        r.submit_one(self.job)
        record = u.read_json(r.record_path(ID))
        self.assertEqual(record['bvid'], BV)
        self.assertEqual(len(record['sha256']), 64)
        self.assertTrue(any(p.endswith('/submitted') for p, _ in self.api.calls))
        before = len(self.api.calls)
        r.submit_one(self.job)
        self.assertEqual(len(self.api.calls), before)
    def test_uncertain_result_never_auto_republishes(self):
        for result in [(1, 'network disconnected'), (0, 'no response'), (0, BV + ' BV1B7411m7LV')]:
            with self.subTest(result=result):
                (self.root / 'receipts' / (ID + '.json')).unlink(missing_ok=True)
                r = self.runner(result)
                r.submit_one(self.job)
                self.assertEqual(r.events[-1]['event'], 'needs_manual_reconciliation')
                self.assertEqual(u.read_json(r.record_path(ID))['phase'], 'submitting')
    def test_source_release_requires_backup_hash_and_age(self):
        r = self.runner()
        r.submit_one(self.job)
        r.inspect = lambda b: {'bvid': BV, 'state': 0, 'owner': {'mid': 123}, 'cid': 9, 'desc': '名场面编号：' + ID}
        job = {'id': ID, 'state': 'ready', 'bvid': BV, 'readyAt': int(time.time()*1000)-8*86400000}
        r.reconcile_and_verify([job])
        self.assertTrue(any(p.endswith('/release') for p, _ in self.api.calls))
        self.assertTrue(r.source_path(ID).exists())
        self.api.calls.clear()
        r.source_path(ID).write_bytes(b'changed')
        r.reconcile_and_verify([job])
        self.assertFalse(any(p.endswith('/release') for p, _ in self.api.calls))

    def test_directory_mode_preserves_minimum_original_retention(self):
        r=self.runner();r.submit_one(self.job);r.config['retainDays']=0
        r.inspect=lambda b:{'bvid':BV,'state':0,'owner':{'mid':123},'cid':9,'desc':'名场面编号：'+ID}
        r.reconcile_and_verify([{'id':ID,'state':'submitted','bvid':BV,'readyAt':0}])
        self.assertFalse(any(p.endswith('/release') for p,_ in self.api.calls))
        self.assertTrue(r.source_path(ID).exists())
    def test_wrong_account_or_waiting_moderation(self):
        self.assertIsNone(u.verified_fields({'bvid': BV, 'state': 0, 'owner': {'mid': 999}, 'cid': 1}, BV, 123))
        self.assertIsNone(u.verified_fields({'bvid': BV, 'state': -4, 'owner': {'mid': 123}, 'cid': 1}, BV, 123))
    def test_category_collection_added_once_without_resubmission(self):
        class Collection:
            calls=0
            def ensure_video(self,binding,video,mid):
                self.calls+=1
                self.asserted=(binding['seasonId'],video['aid'],mid)
        collection=Collection()
        self.cfg['categoryCollections']={'funny':{'seasonId':10,'sectionId':20,'ownerMid':123,'title':'下饭操作'}}
        r=u.Runner(self.cfg,api=self.api,collections=collection)
        job={'id':ID,'category':'funny'}
        video={'bvid':BV,'aid':30}
        self.assertTrue(r.ensure_collection(job,video))
        self.assertTrue(r.ensure_collection(job,video))
        self.assertEqual(collection.calls,1)
        self.assertEqual(collection.asserted,(10,30,123))
    def test_collection_failure_keeps_original_for_retry(self):
        class Broken:
            def ensure_video(self,*args):raise u.CollectionError('bilibili_collection_rejected_1')
        self.cfg['categoryCollections']={'highlight':{'seasonId':10,'sectionId':20,'ownerMid':123,'title':'名场面'}}
        r=u.Runner(self.cfg,api=self.api,collections=Broken())
        r.inspect=lambda b:{'bvid':BV,'aid':30,'state':0,'owner':{'mid':123},'cid':9,'desc':'名场面编号：'+ID}
        job={'id':ID,'category':'highlight','state':'ready','bvid':BV,'readyAt':int(time.time()*1000)-8*86400000}
        r.reconcile_and_verify([job])
        self.assertTrue(any(e['event']=='collection_will_retry' for e in r.events))
        self.assertFalse(any(p.endswith('/release') for p,_ in self.api.calls))
        self.assertFalse(u.read_json(r.record_path(ID),{}).get('collection'))
    def test_inputs_stay_arguments(self):
        command = u.upload_command(self.cfg, self.job, self.root / 'one.mp4')
        self.assertIn('【峡谷名场面】' + self.job['title'], command)
        self.assertIn('名场面编号：' + ID, command[command.index('--desc')+1])
        with self.assertRaises(u.JobError):
            self.runner().source_path('../../secret')
    def test_video_title_carries_specific_category(self):
        job={**self.job,'category':'funny'}
        command=u.upload_command(self.cfg,job,self.root/'one.mp4')
        self.assertEqual(command[command.index('--title')+1],'【下饭操作】'+job['title'])
    def test_credentials_missing_and_single_instance(self):
        with u.single_instance(self.root):
            with self.assertRaises(u.JobError):
                with u.single_instance(self.root):
                    pass
        self.cookie.unlink()
        with self.assertRaises(u.JobError):
            self.runner()

    def test_website_players_hero_and_category_become_tags(self):
        job={**self.job,'category':'funny','hero':'芮尔','players':['ignored#12345'], 'playerNames':['qwer','煎饼狗子','Keifuu']}
        metadata=u.upload_metadata(job)
        self.assertEqual(metadata['tags'],['英雄联盟','下饭操作','芮尔','qwer','煎饼狗子','Keifuu','峡谷名场面'])
        self.assertNotIn('ignored',metadata['description'])
        self.assertIn('相关玩家：qwer、煎饼狗子、Keifuu',metadata['description'])
        self.assertIn('英雄：芮尔',metadata['description'])

    def test_silent_cli_result_recovers_owned_submission_without_reupload(self):
        class Creator:
            def find_marker(self,job_id,title):return BV
        r=u.Runner(self.cfg,api=self.api,execute=lambda command:(0,''),creator=Creator())
        r.submit_one(self.job)
        self.assertEqual(u.read_json(r.record_path(ID))['bvid'],BV)
        r.submit_one(self.job)
        self.assertEqual(sum(p.endswith('/source') for p,_ in self.api.calls),1)

    def test_uncertain_job_recovers_before_public_moderation(self):
        class Creator:
            def find_marker(self,job_id,title):return BV
        r=u.Runner(self.cfg,api=self.api,inspect_video=lambda b:None,execute=lambda c:self.fail('must not reupload'),creator=Creator())
        r.reconcile_and_verify([{**self.job,'state':'manual'}])
        self.assertEqual(u.read_json(r.record_path(ID))['bvid'],BV)
        self.assertTrue(any(p.endswith('/submitted') for p,_ in self.api.calls))
        self.assertFalse(any(p.endswith('/verified') for p,_ in self.api.calls))

    def test_creator_requires_exact_marker_title_and_unique_bvid(self):
        creator=object.__new__(u.CreatorArchives)
        title=u.upload_metadata(self.job)['title']
        data={'arc_audits':[{'Archive':{'bvid':BV,'title':title,'desc':'名场面编号：'+ID}}]}
        creator.request=lambda path:data
        self.assertEqual(creator.find_marker(ID,title),BV)
        self.assertIsNone(creator.find_marker(ID,title+'other'))
        data['arc_audits'][0]['Archive']['desc']+='extra'
        self.assertIsNone(creator.find_marker(ID,title))
        data['arc_audits'][0]['Archive']['desc']='名场面编号：'+ID
        data['arc_audits'].append({'Archive':{**data['arc_audits'][0]['Archive'],'bvid':'BV1B7411m7LV'}})
        with self.assertRaises(u.CollectionError):creator.find_marker(ID,title)

    def test_tag_limits_deduplication_and_complete_description(self):
        names=['qwer','QWER','带,逗号\n的ID','很长的名字'*6]+['玩家'+str(i) for i in range(10)]
        job={**self.job,'category':'highlight','hero':'泽拉斯/芮尔','playerNames':names,'description':'描述'*1000}
        metadata=u.upload_metadata(job)
        self.assertEqual(len(metadata['tags']),10)
        self.assertTrue(all(0<len(t)<=20 and ',' not in t and '\n' not in t for t in metadata['tags']))
        self.assertEqual(sum(t.casefold()=='qwer' for t in metadata['tags']),1)
        self.assertIn('玩家9',metadata['description'])
        self.assertIn('名场面编号：'+ID,metadata['description'])
        self.assertLessEqual(len(metadata['description']),1900)

    def test_missing_optional_metadata_is_not_invented(self):
        metadata=u.upload_metadata({**self.job,'players':['G30a#71755']})
        self.assertIn('G30a',metadata['tags'])
        self.assertNotIn('英雄：',metadata['description'])
        self.assertNotIn('#71755',metadata['description'])

    def test_owner_can_correct_game_for_non_league_clip(self):
        config={'metadataOverrides':{ID:{'game':'无畏契约'}}}
        metadata=u.upload_metadata(self.job,config)
        self.assertEqual(metadata['tags'][0],'无畏契约')
        self.assertNotIn('英雄联盟',metadata['tags'])
        self.assertNotIn('英雄联盟',metadata['description'])

    def test_static_directory_excludes_interactions_and_credentials(self):
        site=self.root/'site';(site/'moments').mkdir(parents=True);(site/'moments/index.html').write_text('gallery')
        public={'id':ID,'title':'旧视频','description':'','players':['qwer#77051'],'uploaderKey':'qwer#77051','hero':'芮尔','category':'funny','createdAt':1,'duration':1,'hasPoster':True,'archive':{'state':'ready','bvid':BV,'sourceAvailable':True},'likes':['qwer#77051'],'commentCount':2,'owner_hash':'not-public'}
        class DirectoryAPI:
            calls=[]
            def request(self,path,payload=None,target=None,lease=None):
                self.calls.append(path)
                if target:pathlib.Path(target).write_bytes(b'\xff\xd8\xff\xd9');return 4
                if path=='/catalog':return {'members':[{'key':'qwer#77051','name':'qwer'}],'matches':{}}
                return {'items':[public],'nextOffset':None}
        api=DirectoryAPI();config={**self.cfg,'catalogSitePath':str(site)}
        self.assertTrue(u.export_directory(config,api)['changed'])
        self.assertFalse(u.export_directory(config,api)['changed'])
        result=u.read_json(site/'moments/catalog.json');text=json.dumps(result)
        for secret in ('likes','commentCount','sourceAvailable','owner_hash','not-public'):self.assertNotIn(secret,text)
        self.assertEqual(result['items'][0]['posterPath'],'covers/'+ID+'.jpg')
        self.assertEqual(sum(p.endswith('/poster') for p in api.calls),1)


if __name__ == '__main__':
    unittest.main()
