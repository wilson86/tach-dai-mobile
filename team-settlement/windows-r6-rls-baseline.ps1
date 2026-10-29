function Get-R6OtherWorkspaceBaselineSql {
  param(
    [Parameter(Mandatory=$true)][string]$Workspace,
    [Parameter(Mandatory=$true)][string]$Partner,
    [Parameter(Mandatory=$true)][string]$BusinessDate,
    [Parameter(Mandatory=$true)][string]$Region
  )
  if($Workspace -notmatch '^fake_groupa_[A-Za-z0-9_-]{1,100}$' -or
     $Partner -notmatch '^fake_customer_[A-Za-z0-9_-]{1,100}$' -or
     $BusinessDate -ne '2026-10-26' -or $Region -ne 'mn'){
    throw 'R6_BASELINE_SCOPE_INVALID'
  }
  $other=$Workspace -replace '^fake_groupa_','fake_groupb_'
  return "SELECT json_build_object('workspaces',(SELECT count(*) FROM kts_team.workspaces WHERE workspace_id='$other'),'counterparties',(SELECT count(*) FROM kts_team.counterparties WHERE workspace_id='$other'),'other_actor',(SELECT user_id FROM kts_team.memberships WHERE workspace_id='$other' AND team_role='operator' AND revoked_at IS NULL ORDER BY user_id LIMIT 1),'protected_scopes',(SELECT count(*) FROM kts_team.scopes WHERE workspace_id='$Workspace' AND partner_id='$Partner' AND business_date='$BusinessDate'::date AND region='$Region'),'protected_events',(SELECT count(*) FROM kts_team.scope_events WHERE workspace_id='$Workspace' AND partner_id='$Partner' AND business_date='$BusinessDate'::date AND region='$Region'),'memberships',(SELECT count(*) FROM kts_team.memberships WHERE workspace_id='$other'))::text"
}
