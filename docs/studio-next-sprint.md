# Studio provider and workspace sprint

Branch `codex/studio-provider-workspace` is stacked on PR #29 at `c4fad83`. Keep the PRs ordered. This sprint completes a local fixture creation, iteration, preview and patch-review workflow. General AI execution and cloud project integration remain pending.

## What works

- The full PR #29 README suite passed on Node 22.23.2 and Python 3.12.10 with loopback access, including Miniflare and the private release dry run.
- The local Studio entry point advertises Projects (local) after authentication. The production entry point returns no builder URL. Existing Edit, Add New and Activity remain available.
- SQLite stores project specifications, parent versions, request messages, results and phase events. A compatible additive column migration retains old local runs. The UI lists every version, supports continuing a project and restoring an older specification as a new build.
- Collection and habit-tracker fixtures exercise different application behavior. The name field changes the generated heading. Freeform requested changes are stored but do not drive general code generation.
- Parent artifacts are digest checked before iteration. Builds use the selected Node executable. Preview digests are checked on each request. Fixture storage keys are scoped by project.
- Local patch preparation independently checks the artifact, reconstructs the pinned repository tree, scaffolds a disabled Worker, validates its registry entry and regenerates route reservations. It records source SHA, artifact digest, patch SHA-256 and a deterministic proposed branch. Existing edits are limited to disabled projects without shared code or service dependencies.
- The workbench displays the actual patch. Tests apply it to an isolated Git repository and validate the resulting registry. Production activation is a separate review.

Commits through the main implementation milestones are `df05166`, `a4c495f`, `194551f` and `91c614a`. Subsequent test/documentation commits remain on the same branch.

## Provider and execution boundary

A Responses API adapter constructs strict structured-output requests for four source files, with prior source and arbitrary specifications as data. It checks response completion, output shape, duplicate paths and usage, records the returned response ID and distinguishes ambiguous outcomes. Requests have a 60-second transport timeout and no automatic replay. Cancellation is checked before and after a synchronous request. It cannot interrupt an in-flight HTTP request.

The adapter defaults to disabled. It has only been exercised with synthetic responses. It is not exposed through the workbench and is not wired into the build engine. No real API request, credential read or charge occurred. A reservation amount in its configuration is metadata, not a durable budget ledger or verified price ceiling. Before activation, integrate atomic admission with the existing ledger, verify the selected model's current rates and account access, persist job identity and usage, and approve a capped test.

Responses structured output provides a bounded source-generation interface. The Codex SDK supports programmatic coding tasks, while the managed Agents API offers a hosted harness. Sustained tool-driven work should use one of those integrations with durable task orchestration after availability, costs and isolation are reviewed. The current slice avoids introducing a custom autonomous tool loop. [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk), [Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview).

The Docker runner requires an immutable local image ID and disables pulls and network access. It uses a read-only root and input mount, unprivileged UID, dropped capabilities, no-new-privileges, process/memory/CPU limits and a wall-clock timeout. It runs fixed JavaScript syntax checks. A local existing validator image passed the smoke test. This establishes syntax validation inside a container, not functional validation of arbitrary generated applications. The main build engine still permits only reviewed fixtures. Dependency installation, arbitrary build commands, generated tests and general-code browser previews remain disabled pending a complete isolated runner contract.

## Browser evidence

Chrome was used against loopback services with synthetic data.

- The collection search returned one rug. Textiles filtering returned two objects.
- A favorite survived reload and remained present in the next version.
- Continuing the project produced version 2 with a new heading while version 1 remained available.
- The collection layout was inspected at desktop size and 390 × 844. The temporary viewport override was reset.
- A second project generated the habit tracker. Keyboard Space checked a habit, and reload retained the 33% completion result.
- Local Studio rendered its Projects link alongside existing navigation.
- Preparing the habit version produced a visible source-pinned patch and SHA-256 in the workbench.

Automated tests cover malformed artifacts, preview tampering, stale versions, duplicate requests, project isolation, disabled provider gating, lost provider replies, source-bound export and existing Studio authentication and routing. Live Access, remote D1 and deployed services were not verified during this sprint.

## Remaining acceptance gaps

Authenticated cloud project persistence and conversation APIs, D1 project migrations, automatic crash reconciliation, immutable version restoration beyond reviewed fixture specifications, generated-app draft PR publication, cloud previews, complete provider budgets and real natural-language generation are unfinished. The existing bounded copy publisher retains its lost-reply tests, but the general app exporter has no GitHub write adapter yet. No live test-app PR was created. The engineering branch itself is published for review.

All previews currently share one local origin. Project-specific storage keys reduce fixture interference, but arbitrary hostile previews would require origin or opaque-origin sandbox isolation. Keep arbitrary code preview disabled until that is implemented. Old artifacts made with earlier fixture bytes remain viewable, while export can reject them against the current reviewed-fixture policy.

The export patch is a local deployment preparation artifact. Actual staging deployment, resource ownership verification, secret-name inventory, Access checks, validator rollout, cloud migration and rollback approval remain manual. The historical staging recovery workflow must stay unused.

## Local commands

```sh
python3 -m studio_engine.server --workspace /tmp/studio-next-demo
npx --no-install wrangler d1 migrations apply DB --local -c sites/studio/local/wrangler.json --persist-to /tmp/studio-next-web
npx --no-install wrangler dev --local -c sites/studio/local/wrangler.json --persist-to /tmp/studio-next-web
```

Open http://127.0.0.1:8793 and select Projects (local). Use a fresh synthetic project, select a fixture, build, preview, continue, change its name, build again and prepare the latest version's patch. Run all README checks before review.

## Next five actions

1. Review PR #29 first, then this stacked PR and its full test results.
2. Repeat the loopback acceptance workflow on the owner's Mac, including older-specification restoration and patch review.
3. Implement owner-scoped D1 projects/messages and a durable local-to-cloud execution bridge before exposing Projects remotely.
4. Connect the disabled provider to atomic reservations, durable job reconciliation and isolated validation, then separately approve a capped paid test.
5. Add the constrained GitHub app publisher and private cloud preview isolation, then request separate approval for the smallest protected staging rollout with recorded rollback versions.
