import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from league_client_session import ClientSession
from wegame_ui import launch_button,label_mask
from PIL import Image,ImageDraw

class Fake:
    def __init__(self,existing=False):
        self.rows={1:{'pid':1,'parent':10,'name':'leagueclient.exe','birth':'one'}} if existing else {}
        self.phase='None';self.started=0;self.quits=0;self.forced=0;self.now=0;self.ready=True;self.hang=False;self.decision='timeout';self.notices=[]
    def processes(self):return self.rows.copy()
    def launch(self):
        self.started+=1;self.rows={2:{'pid':2,'parent':10,'name':'leagueclient.exe','birth':'two'}};return {'method':'WeGame'}
    def probe(self,expected):
        if not self.ready:raise RuntimeError('Waiting for login')
        return {**next(iter(self.rows.values())),'phase':self.phase}
    def quit(self,pid,birth,expected):
        self.quits+=1
        if not self.hang:self.rows.pop(pid)
    def force_close(self,pid,birth,expected,allow_active=False):self.forced+=1;self.rows.pop(pid)
    def close_notice(self,seconds):self.notices.append(seconds);return self.decision
    def sleep(self,s):self.now+=s
    def clock(self):return self.now

class SessionTests(unittest.TestCase):
    def test_existing_client_is_never_closed(self):
        b=Fake(True);s=ClientSession(b,'me');s.open();s.close()
        self.assertEqual((b.started,b.quits),(0,0))
    def test_owned_idle_client_is_closed_once(self):
        b=Fake();s=ClientSession(b,'me');s.open();s.close();s.close()
        self.assertEqual((b.started,b.quits),(1,1))
        self.assertEqual(s.events[-1]['action'],'closed-owned-client')
    def test_lobby_and_game_are_preserved(self):
        for phase in ['Lobby','Matchmaking','ChampSelect','InProgress','Reconnect','EndOfGame']:
            b=Fake();s=ClientSession(b,'me');s.open();b.phase=phase;s.close();self.assertEqual(b.quits,0)
        b=Fake();s=ClientSession(b,'me');s.open();s.observe('InProgress');s.close();self.assertEqual(b.quits,0)
    def test_reused_pid_is_preserved(self):
        b=Fake();s=ClientSession(b,'me');s.open();b.rows[2]['birth']='replacement';s.close();self.assertEqual(b.quits,0)
    def test_hung_owned_idle_client_uses_end_task(self):
        b=Fake();b.hang=True;s=ClientSession(b,'me');s.open();s.close()
        self.assertEqual((b.quits,b.forced),(1,1));self.assertEqual(s.events[-1]['action'],'ended-owned-client')
    def test_login_timeout_has_no_unverified_quit(self):
        b=Fake();b.ready=False;s=ClientSession(b,'me',15)
        with self.assertRaisesRegex(RuntimeError,'not ready'):s.open()
        s.close();self.assertEqual(b.quits,0)
    def test_two_minute_notice_can_cancel(self):
        b=Fake(True);b.decision='cancel';s=ClientSession(b,'me',notice_seconds=120);s.open();s.close()
        self.assertEqual(b.notices,[120]);self.assertEqual(b.forced,0);self.assertEqual(s.events[-1]['action'],'kept-by-user')
    def test_no_reply_ends_the_confirmed_client(self):
        b=Fake(True);b.phase='InProgress';s=ClientSession(b,'me',notice_seconds=120);s.open();s.close()
        self.assertEqual(b.notices,[120]);self.assertEqual(b.forced,1);self.assertEqual(s.events[-1]['action'],'ended-notified-client')
    def test_recognize_unique_button_and_reject_ambiguity(self):
        image=Image.new('RGB',(1600,1000));draw=ImageDraw.Draw(image)
        draw.rounded_rectangle((1100,880,1450,950),20,fill=(255,183,48))
        draw.rectangle((1500,840,1535,875),fill=(255,183,48))
        box=launch_button(image,(0,0,1600,1000));self.assertLess(abs((box[0]+box[2])/2-1275),5)
        draw.rounded_rectangle((1100,960,1340,999),10,fill=(255,183,48))
        with self.assertRaises(RuntimeError):launch_button(image,(0,0,1600,1000))

if __name__=='__main__':unittest.main()
