$ErrorActionPreference='Stop'
$wrapper='C:\KTS-Settlement\w20-2d63c84e\Invoke-KtsBlueStacksLiveAcceptance.ps1'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($wrapper,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'WRAPPER_PARSE_FAILED'}
$fn=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Complete-R6RunnerCleanup'},$true)
if(-not $fn){throw 'CLEANUP_FUNCTION_MISSING'}
Invoke-Expression $fn.Extent.Text
function Assert-True($value,$message){if(-not $value){throw $message}}
function Write-AtomicJson($path,$value){[IO.File]::WriteAllText($path,($value|ConvertTo-Json -Depth 8))}
$MinimalRlsLogout=$false
$base=Join-Path ([IO.Path]::GetTempPath()) ('kts-cleanup-receipts-'+[guid]::NewGuid().ToString('N'))
$root=Join-Path $base 'fixture';$ev=Join-Path $root 'evidence'
New-Item -ItemType Directory -Path $ev -Force | Out-Null
try {
  $missing=Complete-R6RunnerCleanup $root $null
  if($missing.status -ne 'FAIL'){throw 'MISSING_MANIFEST_ACCEPTED'}
  Write-AtomicJson (Join-Path $root 'REAL_PILOT_MANIFEST.json') @{session_id='fixture_session'}
  $invalid=Complete-R6RunnerCleanup $root $null
  if($invalid.status -ne 'FAIL'){throw 'INVALID_MANIFEST_ACCEPTED'}
  Write-AtomicJson (Join-Path $root 'REAL_PILOT_MANIFEST.json') @{session_id='fixture_session';pids=@()}
  Write-AtomicJson (Join-Path $ev 'WATCHDOG_TERMINAL.json') @{status='PASS'}
  Write-AtomicJson (Join-Path $ev 'SUPERVISOR_TERMINAL.json') @{status='PASS';session_id='fixture_session'}
  $pass=Complete-R6RunnerCleanup $root $null
  if($pass.status -ne 'PASS'){throw 'VALID_RECEIPTS_REJECTED'}
  Write-AtomicJson (Join-Path $ev 'WATCHDOG_TERMINAL.json') @{status='FAIL'}
  $fail=Complete-R6RunnerCleanup $root $null
  if($fail.status -ne 'FAIL'){throw 'FAILED_RECEIPT_ACCEPTED'}
  Write-AtomicJson (Join-Path $ev 'WATCHDOG_TERMINAL.json') @{status='PASS'}
  Write-AtomicJson (Join-Path $ev 'SUPERVISOR_TERMINAL.json') @{status='PASS';session_id='wrong_session'}
  $wrongSession=Complete-R6RunnerCleanup $root $null
  if($wrongSession.status -ne 'FAIL'){throw 'WRONG_SESSION_ACCEPTED'}
  Write-Output 'CLEANUP_RECEIPT_FIXTURE=PASS (SYNTHETIC)'
} finally {
  foreach($name in @('GALAXY_SERVICE_STOP','WATCHDOG_TERMINAL.json','SUPERVISOR_TERMINAL.json','FINAL_CLEANUP.json')){Remove-Item -LiteralPath (Join-Path $ev $name) -Force -ErrorAction SilentlyContinue}
  Remove-Item -LiteralPath (Join-Path $root 'REAL_PILOT_MANIFEST.json') -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $ev -Force;Remove-Item -LiteralPath $root -Force;Remove-Item -LiteralPath $base -Force
}
