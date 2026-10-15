# Restricted native-Android vault-only HTTPS pilot handoff (NOT DEPLOYED)

The repository now contains the **inert handler factory**
`team-settlement/synthetic-vault-https-handler.cjs`. Its construction
requires explicit `syntheticOnly:true`, `privatePilotApproved:true`,
a human-reviewed exact **HTTPS** origin, the local **exact-SHA** checkout
root directory, and an injected **isolated synthetic** auth/recovery backend
request listener. The factory **does not listen on a socket, provide TLS
certificates, connect to PostgreSQL, install a service, or change networks**.
It can be mounted only by a *separately approved* local operator behind
a trusted private HTTPS origin and isolated test identity (never the live
KTS Router). Do not put credentials or TLS private keys in GitHub.

The handler serves exactly the separately named manual HTML page and its
nine allowlisted JS/CSS assets, with no-store, strict CSP, no referrer and
X-Content-Type-Options. Requests must use an encrypted TLS socket and the
exact reviewed Host/Origin. It permits only fake login/logout,
read-only GET /v1/session and manually consented POST
/v1/recovery/receipts/inspect to an injected back-end. **It intentionally
denies POST /v1/scopes/drafts**, review/approve/admin and ALL other
financial and unknown routes; the draft in this stage stays PENDING in
memory, so the operator can exercise opt-in encrypted local backup and
manual server receipt UNKNOWN without accidentally saving money. It is
an Android **vault-only** qualification step, not full group functional QA.

This avoids exposing the general candidate ledger while testing the
first phone durability question. The browser will be able to create a fake
local PENDING draft, manually encrypt it, close/relaunch Chrome, log in as
a fake operator, decrypt only to QUARANTINED, and manually inspect a
read-only server receipt. No server payment/data write is allowed. The
ordinary Sync button will correctly fail closed in this restricted pilot.

Before **any** physical network bind: the operator must approve new
separate TEST-ONLY DB credentials, TLS cert chain (no bypass warnings),
private hostname/network, device identity, new non-8787 listening port,
timebox/stop/cleanup and zero real-data rules. The newly added source and
tests alone are NOT such authorization. Physical Android retention,
incognito/eviction policy, Chrome restart, revocation after lockscreen,
unwanted CSP errors, wrong-account denial and server receipt outcomes
must be recorded on the exact SHA. The operator must stop/delete the
temporary service afterward. Nothing is currently hosted.

Full two-device CAS/draft submission remains a separately authorized
higher-risk follow-up against an independently verified disposable DB;
real-money use further requires approved independent 65-case HIOSKT
oracle, backups/restores and operational signoff.
`GROUP_APP_READY=NO`, `REAL_MONEY_READY=NO`,
`RELEASE_READINESS=BLOCKED`.
