Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$control='C:\KTS-Settlement\w20-2d63c84e'
$source=Join-Path $control 'Run-RealPilot20.ps1'
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'RUNNER_PARSE_FAILED'}
$nodes=@($ast.FindAll({param($n) $n -is [System.Management.Automation.Language.IfStatementAst] -and $n.Extent.Text.StartsWith('if($MinimalRlsLogout -and -not $OfflineR6Lifecycle){') -and $n.Extent.Text.Contains('LEDGER_AUDIT_SOURCE_DRIFT')},$true))
if($nodes.Count -ne 1){throw 'AUDIT_BRANCH_NOT_UNIQUE'}
$branch=[scriptblock]::Create($nodes[0].Extent.Text)
$MinimalRlsLogout=$true;$OfflineR6Lifecycle=$false;$Database='l20_db_a1';$ledger='l20_led_a1';$LedgerPassword='fixture-secret';$run='local20_fixture'
$EvidenceDir=Join-Path $control ('evidence\ledger-branch-test-'+[guid]::NewGuid().ToString('N'));New-Item -ItemType Directory -Path $EvidenceDir|Out-Null
function Get-KtsSha256($p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash}
function Assert-True($v,[string]$m){if(-not $v){throw $m}}
function AtomicJson($p,$v){if($v.evidence_type -ne 'REAL_POSTGRESQL'){throw 'RUNNER_EVIDENCE_TYPE_CHANGED'};$v.evidence_type='MOCKED_PSQL_PROCESS';[IO.File]::WriteAllText($p,($v|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))}
function node.exe { $global:LASTEXITCODE=$script:fixtureExit;return (@{role=$ledger;status=$script:fixtureStatus;direct_mutation_grants=@('scope_update');source='MOCKED_PSQL_PROCESS'}|ConvertTo-Json -Compress) }
$previous=$env:PGPASSWORD;$env:PGPASSWORD='prior-fixture'
try{
  $rootEvidence=$EvidenceDir
  foreach($case in @(@{status='BLOCKED_DIRECT_SCOPE_MUTATION';error='LEDGER_DIRECT_SCOPE_MUTATION_BLOCKED';exit=0},@{status='NO_DIRECT_SCOPE_GRANTS_OBSERVED';error='LEDGER_SAME_WORKSPACE_AUTHORIZATION_NOT_VERIFIED';exit=0},@{status='PROCESS_FAILED';error='LEDGER_AUDIT_PROCESS_FAILED';exit=1})){
    $EvidenceDir=Join-Path $rootEvidence $case.status;New-Item -ItemType Directory -Path $EvidenceDir|Out-Null
    $script:fixtureStatus=$case.status;$script:fixtureExit=$case.exit;$failure=$null
    try{& $branch}catch{$failure=$_.Exception.Message}
    if($failure -ne $case.error){throw 'AUDIT_GATE_FAILED'}
    $evidencePath=Join-Path $EvidenceDir 'LEDGER_SCOPE_GRANT_AUDIT.json'
    if($case.exit -eq 0){$evidence=Get-Content -Raw -LiteralPath $evidencePath|ConvertFrom-Json;if($evidence.audit.status -ne $case.status){throw 'AUDIT_EVIDENCE_FAILED'};if((Get-Content -Raw $evidencePath).Contains($LedgerPassword)){throw 'AUDIT_SECRET_LEAK'}}elseif(Test-Path -LiteralPath $evidencePath){throw 'FAILED_PROCESS_CREATED_PASS_EVIDENCE'}
    if($env:PGPASSWORD -ne 'prior-fixture'){throw 'AUDIT_ENV_NOT_RESTORED'}
  }
  [ordered]@{status='PASS';method='EXACT_RUNNER_BRANCH_WITH_MOCKED_PSQL';real_postgresql='NOT_RUN';fixture=$rootEvidence}|ConvertTo-Json
}finally{$env:PGPASSWORD=$previous}
