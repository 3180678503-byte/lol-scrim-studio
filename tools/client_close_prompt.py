"""Show a bounded Windows close notice; Cancel keeps the client open."""
import argparse,ctypes,json
from ctypes import wintypes as w

def prompt(seconds):
    user=ctypes.WinDLL('user32',use_last_error=True)
    message=user.MessageBoxTimeoutW
    message.argtypes=[w.HWND,w.LPCWSTR,w.LPCWSTR,w.UINT,w.WORD,w.DWORD];message.restype=ctypes.c_int
    body=('灵排定时任务准备关闭英雄联盟。\n\n客户端将在 '+str(seconds)+' 秒后关闭。\n\n'
          '点击“取消”：本次保持开启。\n点击“确定”：立即关闭。\n无人操作：到时自动结束客户端。')
    result=message(None,body,'灵排自动更新 · 关闭提醒',0x1|0x100|0x10000|0x40000,0,seconds*1000)
    if result==2:return 'cancel'
    if result==1:return 'close'
    if result==32000:return 'timeout'
    raise RuntimeError('Close notice could not be shown')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--seconds',type=int,default=120);args=p.parse_args()
    if not 1<=args.seconds<=600:p.error('seconds must be 1..600')
    try:print(json.dumps({'decision':prompt(args.seconds)}))
    except (RuntimeError,OSError) as e:raise SystemExit(str(e))
