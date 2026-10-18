# KTS Settlement — release blocker analysis

Source SHA: `52f860a2a0bbb8b3e919d8541076e1ac90d3cdd4`

## A. Autonomous implementation work

- Counterparty read/create contracts and group workflow UI that remain fake-only and do not accept monetary facts as verified.
- Focused contract and local disposable-PostgreSQL tests for changed code.
- Private 65-case oracle import/review workflow scaffolding that stores no real source data in Git.

## B. Requires local operator-controlled artifacts

- A fresh disposable PostgreSQL database, migrations, separately restricted auth and ledger roles, and a qualified bootstrap administrator.
- A controlled offline initial identity/password bootstrap. Runtime membership administration supports only pre-existing identities.
- Remove the stopped disposable runtime data directory recorded in `GROUP_RUNTIME_QUALIFICATION_RECEIPT.json`; no listener or process remains, but this environment prevented recursive deletion.
- A private, operator-held source of synthetic user credentials; never commit passwords or bearer tokens.

## C. Requires HIOSKT source / independent oracle

- The approved 65-case HIOSKT source, field mapping, expected calculations, and independent discrepancy review.
- This is required before claiming monetary parity or accepting real settlement facts.
- A private hash-only 65-case review scaffold now exists, but it is not source evidence and cannot authorize a release.

## D. Requires human account/device action

- Identity proofing and membership invitation/credential delivery for real humans.
- Any new Android or private-network test against a changed source SHA.

## E. Requires production release authorization

- TLS/network exposure, firewall, host, secret custody, monitoring, backups/restores, deployment, merge, and use of real customer or monetary data.

## Non-negotiable release states

`SYNTHETIC_ONLY=TRUE`  
`REAL_MONEY_ENABLED=FALSE`  
`GROUP_APP_READY=NO` pending the P0 durable membership/provisioning and usable group workflow gaps.  
`REAL_MONEY_READY=NO` pending every C/E item above.
