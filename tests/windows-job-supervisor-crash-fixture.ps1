param([switch]$Worker,[string]$FixtureRoot,[string]$EvidenceDir)
$ErrorActionPreference='Stop'
$control='C:\KTS-Settlement\w20-2d63c84e'
if($Worker){
  $runner=Join-Path $control 'Run-RealPilot20.ps1';$tokens=$null;$errors=$null
  $ast=[Management.Automation.Language.Parser]::ParseFile($runner,[ref]$tokens,[ref]$errors)
  if($errors.Count){throw 'RUNNER_PARSE_FAILED'}
  foreach($name in @('Get-KtsOwnedPgJob','Invoke-PgCtl')){
    $fn=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
    if(-not $fn){throw "RUNNER_FUNCTION_MISSING_$name"};Invoke-Expression $fn.Extent.Text
  }
  function Assert-True($value,$message){if(-not $value){throw $message}}
  function Get-KtsSha256($p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash}
  function AtomicJson($p,$v){[IO.File]::WriteAllText($p,($v|ConvertTo-Json -Depth 8))}
  $bin=Join-Path $FixtureRoot 'bin';$pgdata=Join-Path $FixtureRoot 'data';$evidence=Join-Path $FixtureRoot 'evidence'
  $deadline=[datetimeoffset]::UtcNow.AddMinutes(1);$script:ownedPgJob=$null
  $end=[datetime]::UtcNow.AddSeconds(10);while(-not(Test-Path -LiteralPath (Join-Path $FixtureRoot 'go')) -and [datetime]::UtcNow -lt $end){Start-Sleep -Milliseconds 50}
  if(-not(Test-Path -LiteralPath (Join-Path $FixtureRoot 'go'))){throw 'FIXTURE_START_NOT_AUTHORIZED'}
  Invoke-PgCtl @('-D',$pgdata,'-l',(Join-Path $FixtureRoot 'child-id.txt'),'-w','start') 'crash-fixture' 10|Out-Null
  Start-Sleep -Seconds 20
  exit 2
}
$root=Join-Path ([IO.Path]::GetTempPath()) ('kts-job-supervisor-'+[guid]::NewGuid().ToString('N'))
$bin=Join-Path $root 'bin';$pgdata=Join-Path $root 'data';$evidence=Join-Path $root 'evidence'
New-Item -ItemType Directory -Path $bin,$pgdata,$evidence -Force|Out-Null
$launcher=$null;$supervisor=$null;$child=$null
try {
  $fake=@'
using System;using System.Diagnostics;using System.IO;
class FakePgCtlCrash {
 static int Main(string[] args) {
  int i=Array.IndexOf(args,"-l"); if(i<0||i+1>=args.Length)return 2;
  var info=new ProcessStartInfo(Environment.GetFolderPath(Environment.SpecialFolder.System)+@"\WindowsPowerShell\v1.0\powershell.exe", "-NoProfile -Command \"Start-Sleep -Seconds 30\"");
  info.UseShellExecute=false;info.CreateNoWindow=true;
  var child=Process.Start(info);File.WriteAllText(args[i+1],child.Id.ToString());return 0;
 }
}
'@
  Add-Type -TypeDefinition $fake -OutputAssembly (Join-Path $bin 'pg_ctl.exe') -OutputType ConsoleApplication
  $exe=Join-Path $PSHOME 'powershell.exe'
  $launcher=Start-Process -FilePath $exe -ArgumentList @('-NoProfile','-File',('"'+$PSCommandPath+'"'),'-Worker','-FixtureRoot',('"'+$root+'"')) -WindowStyle Hidden -PassThru
  $launcher.Refresh();$session='job_fixture_'+[guid]::NewGuid().ToString('N');$manifest=Join-Path $root 'manifest.json'
  $m=[ordered]@{owner='KTS_SYNTHETIC_JOB_FIXTURE';session_id=$session;deadline_utc=[datetimeoffset]::UtcNow.AddMinutes(1).ToString('o');launcher=@{pid=$launcher.Id;started_utc=$launcher.StartTime.ToUniversalTime().ToString('o')};evidence=$evidence;cleanup_watchdog=(Join-Path $control 'watchdog.ps1');pids=@()}
  [IO.File]::WriteAllText($manifest,($m|ConvertTo-Json -Depth 8))
  $supervisor=Start-Process -FilePath $exe -ArgumentList @('-NoProfile','-File',('"'+(Join-Path $control 'session-supervisor.ps1')+'"'),'-Manifest',('"'+$manifest+'"')) -WindowStyle Hidden -PassThru
  $end=[datetime]::UtcNow.AddSeconds(10);$ready=Join-Path $evidence 'SUPERVISOR_READY.json'
  while(-not(Test-Path -LiteralPath $ready) -and [datetime]::UtcNow -lt $end){Start-Sleep -Milliseconds 50}
  if(-not(Test-Path -LiteralPath $ready)){throw 'SUPERVISOR_READY_MISSING'}
  $ack=Get-Content -Raw -LiteralPath $ready|ConvertFrom-Json
  if($ack.status -ne 'ARMED' -or $ack.session_id -ne $session -or $ack.supervisor_pid -ne $supervisor.Id){throw 'SUPERVISOR_ACK_INVALID'}
  [IO.File]::WriteAllText((Join-Path $root 'go'),'start')
  $marker=Join-Path $root 'child-id.txt';$end=[datetime]::UtcNow.AddSeconds(10)
  while(-not(Test-Path -LiteralPath $marker) -and [datetime]::UtcNow -lt $end){Start-Sleep -Milliseconds 50}
  if(-not(Test-Path -LiteralPath $marker)){throw 'CHILD_MARKER_MISSING'}
  $receiptPath=Join-Path $evidence 'pgctl-crash-fixture.receipt.json'
  while(-not(Test-Path -LiteralPath $receiptPath) -and [datetime]::UtcNow -lt $end){Start-Sleep -Milliseconds 50}
  if(-not(Test-Path -LiteralPath $receiptPath)){throw 'FAKE_LAUNCH_RECEIPT_MISSING'}
  $fakeReceipt=Get-Content -Raw -LiteralPath $receiptPath|ConvertFrom-Json
  $childId=[int][IO.File]::ReadAllText($marker)
  $childRecord=Get-CimInstance Win32_Process -Filter "ProcessId=$childId" -ErrorAction Stop
  if($null -eq $childRecord -or $childRecord.ParentProcessId -ne $fakeReceipt.pid -or $childRecord.Name -ne 'powershell.exe' -or $childRecord.CommandLine -notlike '*Start-Sleep -Seconds 30*'){throw 'CHILD_IDENTITY_INVALID'}
  $child=Get-Process -Id $childId -ErrorAction Stop
  if($child.HasExited){throw 'CHILD_EXITED_EARLY'}
  $launcher.Kill();if(-not $launcher.WaitForExit(5000)){throw 'LAUNCHER_EXIT_TIMEOUT'}
  if(-not $child.WaitForExit(5000)){throw 'JOB_CHILD_REMAINS'}
  if(-not $supervisor.WaitForExit(10000)){throw 'SUPERVISOR_EXIT_TIMEOUT'}
  $w=Get-Content -Raw -LiteralPath (Join-Path $evidence 'WATCHDOG_TERMINAL.json')|ConvertFrom-Json
  $s=Get-Content -Raw -LiteralPath (Join-Path $evidence 'SUPERVISOR_TERMINAL.json')|ConvertFrom-Json
  if($w.status -ne 'PASS' -or $s.status -ne 'PASS' -or $s.session_id -ne $session -or $s.trigger -ne 'LAUNCHER_EXIT'){throw 'TERMINAL_RECEIPT_INVALID'}
  if($EvidenceDir){
    $allowed=[IO.Path]::GetFullPath((Join-Path $control 'evidence')).TrimEnd('\')+'\';$target=[IO.Path]::GetFullPath($EvidenceDir)
    if(-not $target.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $target)){throw 'EVIDENCE_PATH_INVALID'}
    New-Item -ItemType Directory -Path $target|Out-Null
    foreach($name in @('SUPERVISOR_READY.json','WATCHDOG_TERMINAL.json','SUPERVISOR_TERMINAL.json')){Copy-Item -LiteralPath (Join-Path $evidence $name) -Destination (Join-Path $target $name)}
    [IO.File]::WriteAllText((Join-Path $target 'FIXTURE_RESULT.json'),(@{session_id=$session;launcher_pid=$launcher.Id;child_pid=$child.Id;supervisor_pid=$supervisor.Id;job_child_exited=$true;postgresql='NOT_RUN'}|ConvertTo-Json))
  }
  'RUNNER_FUNCTION=PASS;JOB_CHILD_EXIT=PASS;SUPERVISOR=PASS;WATCHDOG=PASS_EMPTY_MANIFEST;POSTGRESQL=NOT_RUN'
} finally {
  foreach($p in @($launcher,$child,$supervisor)){if($p){$p.Refresh();if(-not $p.HasExited){$p.Kill();[void]$p.WaitForExit(5000)};$p.Dispose()}}
  foreach($p in @((Join-Path $root 'manifest.json'),(Join-Path $root 'go'),(Join-Path $root 'child-id.txt'),(Join-Path $bin 'pg_ctl.exe'),(Join-Path $evidence 'SUPERVISOR_READY.json'),(Join-Path $evidence 'WATCHDOG_TERMINAL.json'),(Join-Path $evidence 'SUPERVISOR_TERMINAL.json'),(Join-Path $evidence 'pgctl-crash-fixture.receipt.json'))){Remove-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue}
  foreach($p in @($bin,$pgdata,$evidence,$root)){Remove-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue}
}
