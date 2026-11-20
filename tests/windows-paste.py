"""Exercise the packaged WebView on an isolated local desktop or a disposable GitHub-hosted VM."""
from pathlib import Path
import sys, os, socket, subprocess, uuid, tempfile, shutil, time
import ctypes as C
from ctypes import wintypes as W
K=C.WinDLL('kernel32',use_last_error=True)
class StartupInfo(C.Structure):
 _fields_=[('cb',W.DWORD),('reserved',W.LPWSTR),('desktop',W.LPWSTR),('title',W.LPWSTR),
           ('x',W.DWORD),('y',W.DWORD),('width',W.DWORD),('height',W.DWORD),
           ('x_chars',W.DWORD),('y_chars',W.DWORD),('fill',W.DWORD),('flags',W.DWORD),
           ('show',W.WORD),('reserved_bytes',W.WORD),('reserved_ptr',W.LPVOID),
           ('stdin',W.HANDLE),('stdout',W.HANDLE),('stderr',W.HANDLE)]
class ProcessInfo(C.Structure):
 _fields_=[('process',W.HANDLE),('thread',W.HANDLE),('pid',W.DWORD),('tid',W.DWORD)]
K.CreateProcessW.argtypes=[W.LPCWSTR,W.LPWSTR,W.LPVOID,W.LPVOID,W.BOOL,W.DWORD,W.LPVOID,W.LPCWSTR,C.POINTER(StartupInfo),C.POINTER(ProcessInfo)]
K.WaitForSingleObject.argtypes=[W.HANDLE,W.DWORD]
K.TerminateProcess.argtypes=[W.HANDLE,W.UINT]
K.CloseHandle.argtypes=[W.HANDLE]
if len(sys.argv)==1:
 for mode in ('clipboard','notebook'):
  subprocess.run([sys.executable,__file__,mode],check=True)
 sys.exit(0)
mode=sys.argv[1]
assert mode in ('clipboard','notebook')
U=C.WinDLL('user32',use_last_error=True)
def fn(name,result,args):
 f=getattr(U,name);f.restype=result;f.argtypes=args;return f
station=fn('CreateWindowStationW',W.HANDLE,[W.LPCWSTR,W.DWORD,W.DWORD,W.LPVOID])
getstation=fn('GetProcessWindowStation',W.HANDLE,[])
setstation=fn('SetProcessWindowStation',W.BOOL,[W.HANDLE])
getname=fn('GetUserObjectInformationW',W.BOOL,[W.HANDLE,C.c_int,W.LPVOID,W.DWORD,C.POINTER(W.DWORD)])
desktop=fn('CreateDesktopW',W.HANDLE,[W.LPCWSTR,W.LPCWSTR,W.LPVOID,W.DWORD,W.DWORD,W.LPVOID])
setdesk=fn('SetThreadDesktop',W.BOOL,[W.HANDLE])
tdesk=fn('GetThreadDesktop',W.HANDLE,[W.DWORD])
def name(h):
 b=C.create_unicode_buffer(256);needed=W.DWORD()
 if not getname(h,2,b,C.sizeof(b),C.byref(needed)):raise C.WinError(C.get_last_error())
 return b.value
st=getstation()
hosted=(os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('RUNNER_ENVIRONMENT')=='github-hosted'
        and os.environ.get('RUNNER_OS')=='Windows')
# The hosted VM belongs to this job. Its installed WebView2 can start on the runner's
# normal desktop. On a developer machine clipboard tests must use their own station.
if hosted:
 deskname=name(tdesk(K.GetCurrentThreadId()))
else:
 if mode=='clipboard':
  old=name(st)
  st=station('DevPadQA'+uuid.uuid4().hex,0,0x10000000,None) or station(None,0,0x10000000,None)
  assert st and name(st)!=old
  assert setstation(st)
 deskname='Receiver'+uuid.uuid4().hex[:8]
 d=desktop(deskname,None,None,0,0x10000000,None)
 assert d and setdesk(d)
tmp=Path(tempfile.mkdtemp(prefix='devpad-receiver-')).resolve()
exe=Path(os.environ.get('DEVPAD_TEST_EXE','src-tauri/target/release/devpad.exe')).resolve()
if not hosted:
 exe=Path(shutil.copy2(exe,tmp/'DevPad.exe'))
with socket.socket() as listener:
 listener.bind(('127.0.0.1',0));port=listener.getsockname()[1]
env=dict(os.environ,DEVPAD_DATA_DIR=str(tmp/'data'),WEBVIEW2_USER_DATA_FOLDER=str(tmp/'webview'),DEVPAD_TEST_STARTUP='1',DEVPAD_PRIVATE_RECEIVER=mode,DEVPAD_PASTE_PORT=str(port),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port='+str(port)+' --disable-gpu')
startup=StartupInfo();startup.cb=C.sizeof(startup)
if not hosted:startup.desktop=name(st)+'\\'+deskname
process=ProcessInfo()
try:
 os.environ.update(env)
 command=C.create_unicode_buffer(subprocess.list2cmdline([str(exe)]))
 if not K.CreateProcessW(str(exe),command,None,None,False,0x08000000,None,str(exe.parent),C.byref(startup),C.byref(process)):
  raise C.WinError(C.get_last_error())
 tid=process.tid
 for _ in range(50):
  if tdesk(tid) and name(tdesk(tid))==deskname:break
  time.sleep(.1)
 assert name(tdesk(tid))==deskname, 'Unexpected desktop for receiver'
 probe=subprocess.run(['node',str(Path('tests/windows-paste.cjs').resolve())],env=env,timeout=110)
 sys.exit(probe.returncode)
finally:
 if process.process:
  if K.WaitForSingleObject(process.process,0)==258:
   K.TerminateProcess(process.process,0);K.WaitForSingleObject(process.process,5000)
  K.CloseHandle(process.thread);K.CloseHandle(process.process)
 time.sleep(1)
 marker=tmp/'data'/'test-identity'
 if marker.is_file():
  import re
  identifier=marker.read_text().strip()
  assert re.fullmatch(r'local\.devpad\.test-[0-9a-f]{1,16}',identifier)
  candidate=Path(os.environ['LOCALAPPDATA'])/identifier
  if candidate.is_dir() and not any(candidate.iterdir()):candidate.rmdir()
 assert tmp.parent==Path(tempfile.gettempdir()).resolve() and tmp.name.startswith('devpad-receiver-')
 for i in range(20):
  try:shutil.rmtree(tmp);break
  except OSError:
   if i==19:raise
   time.sleep(.25)
