# Studio 2 local foundation handoff

## Implemented and tested

Recovered the prior reliability branch from the verified bundle at f7de6e9. Its six Python recovery tests and eighteen dispatcher/prepare tests passed before implementation. The new integration branch is codex/studio-app-engine.

Added a local application engine, deterministic collection provider, persisted specifications and run history, request idempotency, project version checks, strict artifact validation, bounded builds and tests, immutable review manifests, and a separate preview service. Added a local project workbench with brief editing and preview links. Eight new Python tests cover builds, failure handling, project isolation, stale versions, duplicate requests, artifact rejection, HTTP origin checks and preview integrity.

The source validator passes 201 checks. Registry and generated route inventory checks pass. All 63 Python tests pass. Twenty focused Studio Node tests pass. Full Node testing reaches the existing Miniflare suite but fails at loopback binding with EPERM.

## Implemented but incompletely verified

The local servers cannot bind sockets in this sandbox. Browser interactions and responsive appearance have not been verified. The private release dry run has the same runtime restriction. The generated app is buildable and its model tests pass, but this session did not observe a running browser demo.

## Designed only

The provider protocol and capability catalog are implemented. Arbitrary generated code execution, full-stack Worker applications, durable cloud orchestration and provider cost accounting require adapters described in studio-app-engine.md. Exact fixture matching currently enforces the executable boundary.

## Not started

Cloud Studio integration, true conversational code iteration, repository patch export and automatic draft publication, approval records, dependency installation, infrastructure provisioning, rollback controls, broad repository audit and live model integration remain pending. This is a partial implementation of the major sprint. The requested general-purpose app builder is not complete.

## Versioned work and external limitations

The recovery commit is f7de6e9. The engine milestone is 837e1cb and the workspace milestone is a76a35b. Subsequent fixes and this handoff are committed on the same branch. The verified bundle contains the final branch tip.

The GitHub connector confirmed repository access. Git push failed because shell networking could not resolve github.com. No remote branch or draft PR was created. Production, staging, D1, cron, DNS and paid APIs were untouched.

## WHEN YOU RETURN

1. Import the final bundle into the canonical repository using git fetch with an unused local branch name, then inspect the complete diff.
2. Run the README checks in an environment that allows local listeners.
3. Follow studio-app-engine.md to open the workbench and test search, categories, favorites, reload persistence, keyboard use and a mobile viewport.
4. Push the integration branch and open a draft PR after reviewing the local-only scope and remaining gaps.
5. Approve a separately scoped sandbox/provider integration before enabling arbitrary AI-generated code or any paid execution. Deployment and infrastructure changes require separate owner approval.
