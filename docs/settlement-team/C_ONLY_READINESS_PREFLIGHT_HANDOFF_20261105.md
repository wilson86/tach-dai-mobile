# KTS Settlement — one-shot Windows C:-only readiness preflight

**Scope:** KTS Settlement (Issue #5 and independent security Issue #32).
**Source authority:** `wilson86/tach-dai-mobile`, branch
`codex/settlement-v2-expiry-delay-review-20261104`,
baseline SHA `bbb6a5177e72b24d41256d8bede4fff4bf95c9a4`.
**Purpose:** determine whether a genuinely isolated, zero-cost PostgreSQL 16
qualification environment can be prepared. **NOT permission to run SQL,
provision a key, log into any database, deploy, merge or enable money writes.**

The ChatGPT cloud working container has native Node 22.16.0, but
`postgres`, `psql` and `initdb` executables are not installed.
It cannot inspect the operator's Windows C: environment. The existing
Issue #32 external security review is still open, without an independent
reviewer or approval. Neither condition can be solved by declaring
synthetic source tests to be PostgreSQL evidence.

## Operator-invoked Codex Windows — ONE bounded prompt

Only use when Codex is running in an **already-authorized source checkout on
Windows C:**. Do not run against production, a live application service
or an unknown drive. This is an environment inventory and report, not an
unattended executor.

~~~text
WILSON86 KTS Settlement — C:-only READ-ONLY PG16 capability preflight.

GOAL: find out whether an explicitly isolated PostgreSQL 16 synthetic
security-qualification environment is technically available. Do NOT
create a new database/cluster, connect to a database, execute SQL,
change roles, install software, merge, deploy, invoke paid CI or send
customer data. COST_USD=0.

STEP 1 — PROVENANCE:
Read wilson86/AI_ORCHESTRATOR @
59630fd445c87b57598c88b0d47cc1296a8ebabd:
AGENTS.md, docs/PROJECT_WIDE_ZERO_COST_CI_POLICY.md and the
five Shared Skills; also PR #11 context-guard.
Read wilson86/tach-dai-mobile Issue #5 and Issue #32.
If sources unavailable: MANUAL_ONLY and show exactly what was unreadable.
Stay in the KTS Settlement project.

STEP 2 — FILESYSTEM/HEAD:
Run only from an existing, explicitly authorized C: project folder.
Never search E: or F: or traverse symlink/junction targets.
Use read-only Get-Location, git rev-parse --show-toplevel,
git status --porcelain, git rev-parse HEAD, git remote -v
(never print credentials or token-bearing remote URLs).
Verify repo wilson86/tach-dai-mobile and current branch/SHA.
Expected branch codex/settlement-v2-expiry-delay-review-20261104,
baseline SHA bbb6a5177e72b24d41256d8bede4fff4bf95c9a4;
if newer HEAD, preserve it and compare to GitHub before proceeding.
If dirty, detached, unexpected repo, wrong drive or unknown ownership:
STOP; do not checkout/reset/stash/delete/clean.

STEP 3 — CAPABILITY INVENTORY ONLY:
Read-only check presence and --version for node, git, psql,
postgres, initdb and pg_ctl where these commands are already installed;
do not install or start services. Do NOT run psql SQL commands or
connect to any local/remote DB, even if credentials happen to exist.
Report PostgreSQL major version exactly, or NOT_FOUND/NOT_VERIFIED.
Do not expose environment values, passwords or server addresses.
Identify whether a disposable PG16 test cluster has a separately
approved non-production provenance; if uncertain, mark UNKNOWN and
do not access it. Do not infer an installed psql client implies
PostgreSQL server or that any DB is disposable.

STEP 4 — SECURITY STOP GATE:
Check Issue #32 for a named independent reviewer, signed exact-SHA
decision and supporting evidence. A GitHub issue authored by the
implementing agent, a synthetic Node PASS or a reviewer roleplay is
not signoff. If no valid review: SECURITY_SIGNOFF=NOT_GRANTED.
No SQL/migration/crypto key provisioning or execution, no tenant read,
no write. Existing WRITE_BLOCK remains ENABLED.

STEP 5 — OUTPUT ONLY THIS SHORT EVIDENCE REPORT:
PROJECT=KTS Settlement
REPOSITORY=wilson86/tach-dai-mobile
BRANCH=<verified or UNKNOWN>
HEAD_SHA=<verified or UNKNOWN>
CONTEXT_RISK=LOW|ELEVATED|HIGH|UNKNOWN
SKILLS=MANUAL_ONLY unless native discovery actually verified
WIN_C_WORKSPACE=VERIFIED|BLOCKED|UNKNOWN
SOURCE_DIRTY=YES|NO|UNKNOWN
NODE_VERSION=<verified or NOT_FOUND>
POSTGRESQL_16_SERVER=INSTALLED_NOT_STARTED|NOT_FOUND|UNKNOWN
PSQL_16_CLIENT=VERIFIED|NOT_FOUND|UNKNOWN
DISPOSABLE_PG16_AUTHORIZED=NO|UNKNOWN (no execution)
INDEPENDENT_SECURITY_REVIEW=NOT_GRANTED unless real evidence
PG16_NATIVE_SQL_TESTS=NOT_RUN
WINDOWS_NATIVE_END_TO_END=NOT_RUN
HIOSKT_65_ORACLE=NOT_RUN
WRITE_BLOCK=ENABLED
RELEASE=NO_GO
COST_USD=0
FILES_REMOVED=0
SPACE_RECOVERED_MB=0
NEXT_BLOCKER=<single precise blocker>

Keep all rollback/QA/source files. Do not claim QA PASS based on presence
of binaries or a preflight checklist. If any guard fails, STOP and report.
~~~

## Acceptance and future steps

A capability report merely establishes whether Windows C: has the **tools**
needed for a future **independently approved** fresh isolated PG16 run.
It is not a successful PostgreSQL security test.

After a genuine reviewer signs the chosen SQL owner/row-lock/key custody/
tenant-read architecture for an exact source SHA, a separate bounded,
explicitly approved synthetic PG16 qualification may cover catalog
privileges, direct tenant SELECT denial, attacker-writable tenant GUC,
JS–SQL HMAC parity, expiry, concurrent logout/membership/identity revocation
and lost transaction acknowledgment. Only after that and independent money
oracle/Windows/Android acceptance can any release gate change.

**CURRENT:** `SECURITY_SIGNOFF=NOT_GRANTED; PG16=NOT_RUN;
WRITE_BLOCK=ENABLED; RELEASE=NO_GO; COST_USD=0`.
