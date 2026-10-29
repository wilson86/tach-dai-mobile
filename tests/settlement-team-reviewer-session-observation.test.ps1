Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'team-settlement\windows-reviewer-session-observation.ps1')
function Assert-Test($value,[string]$message){if(-not $value){throw $message}}
$inputArgs=@{Workspace='fake_groupa_test';Reviewer='fake_reviewer_test';SessionStartUtc='2026-10-29T08:00:00.000000Z'}
$beforeSql=Get-KtsReviewerSessionObservationSql -Phase BEFORE_LOGOUT @inputArgs
$afterSql=Get-KtsReviewerSessionObservationSql -Phase AFTER_LOGOUT @inputArgs -IssuedAtUtc '2026-10-29T08:01:00.123456Z'
Assert-Test ($beforeSql.Contains('kts_auth.sessions') -and $beforeSql.Contains('revoked_at IS NULL') -and $beforeSql.Contains('expires_at > now()')) 'BEFORE_QUERY_INVALID'
Assert-Test ($afterSql.Contains("issued_at='2026-10-29T08:01:00.123456Z'::timestamptz") -and $afterSql.Contains('revoked_at IS NOT NULL')) 'AFTER_QUERY_INVALID'
Assert-Test (-not ($beforeSql+$afterSql).Contains('session_hash')) 'SESSION_HASH_EXPOSED'
$before=[pscustomobject]@{role='l20_auth_fixture';superuser=$false;bypass=$false;owned_count=0;active_count=1;issued_at='2026-10-29T08:01:00.123456Z'}
$after=[pscustomobject]@{role='l20_auth_fixture';superuser=$false;bypass=$false;owned_count=0;active_count=0;matching_count=1;revoked_count=1}
Assert-KtsReviewerSessionObservation -Phase BEFORE_LOGOUT -Snapshot $before -ExpectedAuthRole 'l20_auth_fixture'
Assert-KtsReviewerSessionObservation -Phase AFTER_LOGOUT -Snapshot $after -ExpectedAuthRole 'l20_auth_fixture'
$negative=0
foreach($change in @('role','superuser','bypass','owner','multiple','missing','unrevoked','still_active','ambiguous')){
  $phase=if($change -in @('unrevoked','still_active','ambiguous')){'AFTER_LOGOUT'}else{'BEFORE_LOGOUT'}
  $copy=if($phase -eq 'BEFORE_LOGOUT'){$before|ConvertTo-Json|ConvertFrom-Json}else{$after|ConvertTo-Json|ConvertFrom-Json}
  switch($change){
    'role' {$copy.role='other'}
    'superuser' {$copy.superuser=$true}
    'bypass' {$copy.bypass=$true}
    'owner' {$copy.owned_count=1}
    'multiple' {$copy.active_count=2}
    'missing' {$copy.PSObject.Properties.Remove('issued_at')}
    'unrevoked' {$copy.revoked_count=0}
    'still_active' {$copy.active_count=1}
    'ambiguous' {$copy.matching_count=2}
  }
  $rejected=$false;try{Assert-KtsReviewerSessionObservation -Phase $phase -Snapshot $copy -ExpectedAuthRole 'l20_auth_fixture'}catch{$rejected=$true}
  Assert-Test $rejected "INVALID_OBSERVATION_ACCEPTED_$change";$negative++
}
foreach($bad in @(
  @{Workspace="fake_groupa_test' OR true--";Reviewer='fake_reviewer_test';SessionStartUtc='2026-10-29T08:00:00.000000Z'},
  @{Workspace='fake_groupa_test';Reviewer="fake_reviewer_test'--";SessionStartUtc='2026-10-29T08:00:00.000000Z'},
  @{Workspace='fake_groupa_test';Reviewer='fake_reviewer_test';SessionStartUtc="2026-10-29T08:00:00Z'--"}
)){
  $rejected=$false;try{[void](Get-KtsReviewerSessionObservationSql -Phase BEFORE_LOGOUT @bad)}catch{$rejected=$true}
  Assert-Test $rejected 'INVALID_QUERY_INPUT_ACCEPTED';$negative++
}
$rejected=$false;try{[void](Get-KtsReviewerSessionObservationSql -Phase AFTER_LOGOUT @inputArgs -IssuedAtUtc '2026-10-29T07:59:00.000000Z')}catch{$rejected=$true}
Assert-Test $rejected 'PRE_SESSION_ISSUE_TIME_ACCEPTED';$negative++
[pscustomobject]@{status='PASS';positive_cases=2;negative_cases=$negative;session_hash_exported=$false;evidence_type='OFFLINE_CONTRACT';real_postgresql='NOT_RUN'}|ConvertTo-Json
