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

Source path: `app/settlement-team-synthetic-walkthrough.html` (Git blob `3c499b0cae5a70a9b1733425fe2d4df2cbd9bb5d`).
Node regression: `tests/settlement-team-synthetic-walkthrough.test.cjs` (Git blob `95a86bd3d456e33cba65e38dddaec59a389f8751`).

Exact local `git hash-object` matches these two GitHub blobs. Linux native Node.js 22.16.0:
`node --check tests/settlement-team-synthetic-walkthrough.test.cjs` **PASS**;
`node --test tests/settlement-team-synthetic-walkthrough.test.cjs` **5 PASS / 0 FAIL / 0 SKIP**, exit 0, using actual HTML JS evaluated with `node:vm`.
Two attempts to run headless Chromium screenshot in the current sandbox timed out with no screenshot; therefore **BROWSER_VISUAL_QA=NOT_RUN**, **PHYSICAL_ANDROID=NOT_RUN** and **USER_ACCEPTANCE=NOT_RUN**; do not claim these were validated.

This is a **product workflow preview only**, valuable for identifying UX misunderstandings before adopting a real shared group backend. It does not make KTS Settlement commercially/monetarily usable. Issue #32 independent security review, real PostgreSQL 16 least-privilege tenant isolation and authentic 65-case HIOSKT monetary verification are still mandatory gates.

`WRITE_BLOCK=ENABLED; RELEASE=NO_GO; PRODUCTION_MUTATION=NONE; COST_USD=0`.
