$ErrorActionPreference='Stop'
$runner='C:\KTS-Settlement\w20-2d63c84e\Run-RealPilot20.ps1'
$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($runner,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'RUNNER_PARSE_FAILED'}
foreach($name in @('Get-KtsOwnedPgJob','Invoke-PgCtl')){
  $fn=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
  if(-not $fn){throw "RUNNER_FUNCTION_MISSING_$name"};Invoke-Expression $fn.Extent.Text
}
function Assert-True($value,$message){if(-not $value){throw $message}}
function Get-KtsSha256($p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash}
function AtomicJson($p,$v){[IO.File]::WriteAllText($p,($v|ConvertTo-Json -Depth 8))}
$control='C:\KTS-Settlement\w20-2d63c84e';$deadline=[datetimeoffset]::UtcNow.AddMinutes(1)
$root=Join-Path ([IO.Path]::GetTempPath()) ('kts-pgctl-owned-fixture-'+[guid]::NewGuid().ToString('N'))
$bin=Join-Path $root 'bin';$pgdata=Join-Path $root 'data';$evidence=Join-Path $root 'evidence';$other=Join-Path $root 'other'
New-Item -ItemType Directory -Path $bin,$pgdata,$evidence,$other -Force|Out-Null
$marker=Join-Path $root 'child-id.txt';$script:ownedPgJob=$null;$ownedChild=$null
try {
  $driftDir=Join-Path $root 'r6-grants-d06feeb\team-settlement';New-Item -ItemType Directory -Path $driftDir -Force|Out-Null
  [IO.File]::WriteAllText((Join-Path $driftDir 'windows-pilot-owned-job.cs'),'// altered fixture')
  $originalControl=$control;$control=$root;$driftRejected=$false
  try{Get-KtsOwnedPgJob|Out-Null}catch{$driftRejected=$_.Exception.Message -eq 'OWNED_JOB_SOURCE_DRIFT'}finally{$control=$originalControl}
  if(-not $driftRejected -or $script:ownedPgJob){throw 'RUNNER_JOB_SOURCE_DRIFT_ACCEPTED'}
  $fake=@'
using System;
using System.Diagnostics;
using System.IO;
class FakePgCtl {
  static int Main(string[] args) {
    int i=Array.IndexOf(args,"-l"); if(i<0||i+1>=args.Length)return 2;
    var info=new ProcessStartInfo(Environment.GetFolderPath(Environment.SpecialFolder.System)+@"\WindowsPowerShell\v1.0\powershell.exe", "-NoProfile -Command \"Start-Sleep -Seconds 30\"");
    info.UseShellExecute=false;info.CreateNoWindow=true;
    var child=Process.Start(info);File.WriteAllText(args[i+1],child.Id.ToString());return 0;
  }
}
'@
  Add-Type -TypeDefinition $fake -OutputAssembly (Join-Path $bin 'pg_ctl.exe') -OutputType ConsoleApplication
  $receipt=Invoke-PgCtl @('-D',$pgdata,'-l',$marker,'-w','start') 'synthetic-start' 10
  if($receipt.exit_code -ne 0 -or -not(Test-Path -LiteralPath $marker)){throw 'RUNNER_JOB_START_FAILED'}
  $ownedChild=Get-Process -Id ([int][IO.File]::ReadAllText($marker)) -ErrorAction Stop
  if($ownedChild.HasExited){throw 'RUNNER_JOB_CHILD_EARLY_EXIT'}
  $rejected=$false;try{Invoke-PgCtl @('-D',$other,'-l',$marker,'-w','start') 'wrong-root' 10|Out-Null}catch{$rejected=$_.Exception.Message -eq 'PGCTL_DATA_ROOT_MISMATCH'}
  if(-not $rejected){throw 'RUNNER_JOB_WRONG_ROOT_ACCEPTED'}
  $script:ownedPgJob.Dispose();$script:ownedPgJob=$null
  if(-not $ownedChild.WaitForExit(5000)){throw 'RUNNER_JOB_DESCENDANT_ALIVE'}
  'RUNNER_JOB_INVOCATION=PASS;ROOT_GUARD=PASS;SOURCE_DRIFT=PASS;DESCENDANT_CLEANUP=PASS;POSTGRESQL=NOT_RUN'
} finally {
  if($script:ownedPgJob){$script:ownedPgJob.Dispose()}
  if($ownedChild){$ownedChild.Refresh();if(-not $ownedChild.HasExited){$ownedChild.Kill();[void]$ownedChild.WaitForExit(5000)};$ownedChild.Dispose()}
  foreach($p in @($marker,(Join-Path $evidence 'pgctl-synthetic-start.receipt.json'),(Join-Path $bin 'pg_ctl.exe'),(Join-Path $driftDir 'windows-pilot-owned-job.cs'))){Remove-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue}
  foreach($p in @($driftDir,(Split-Path -Parent $driftDir),$bin,$pgdata,$evidence,$other,$root)){Remove-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue}
}
