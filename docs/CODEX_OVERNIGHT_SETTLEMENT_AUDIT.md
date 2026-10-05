# Codex Overnight Settlement Rule Audit

## Goal
Audit the existing KTS/PWA codebase and all currently available settlement evidence. Do NOT implement new settlement rules unless they are already fully proven by existing evidence. The user explicitly requires: understand all rules first, then implement.

## Safety boundary
- Do not modify `main`.
- Do not deploy anything.
- Do not change production PWA, Desktop, Telegram routing, sends, or live data.
- Work only on this feature/audit branch or in read-only analysis.
- No guessed accounting rules. Unknowns must remain UNKNOWN and fail closed.
- Preserve all existing qualified KTS behavior.

## Product direction already decided
- Primary future user surface: mobile PWA on phone.
- PC/Desktop remains internal to the owner.
- PWA must eventually persist editable partners, effective-dated configs, messages, KQXS snapshots, settlements and detailed reports.
- Current reference app is the accounting oracle during shadow comparison.
- Commercialization is explicitly out of scope until long-running zero-unexplained-difference comparison is achieved.

## Confirmed settlement structure
For each partner/date/region/category:
1. XAC
2. QUA CO
3. TRUNG units
4. payout = TRUNG units * configured win rate
5. apply partner direction (customer/owner)
6. apply total percent
7. apply refund in the correct direction
8. final THU / BU

Partner direction from owner's viewpoint:
- partner role = CUSTOMER: owner is the customer's owner; `net = qua_co - payout`
- partner role = OWNER: owner is the owner's customer; `net = payout - qua_co`

Refund direction already confirmed:
- CUSTOMER: refund reduces owner's THU when customer loses.
- OWNER: refund reduces owner's BU when owner wins against user.

Effective-dated pricing/config requirement:
- saving a changed config requires `effective_from_date`
- earlier business dates keep old config
- old reports must never be recalculated under a newer config
- accepted messages/settlements retain an immutable config snapshot

Detailed reports requirement:
- dynamic categories: if a person bet it, report it; if not, no empty row required
- group by person -> business date -> region -> category -> message/detail
- show XAC, QUA CO, TRUNG units, payout, refund, THU/BU
- retain original message and detailed winning rows

KQXS requirement:
- future PWA auto-updates lottery results during live draw windows roughly every 60-120 seconds
- result source must be separate from settlement logic
- provisional while incomplete, final only after complete/verified
- persist timestamped result snapshots

## Confirmed DAT rules
Canonicalization:
- 1 station + `da` => DAT (Da thang)
- 2+ stations + `da/dx` => DAX (Da xien)

DAT expansion:
- n numbers => all unordered number pairs C(n,2)
- existing evidence indicates XAC DAT = number_of_pairs * 36 * stake for 1-station MN cases

DAT winning modes are now considered PROVEN by reference-app examples:
- ONE_PAIR: each winning number-pair contributes exactly 1 unit, regardless of occurrence counts
- MULTI_PAIR: each winning number-pair contributes `min(hitsA, hitsB)` units
- KY_RUOI: each winning number-pair contributes `(hitsA + hitsB) / 2` units
- if either number has zero occurrences, pair contributes 0

Proven occurrence examples:
- 1x1 => ONE_PAIR 1, MULTI_PAIR 1, KY_RUOI 1
- 2x1 => KY_RUOI 1.5
- 2x2 => MULTI_PAIR 2, KY_RUOI 2
- 3x1 => ONE_PAIR 1, MULTI_PAIR 1, KY_RUOI 2

## Existing known DAX evidence
DAX is evaluated per station-pair and number-pair, not as one regional occurrence count.
Known reference-app examples:
- 2026-10-04, `2d 75 42 dx 1n` => DAX TRUNG 2
- 2026-10-04, `2d 42 32 dx 1n` => DAX TRUNG 1
- 2026-09-22, `3d 09 19 dx 1n` under current multi-pair setting => detailed rows show BL-BT 2, BT-VT 1, BL-VT 0, total DAX TRUNG 3
Do not infer the full DAX formula beyond what can be proven from repository/evidence.

## Other already observed categories
Evidence already exists for at least:
- 2CB
- 2CD / dau-duoi style
- 4C
- DAT
- DAX
Do not expand this list into full formulas unless the repo/test evidence proves it.

## Remaining rule areas that require proof
Audit the repository, docs, tests, old fixtures, examples and comments to determine whether any of these are ALREADY fully specified somewhere. If so, cite exact file/line/test evidence and classify CONFIRMED. If not, keep UNKNOWN and generate the minimum discriminating reference-app test needed.

1. DAX modes: ONE_PAIR vs MULTI_PAIR vs KY_RUOI, including station-pair aggregation.
2. Tinh Ui.
3. 2C 7 lo.
4. 3C lo.
5. 3C 7 lo.
6. 3C dau-duoi.
7. XC exact draw positions and hit counting for MN/MT/MB.
8. MB xien 2-3-4 rules.
9. Commission type `Thanh tien` versus ratio.
10. Total percent ordering relative to payout/refund.
11. Rounding policy: internal precision, per-line vs final rounding, x.xx5 boundaries.
12. Any region-specific XAC multipliers not yet proven.
13. Any category aliases in canonical KTS output that settlement must map without reparsing raw text.

## Reference-app GUI oracle access
The user has placed a Desktop shortcut named exactly `g1hp80` that opens the current reference KTS/accounting app. If the local Codex environment has GUI/browser/UI-automation capability, use that app as the oracle for unresolved rules rather than asking the user to run every test manually.

### Dedicated disposable test partner
The user has now created a dedicated partner/profile named exactly `TEST_KTS` for oracle testing.

Rules for this profile:
- Use `TEST_KTS` for all GUI oracle mutations. Do not use Hiền, Trúc, Thái, Quýt, Thiên, or any other real partner unless the user explicitly approves later.
- It is permitted to change `TEST_KTS` pricing/toggles/rates temporarily for tests, provided the original values are captured first and restored exactly afterward.
- Add only synthetic test messages to `TEST_KTS`.
- After each individual test, delete that exact synthetic message and verify it is no longer present before proceeding.
- At the end of the audit, `TEST_KTS` must have zero leftover synthetic messages from this run and its configuration must equal the pre-test snapshot.

Operational protocol:
- Resolve the shortcut from the user's Desktop (typically `%USERPROFILE%\\Desktop\\g1hp80.lnk` or the equivalent Desktop folder). Do not assume the target path; inspect the shortcut safely.
- Launch only this reference app for oracle testing.
- Do not send Telegram/Zalo/customer messages and do not trigger any production dispatch action.
- Before changing any TEST_KTS config setting, capture the current value(s) so they can be restored exactly afterward.
- For every oracle case, set only the minimum required date/config toggle, enter the exact synthetic test message under TEST_KTS, capture XAC / QUA CO / TRUNG / detail rows / THU-BU needed as evidence, then DELETE THAT TEST MESSAGE from the reference app immediately after evidence is recorded.
- Never delete or edit a pre-existing message. Identify the synthetic test message by exact text and/or creation order before deletion.
- After a test that changes a toggle or rate (ONE_PAIR/MULTI_PAIR/KY_RUOI, Tinh Ui, commission mode, total %, refund %, etc.), restore the original setting exactly before moving to another unrelated test and verify the restore.
- Prefer one synthetic message at a time so cleanup is unambiguous.
- Keep an audit log of: date used, TEST_KTS setting before, setting during test, exact input, observed output, deletion confirmation, restored setting confirmation.
- If the app requests credentials, OTP, CAPTCHA, elevated UAC approval, or anything requiring the user's secret/interactive approval, STOP that path and record exactly what the user must provide. Do not guess credentials or bypass controls.
- If GUI automation is unavailable in the local Codex runtime, do not pretend tests were run. Fall back to repository audit and produce the minimal manual oracle test list.
- At end of run, verify there are zero known synthetic test messages left in TEST_KTS and all modified settings have been restored.

User-interaction minimization:
- Do not ask the user for information that can be discovered locally from the shortcut, repo, existing logged-in session, or app UI.
- Ask the user only for a blocking item that cannot be derived safely, such as login/OTP, UAC approval, or a UI ambiguity that could risk mutating real data.
- If `TEST_KTS` cannot be located in the app, stop GUI mutation and report that exact blocker rather than falling back to a real partner.

## Required work tonight
1. Inventory all relevant settlement/betting logic already present in:
   - `wilson86/tach-dai-mobile`
   - `wilson86/KTS`
   - feature branches related to settlement if accessible
2. Search parser grammars, tests, fixtures, docs, historical scripts and business engine code for each remaining rule.
3. Build a RULE_MATRIX.md with columns:
   - rule/category
   - status: CONFIRMED / PARTIAL / UNKNOWN / CONFLICT
   - exact formula/semantic if confirmed
   - evidence file + line/test name
   - minimal oracle test if not confirmed
4. Build an ORACLE_TEST_PLAN.md containing the smallest possible reference-app test set. Every test must specify:
   - business date
   - region/stations
   - exact input syntax
   - which config toggle to set
   - expected discriminating observation (not guessed final answer unless already derivable)
5. Create/extend deterministic tests ONLY for rules that are already confirmed. Unknown rules must assert fail-closed or remain unimplemented.
6. Audit current settlement prototype for accidental guesses. If any unproven rule is implemented as if true, flag it and change only if needed to fail closed on this audit branch.
7. Do not wire visible PWA UI yet.
8. Do not implement commercial credit/licensing yet.
9. If GUI oracle access is available, execute the minimum safe oracle test set using TEST_KTS and update the rule matrix from observed evidence, following the cleanup/restore protocol above.

## Required final overnight report
Produce `docs/OVERNIGHT_SETTLEMENT_AUDIT_RESULT.md` with:
- CONFIRMED rules
- PARTIAL rules
- UNKNOWN rules
- CONFLICTS found
- exact files/tests proving each confirmed rule
- exact minimum remaining manual tests the user must run in the reference app
- any prototype code that currently guesses an unproven rule
- test results
- GUI-oracle audit log if GUI tests ran
- explicit confirmation of synthetic-test cleanup and setting restoration status
- explicit statement: `READY_TO_IMPLEMENT_ALL_RULES = YES/NO`

`READY_TO_IMPLEMENT_ALL_RULES` may be YES only if every money-affecting rule is proven with no unresolved conflict.

## Efficiency
Use deterministic search/scripts/tests first. Do not spend model effort re-reading large unrelated parts of KTS. Do not rewrite the app. The objective is to minimize AI quota while producing a complete rule audit.
