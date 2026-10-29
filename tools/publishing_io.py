"""GitHub-only proxy selection and atomic, path-checked publication copies."""
import os
from pathlib import Path
import shutil
import subprocess
from urllib.parse import urlsplit

def system_proxy():
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Software\Microsoft\Windows\CurrentVersion\Internet Settings') as key:
            if not winreg.QueryValueEx(key,'ProxyEnable')[0]:
                return None
            value=winreg.QueryValueEx(key,'ProxyServer')[0]
    except (ImportError,OSError):
        return None
    return parse_proxy(value)

def parse_proxy(value):
    if not isinstance(value,str) or any(x in value for x in ['\r','\n']):
        return None
    if '=' in value:
        entries=dict(part.split('=',1) for part in value.split(';') if '=' in part)
        value=entries.get('https') or entries.get('http') or ''
    if not value:
        return None
    value=value if '://' in value else 'http://'+value
    parsed=urlsplit(value)
    return value if parsed.scheme in ['http','https','socks5','socks5h'] and parsed.hostname else None

def git_proxy(git,remote,env):
    # Honor an explicit Git proxy, including an explicitly empty direct setting.
    query=subprocess.run([str(git),'config','--get-urlmatch','http.proxy',remote],capture_output=True,text=True,
                         creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    if query.returncode==0:
        return query.stdout.strip()
    return env.get('HTTPS_PROXY') or env.get('https_proxy') or env.get('ALL_PROXY') or env.get('all_proxy') or system_proxy()

def copy_publication_files(source,target,paths):
    source=Path(source).resolve();target=Path(target).resolve()
    for relative in paths:
        relative=Path(relative)
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError('Publication path must be relative')
        src=(source/relative).resolve();dst=(target/relative).resolve()
        if not src.is_relative_to(source) or not dst.is_relative_to(target):
            raise ValueError('Publication path leaves the checkout')
        temp=dst.with_name('.publish-'+dst.name+'.tmp')
        try:
            dst.parent.mkdir(parents=True,exist_ok=True)
            # Python's stream copy avoids CopyFile2; os.replace commits a complete file.
            with src.open('rb') as reader,temp.open('wb') as writer:
                shutil.copyfileobj(reader,writer)
            os.replace(temp,dst)
        except OSError as error:
            raise RuntimeError('Copy publication file '+relative.as_posix()+' failed: '+str(error)) from error
        finally:
            temp.unlink(missing_ok=True)
