"""Disposable Windows process-containment experiment. No PostgreSQL or pilot.

The child is atomically assigned to a kill-on-close job using the Windows
process-creation job-list attribute. This is not integrated into the runner and does
not prove that PostgreSQL's actual process tree obeys the job policy.
"""
import ctypes
from ctypes import wintypes
import os
import queue
import subprocess
import sys
import threading
import time

if os.name != 'nt':
    raise SystemExit('WINDOWS_REQUIRED')
k = ctypes.WinDLL('kernel32', use_last_error=True)

class STARTUPINFO(ctypes.Structure):
    _fields_ = [('cb', wintypes.DWORD), ('lpReserved', wintypes.LPWSTR),
        ('lpDesktop', wintypes.LPWSTR), ('lpTitle', wintypes.LPWSTR),
        ('dwX', wintypes.DWORD), ('dwY', wintypes.DWORD),
        ('dwXSize', wintypes.DWORD), ('dwYSize', wintypes.DWORD),
        ('dwXCountChars', wintypes.DWORD), ('dwYCountChars', wintypes.DWORD),
        ('dwFillAttribute', wintypes.DWORD), ('dwFlags', wintypes.DWORD),
        ('wShowWindow', wintypes.WORD), ('cbReserved2', wintypes.WORD),
        ('lpReserved2', ctypes.POINTER(ctypes.c_byte)), ('hStdInput', wintypes.HANDLE),
        ('hStdOutput', wintypes.HANDLE), ('hStdError', wintypes.HANDLE)]
class PROCESS_INFORMATION(ctypes.Structure):
    _fields_ = [('hProcess', wintypes.HANDLE), ('hThread', wintypes.HANDLE),
                ('dwProcessId', wintypes.DWORD), ('dwThreadId', wintypes.DWORD)]
class STARTUPINFOEX(ctypes.Structure):
    _fields_ = [('StartupInfo',STARTUPINFO),('lpAttributeList',ctypes.c_void_p)]
class IO_COUNTERS(ctypes.Structure):
    _fields_ = [(n, ctypes.c_ulonglong) for n in ('ReadOperationCount','WriteOperationCount',
        'OtherOperationCount','ReadTransferCount','WriteTransferCount','OtherTransferCount')]
class BASIC_LIMIT(ctypes.Structure):
    _fields_ = [('PerProcessUserTimeLimit',ctypes.c_longlong),('PerJobUserTimeLimit',ctypes.c_longlong),
        ('LimitFlags',wintypes.DWORD),('MinimumWorkingSetSize',ctypes.c_size_t),
        ('MaximumWorkingSetSize',ctypes.c_size_t),('ActiveProcessLimit',wintypes.DWORD),
        ('Affinity',ctypes.c_size_t),('PriorityClass',wintypes.DWORD),('SchedulingClass',wintypes.DWORD)]
class EXTENDED_LIMIT(ctypes.Structure):
    _fields_ = [('BasicLimitInformation',BASIC_LIMIT),('IoInfo',IO_COUNTERS),
        ('ProcessMemoryLimit',ctypes.c_size_t),('JobMemoryLimit',ctypes.c_size_t),
        ('PeakProcessMemoryUsed',ctypes.c_size_t),('PeakJobMemoryUsed',ctypes.c_size_t)]

k.CreateJobObjectW.argtypes=[ctypes.c_void_p,wintypes.LPCWSTR]; k.CreateJobObjectW.restype=wintypes.HANDLE
k.SetInformationJobObject.argtypes=[wintypes.HANDLE,ctypes.c_int,ctypes.c_void_p,wintypes.DWORD];k.SetInformationJobObject.restype=wintypes.BOOL
k.CreateProcessW.argtypes=[wintypes.LPCWSTR,wintypes.LPWSTR,ctypes.c_void_p,ctypes.c_void_p,wintypes.BOOL,wintypes.DWORD,ctypes.c_void_p,wintypes.LPCWSTR,ctypes.POINTER(STARTUPINFO),ctypes.POINTER(PROCESS_INFORMATION)];k.CreateProcessW.restype=wintypes.BOOL
k.AssignProcessToJobObject.argtypes=[wintypes.HANDLE,wintypes.HANDLE];k.AssignProcessToJobObject.restype=wintypes.BOOL
k.InitializeProcThreadAttributeList.argtypes=[ctypes.c_void_p,wintypes.DWORD,wintypes.DWORD,ctypes.POINTER(ctypes.c_size_t)];k.InitializeProcThreadAttributeList.restype=wintypes.BOOL
k.UpdateProcThreadAttribute.argtypes=[ctypes.c_void_p,wintypes.DWORD,ctypes.c_size_t,ctypes.c_void_p,ctypes.c_size_t,ctypes.c_void_p,ctypes.c_void_p];k.UpdateProcThreadAttribute.restype=wintypes.BOOL
k.DeleteProcThreadAttributeList.argtypes=[ctypes.c_void_p]
k.ResumeThread.argtypes=[wintypes.HANDLE];k.ResumeThread.restype=wintypes.DWORD
k.TerminateProcess.argtypes=[wintypes.HANDLE,wintypes.UINT];k.TerminateProcess.restype=wintypes.BOOL
k.CloseHandle.argtypes=[wintypes.HANDLE];k.CloseHandle.restype=wintypes.BOOL
k.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD];k.OpenProcess.restype=wintypes.HANDLE
k.WaitForSingleObject.argtypes=[wintypes.HANDLE,wintypes.DWORD];k.WaitForSingleObject.restype=wintypes.DWORD

def must(ok):
    if not ok: raise ctypes.WinError(ctypes.get_last_error())

def owner(suspended=False):
    job=k.CreateJobObjectW(None,None);must(job)
    info=EXTENDED_LIMIT();info.BasicLimitInformation.LimitFlags=0x2000 # KILL_ON_JOB_CLOSE
    must(k.SetInformationJobObject(job,9,ctypes.byref(info),ctypes.sizeof(info)))
    needed=ctypes.c_size_t();k.InitializeProcThreadAttributeList(None,1,0,ctypes.byref(needed))
    storage=ctypes.create_string_buffer(needed.value)
    must(k.InitializeProcThreadAttributeList(storage,1,0,ctypes.byref(needed)))
    job_list=(wintypes.HANDLE*1)(job)
    must(k.UpdateProcThreadAttribute(storage,0,0x0002000D,ctypes.byref(job_list),ctypes.sizeof(job_list),None,None))
    startup=STARTUPINFOEX();startup.StartupInfo.cb=ctypes.sizeof(startup);startup.lpAttributeList=ctypes.cast(storage,ctypes.c_void_p);proc=PROCESS_INFORMATION()
    cmd=ctypes.create_unicode_buffer(subprocess.list2cmdline([sys.executable,'-c','import time; time.sleep(30)']))
    try:
        must(k.CreateProcessW(sys.executable,cmd,None,None,False,0x4|0x08000000|0x00080000,None,None,ctypes.byref(startup.StartupInfo),ctypes.byref(proc)))
    finally: k.DeleteProcThreadAttributeList(storage)
    try:
        try:
            if not suspended: must(k.ResumeThread(proc.hThread)!=0xffffffff)
        except BaseException:
            k.TerminateProcess(proc.hProcess,1)
            raise
        print(proc.dwProcessId,flush=True)
        time.sleep(20) # Parent kills this disposable owner during the test.
    finally:
        k.CloseHandle(proc.hThread);k.CloseHandle(proc.hProcess);k.CloseHandle(job)

def run_case(suspended):
    parent=subprocess.Popen([sys.executable,__file__,'--owner-suspended' if suspended else '--owner'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    q=queue.Queue()
    threading.Thread(target=lambda:q.put(parent.stdout.readline()),daemon=True).start()
    child=None; child_handle=None
    try:
        line=q.get(timeout=8).strip();child=int(line)
        child_handle=k.OpenProcess(0x00100001,False,child);must(child_handle)
        assert k.WaitForSingleObject(child_handle,0)==258,'fixture child did not start'
        parent.kill();parent.wait(timeout=5)
        assert k.WaitForSingleObject(child_handle,5000)==0,'job failed to terminate child after owner exit'
        print(('SUSPENDED' if suspended else 'RUNNING')+'_CHILD_OWNER_EXIT=PASS')
    finally:
        if parent.poll() is None: parent.kill();parent.wait(timeout=5)
        if child_handle:
            try:
                if k.WaitForSingleObject(child_handle,0)==258: k.TerminateProcess(child_handle,1)
                k.WaitForSingleObject(child_handle,3000)
            finally: k.CloseHandle(child_handle)

if __name__=='__main__':
    if sys.argv[1:]==['--owner']: owner()
    elif sys.argv[1:]==['--owner-suspended']: owner(suspended=True)
    elif not sys.argv[1:]:
        run_case(True);run_case(False);print('REAL_POSTGRESQL=NOT_RUN')
    else: raise SystemExit('INVALID_FIXTURE_ARGUMENT')
