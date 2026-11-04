# KTS Settlement — private 65-case HIOSKT oracle workflow

This workflow is intentionally a **review scaffold**, not a source of lottery or monetary truth.

1. Keep actual HIOSKT reference inputs, partner mappings, rate/effective-date context, expected results and reviewer notes in an operator-controlled **private** location outside Git, public CI, published Pages and issue comments.
2. Create a blank checklist with `createBlankOracle65Template()`. The 65 blank rows are **not** actual cases or acceptance evidence.
3. For each of exactly 65 genuinely approved cases, privately calculate SHA-256 commitments to the full *canonical serialized* source record and independent expected result. Pass only a case ID and two 64-hex digests to `createOracle65ReviewPlan()`. Store the resulting plan **privately**, not in this public repository.
4. Independently calculate the candidate result using the **same canonical serialization**, commit its digest locally to the private evidence record, mark `MATCHED` or `DISCREPANCY`, and call `applyOracle65Review()`. The function validates the *entire 65-case plan* again before accepting decisions; a forged/missing-source plan must not produce a misleading `reviewed_count=65`.
5. Resolve every discrepancy outside this repository, and retain the source, independent expected outcomes, reviewer identity, approval date and signatures privately. Do not treat self-entered reviewer references or a 65-hash match as independent HIOSKT evidence.

**Critical confidentiality limitation:** An unkeyed SHA-256 of a small or predictable money amount, bet, date, customer identity or short record may be **brute-forced by enumeration**, even though the hash is one-way in the general sense. Therefore **never publish case digests or raw 65-case commitments in GitHub/CI/logs/chat**. A future privacy-aware evidence design may use canonicalized structured inputs plus secret keyed commitments, but key custody and verification must be independently reviewed first. Do not invent secret salts/keys or assume the current hashing protocol proves privacy or identity.

**Critical integrity limitation:** Any holder of the review plan can create matching synthetic digests. Valid SHA syntax and a `reviewed_count=65` are only evidence of well-formed bookkeeping, **not** proof of authentic HIOSKT data, independent monetary parity, or authorized production use.

The module rejects unexpected plaintext source fields and never grants monetary parity or release authorization, even when all 65 hashes match. Real-money enablement additionally requires independently approved security, PostgreSQL tenant isolation, backup/restore, identity, network and business acceptance as tracked in Issue #5 and [Issue #32](https://github.com/wilson86/tach-dai-mobile/issues/32).

**Status: `REAL_HISTORY_65=BLOCKED`, `HIOSKT_ORACLE=NOT_COMPARABLE`, `WRITE_BLOCK=ENABLED`, `RELEASE=NO_GO`, `COST_USD=0`.**
