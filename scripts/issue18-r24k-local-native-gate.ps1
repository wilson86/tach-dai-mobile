# WILSON86 Issue18 — Native Node qualification only, no server, no deployment.
# Operator/Codex invoked on isolated C: checkouts; never production or E:/F:.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$MobileRoot,
  [Parameter(Mandatory=$true)][string]$NgangRoot,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ExpectedMobileSHA,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ExpectedNgangSHA,
  [Parameter(Mandatory=$true)][string]$EvidenceRoot
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Assert-CPath([string]$Path,[bool]$MustExist=$true) {
  $full = [System.IO.Path]::GetFullPath($Path).TrimEnd([char]'\')
  if(-not $full.StartsWith('C:\',[StringComparison]::OrdinalIgnoreCase)) { throw "C_ONLY_HOLD: $full" }
  if($MustExist -and -not (Test-Path -LiteralPath $full -PathType Container)) { throw "DIRECTORY_MISSING_HOLD: $full" }
  if(Test-Path -LiteralPath $full) {
    $node = Get-Item -LiteralPath $full -Force
    if(($node.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw "REPARSE_POINT_HOLD: $full" }
  }
  return $full
}
$MobileRoot = Assert-CPath $MobileRoot
$NgangRoot = Assert-CPath $NgangRoot
$EvidenceRoot = Assert-CPath $EvidenceRoot $false
if($MobileRoot -eq $NgangRoot -or $EvidenceRoot -eq $MobileRoot -or $EvidenceRoot -eq $NgangRoot) {throw 'WORKSPACE_OVERLAP_HOLD'}
foreach($tool in @('git','node')){if(-not (Get-Command $tool -ErrorAction SilentlyContinue)) {throw "TOOL_NOT_FOUND_HOLD: $tool"}}
function Check-Repo([string]$Root,[string]$Expected) {
  $inside = (& git -C $Root rev-parse --is-inside-work-tree 2>&1 | Out-String).Trim()
  if($LASTEXITCODE -ne 0 -or $inside -ne 'true'){throw "GIT_CHECKOUT_HOLD: $Root"}
  $head = (& git -C $Root rev-parse HEAD 2>&1 | Out-String).Trim()
  if($LASTEXITCODE -ne 0 -or $head -ne $Expected){throw "SHA_MISMATCH_HOLD: expected=$Expected actual=$head"}
  $dirty = (& git -C $Root status --porcelain=v1 --untracked-files=normal 2>&1 | Out-String).Trim()
  if($LASTEXITCODE -ne 0 -or $dirty){throw "DIRTY_CHECKOUT_HOLD: $Root"}
  return $head
}
$mobileSHA = Check-Repo $MobileRoot $ExpectedMobileSHA
$ngangSHA = Check-Repo $NgangRoot $ExpectedNgangSHA
New-Item -ItemType Directory -Path $EvidenceRoot -Force | Out-Null
$runStamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$runPath = Join-Path $EvidenceRoot ("native_quyt_$runStamp")
New-Item -ItemType Directory -Path $runPath | Out-Null
$names = @(
  'tests/issue18-quyt-ticket-synthetic.test.js',
  'tests/issue18-quyt-ticket-ui.test.js',
  'tests/customer-message-review.test.js',
  'tests/quyt-bao-review.test.js',
  'tests/quyt-exact-review.test.js',
  'tests/quyt-bao-ui-contract.test.js',
  'tests/clean-aggregate-review.test.js'
)
$receipts = [System.Collections.Generic.List[object]]::new()
function Run-Command([string]$App,[string]$Root,[string]$Name,[string[]]$Args) {
  $log = Join-Path $runPath "$App-$Name.log"
  Push-Location -LiteralPath $Root
  try {
    & node @Args 2>&1 | Out-File -LiteralPath $log -Encoding utf8
    $code = $LASTEXITCODE
  } catch {
    "RUN_EXCEPTION: $($_.Exception.Message)" | Out-File -LiteralPath $log -Encoding utf8
    $code = 998
  } finally { Pop-Location }
  $receipts.Add([pscustomobject]@{app=$App;cmd=('node '+($Args -join ' '));exit_code=$code;log=$log})
  return $code
}
$failed = $false
foreach($entry in @(
  [pscustomobject]@{app='mobile';root=$MobileRoot},
  [pscustomobject]@{app='ngang';root=$NgangRoot}
)) {
  $a = Run-Command $entry.app $entry.root 'focused' (@('--test')+$names)
  $b = Run-Command $entry.app $entry.root 'assets' @('tests/release-review-asset-consistency.js')
  if($a -ne 0 -or $b -ne 0){$failed=$true}
}
$receipt = [ordered]@{
 schema='WILSON86_KTS_ISSUE18_NATIVE_QUALIFICATION_V1'
 utc=[DateTime]::UtcNow.ToString('o')
 mobile_sha=$mobileSHA
 ngang_sha=$ngangSHA
 node_version=((& node --version 2>&1 | Out-String).Trim())
 native_qa= $(if($failed){'FAIL'}else{'PASS'})
 chrome_qa='NOT_RUN'
 android_qa='NOT_RUN'
 router_desktop_parity='NOT_RUN'
 production='NO_GO'
 cost_usd=0
 tasks=$receipts.ToArray()
}
$path = Join-Path $runPath 'receipt.json'
$receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $path -Encoding utf8
Write-Output "NATIVE_GATE=$(if($failed){'FAIL'}else{'PASS'})"
Write-Output "RECEIPT=$path"
Write-Output 'CHROME=NOT_RUN ANDROID=NOT_RUN ROUTER_DESKTOP=NOT_RUN RELEASE=NO_GO COST_USD=0'
if($failed){exit 1}
