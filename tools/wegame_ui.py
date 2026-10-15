"""Open LoL's WeGame page and recognize its launch button on the active desktop."""
import ctypes,json,time
from ctypes import wintypes as w
from pathlib import Path
from PIL import ImageGrab,Image

def launch_button(image,bounds):
    left,top,right,bottom=bounds; width=right-left;height=bottom-top
    points=set()
    for y in range(max(0,top+int(height*.82)),min(image.height,bottom),4):
        for x in range(max(0,left+int(width*.68)),min(image.width,right),4):
            red,green,blue=image.getpixel((x,y))[:3]
            if red>210 and 135<green<240 and blue<150 and red>green:points.add((x,y))
    candidates=[]
    while points:
        stack=[points.pop()];group=[]
        while stack:
            x,y=stack.pop();group.append((x,y))
            for point in [(x-4,y),(x+4,y),(x,y-4),(x,y+4)]:
                if point in points:points.remove(point);stack.append(point)
        x0=min(x for x,y in group);x1=max(x for x,y in group);y0=min(y for x,y in group);y1=max(y for x,y in group)
        if len(group)>250 and 2.5<(x1-x0)/max(1,y1-y0)<7 and y1-y0<height*.13:
            candidates.append((x0,y0,x1+1,y1+1))
    if len(candidates)!=1:raise RuntimeError('Cannot uniquely recognize WeGame launch button')
    return candidates[0]

def label_mask(image,box):
    left,top,right,bottom=box;width=right-left;height=bottom-top
    crop=image.crop((left+width*.49,top+height*.20,left+width*.71,top+height*.82))
    return list(crop.convert('L').resize((64,40),Image.Resampling.BILINEAR).point(lambda p:0 if p<110 else 255).getdata())

def click_launch(expected_pid):
    u=ctypes.WinDLL('user32',use_last_error=True);k=ctypes.WinDLL('kernel32')
    u.SetProcessDPIAware()
    callback_type=ctypes.WINFUNCTYPE(w.BOOL,w.HWND,w.LPARAM)
    u.EnumWindows.argtypes=[callback_type,w.LPARAM]
    u.GetWindowThreadProcessId.argtypes=[w.HWND,ctypes.POINTER(w.DWORD)]
    u.GetWindowRect.argtypes=[w.HWND,ctypes.POINTER(w.RECT)]
    u.GetForegroundWindow.restype=w.HWND
    u.GetWindowTextW.argtypes=[w.HWND,w.LPWSTR,ctypes.c_int]
    u.SetForegroundWindow.argtypes=[w.HWND];u.ShowWindow.argtypes=[w.HWND,ctypes.c_int]
    u.BringWindowToTop.argtypes=[w.HWND];u.AttachThreadInput.argtypes=[w.DWORD,w.DWORD,w.BOOL]
    u.OpenInputDesktop.argtypes=[w.DWORD,w.BOOL,w.DWORD];u.OpenInputDesktop.restype=w.HANDLE
    u.SetThreadDesktop.argtypes=[w.HANDLE];u.CloseDesktop.argtypes=[w.HANDLE]
    u.GetUserObjectInformationW.argtypes=[w.HANDLE,ctypes.c_int,ctypes.c_void_p,w.DWORD,ctypes.POINTER(w.DWORD)]
    desktop=u.OpenInputDesktop(0,False,0x43);name=ctypes.create_unicode_buffer(128);size=w.DWORD()
    if not desktop or not u.GetUserObjectInformationW(desktop,2,name,ctypes.sizeof(name),ctypes.byref(size)):
        raise RuntimeError('Interactive desktop unavailable; leave Windows signed in and unlocked')
    if name.value=='Screen-saver':
        # Dismiss a Windows screen saver; this never unlocks the workstation.
        k.OpenProcess.argtypes=[w.DWORD,w.BOOL,w.DWORD];k.OpenProcess.restype=w.HANDLE
        k.QueryFullProcessImageNameW.argtypes=[w.HANDLE,w.DWORD,w.LPWSTR,ctypes.POINTER(w.DWORD)]
        k.CloseHandle.argtypes=[w.HANDLE];u.PostMessageW.argtypes=[w.HWND,w.UINT,w.WPARAM,w.LPARAM]
        if u.SetThreadDesktop(desktop):
            @callback_type
            def dismiss(h,_):
                pid=w.DWORD();u.GetWindowThreadProcessId(h,ctypes.byref(pid))
                process=k.OpenProcess(0x1000,False,pid.value)
                if process:
                    path=ctypes.create_unicode_buffer(2048);length=w.DWORD(len(path))
                    if k.QueryFullProcessImageNameW(process,0,path,ctypes.byref(length)) and path.value.lower().endswith('.scr'):
                        u.PostMessageW(h,0x10,0,0)
                    k.CloseHandle(process)
                return True
            u.EnumWindows(dismiss,0);time.sleep(2)
            new_desktop=u.OpenInputDesktop(0,False,0x43)
            if new_desktop:
                u.SetThreadDesktop(new_desktop);u.CloseDesktop(desktop);desktop=new_desktop
                u.GetUserObjectInformationW(desktop,2,name,ctypes.sizeof(name),ctypes.byref(size))
    if name.value!='Default':
        u.CloseDesktop(desktop)
        raise RuntimeError('Windows desktop is locked or showing a screen saver; unlock before WeGame launch')
    if not u.SetThreadDesktop(desktop):raise RuntimeError('Cannot attach to interactive desktop')
    choices=[]
    @callback_type
    def enum(h,_):
        text=ctypes.create_unicode_buffer(128);u.GetWindowTextW(h,text,128)
        pid=w.DWORD();u.GetWindowThreadProcessId(h,ctypes.byref(pid))
        r=w.RECT();u.GetWindowRect(h,ctypes.byref(r))
        if pid.value==expected_pid and text.value=='WeGame' and r.right-r.left>900 and r.bottom-r.top>500:choices.append((h,r))
        return True
    try:
        u.EnumWindows(enum,0)
        if not choices:raise RuntimeError('WeGame main window unavailable; verify saved login')
        h,r=max(choices,key=lambda x:(x[1].right-x[1].left)*(x[1].bottom-x[1].top))
        foreground=u.GetForegroundWindow();foreground_thread=u.GetWindowThreadProcessId(foreground,None)
        own=k.GetCurrentThreadId();attached=u.AttachThreadInput(own,foreground_thread,True)
        try:u.ShowWindow(h,9);u.BringWindowToTop(h);u.SetForegroundWindow(h)
        finally:
            if attached:u.AttachThreadInput(own,foreground_thread,False)
        time.sleep(1)
        if u.GetForegroundWindow()!=h:raise RuntimeError('Cannot bring WeGame to foreground')
        u.GetWindowRect(h,ctypes.byref(r));image=ImageGrab.grab()
        box=launch_button(image,(r.left,r.top,r.right,r.bottom))
        reference=Image.open(Path(__file__).with_name('wegame-launch-button.png'))
        actual=label_mask(image,box);expected=label_mask(reference,(0,0,reference.width,reference.height))
        if sum(a!=b for a,b in zip(actual,expected))/len(actual)>.15:
            raise RuntimeError('WeGame button label changed; expected the observed Launch label')
        if u.GetForegroundWindow()!=h:raise RuntimeError('Foreground changed before launch')
        x=(box[0]+box[2])//2;y=(box[1]+box[3])//2
        u.SetCursorPos.argtypes=[ctypes.c_int,ctypes.c_int]
        if not u.SetCursorPos(x,y):raise RuntimeError('WeGame input requires the same administrator level as WeGame')
        point=w.POINT();u.GetCursorPos(ctypes.byref(point))
        if (point.x,point.y)!=(x,y):raise RuntimeError('Cursor moved before launch')
        u.mouse_event.argtypes=[w.DWORD,w.DWORD,w.DWORD,w.DWORD,ctypes.c_size_t]
        u.mouse_event(2,0,0,0,0);u.mouse_event(4,0,0,0,0)
        return {'method':'WeGame launch button','clicked':[x,y]}
    finally:u.CloseDesktop(desktop)

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--wegame-pid',required=True,type=int);args=p.parse_args()
    try:print(json.dumps(click_launch(args.wegame_pid)))
    except (RuntimeError,OSError) as e:raise SystemExit(str(e))
