# Windows synthetic pilot Job Object candidate

The control runner `C:\KTS-Settlement\w20-2d63c84e\Run-RealPilot20.ps1`
(local SHA-256 `D5B90625210B7342E0D116A589A20F8DD83ADD893043785FFC5CBA2C3E7274EF`)
now creates `pg_ctl ... start` in a session Job Object using the pinned
`team-settlement/windows-pilot-owned-job.cs`. Windows process creation uses
the job-list attribute, so the child is assigned atomically before resume.
The job closes on runner exit or its absolute deadline; graceful `pg_ctl stop`
and the independent supervisor/watchdog remain in place. This control runner
is outside Git and must be verified by its exact hash before reuse.
The reviewable `patches/windows-owned-job-control.patch` reconstructs these
runner changes from the verified baseline SHA-256
`8A5E6FB5AC8796AB5D749387DEA7DB364BB678493F1218F9B5C098F05AB21C5B`.
It was replayed only onto a disposable LF-normalized copy and matched the
current runner's LF-normalized text; this is not proof of byte-identical
Windows line endings or authorization to apply it to a live runner.

Offline evidence: `tests/windows-pilot-owned-job-fixture.ps1` tested disposal,
deadline and owner termination with disposable PowerShell children. The
`windows-pilot-runner-owned-job-fixture.ps1` test extracts the actual runner
functions, calls `Invoke-PgCtl` against a disposable fake `pg_ctl.exe`, and
verifies exact-root rejection, altered helper rejection, and child cleanup.
An initial test exposed missing short-lived-process exit code; the helper now
holds the process handle before resuming it. No PostgreSQL was initialized.
`windows-pilot-runner-job-failure-fixture.ps1` additionally exercises nonzero
exit and timeout using a disposable executable; both errors propagate and its
job-owned descendant exits after disposal. Timeout cleanup now uses the exact
process handle and a bounded five-second wait, instead of an unbounded wait.
The same fixture confirms a fake stop command's wait is capped by the remaining
session deadline. Before the fix a two-second deadline took over six seconds;
afterward the fake command timed out within the bound. Process launch itself and
the five-second emergency cleanup are not proven to complete before deadline.

`windows-job-supervisor-crash-fixture.ps1` uses the actual extracted runner
functions, supervisor and watchdog with a disposable fake pg_ctl and child.
After the launcher is killed, the child exits and both terminal receipts pass.
The manifest intentionally has no child PID: the job/process handle, not the
watchdog's empty-manifest receipt, proves that disposable child's exit.

This is a candidate, not live qualification: the whole canonical entrypoint,
actual pg_ctl/postmaster process tree, PostgreSQL graceful shutdown, and
independent review are NOT_RUN. Never
promote live readiness based on these fixture tests. PostgreSQL synthetic work
requires separate authorization and a fresh isolated root.
