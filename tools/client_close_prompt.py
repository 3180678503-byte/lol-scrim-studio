"""Show a bounded Windows close notice; Cancel keeps the client open."""
import argparse,ctypes,json,os,threading
from ctypes import wintypes as w

def prompt(seconds):
    user=ctypes.WinDLL('user32',use_last_error=True)
    message=user.MessageBoxTimeoutW
    message.argtypes=[w.HWND,w.LPCWSTR,w.LPCWSTR,w.UINT,w.WORD,w.DWORD];message.restype=ctypes.c_int
    callback_type=ctypes.WINFUNCTYPE(w.BOOL,w.HWND,w.LPARAM)
    user.EnumWindows.argtypes=[callback_type,w.LPARAM]
    user.GetWindowThreadProcessId.argtypes=[w.HWND,ctypes.POINTER(w.DWORD)]
    user.GetWindowTextW.argtypes=[w.HWND,w.LPWSTR,ctypes.c_int]
    user.SetWindowPos.argtypes=[w.HWND,w.HWND,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_int,w.UINT]
    user.SetForegroundWindow.argtypes=[w.HWND]
    user.GetForegroundWindow.restype=w.HWND
    stopped=threading.Event()
    title='灵排自动更新 · 关闭提醒'
    def keep_visible():
        activated=False
        while not stopped.wait(.5):
            @callback_type
            def raise_notice(window,_):
                nonlocal activated
                pid=w.DWORD();user.GetWindowThreadProcessId(window,ctypes.byref(pid))
                if pid.value==os.getpid():
                    caption=ctypes.create_unicode_buffer(128);user.GetWindowTextW(window,caption,128)
                    if caption.value==title:
                        # The League startup advert can otherwise cover the notice.
                        user.SetWindowPos(window,w.HWND(-1),0,0,0,0,0x53)
                        if not activated:user.SetForegroundWindow(window);activated=True
                return True
            user.EnumWindows(raise_notice,0)
    body=('灵排定时任务准备关闭英雄联盟。\n\n客户端将在 '+str(seconds)+' 秒后关闭。\n\n'
          '点击“取消”：本次保持开启。\n点击“确定”：立即关闭。\n无人操作：到时自动结束客户端。')
    owner=user.GetForegroundWindow()
    watcher=threading.Thread(target=keep_visible,daemon=True);watcher.start()
    try:result=message(owner,body,title,0x1|0x100|0x10000|0x40000,0,seconds*1000)
    finally:stopped.set();watcher.join(timeout=1)
    if result==2:return 'cancel'
    if result==1:return 'close'
    if result==32000:return 'timeout'
    raise RuntimeError('Close notice could not be shown')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--seconds',type=int,default=120);args=p.parse_args()
    if not 1<=args.seconds<=600:p.error('seconds must be 1..600')
    try:print(json.dumps({'decision':prompt(args.seconds)}))
    except (RuntimeError,OSError) as e:raise SystemExit(str(e))
