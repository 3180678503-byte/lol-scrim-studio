import copy, json, sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'skills/lol-scrim-update/scripts'))
import review_timeline as R


class EvidenceTest(unittest.TestCase):
    def fixture(self):
        match = {'duration':1000,'players':[{'id':1,'team':100}], 'teams':[{'kills':1},{'kills':0}]}
        frames = []
        for seconds in [0,600,900,960]:
            frames.append({'timestamp':seconds*1000,'participantFrames':{'1':{'totalGold':500+seconds*5,'damageStats':{'totalDamageDoneToChampions':seconds*10}}},'events':[]})
        frames[1]['events'] = [{'type':'CHAMPION_KILL','timestamp':590000,'killerId':1,'victimId':7,'assistingParticipantIds':[2,3],'shutdownBounty':500,'puuid':'PRIVATE','victimDamageReceived':[{'name':'PRIVATE'}]}]
        return match, {'frames':frames,'participants':[{'puuid':'PRIVATE'}]}

    def test_projection_and_actual_phase_end(self):
        match,timeline=self.fixture();R.attach(match,timeline,{1:100,7:200})
        public=json.dumps(match);self.assertNotIn('PRIVATE',public);self.assertNotIn('puuid',public)
        event=match['reviewTimeline']['events'][0];self.assertIsNone(event['victim']);self.assertEqual(event['assists'],[]);self.assertEqual(event['shutdown'],500)
        phases=match['players'][0]['reviewPhases'];self.assertEqual(phases[-1]['end'],960);self.assertEqual(phases[0]['dpm'],600);self.assertEqual(phases[0]['gpm'],300)

    def test_later_exclusion_and_richer_evidence_survive_import(self):
        old,t=self.fixture();R.attach(old,t);new=copy.deepcopy(old);new.pop('reviewTimeline');new['players'][0].pop('reviewPhases');R.preserve(old,new)
        self.assertEqual(old,new)
        new['players']=[];R.redact(new);self.assertIsNone(new['reviewTimeline']['events'][0]['killer'])

    def test_missing_damage_stays_null(self):
        match,t=self.fixture()
        for f in t['frames']: f['participantFrames']['1'].pop('damageStats')
        R.attach(match,t);self.assertTrue(all(p['dpm'] is None for p in match['players'][0]['reviewPhases']))

    def test_boundary_frames_with_small_clock_offset_are_shared(self):
        match,t=self.fixture()
        for frame in t['frames']:
            if frame['timestamp'] == 900000: frame['timestamp'] += 40
        R.attach(match,t)
        a,b=match['players'][0]['reviewPhases']
        self.assertEqual(a['end'],900.04);self.assertEqual(b['start'],900.04)


if __name__ == '__main__': unittest.main()
