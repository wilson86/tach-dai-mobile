# KTS Settlement — private 65-case HIOSKT oracle workflow

This workflow is intentionally a **review scaffold**, not a source of lottery or monetary truth.

1. Keep the actual HIOSKT reference inputs, mappings, expected results, and reviewer notes in an operator-controlled private location outside Git and CI artifacts.
2. Create a blank checklist with `createBlankOracle65Template()`.
3. For each of exactly 65 approved cases, calculate SHA-256 commitments to the private source record and the private expected result. Pass only the case ID and two digests to `createOracle65ReviewPlan()`.
4. Independently calculate the actual result, commit only its digest with `MATCHED` or `DISCREPANCY`, and call `applyOracle65Review()`.
5. Resolve every discrepancy outside this repository. Preserve the signed/approved private review evidence separately.

The module rejects plaintext source fields and never grants monetary parity or release authorization, even when all 65 hashes match. Real-money enablement additionally requires the independent security, backup/restore, identity, network, and business approvals listed in `RELEASE_BLOCKERS.md`.
