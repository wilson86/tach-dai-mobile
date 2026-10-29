function Get-KtsReviewerSessionObservationSql {
  param(
    [Parameter(Mandatory=$true)][ValidateSet('BEFORE_LOGOUT','AFTER_LOGOUT')][string]$Phase,
    [Parameter(Mandatory=$true)][string]$Workspace,
    [Parameter(Mandatory=$true)][string]$Reviewer,
    [Parameter(Mandatory=$true)][string]$SessionStartUtc,
    [string]$IssuedAtUtc
  )
  if($Workspace -notmatch '^fake_groupa_[A-Za-z0-9_-]{1,100}$' -or
     $Reviewer -notmatch '^fake_reviewer_[A-Za-z0-9_-]{1,100}$'){
    throw 'REVIEWER_SESSION_IDENTITY_INVALID'
  }
  $dateFormat="yyyy-MM-dd'T'HH:mm:ss.ffffff'Z'"
  $culture=[Globalization.CultureInfo]::InvariantCulture
  $style=[Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal
  $start=[DateTimeOffset]::MinValue
  if(-not [DateTimeOffset]::TryParseExact($SessionStartUtc,$dateFormat,$culture,$style,[ref]$start)){
    throw 'REVIEWER_SESSION_START_INVALID'
  }
  $identity="workspace_id='$Workspace' AND user_id='$Reviewer' AND issued_at >= '$SessionStartUtc'::timestamptz"
  $active="$identity AND revoked_at IS NULL AND expires_at > now()"
  $roleFields="'role',current_user,'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=current_user),'bypass',(SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user),'owned_count',(SELECT count(*) FROM pg_class WHERE relnamespace='kts_auth'::regnamespace AND relkind='r' AND relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user))"
  if($Phase -eq 'BEFORE_LOGOUT'){
    return "SELECT json_build_object($roleFields,'active_count',(SELECT count(*) FROM kts_auth.sessions WHERE $active),'issued_at',(SELECT to_char(issued_at AT TIME ZONE 'UTC','YYYY-MM-DD`"T`"HH24:MI:SS.US`"Z`"') FROM kts_auth.sessions WHERE $active ORDER BY issued_at DESC LIMIT 1))::text"
  }
  $issued=[DateTimeOffset]::MinValue
  if(-not [DateTimeOffset]::TryParseExact($IssuedAtUtc,$dateFormat,$culture,$style,[ref]$issued) -or $issued -lt $start){
    throw 'REVIEWER_SESSION_ISSUED_INVALID'
  }
  $matching="$identity AND issued_at='$IssuedAtUtc'::timestamptz"
  return "SELECT json_build_object($roleFields,'active_count',(SELECT count(*) FROM kts_auth.sessions WHERE $active),'matching_count',(SELECT count(*) FROM kts_auth.sessions WHERE $matching),'revoked_count',(SELECT count(*) FROM kts_auth.sessions WHERE $matching AND revoked_at IS NOT NULL AND expires_at > now()))::text"
}

function Assert-KtsReviewerSessionObservation {
  param(
    [Parameter(Mandatory=$true)][ValidateSet('BEFORE_LOGOUT','AFTER_LOGOUT')][string]$Phase,
    [Parameter(Mandatory=$true)]$Snapshot,
    [Parameter(Mandatory=$true)][string]$ExpectedAuthRole
  )
  if($ExpectedAuthRole -notmatch '^l20_auth_[a-zA-Z0-9_]{1,64}$'){
    throw 'REVIEWER_SESSION_ROLE_INVALID'
  }
  foreach($name in 'role','superuser','bypass','owned_count','active_count'){
    if($null -eq $Snapshot.PSObject.Properties[$name] -or $null -eq $Snapshot.$name){throw 'REVIEWER_SESSION_OBSERVATION_MISSING'}
  }
  if($Snapshot.role -cne $ExpectedAuthRole -or $Snapshot.superuser -isnot [bool] -or $Snapshot.bypass -isnot [bool] -or
     $Snapshot.superuser -or $Snapshot.bypass -or [int]$Snapshot.owned_count -ne 0){
    throw 'REVIEWER_SESSION_ROLE_NOT_RESTRICTED'
  }
  if($Phase -eq 'BEFORE_LOGOUT'){
    if([int]$Snapshot.active_count -ne 1 -or $null -eq $Snapshot.PSObject.Properties['issued_at'] -or
       [string]$Snapshot.issued_at -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$'){
      throw 'REVIEWER_SESSION_BASELINE_INVALID'
    }
  }else{
    foreach($name in 'matching_count','revoked_count'){
      if($null -eq $Snapshot.PSObject.Properties[$name] -or $null -eq $Snapshot.$name){throw 'REVIEWER_SESSION_OBSERVATION_MISSING'}
    }
    if([int]$Snapshot.active_count -ne 0 -or [int]$Snapshot.matching_count -ne 1 -or [int]$Snapshot.revoked_count -ne 1){
      throw 'REVIEWER_SESSION_REVOCATION_UNVERIFIED'
    }
  }
}
