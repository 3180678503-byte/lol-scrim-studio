"""Regression for roster removal, intact team denominators and import persistence."""
import copy,hashlib,unittest
import roster_policy

class PolicyTests(unittest.TestCase):
    def test_cohort_removal(self):
        player=lambda name,team=100,own=False:{'id':{'self':1,'friend':2,'removed':3}[name],'key':name,'name':name,'team':team,'isSelf':own,'win':True,'teamKills':30,'teamDamage':1000}
        match=lambda number,rows:{'number':number,'matchKey':str(number),'date':'2026-10-14','createdAt':'2026-10-14T00:00:00Z','players':rows,'frames':[{'players':{str(p['id']):{'gold':1} for p in rows}}],'sourcePlayers':[{'key':p['key'],'name':p['name']} for p in rows]}
        own=player('self',own=True);other=player('friend');removed=player('removed',200)
        d={'datasetType':'friends-flex','matches':[match(8,[own,removed]),match(9,[removed]),match(10,[other,removed])],'cohort':[own,other,removed],'collection':{'accounts':[{'name':p['name'],'count':1} for p in [own,other,removed]]}}
        policy={'includeSelfInRadar':True,'excludedKeyHashes':[hashlib.sha256(b'removed').hexdigest()]}
        roster_policy.apply(d,policy)
        self.assertEqual([m['number'] for m in d['matches']],[8,10]);self.assertEqual(d['collection']['trackedPlayers'],2);self.assertEqual(d['collection']['withoutSelf'],1)
        self.assertEqual(d['matches'][0]['players'][0]['teamKills'],30);self.assertEqual(d['matches'][0]['players'][0]['teamDamage'],1000)
        self.assertEqual(d['matches'][0]['trackedTeams'],[100]);self.assertNotIn('3',d['matches'][0]['frames'][0]['players']);self.assertTrue(d['radarIncludeSelf'])
        original=copy.deepcopy(d);roster_policy.apply(d,policy);self.assertEqual(d,original)
        # A later old import cannot restore an excluded player or a removed-only game.
        d['matches'].append(match(11,[removed]));d['matches'][0]['players'].append(removed);roster_policy.apply(d,policy)
        self.assertEqual(len(d['matches']),2);self.assertFalse(any(p['key']=='removed' for m in d['matches'] for p in m['players']))

    def test_flex_removes_self_only_games(self):
        d={'datasetType':'flex','matches':[{'number':3,'matchKey':'3','date':'2026-10-14','createdAt':'2026-10-14T00:00:00Z','players':[{'id':1,'key':'self','name':'self','team':100,'isSelf':True},{'id':2,'key':'removed','name':'removed','team':100,'isSelf':False}],'frames':[]}],'collection':{'queriedFlex':1}}
        policy={'excludedKeyHashes':[hashlib.sha256(b'removed').hexdigest()]}
        roster_policy.apply(d,policy);self.assertEqual(d['matches'],[]);self.assertEqual(d['collection']['importedFriendGames'],0)

if __name__=='__main__':unittest.main()
