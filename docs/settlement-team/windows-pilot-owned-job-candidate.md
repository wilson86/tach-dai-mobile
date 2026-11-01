# Windows synthetic pilot Job Object candidate

The control runner `C:\KTS-Settlement\w20-2d63c84e\Run-RealPilot20.ps1`
(local SHA-256 `4328A1DE83723B365A6BC90E517048479BDC89094A8B352C617738656199A8DD`)
now creates `pg_ctl ... start` in a session Job Object using the pinned
`team-settlement/windows-pilot-owned-job.cs`. Windows process creation uses
the job-list attribute, so the child is assigned atomically before resume.
The job closes on runner exit or its absolute deadline; graceful `pg_ctl stop`
and the independent supervisor/watchdog remain in place. This control runner
is outside Git and must be verified by its exact hash before reuse.

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
