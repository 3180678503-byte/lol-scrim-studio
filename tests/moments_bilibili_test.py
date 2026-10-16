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


if __name__ == '__main__':
    unittest.main()
