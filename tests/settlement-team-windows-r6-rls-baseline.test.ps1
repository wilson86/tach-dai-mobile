Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
. (Join-Path $repo 'team-settlement\windows-r6-rls-baseline.ps1')
function Assert-Test($value,[string]$message){if(-not $value){throw $message}}
$schema=Get-Content -Raw -LiteralPath (Join-Path $repo 'team-settlement\migrations\001_team_ledger.sql')
Assert-Test ($schema -match '(?s)CREATE TABLE IF NOT EXISTS kts_team\.memberships\s*\(.*?\bteam_role\s+text.*?\brevoked_at\s+timestamptz') 'MEMBERSHIP_SCHEMA_MISMATCH'
$sql=Get-R6OtherWorkspaceBaselineSql -Workspace 'fake_groupa_test' -Partner 'fake_customer_test' -BusinessDate '2026-10-26' -Region 'mn'
Assert-Test ($sql.StartsWith('SELECT json_build_object(') -and $sql.EndsWith('::text')) 'QUERY_SHAPE_INVALID'
Assert-Test ($sql.Contains("WHERE workspace_id='fake_groupb_test' AND team_role='operator' AND revoked_at IS NULL")) 'ACTIVE_OTHER_OPERATOR_QUERY_MISSING'
Assert-Test (-not $sql.Contains(" AND role='operator'")) 'OBSOLETE_ROLE_COLUMN_PRESENT'
Assert-Test ($sql.Contains("workspace_id='fake_groupa_test' AND partner_id='fake_customer_test' AND business_date='2026-10-26'::date AND region='mn'")) 'PROTECTED_SCOPE_QUERY_INVALID'
Assert-Test ($sql.Contains("'protected_scopes'") -and $sql.Contains("'protected_events'") -and $sql.Contains("'other_actor'")) 'NONVACUOUS_BASELINE_MISSING'
foreach($bad in @(
  @{Workspace="fake_groupa_test' OR true--";Partner='fake_customer_test';BusinessDate='2026-10-26';Region='mn'},
  @{Workspace='fake_groupb_test';Partner='fake_customer_test';BusinessDate='2026-10-26';Region='mn'},
  @{Workspace='fake_groupa_test';Partner="fake_customer_test'--";BusinessDate='2026-10-26';Region='mn'},
  @{Workspace='fake_groupa_test';Partner='fake_customer_test';BusinessDate='2026-10-27';Region='mn'},
  @{Workspace='fake_groupa_test';Partner='fake_customer_test';BusinessDate='2026-10-26';Region='mb'}
)){
  $rejected=$false
  try{[void](Get-R6OtherWorkspaceBaselineSql @bad)}catch{$rejected=$_.Exception.Message -eq 'R6_BASELINE_SCOPE_INVALID'}
  Assert-Test $rejected 'INVALID_SYNTHETIC_SCOPE_ACCEPTED'
}
[pscustomobject]@{status='PASS';schema='PASS';query_contract='PASS';invalid_scopes_rejected=5;evidence_type='OFFLINE_SOURCE_CONTRACT';real_postgresql='NOT_RUN'}|ConvertTo-Json
