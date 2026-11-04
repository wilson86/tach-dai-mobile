# KTS Settlement — offline two-role walkthrough (fake-only)

**Purpose:** A real, directly openable user-facing **static HTML demonstration** of the proposed operator/reviewer workflow. This is **not** the multiuser backend, receipt verifier, financial calculator, tested hosted PWA, sellable product or production readiness.

## Open and test

Download `app/settlement-team-synthetic-walkthrough.html` and open the single file in a modern browser on Windows or Android. No network, server, login, password, database, installation or API key is used. The page intentionally uses a strict Content Security Policy with `connect-src 'none'` and does not call `fetch`, `localStorage`, `IndexedDB`, WebSockets or third-party scripts.

User walkthrough, entirely in **synthetic memory**:

1. Choose **Nhân viên A · Nhóm A**, **Hồ sơ giả · Nhóm A**. Select **Tạo nháp giả**, then **Gửi duyệt (giả)**. Observe revision 1→2 and an immutable-looking *demo timeline*; it is only in-memory, **NOT** a durable audit journal.
2. Change user to **Người duyệt B · Nhóm A**. Select **Duyệt độc lập (giả)**. Observe revision 3 / **ĐÃ DUYỆT (MÔ PHỎNG)**. An operator cannot approve their own fake draft.
3. Change to **Nhân viên C · Nhóm B** while viewing Group A. The demo refuses tenant viewing. Switch to Group B and create its own isolated fake draft.
4. Try **Kiểm tra xung đột**: it submits a stale local revision and reports `REVISION_CONFLICT` without altering the state. **Xóa toàn bộ dữ liệu giả** clears both fake groups; page reload also erases all state.

**DO NOT ENTER ANY REAL CUSTOMER, BETTING, MONETARY, HIOSKT OR CREDENTIAL DATA.** There are no editable customer/money fields at all. No actual changes are transmitted to a database or across devices. Do not use this file for accounting or to claim server-enforced tenant isolation; browser-only checks can be bypassed by the local page holder. The two accounts are fixed fake personas, not real identities.

## Evidence / limits

Source path: `app/settlement-team-synthetic-walkthrough.html` (initial Git blob `3c499b0cae5a70a9b1733425fe2d4df2cbd9bb5d` (superseded by browser-qualified patch)).
Node regression: `tests/settlement-team-synthetic-walkthrough.test.cjs` (initial Git blob `95a86bd3d456e33cba65e38dddaec59a389f8751` (superseded by new regression)).

Exact local `git hash-object` matches these two GitHub blobs. Linux native Node.js 22.16.0:
`node --check tests/settlement-team-synthetic-walkthrough.test.cjs` **PASS**;
`node --test tests/settlement-team-synthetic-walkthrough.test.cjs` **5 PASS / 0 FAIL / 0 SKIP**, exit 0, using actual HTML JS evaluated with `node:vm`.
Two attempts to run headless Chromium screenshot in the current sandbox timed out with no screenshot; therefore **BROWSER_VISUAL_QA=NOT_RUN**, **PHYSICAL_ANDROID=NOT_RUN** and **USER_ACCEPTANCE=NOT_RUN**; do not claim these were validated.

This is a **product workflow preview only**, valuable for identifying UX misunderstandings before adopting a real shared group backend. It does not make KTS Settlement commercially/monetarily usable. Issue #32 independent security review, real PostgreSQL 16 least-privilege tenant isolation and authentic 65-case HIOSKT monetary verification are still mandatory gates.

`WRITE_BLOCK=ENABLED; RELEASE=NO_GO; PRODUCTION_MUTATION=NONE; COST_USD=0`.

## 2026-11-05 — Actual browser QA and Group B workflow fix (bounded demo scope)

**Reproduced real user-facing bug in v1:** Group B could CREATE and SUBMIT but was **stuck at PENDING_REVIEW** because its only fake persona was `operator_b`. Group A had a reviewer, Group B did not. Before changing the source, real Chromium 144 through Playwright on a 390 × 844 mobile viewport completed Group A approval but demonstrated **zero available Group B reviewer accounts** after Group B submitted. This was a genuine offline walkthrough usability defect; not a production backend issue. The baseline mobile screenshot and original probe log are retained locally as reproduction evidence.

**Fix:** Added `reviewer_b` fake persona (“Người duyệt E · Nhóm B”), made both actor and scope selectors accessible via associated HTML `<label>` elements, and corrected the landing copy to say there are multiple roles. The fake state machine remains **in-memory only**, never reads real credentials, never contacts a server and never performs monetary actions. No change to backend, migrations, money calculations or production scope.

**Native Node.js 22.16.0, exact GitHub source bytes:**
- HTML Git blob `2ac44456ea28b86b9ca09ab107c63aa354c1a892`
- Regression Git blob `16889dcb3eeb38ba3c77b2575f6f5a1c9e3d8daf`
- `node --check tests/settlement-team-synthetic-walkthrough.test.cjs` → PASS
- `node --test tests/settlement-team-synthetic-walkthrough.test.cjs` → **8 PASS / 0 FAIL / 0 SKIP**. Includes Group B create→submit→independent approval, cross-tenant denial, tamper-resistant snapshots, label association, reset, stale-revision denial and no network APIs.

**Actual Chromium 144, Playwright browser interaction:** Unlike the initial attempts to navigate directly to a file URL (blocked by the browser sandbox), this qualification injected the exact standalone HTML into a fresh browser document via `page.set_content()` and ran real DOM clicks/selections with page errors/request interception:
- 390 × 844 mobile browser: **20/20 assertions PASS**;
- 1366 × 768 desktop browser: **20/20 assertions PASS**;
- Both workflows A and B completed, unauthorized viewer and cross-tenant access blocked, reset clears both groups, conflict and labels verified.
- **0 JavaScript page errors; 0 network requests; 0 horizontal overflow** at these two viewport sizes.
- Screenshots and logs saved under `/mnt/data/settlement_synthetic_demo/qa/`; **these are local browser QA, NOT real Android hardware or independent external acceptance.**
- Browser automation did **not** verify OS-specific `file://` opening. A Linux Chrome policy blocked direct file URL in this sandbox. Standalone file mode on Windows/Android remains `NOT_RUN` until user or hardware verifies.

**Qualification boundary:** No remaining failures were detected in the **specific 8 native Node and 40 Chromium assertions run on this fake-only demo**. This is **NOT** proof of absence of all bugs or real-money safety. The actual KTS Settlement backend, PostgreSQL16 tenant isolation and HIOSKT 65-case money oracle remain unqualified: `WRITE_BLOCK=ENABLED; RELEASE=NO_GO; COST_USD=0`.
