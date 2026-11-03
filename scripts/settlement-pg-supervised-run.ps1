param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$ExpectedSha,
  [ValidateSet('Live','Synthetic')][string]$Mode='Synthetic'
)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSEdition -eq 'Desktop'){$env:PSModulePath=Join-Path $PSHOME 'Modules'}
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(-not $root.StartsWith('C:\KTS-Settlement\',[StringComparison]::OrdinalIgnoreCase)){throw 'CHECKOUT_C_ONLY'}
$actual=(& git -C $root rev-parse HEAD).Trim()
if($LASTEXITCODE -ne 0 -or $actual -cne $ExpectedSha){throw 'SOURCE_SHA_MISMATCH'}
if($Mode -eq 'Live' -and (& git -C $root status --porcelain --untracked-files=no)){throw 'SOURCE_DIRTY'}
$control='C:\KTS-Settlement\w20-2d63c84e'
$supervisor=Join-Path $control 'session-supervisor.ps1';$watchdog=Join-Path $control 'watchdog.ps1'
$jobSource=Join-Path $root 'team-settlement\windows-pilot-owned-job.cs'
$pins=@{ $supervisor='55DF8D8F6D3E1B5C1AB6CF741FDED38DFB3C2D732B3F154637D6534C49F703EF'; $watchdog='85A4BF399168586B9CCCE248835DB99A89C6E5A3280DE2E32413C92663BE2C02'; $jobSource='417F905FFE9425B87041F53527261AFAFB0C749D1BF6DF03B10EAFC7C2967BC9' }
foreach($p in $pins.Keys){if((Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash -cne $pins[$p]){throw 'CONTROL_SOURCE_DRIFT'}}
$node=(Get-Command node.exe -ErrorAction Stop).Source
if(-not $node.StartsWith('C:\',[StringComparison]::OrdinalIgnoreCase)){throw 'NODE_C_ONLY'}
$id='pg_supervised_'+[guid]::NewGuid().ToString('N')
$evidence=Join-Path 'C:\KTS-Settlement' $id
New-Item -Path $evidence -ItemType Directory -ErrorAction Stop|Out-Null
$self=Get-Process -Id $PID;$deadline=[DateTimeOffset]::UtcNow.AddMinutes(8)
$manifest=Join-Path $evidence 'manifest.json'
$record=[ordered]@{owner='KTS_PG_SYNTHETIC';session_id=$id;deadline_utc=$deadline.ToString('o');launcher=@{pid=$PID;started_utc=$self.StartTime.ToUniversalTime().ToString('o')};evidence=$evidence;cleanup_watchdog=$watchdog;pids=@(@{pid=$PID;name=$self.ProcessName;started_utc=$self.StartTime.ToUniversalTime().ToString('o')})}
[IO.File]::WriteAllText($manifest,($record|ConvertTo-Json -Depth 8),(New-Object Text.UTF8Encoding($false)))
$sup=$null;$job=$null;$child=$null;$result=[ordered]@{session_id=$id;source_sha=$actual;mode=$Mode;status='NOT_RUN';postgres='NOT_RUN'}
if($Mode -eq 'Live'){$result.postgres='UNVERIFIED_SEE_QUALIFICATION'}
try {
 $ps=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
 if(-not $ps.StartsWith('C:\',[StringComparison]::OrdinalIgnoreCase) -or -not(Test-Path -LiteralPath $ps)){throw 'POWERSHELL_C_ONLY'}
 $sup=Start-Process -FilePath $ps -ArgumentList @('-NoProfile','-File',('"'+$supervisor+'"'),'-Manifest',('"'+$manifest+'"')) -WindowStyle Hidden -PassThru
 $ready=Join-Path $evidence 'SUPERVISOR_READY.json';$until=[DateTimeOffset]::UtcNow.AddSeconds(10)
 while(-not(Test-Path -LiteralPath $ready)){if($sup.HasExited -or [DateTimeOffset]::UtcNow -ge $until){throw 'SUPERVISOR_NOT_ARMED'};Start-Sleep -Milliseconds 50}
 $ack=Get-Content -Raw -LiteralPath $ready|ConvertFrom-Json
 if($ack.status -cne 'ARMED' -or $ack.session_id -cne $id -or $ack.supervisor_pid -ne $sup.Id){throw 'SUPERVISOR_ACK_INVALID'}
 Add-Type -Path $jobSource
 $job=New-Object KtsSyntheticPilot.OwnedJob ($deadline.UtcDateTime)
 if($Mode -eq 'Live'){$entry=Join-Path $root 'scripts\settlement-pg-isolated-migrations.cjs';$nodeArgs=('"{0}" --run --expected-sha={1}' -f $entry,$ExpectedSha)}
 else {$entry=Join-Path $root 'tests\settlement-pg-supervised-fixture.cjs';$nodeArgs=('"{0}" "{1}"' -f $entry,$evidence)}
 $child=$job.Start($node,$nodeArgs,$root)
 $result.node_pid=$child.Id;$result.node_start=$child.StartTime.ToUniversalTime().ToString('o')
 $remaining=[int][Math]::Max(1,($deadline-[DateTimeOffset]::UtcNow).TotalMilliseconds)
 if(-not $child.WaitForExit($remaining)){throw 'JOB_DEADLINE_EXPIRED'}
 $result.node_exit=$child.ExitCode
 if($result.node_exit -ne 0){throw 'NODE_QUALIFICATION_FAILED'}
 $result.status='PASS_NODE_EXIT_ONLY'
} catch {$result.status='FAIL';$result.error=$_.Exception.Message;throw} finally {
 if($job){$job.Dispose()};if($child){$child.Dispose()}
 [IO.File]::WriteAllText((Join-Path $evidence 'LAUNCHER_TERMINAL.json'),($result|ConvertTo-Json -Depth 6),(New-Object Text.UTF8Encoding($false)))
 Write-Output ('PG_SUPERVISED_EVIDENCE='+$evidence)
}
