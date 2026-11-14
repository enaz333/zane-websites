# Studio local app-building slice

The local engine provides persisted specifications, request idempotency, per-project version checks, a provider protocol, checked multi-file output, JavaScript syntax validation, fixture behavior tests and immutable review artifacts. A local workbench lists projects and saved requests and supports updating the brief against the latest version. It uses synthetic data and the reviewed collection fixture.

## Run locally

Use the repository's Node 22 and Python 3.12 environment.

```sh
python3 -m studio_engine --workspace /tmp/studio-builder-demo --spec studio_engine/fixtures/spec.json --request-id demo-1
python3 -m studio_engine.server --workspace /tmp/studio-builder-demo
```

Open http://127.0.0.1:8794. The separate preview listens on port 8795. Keep these servers on loopback and use synthetic information. The collection supports search, categories, favorites and browser-local persistence. The workbench supports selecting an existing project and saving a revised specification. The current fixture provider returns the same reviewed application for each request. It does not interpret instructions or implement requested new functionality.

Each successful version has a public directory, tests and a review.json manifest. The manifest records parent version, artifact hash, provider and validator identity, proposed short path and disabled publication. Requests and phase events remain in the local SQLite database. A repeated request ID returns its recorded result. Conflicting reuse and stale parent versions are rejected. Failed builds retain their diagnostic and leave the published local version unchanged.

## Trust boundary and capability roadmap

Provider.generate receives the specification and prior source map and returns a proposed complete file map. The executor checks paths, byte bounds and exact reviewed fixture contents before invoking Node. This restriction is deliberate for the host-based fixture runner. Supporting arbitrary generated JavaScript requires an isolated execution adapter with filesystem, process, network, credential and resource boundaries. Syntax checks alone do not provide such a boundary.

The first supported capability is interactive. Declarations for Worker APIs, database, storage, authentication, integrations, payments, scheduled work, realtime, maps, media, AI and WebXR are recognized but rejected until a corresponding adapter and approval policy exist. Unknown capabilities fail validation. There is no automatic dependency installation or generated shell execution.

The next adapter should accept a pinned source snapshot, immutable request ID, approved capabilities, resource limits and cancellation token. It should return phase events, a complete file manifest, patch digest, tool results and provider usage. Choose a hosted coding environment for cloud operation or an explicitly installed local agent for optional Mac operation. Provider availability, pricing and supported APIs must be researched before implementation. No production provider has been selected or integrated here.

Long jobs should use durable orchestration outside a single Worker request. Persist provider job IDs before dispatch, reconcile ambiguous starts and never refund reservations on uncertain billing. Keep provider, validator and publisher identities independent from source SHA. A trusted publisher must independently reconstruct the approved diff, compare the checked digest and reconcile a deterministic branch before creating a draft PR.

## Known limits and next milestones

- The workbench is a separate local service. Integration with the authenticated Studio Worker, D1 project ownership and existing Edit/Add New navigation is pending.
- A completed build produces a local review artifact. Repository patch export, actual draft PR publication, disabled registry scaffolding and deployment are pending.
- Brief history is persisted in run requests. Conversation messages, arbitrary instruction-driven code iteration, cancellation and rollback controls are pending.
- Builds run synchronously and have bounded Node subprocess durations. A process crash can leave a running row or an orphan version directory. Preserve both, inspect the manifest and database, and use a fresh workspace for further fixture testing. Automated reconciliation requires its own state machine.
- Local fixture execution costs zero provider tokens. The manifest reports zero estimated cost and unknown actual provider charges. Paid adapters must implement the existing reservation safeguards before activation.
- Preview files are checked against the recorded digest on every request. The two local origins separate the workspace API from the app. Multi-user authorization, per-project preview origins and public preview hosting remain unimplemented.
- The local collection and workbench need desktop, keyboard and mobile browser verification.

## Validation

```sh
python3 -m unittest discover -s tests -p test_studio_engine.py -v
node --test tests/studio-prepare.test.mjs tests/studio-dispatch.test.mjs tests/studio-provider.test.mjs
```

Run the README suite as well. The HTTP tests invoke handlers directly so they can verify origin rejection, project listing, preview serving and tamper rejection in environments that prohibit socket listeners.

## Follow-up sprint

The provider/workspace branch adds two fixtures, request messages, specification restoration, prior-artifact checks, local Studio navigation and source-pinned patch review. The updated implementation status, browser verification, provider boundaries and remaining cloud work are recorded in [the next sprint handoff](studio-next-sprint.md).
