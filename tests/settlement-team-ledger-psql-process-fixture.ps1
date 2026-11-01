Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$dir=Join-Path 'C:\KTS-Settlement\w20-2d63c84e\evidence' ('ledger-psql-child-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $dir|Out-Null
$exe=Join-Path $dir 'synthetic-psql.exe'
$src=@'
using System;
using System.Threading;
class SyntheticPsql {
  public static int Main(string[] args) {
    if(Environment.GetEnvironmentVariable("PGPASSWORD") != "fixture-secret") return 21;
    foreach(string arg in args) if(arg.Contains("fixture-secret")) return 22;
    string mode=Environment.GetEnvironmentVariable("KTS_PSQL_FIXTURE_MODE");
    if(mode=="FAIL") { Console.Error.Write("synthetic error"); return 17; }
    if(mode=="TIMEOUT") { Thread.Sleep(3000); return 0; }
    Console.Error.Write("synthetic diagnostic");
    Console.WriteLine("{\"role\":\"l20_led_a1\",\"superuser\":false,\"bypass_rls\":false,\"scope_insert\":true,\"scope_update\":true,\"scope_delete\":false,\"state_update\":true,\"revision_update\":true,\"reviewed_by_update\":true,\"submitted_by_update\":true,\"locked_at_update\":true}");
    return 0;
  }
}
'@
Add-Type -TypeDefinition $src -OutputAssembly $exe -OutputType ConsoleApplication
$env:KTS_PSQL_FIXTURE_EXE=$exe
try{
  & node --test (Join-Path $PSScriptRoot 'settlement-team-ledger-psql-process-fixture.test.cjs')
  if($LASTEXITCODE -ne 0){throw 'SYNTHETIC_PSQL_TEST_FAILED'}
  [ordered]@{status='PASS';evidence_type='SYNTHETIC_CHILD_PROCESS';fixture=$dir;postgres='NOT_RUN'}|ConvertTo-Json
}finally{Remove-Item Env:KTS_PSQL_FIXTURE_EXE -ErrorAction SilentlyContinue}
