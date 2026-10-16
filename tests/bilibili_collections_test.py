import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('uploader',pathlib.Path(__file__).parents[1]/'tools/moments_bilibili.py')
u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u)


class CollectionsChecks(unittest.TestCase):
    def client(self, present=False, reject=False):
        client=object.__new__(u.Collections)
        client.calls=[]
        state={'present':present}
        def request(path,form=None,payload=None):
            client.calls.append((path,form,payload))
            if 'episodes/add' in path:
                if reject:raise u.CollectionError('bilibili_collection_rejected_1')
                state['present']=True
                return None
            return {'section':{'id':20,'seasonId':10},'episodes':[{'aid':30}] if state['present'] else None}
        client.request=request
        return client
    def data(self):
        return {'seasonId':10,'sectionId':20,'ownerMid':1},{'aid':30,'cid':40,'title':'视频','owner':{'mid':1},'pages':[{'cid':40}]}
    def test_add_and_readback(self):
        c=self.client();binding,video=self.data()
        self.assertEqual(c.ensure_video(binding,video,1),'added')
        self.assertEqual(len(c.calls),3)
        self.assertEqual(c.calls[1][2]['sectionId'],20)
        self.assertEqual(c.calls[1][2]['episodes'][0]['aid'],30)
    def test_existing_does_not_add_again(self):
        c=self.client(present=True);binding,video=self.data()
        self.assertEqual(c.ensure_video(binding,video,1),'already_present')
        self.assertEqual(len(c.calls),1)
    def test_failure_remains_retryable(self):
        c=self.client(reject=True);binding,video=self.data()
        with self.assertRaises(u.CollectionError):c.ensure_video(binding,video,1)
    def test_wrong_account_and_section_refused(self):
        c=self.client();binding,video=self.data();binding['ownerMid']=2
        with self.assertRaises(u.CollectionError):c.ensure_video(binding,video,1)
        self.assertEqual(c.calls,[])
        binding['ownerMid']=1;binding['seasonId']=99
        with self.assertRaises(u.CollectionError):c.ensure_video(binding,video,1)
    def test_multiple_parts_refused(self):
        c=self.client();binding,video=self.data();video['pages'].append({'cid':41})
        with self.assertRaises(u.CollectionError):c.ensure_video(binding,video,1)
    def test_null_seasons_and_four_distinct_categories(self):
        c=object.__new__(u.Collections);c.request=lambda path:{'seasons':None}
        self.assertEqual(c.list(),[])
        self.assertEqual(set(u.COLLECTION_NAMES),{'highlight','funny','teamwork','meme'})
    def test_official_permission_flag(self):
        c=object.__new__(u.Collections)
        c.request=lambda path:{'season':False}
        self.assertFalse(c.can_create())
        c.request=lambda path:{'season':True}
        self.assertTrue(c.can_create())
        c.request=lambda path:{}
        with self.assertRaises(u.CollectionError):c.can_create()
    def test_create_form_and_valid_id(self):
        c=object.__new__(u.Collections);captured=[]
        def request(path,form):captured.append((path,form));return 10
        c.request=request
        self.assertEqual(c.create('名场面','高光','https://archive.biliimg.com/a.jpg'),10)
        self.assertEqual(captured[0][1]['season_price'],0)
        with self.assertRaises(u.CollectionError):c.create('','高光','url')
    def test_setup_without_permission_never_creates(self):
        class Disabled:
            def can_create(self):return False
            def upload_cover(self,*args):raise AssertionError('must not upload without permission')
            def create(self,*args):raise AssertionError('must not create without permission')
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder);cookie=root/'cookies.json';config=root/'config.json'
            u.save_json(cookie,{'token_info':{'mid':1}})
            u.save_json(config,{'cookiePath':str(cookie),'privateRoot':folder})
            with patch.object(u,'Collections',return_value=Disabled()):
                with self.assertRaisesRegex(u.CollectionError,'not_enabled'):
                    u.configure_collections(config,root/'missing-covers')
            self.assertNotIn('categoryCollections',u.read_json(config))


if __name__=='__main__':unittest.main()
