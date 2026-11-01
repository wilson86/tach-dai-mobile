param([switch]$Owner,[string]$Marker)
$ErrorActionPreference='Stop'
$source=Join-Path (Split-Path $PSScriptRoot -Parent) 'team-settlement\windows-pilot-owned-job.cs'
Add-Type -Path $source
$exe=Join-Path $PSHOME 'powershell.exe'
if($Owner){
  $job=[KtsSyntheticPilot.OwnedJob]::new([datetime]::UtcNow.AddMinutes(1))
  $child=$job.Start($exe,'-NoProfile -Command "Start-Sleep -Seconds 30"',$PSHOME)
  [IO.File]::WriteAllText($Marker,[string]$child.Id)
  Start-Sleep -Seconds 20
  exit 2
}
$job=$null;$child=$null;$fixtureOwner=$null;$ownerChild=$null
$marker=Join-Path ([IO.Path]::GetTempPath()) ('kts-job-owned-'+[guid]::NewGuid().ToString('N')+'.txt')
try {
  $job=[KtsSyntheticPilot.OwnedJob]::new([datetime]::UtcNow.AddMinutes(1))
  $child=$job.Start($exe,'-NoProfile -Command "Start-Sleep -Seconds 30"',$PSHOME)
  if($child.HasExited){throw 'FIXTURE_CHILD_EARLY_EXIT'}
  $job.Dispose();$job=$null
  if(-not $child.WaitForExit(5000)){throw 'JOB_DISPOSE_CHILD_ALIVE'}
  $job=[KtsSyntheticPilot.OwnedJob]::new([datetime]::UtcNow.AddSeconds(2))
  $child=$job.Start($exe,'-NoProfile -Command "Start-Sleep -Seconds 30"',$PSHOME)
  if(-not $child.WaitForExit(6000)){throw 'JOB_DEADLINE_CHILD_ALIVE'}
  $job.Dispose();$job=$null
  $fixtureOwner=Start-Process -FilePath $exe -ArgumentList @('-NoProfile','-File',('"'+$PSCommandPath+'"'),'-Owner','-Marker',('"'+$marker+'"')) -WindowStyle Hidden -PassThru
  $until=[datetime]::UtcNow.AddSeconds(8)
  while(-not(Test-Path -LiteralPath $marker) -and [datetime]::UtcNow -lt $until){Start-Sleep -Milliseconds 50}
  if(-not(Test-Path -LiteralPath $marker)){throw 'OWNER_MARKER_MISSING'}
  $childId=[int][IO.File]::ReadAllText($marker);$ownerChild=Get-Process -Id $childId -ErrorAction Stop
  $fixtureOwner.Kill();if(-not $fixtureOwner.WaitForExit(5000)){throw 'OWNER_EXIT_TIMEOUT'}
  if(-not $ownerChild.WaitForExit(5000)){throw 'OWNER_EXIT_CHILD_ALIVE'}
  'JOB_DISPOSE=PASS;JOB_DEADLINE=PASS;OWNER_EXIT=PASS;POSTGRESQL=NOT_RUN'
} finally {
  if($job){$job.Dispose()}
  foreach($p in @($child,$ownerChild,$fixtureOwner)){if($p){$p.Refresh();if(-not $p.HasExited){$p.Kill();[void]$p.WaitForExit(5000)};$p.Dispose()}}
  Remove-Item -LiteralPath $marker -Force -ErrorAction SilentlyContinue
}
