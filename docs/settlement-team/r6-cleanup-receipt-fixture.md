# R6 cleanup receipt fail-closed fix

The Windows control file `C:\KTS-Settlement\w20-2d63c84e\Invoke-KtsBlueStacksLiveAcceptance.ps1`
previously set cleanup PASS when the runner manifest was absent. The control
file is outside this Git checkout; the local fix requires a readable manifest,
nonempty session ID, and `pids` property before terminal receipts can qualify.
SHA-256 after the local fix:
`75DB9EF2BDAA9A8E09EF3D15AB3598BE9A219FE910EFFD8D8BFE66C571063CA9`.

`tests/r6-cleanup-receipt-fixture.ps1` extracts and executes the actual function
with synthetic files. Missing/invalid manifest, a FAIL watchdog receipt and a
wrong supervisor session fail; matching fixture receipts pass. Malformed or
null PID records and a real, still-running disposable owned process also fail.
The test stops its own disposable child by its process handle. This does not
demonstrate real process cleanup, trustworthy receipts, a database, a Job Object
integration or release readiness. The control file and previous evidence remain
local and must be hash-checked before reuse; no live lease is authorized here.
