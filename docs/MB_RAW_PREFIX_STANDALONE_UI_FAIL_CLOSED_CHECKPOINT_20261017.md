# Mobile/Unified raw-prefix safety addendum — 2026-10-17

Supersedes source-scope statements in `docs/MB_RAW_PREFIX_VERSIONED_RELEASE_REVIEW_20261017.md` that assumed the PWA functional parser source would remain unchanged. This release candidate includes an additional safety improvement discovered during review.

## Exact source
- Candidate code/test HEAD before this addendum: `eace2adbc9f36123d5f4b47d8ac208d9b0bdbeac`, Draft PR #13, based on qualified feature SHA `69aa61c3c25f31c2a9391eccbd6f5dd72a5fa151`.
- Root `index.html`: new `findForbiddenRawBetPrefix` scans physical source lines BEFORE `preprocessChatText` and materialized output. Standalone Mobile `run` invokes it, fails closed with physical error line, clears result list and preserves source.
- `app/index.html`: Unified/Đá Vòng invokes the same iframe-origin raw-prefix guard BEFORE any chat cleaning; error clears result and does not copy/cut/generated-money silently.
- `tests/mb-leading-dot-chat-envelope.js`: verifies 6 malformed raw formats including pipe with/without spaces, doubled pipe/dot, full Telegram headers, with line 2 attribution. `tests/mb-leading-dot-davong-parity.js`: static ordering gate requires preflight before iframe sanitize.
- Mobile 2.0.32 and Unified 1.0.20 versioned SW caches and QA pinning remain coherent. Engine/calendar unchanged at SHA `046935677f9d88468b71246410444c27435c72e1415aeb359c799452584c36eb`.
- The earlier passed 15 functional Node scripts and 5 release-cache tests apply to prior SHA, NOT the new branch containing this raw-prefix guard.
- Isolated in-process V8 against actual staged Mobile and Ngang engines: 6 malformed inputs correctly marked line 2; single approved dot and standalone divider kept; two legitimate MB inputs normalize exactly. Static code syntax PASS. **Real Node/UI/Android QA on this new release staging SHA: NOT_RUN.**
- All public pages unchanged. Do not merge/publish until SHA-bound C:-isolated Node checks, Router-release-based bridge + Desktop regression, and separate human deployment approval.
- `COST_USD=0`, `PRODUCTION_MUTATION=NONE`, `GITHUB_CI=NOT_RUN`, `MERGE=NO`, `DEPLOY=NO`, `RELEASE_READY=FALSE`.
