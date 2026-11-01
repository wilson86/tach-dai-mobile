param([ValidateSet('nonzero','timeout','deadline-stop')][string]$Scenario='nonzero')
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
$root=Join-Path ([IO.Path]::GetTempPath()) ('kts-job-failure-'+[guid]::NewGuid().ToString('N'))
$bin=Join-Path $root 'bin';$pgdata=Join-Path $root 'data';$evidence=Join-Path $root 'evidence'
New-Item -ItemType Directory -Path $bin,$pgdata,$evidence -Force|Out-Null
$marker=Join-Path $root 'child-id.txt';$script:ownedPgJob=$null;$ownedChild=$null
try {
  $fake=@'
using System;using System.Diagnostics;using System.IO;using System.Threading;
class FakePgCtlFailure {
  static int Main(string[] args) {
    int i=Array.IndexOf(args,"-l"); if(i<0||i+1>=args.Length)return 2;
    if(Array.IndexOf(args,"--fixture-deadline-stop")>=0){File.WriteAllText(args[i+1],"no-child");Thread.Sleep(20000);return 0;}
    var info=new ProcessStartInfo(Environment.GetFolderPath(Environment.SpecialFolder.System)+@"\WindowsPowerShell\v1.0\powershell.exe", "-NoProfile -Command \"Start-Sleep -Seconds 30\"");
    info.UseShellExecute=false;info.CreateNoWindow=true;
    var child=Process.Start(info);File.WriteAllText(args[i+1],child.Id.ToString());
    if(Array.IndexOf(args,"--fixture-timeout")>=0){Thread.Sleep(20000);return 0;}
    return 17;
  }
}
'@
  Add-Type -TypeDefinition $fake -OutputAssembly (Join-Path $bin 'pg_ctl.exe') -OutputType ConsoleApplication
  $extra=if($Scenario -eq 'deadline-stop'){'--fixture-deadline-stop'}elseif($Scenario -eq 'timeout'){'--fixture-timeout'}else{'--fixture-nonzero'}
  $verb=if($Scenario -eq 'deadline-stop'){'stop'}else{'start'}
  $commandTimeout=if($Scenario -eq 'deadline-stop'){6}else{1}
  if($Scenario -eq 'deadline-stop'){$deadline=[datetimeoffset]::UtcNow.AddSeconds(2)}
  $started=[datetimeoffset]::UtcNow
  $caught='';try{Invoke-PgCtl @('-D',$pgdata,'-l',$marker,$extra,'-w',$verb) 'synthetic-failure' $commandTimeout|Out-Null}catch{$caught=$_.Exception.Message}
  $elapsed=([datetimeoffset]::UtcNow-$started).TotalSeconds
  $expected=if($Scenario -in @('timeout','deadline-stop')){'PG_CTL_TIMEOUT_synthetic-failure'}else{'PG_CTL_FAILED_synthetic-failure_17'}
  if($caught -ne $expected){throw "FAILURE_NOT_PROPAGATED_$caught"}
  if($Scenario -eq 'deadline-stop' -and $elapsed -gt 4){throw "DEADLINE_OVERRUN_$elapsed"}
  $receipt=Get-Content -Raw -LiteralPath (Join-Path $evidence 'pgctl-synthetic-failure.receipt.json')|ConvertFrom-Json
  if($Scenario -eq 'deadline-stop' -and ($null -eq $receipt.wait_milliseconds -or $receipt.wait_milliseconds -gt 2000)){throw 'DEADLINE_WAIT_RECEIPT_INVALID'}
  if($Scenario -in @('timeout','deadline-stop')) {if($receipt.timed_out -ne $true -or $null -ne $receipt.exit_code){throw 'TIMEOUT_RECEIPT_INVALID'}}
  else {if($receipt.timed_out -ne $false -or $receipt.exit_code -ne 17){throw 'NONZERO_RECEIPT_INVALID'}}
  if($Scenario -ne 'deadline-stop'){
    $ownedChild=Get-Process -Id ([int][IO.File]::ReadAllText($marker)) -ErrorAction Stop
    $script:ownedPgJob.Dispose();$script:ownedPgJob=$null
    if(-not $ownedChild.WaitForExit(5000)){throw 'FAILED_START_DESCENDANT_ALIVE'}
  }
  $cleanupStatus=if($Scenario -eq 'deadline-stop'){'NOT_APPLICABLE_NO_JOB'}else{'PASS'}
  "RUNNER_${Scenario}_FAIL_CLOSED=PASS;JOB_CLEANUP=$cleanupStatus;POSTGRESQL=NOT_RUN"
} finally {
  if($script:ownedPgJob){$script:ownedPgJob.Dispose()}
  if($ownedChild){$ownedChild.Refresh();if(-not $ownedChild.HasExited){$ownedChild.Kill();[void]$ownedChild.WaitForExit(5000)};$ownedChild.Dispose()}
  foreach($p in @($marker,(Join-Path $evidence 'pgctl-synthetic-failure.receipt.json'),(Join-Path $bin 'pg_ctl.exe'))){Remove-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue}
  foreach($p in @($bin,$pgdata,$evidence,$root)){Remove-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue}
}
