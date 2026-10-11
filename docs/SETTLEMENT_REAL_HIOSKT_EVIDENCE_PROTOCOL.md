# KTS Settlement — independent HIOSKT evidence intake

Policy: WILSON86-ZERO-COST-CI-2026-10-09-v1.
Release status: BLOCKED_PENDING_INDEPENDENT_EVIDENCE.

## Local audit checkpoint, 2026-10-09

- Reported local HEAD: 32029af…; PR #2 and #3 commits were absent from the local clone.
- Real SQLite history was found; the operator-approved manifest identifying 65 historical cases was not found.
- No independent HIOSKT payout export and matching mapping were found.
- Local read-only checks: 14 PASS. This is not a HIOSKT monetary comparison.
- MONETARY_MISMATCH_COUNT = NOT_COMPARABLE, not 0.
- Report name: KTS_SETTLEMENT_LOCAL_EVIDENCE_AUDIT_20261009.md (local only).
- Operator-supplied report SHA256: 40B42658D29806C9E80A981EE56DBF73879066BA328AB9B68418A8ADB108D10F. This hash has not been independently verified from report bytes.
- Candidate PR #3 head at intake: 24917a5868d8602c761c915008e53a0e97dd9b70.
- Paired PR #2 head at intake: d58e77da1e2c2a69ee5cac4e081d421d1f7773dc.

## The two missing authorities

1. Operator-approved 65-case *real* history manifest. Select 65 cases by a documented rule from real SQLite data, include unique case IDs, partner/date/region and the exact KTS record ID. Do not invent or generate cases. Duplicate business dates are allowed if case identities differ.
2. Independent HIOSKT export/report/screenshot containing four real monetary totals and the input identifiers for the same cases. Preserve SHA256 for native source files and operator review mapping. Do not generate the HIOSKT amounts from KTS calculations. Do not put actual customer/monetary records in this public repository.

For each mapped case also preserve original canonical parsed bet, historical pricing config and partner role, draw verification provenance, parser/engine identity, source timestamps, and XAC / QUA_CO / PAYOUT / FINAL totals in exact decimal notation. Store sensitive inputs and HIOSKT data PRIVATELY, read-only.

## Optional local-only format for stage-1 structural audit

The example below deliberately contains no case entries and must fail closed.

~~~json
{
  "format": "kts-settlement-real-evidence-v1",
  "feature_head": "<actual current feature commit SHA>",
  "cases": []
}
~~~

Real case entries require:
- case_id: unique opaque string (not a customer's name)
- scope: partner_id, business_date (YYYY-MM-DD), region (mn/mt/mb)
- kts: source_sha256, source_ref, totals with string fields xac, qua_co, payout, final
- hioskt: independently collected source_sha256, source_ref and same four string totals
- mapping: method = operator_verified, review_ref = nonempty audit reference.

When a real private manifest is available and source HEAD has been checked, run this local read-only command:

~~~powershell
node .github/scripts/settlement-real-evidence-gate.cjs "E:\PRIVATE_EVIDENCE\KTS\real-case-manifest.json" "<exact-current-feature-SHA>"
~~~

This validation is STRUCTURAL ONLY. It never authenticates independently collected HIOSKT, approves the 65 historical cases, proves source independence, or grants release permission. A structurally complete synthetic input can produce candidate_difference_cases=0 but monetary_mismatch_count remains NOT_COMPARABLE and release_readiness remains BLOCKED. Exit code 2 is expected, including for structurally complete input.

## Hard stop rule

No genuine 65-case manifest OR no independent HIOSKT mapping => REAL_HISTORY_65_STATUS=BLOCKED; HIOSKT_ORACLE_STATUS=BLOCKED; MONETARY_MISMATCH_COUNT=NOT_COMPARABLE. Do not repeat a local Codex audit without newly available source evidence. No fabricated values, no monetary formula changes, no activation of unsupported Ủi / tiến xiên, no Pages deploy, main merge, real customer mutation or private metered GitHub-hosted Actions.

After the operator supplies both genuine sources privately, a bounded local read-only audit can replay the same 65 cases and manually validate every unexplained money difference. Explicit human deployment approval remains a separate gate.
