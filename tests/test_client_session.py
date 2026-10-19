import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from league_client_session import ClientSession
from wegame_ui import launch_button,label_mask,activate_wegame,fit_window,league_icon
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
    def test_removed_external_monitor_and_smaller_laptop_screen(self):
        self.assertEqual(fit_window((3000,700,5300,2140),(0,0,1920,1040)),(259,0,1920,1040))
        self.assertEqual(fit_window((-300,50,850,770),(0,0,1920,1040)),(0,50,1150,770))
        self.assertEqual(fit_window((100,100,1250,820),(0,0,1920,1040)),(100,100,1250,820))
    def test_league_logo_at_laptop_dpi(self):
        reference=Image.open(Path(__file__).resolve().parents[1]/'tools/wegame-league-icon.png').convert('RGB')
        for scale in [.5,.625,.75,1,1.5]:
            image=Image.new('RGB',(1440,900),(30,30,30))
            logo=reference.resize((int(reference.width*scale),int(reference.height*scale)))
            image.paste(logo,(20,260))
            x,y=league_icon(image,(0,0,1440,900))
            self.assertLess(abs(x-(20+logo.width/2)),6)
            self.assertLess(abs(y-(260+logo.height/2)),6)
    def test_foreground_denial_retries_alt_and_detaches_threads(self):
        class Windows:
            foreground=7;permission=False;keys=False;sent=0
            attached=[]
            def GetForegroundWindow(self):return self.foreground
            def GetWindowThreadProcessId(self,h,p):
                if p is not None:p._obj.value=42
                return h+100
            def GetCurrentThreadId(self):return 1000
            def GetAsyncKeyState(self,vk):return 0x8000 if self.keys else 0
            def SendInput(self,count,events,size):
                self.sent+=1;self.permission=True
                assert count==2 and events[0].data.keyboard.vk==0x12 and events[1].data.keyboard.flags==2
                return count
            def AttachThreadInput(self,a,b,enabled):self.attached.append((b,enabled));return True
            def ShowWindow(self,*args):pass
            def BringWindowToTop(self,*args):pass
            def SetForegroundWindow(self,h):
                if self.permission:self.foreground=h
        u=Windows();activate_wegame(u,u,9,{42},sleep=lambda s:None)
        self.assertEqual(u.foreground,9);self.assertEqual(u.sent,1)
        for thread in {t for t,on in u.attached}:self.assertEqual(sum(on for t,on in u.attached if t==thread),sum(not on for t,on in u.attached if t==thread))
        u=Windows();u.keys=True;u.attached=[]
        with self.assertRaisesRegex(RuntimeError,'modifiers'):activate_wegame(u,u,9,{42},sleep=lambda s:None)
        self.assertEqual(u.sent,0)
        u=Windows();u.attached=[]
        with self.assertRaisesRegex(RuntimeError,'ownership'):activate_wegame(u,u,9,{99},sleep=lambda s:None)
        self.assertEqual(u.sent,0)
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
