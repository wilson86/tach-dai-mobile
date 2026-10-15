# Source-pinned, static fake-only Android vault handoff artifact

After the `native-pilot-ui-contract` real Chrome gate is successful,
a separate CI step builds a **non-deployed**, checkout-SHA-verified packet
with only the 10 explicit manual HTML/CSS/JS assets. The Node packet
builder hashes each exact checked-out source file, validates it is a
regular non-symlink file below 256 KiB, refuses unknown/head-drift sources
and writes a JSON manifest. GitHub Actions archives the directory as
`kts-android-vault-fake-only-source-packet` for operator handoff.

This artifact has **NO** backend, executable listener, credentials, token,
certificate/private key, database migration, Docker/Windows installer, or
permission to publish. It is NOT a usable app URL. The local operator must
separately authorize private TLS, synthetic backend identities, physical
devices, isolated test database and specific start/stop/cleanup actions.
The inert `synthetic-vault-https-handler.cjs` restricts the first phone
stage to manual encrypted backup/recovery and receipt-read only; it
explicitly blocks financial draft POST. No real HIOSKT inputs/money.

Important: CI checks out **the PR HEAD itself** rather than GitHub's
synthetic merge ref for all four contract jobs. Both native Chrome runners
also compare the actual `git rev-parse HEAD` against the stamped source
SHA before reporting browser evidence. This closes the prior gap where a
reported source SHA could refer to PR head while tested files came from
an automatically constructed PR merge commit. Existing historical CI
artifacts keep their historical scope; only the new exact-HEAD artifacts
have this stronger checkout identity guarantee.
