// Synthetic pilot candidate. Not PostgreSQL-qualified or approved for live use.
// Creates each process atomically inside a kill-on-close job. Keep the runner's
// independently supervised lifecycle and graceful pg_ctl stop in place.
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace KtsSyntheticPilot {
  public sealed class OwnedJob : IDisposable {
    [StructLayout(LayoutKind.Sequential)] struct BasicLimit {
      public long ProcessTime, JobTime; public uint Flags;
      public UIntPtr MinWorking, MaxWorking; public uint ActiveLimit;
      public UIntPtr Affinity; public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct IoCounters {
      public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes;
    }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimit {
      public BasicLimit Basic; public IoCounters Io; public UIntPtr ProcessMemory, JobMemory, PeakProcess, PeakJob;
    }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct StartupInfo {
      public int cb; public string reserved, desktop, title;
      public uint x,y,xSize,ySize,xChars,yChars,fill,flags;
      public ushort show,reserved2; public IntPtr reservedPtr,stdin,stdout,stderr;
    }
    [StructLayout(LayoutKind.Sequential)] struct StartupInfoEx { public StartupInfo info; public IntPtr attributes; }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr process,thread; public uint pid,tid; }
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes,string name);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int type,ref ExtendedLimit info,uint length);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,int flags,ref IntPtr size);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
    [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string application,StringBuilder command,IntPtr processAttributes,IntPtr threadAttributes,bool inherit,uint flags,IntPtr environment,string directory,ref StartupInfoEx startup,out ProcessInfo process);
    [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr process,uint exitCode);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    readonly object gate=new object(); IntPtr job; readonly DateTime deadline; Timer timer; bool disposed;
    static void Require(bool ok) { if(!ok) throw new Win32Exception(Marshal.GetLastWin32Error()); }
    public OwnedJob(DateTime deadlineUtc) {
      deadline=deadlineUtc.ToUniversalTime();
      var remaining=deadline-DateTime.UtcNow;
      if(remaining<=TimeSpan.Zero || remaining>TimeSpan.FromMinutes(60)) throw new InvalidOperationException("JOB_DEADLINE_INVALID");
      job=CreateJobObject(IntPtr.Zero,null);Require(job!=IntPtr.Zero);
      try {
        var limit=new ExtendedLimit();limit.Basic.Flags=0x2000;
        Require(SetInformationJobObject(job,9,ref limit,(uint)Marshal.SizeOf(typeof(ExtendedLimit))));
        timer=new Timer(_=>Dispose(),null,remaining,Timeout.InfiniteTimeSpan);
      } catch {CloseHandle(job);job=IntPtr.Zero;throw;}
    }
    public Process Start(string executable,string arguments,string directory) {
      lock(gate) {
        if(disposed || DateTime.UtcNow>=deadline) throw new InvalidOperationException("JOB_DEADLINE_EXPIRED");
        if(String.IsNullOrWhiteSpace(executable)||!System.IO.Path.IsPathRooted(executable)||executable.Contains("\"")) throw new ArgumentException("JOB_EXECUTABLE_INVALID");
        IntPtr size=IntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size);
        if(size==IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
        IntPtr list=Marshal.AllocHGlobal(size), jobArray=IntPtr.Zero; bool initialized=false; ProcessInfo pi=new ProcessInfo();
        try {
          Require(InitializeProcThreadAttributeList(list,1,0,ref size));initialized=true;
          jobArray=Marshal.AllocHGlobal(IntPtr.Size);Marshal.WriteIntPtr(jobArray,job);
          Require(UpdateProcThreadAttribute(list,0,(IntPtr)0x0002000d,jobArray,(IntPtr)IntPtr.Size,IntPtr.Zero,IntPtr.Zero));
          var si=new StartupInfoEx();si.info.cb=Marshal.SizeOf(typeof(StartupInfoEx));si.attributes=list;
          var command=new StringBuilder("\""+executable+"\" "+(arguments??""));
          Require(CreateProcess(executable,command,IntPtr.Zero,IntPtr.Zero,false,0x00080000|0x00000004|0x08000000,IntPtr.Zero,directory,ref si,out pi));
          try {
            var process=Process.GetProcessById((int)pi.pid);
            // Acquire the Process object's handle while the child is still
            // suspended; otherwise a short-lived child can disappear before
            // PowerShell reads its exit code.
            var stableHandle=process.Handle;
            if(ResumeThread(pi.thread)==0xffffffff) { process.Dispose();throw new Win32Exception(Marshal.GetLastWin32Error()); }
            return process;
          } catch {TerminateProcess(pi.process,1);throw;}
        } finally {
          if(pi.thread!=IntPtr.Zero)CloseHandle(pi.thread);if(pi.process!=IntPtr.Zero)CloseHandle(pi.process);
          if(jobArray!=IntPtr.Zero)Marshal.FreeHGlobal(jobArray);if(initialized)DeleteProcThreadAttributeList(list);Marshal.FreeHGlobal(list);
        }
      }
    }
    public void Dispose() {
      lock(gate) {if(disposed)return;disposed=true;if(timer!=null)timer.Dispose();if(job!=IntPtr.Zero){CloseHandle(job);job=IntPtr.Zero;}}
    }
  }
}
