[CmdletBinding()]
param(
  [string]$AuthorizationPath,
  [switch]$OfflineAdmissionTest,
  [string]$OfflineLifecycleManifest
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$control='C:\KTS-Settlement\w20-2d63c84e'
$source='C:\KTS-Settlement\android-pilot-stage-a-52f860a\tach-dai-mobile-b2-group-app'
$wrapper=Join-Path $control 'Invoke-KtsBlueStacksLiveAcceptance.ps1'
$expected='9DA554278366690954CCC0C7AF56DE4A2DCC3A40A9133943621680848FC2998D'
if(-not(Test-Path -LiteralPath $wrapper -PathType Leaf)){throw 'MINIMAL_WRAPPER_SOURCE_DRIFT'}
$stream=[IO.File]::OpenRead($wrapper)
try{$sha=[Security.Cryptography.SHA256]::Create();try{$actual=([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','')}finally{$sha.Dispose()}}finally{$stream.Dispose()}
if($actual -cne $expected){throw 'MINIMAL_WRAPPER_SOURCE_DRIFT'}
if(-not [string]::IsNullOrWhiteSpace($OfflineLifecycleManifest)){
  if($env:KTS_R6_ROOTLESS_TEST -ne '1' -or $env:NODE_ENV -ne 'test' -or $OfflineAdmissionTest -or -not [string]::IsNullOrWhiteSpace($AuthorizationPath)){throw 'MINIMAL_OFFLINE_LIFECYCLE_DENIED'}
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $wrapper -SourceRoot $source -ControlRoot $control -OfflineR6FullLifecycle -MinimalRlsLogout -R6FixtureManifest $OfflineLifecycleManifest
}elseif($OfflineAdmissionTest){
  if($env:KTS_R6_ROOTLESS_TEST -ne '1' -or $env:NODE_ENV -ne 'test' -or -not [string]::IsNullOrWhiteSpace($AuthorizationPath)){throw 'MINIMAL_OFFLINE_ADMISSION_DENIED'}
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $wrapper -SourceRoot $source -ControlRoot $control -OfflineMinimalAdmissionSelfTest
}else{
  if([string]::IsNullOrWhiteSpace($AuthorizationPath)){throw 'MINIMAL_AUTHORIZATION_REQUIRED'}
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $wrapper -SourceRoot $source -ControlRoot $control -MinimalRlsLogout -MinimalAuthorizationPath $AuthorizationPath
}
exit $LASTEXITCODE
