# Minimal synthetic RLS and Reviewer logout follow-up

The launcher calls the existing Windows wrapper, runner, and Android driver.
It creates and approves a synthetic document, checks restricted-role RLS in
both directions, and observes the Reviewer's session before and after logout.
It omits the unrelated offline and reload checks. Real PostgreSQL and Android
outcomes remain unverified until a separately authorized supervised session.

Apply the control patch only to the exact SHA identities recorded in the
preceding batch checkpoint. Verify all resulting hashes and replay the focused
offline tests before using the launcher. The launcher pins its wrapper, and the
wrapper pins the runner and driver; the runner pins its source dependencies.
The subsequent fixture-failure patch makes missing preflight evidence produce
a durable test failure, and includes a disposable launcher-drift exercise.

A future live run requires a separate, explicit owner authorization. The
authorized operator must prepare one JSON file in the control directory's
`minimal-authorizations` folder. Its name must be `minimal-<id>.json`, where
`id` is the same lowercase 32-character hexadecimal `authorization_id` in
the JSON. Required fields are `authorization_id`, `purpose` equal to
`KTS_MINIMAL_RLS_REVIEWER_LOGOUT`, `synthetic_only` equal to true,
`max_sessions` equal to 1, `expires_utc` no more than 24 hours ahead,
`source_head`, and exact `runner_sha256`, `driver_sha256`, and
`wrapper_sha256`. The wrapper writes a durable exclusive `.claimed` marker;
the runner writes a second exclusive `.runner-consumed` marker. Neither marker
is reset automatically after failure. The runner also restricts the fresh root
to the approved project parent and the generated session suffix.

Call `team-settlement/Invoke-KtsMinimalRlsReviewer.ps1 -AuthorizationPath
<path>` only after that separate authorization. `-OfflineAdmissionTest` and
`-OfflineLifecycleManifest` are restricted to explicit rootless test mode;
their evidence is fixture evidence and must not be reported as live SQL or
Android acceptance. No authorization, lease, root, or live service is created
by preparing this launcher.
