# AGENTS.md — Safe $0 GitHub Actions, cross-project handoff

Repository: `wilson86/tach-dai-mobile`.
Policy authority: `WILSON86-ZERO-COST-CI-2026-10-09-v1`.
Canonical cross-project policy: https://github.com/wilson86/AI_ORCHESTRATOR/blob/migration/f-source-preserved-20261005/docs/PROJECT_WIDE_ZERO_COST_CI_POLICY.md

## Mandatory agent instructions
Read the canonical policy and existing project-specific release/data rules before work.
The user has **no GitHub payment method and authorizes $0 extra spend**. Their October 2026 quota of 2,000 GitHub-hosted Actions minutes has run out; the email projects reset on 2026-11-01. Recheck billing before future paid-runner eligibility. Do not add payment, increase budgets, purchase CI, or expose private code to gain free CI.
Use public standard hosted runners only when eligible, and batch CI to the exact final SHA.
For private projects, do not intentionally trigger metered workflows with exhausted minutes. Use local deterministic tests where available. Mark `GITHUB_CI=NOT_RUN/BLOCKED` if not actually green; synthetic QA and green SOURCE-PARITY do not equal real-world qualification.
Do not bypass required security or release gates. No main merge or deploy, customer data mutation, new monetary rules, or publish actions without explicit user approval. Use local Codex only for indispensable Windows/hardware/oracle tasks and provide one copyable PowerShell prompt.
Report repo, branch, HEAD, test counts and provenance, real-world blockers, no production mutation, and next safe step at every handoff. Warn before chat context is exhausted.

## Branch scope
This file lives on the isolated `governance/zero-cost-ci-20261009` branch to avoid automatically triggering CI/deployment on the working `main` branch. It is **not merged**, and does not constitute a release.
Other chats must read this governance branch directly if it is not yet present in their working branch. Do not merge this branch solely to make a note available; evaluate branch safety and publication gates first.
