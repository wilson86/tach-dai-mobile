# Synthetic RLS and Reviewer logout follow-up

R6 established an Android-reviewed synthetic document and three ordered
PostgreSQL events with matching receipts. Its restricted-role RLS check failed
before that check could run: the baseline selected `memberships.role`, while
the schema defines `memberships.team_role`. Reviewer logout was not reached.
R6 evidence and its consumed lease and data root are historical evidence; they
must not be reused as a live database.

The Windows runner's baseline query uses `Get-R6OtherWorkspaceBaselineSql`.
The source contract test verifies the schema, the active-operator predicate,
the two synthetic scopes and rejection of unsafe values. This is offline
evidence. It does not establish that PostgreSQL RLS or Android logout passed.

## Reproducible control-source changes

The control runner and wrapper are not stored in this repository. The two
patches in `patches/` preserve their qualified changes without runtime data:
first apply `r6-role-fix-control.patch`, then
`r6-rls-integration-control.patch`. They target the two control files by their
relative names. The first patch requires runner SHA-256
`0125D10FE318C627416F76E18BC55BD7AE27B73A5F1FE9ADEEBB93BDA76AA36C`
and wrapper SHA-256
`8FE69C11434310F136637790A403B8DAE64CABD64B375BA3F99772B01B9B74C5`.
After both patches, their respective hashes must be
`842E15F5A974B8339389F80C4D064F3544FDDE4053736FD13EEC5B5B5554DA34`
and `2CD9DAF266B8111C0030C1EF9395EEFB9DD60B3A78036574A9B84324D52949FB`.

Use `git -c core.autocrlf=false apply --check` before each application and
`git -c core.autocrlf=false apply` to apply it. The LF setting is necessary:
automatic CRLF conversion changes the byte hashes and is rejected by source
admission. Do not apply either patch to an active session or overwrite an
unverified control file. Preserve a rollback copy first. The runner admits and
loads the repository helper only after verifying its exact SHA-256.

## Minimal future acceptance

Only a separately authorized, supervised session may run the following:

1. Verify the exact source and control-file hashes, the previously recorded R6
   evidence hashes, the isolated Android device, strict HTTPS trust, available
   ports and the absence of a conflicting session. Use a never-used synthetic
   database root and a new single-use session identity. Arm the existing
   supervisor and watchdog before starting services; set an absolute deadline
   no longer than 60 minutes.
2. Initialize the fresh PostgreSQL 16 cluster, apply the approved migrations,
   and verify the six applicable tables have both RLS and FORCE RLS enabled.
   Use the existing synthetic-only application and actual authentication,
   receipt and review APIs to establish the minimum distinct-actor reviewed
   document required for the two checks. Capture the event and receipt IDs,
   workspace, actors, revision and feed order as local protected evidence.
   Do not import or copy the historical R6 database.
3. Prove RLS under the existing non-owner, non-superuser ledger role with
   `NOBYPASSRLS` and the verified workspace and actor transaction context.
   First demonstrate that the opposite workspace and protected records exist.
   Check valid in-workspace reads and execute negative reads and a rollback-only
   unauthorized write in both workspace directions. Require no cross-workspace
   visibility or changed rows; record actual query results without passwords,
   tokens or customer data. A superuser result is only a baseline, never proof
   of role isolation.
4. In the isolated Android browser, authenticate the independent synthetic
   Reviewer, load the reviewed document and verify revision and server receipt.
   Use the actual logout control and verify the UI becomes unauthenticated.
   Verify the server's existing session contract rejects the revoked session;
   keep any session token or hash out of screenshots, reports and logs.
5. Verify no duplicate events or receipts, close only owned processes, verify
   the test ports closed, and require watchdog and supervisor terminal PASS.
   Preserve the fresh root and hash the evidence. Mark acceptance PASS only
   when the real RLS, Reviewer logout, integrity and cleanup checks all pass.

The current full Android wrapper exercises a broader workflow. A narrower
launcher for the procedure above has not yet been implemented or validated;
this document is a procedure, not a claim that such a launcher exists.

## Prepared authorization request

> I authorize exactly one new supervised, synthetic-only local acceptance
> session for the RLS and Reviewer logout procedure above, lasting at most
> 60 minutes. Use a new lease and a never-used PostgreSQL root. Preserve R6
> and all earlier roots. Do not access production or real customer data, and
> do not automatically start another session if this one fails.
