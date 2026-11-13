# Studio reliability sprint

The branch is `codex/studio-reliability-sprint`, based on main at `9ec27f6`. GitHub DNS resolution blocked the push, so the branch is available as a verified Git bundle. No draft PR was opened. No live staging or production behavior was verified. The sprint used synthetic data and made no deployment, cron, recovery workflow or paid model calls.

## Delivered

- Prepare rejects malformed GitHub content and validator replies before a model call. Fixed diagnostics distinguish timeouts, HTTP errors, invalid responses and unclear claims.
- A lost claim reply leaves the persisted lock and reservation in force. After expiry the dispatcher can resume safe work. An interrupted model attempt is never replayed. GitHub recovery checks the deterministic branch and draft contents and fences new publication by the execution window.
- The one-time recovery script now reads back the expected terminal state after an unclear import reply. It checks the cleared lock, ledger, audit history and terminal timestamp. GitHub or dispatcher postflight failures report separately after D1 verification. The guarded recovery SQL and workflow entry conditions are unchanged.
- The new-project guide includes route inventory regeneration and local preview. A temporary-repository test checks that scaffolding leaves existing site files, enabled project entries and public redirects intact.

Commits are `16ff77f` for dispatcher reliability, `061e809` for D1 recovery, `f02a869` for SQLite failure injection, `d852684` for publication response validation, `3609dcb` for scaffolding and `6613d08` for validator revision and digest tests.

## Verification

- Offline npm install, repository validation (199 checks), registry validation (6 projects), route inventory check and all 55 Python tests passed.
- All 26 Node tests outside the loopback-dependent Studio suite passed. These include route compatibility and the SQLite dispatcher regression covering concurrent ticks, a lost claim reply, stale lock recovery, reservation preservation and lost GitHub branch and PR replies.
- The dispatcher Wrangler bundle dry run passed. The full Node command and private Studio release dry run reached the local runtime but failed at loopback bind with `EPERM`. Browser and validator container checks remain pending.

## Follow-up investigation

The validator image embeds the source archive in [prepare-image.sh](../sites/studio/executor/prepare-image.sh) and verifies the pinned SHA and patched bytes in [check-server.mjs](../sites/studio/executor/check-server.mjs). The dispatcher currently uses that same SHA for GitHub publication. Separating these safely would require independently verifying a reviewed target archive in an immutable runner. Pin the runner image and dependency lock, keep the authorized source SHA separately reviewed, verify it against the archive and retain the exact patch digest check. Preserve the final main check. The current branch keeps the exact SHA gate and tests stale main, an incorrect validator base and an incorrect digest.

The focused operational review covered Studio dispatch, publication, recovery, staging release controls and route scaffolding. A whole-repository audit and the interface roadmap remain pending.

- The shared-account token can reach beyond staging if compromised. The target checks in [release_studio_staging.py](../scripts/release_studio_staging.py) protect the workflow, while account or credential isolation would address the remaining boundary. Retain protected approval and review token scope before activation.
- Reconciliation can block subsequent tasks while GitHub is unavailable or a PR diverges from expected state. Add an owner-visible reconciliation state and a read-only preflight that checks the exact branch and PR without permitting a model replay. See [studio-dispatch.mjs](../workers/studio-dispatch.mjs).
- The publisher reads main immediately before creating a PR, but main can advance between that read and creation. Keep the PR in draft and use a required check tied to the reviewed base and proposed commit before any merge. See [studio-publisher.mjs](../workers/studio-publisher.mjs).

## When you return

1. Import the bundle with `git fetch /path/to/studio-reliability-sprint.bundle codex/studio-reliability-sprint:refs/heads/codex/studio-reliability-sprint`. Push that branch and open one draft PR against main.
2. Run the README suite on Node 22 and Python 3.12 where loopback binds are allowed. Smoke-test the validator with the reviewed commit and a synthetic secret.
3. After review and separate owner approval, prepare an inert dispatcher build for the same reviewed commit. Verify the protected staging environment, staging D1 marker, exact resource bindings and prior versions before any approved refresh. Keep cron off. Do not run the historical recovery workflow.
4. For the separately approved staging trial, follow [Studio executor setup](studio-executor.md) with one new synthetic task and the single-task budget. Verify the draft parent, one-heading diff, Activity result and ledger. Disable the test dispatcher afterward and retain the rollback versions.
