# Zane Studio

Studio is a private workspace for requesting changes to a website or proposing a new page or independent app. Edit captures a registry target, optional page and description. Add New captures a title, proposed apex slug and build type. Both default to economy and record the optional ASAP preference. Activity shows saved requests, with cancellation and paginated history. Production submission saves a request and does not start a job. Local preview queues eligible Personal homepage Edit requests to exercise the MVP 1B storage and Activity changes.

## Preview locally

Use Node 22. Run from the repository root:

```sh
npm ci
npx --no-install wrangler d1 migrations apply DB --local -c sites/studio/local/wrangler.json
npx --no-install wrangler dev --local -c sites/studio/local/wrangler.json
```

Open http://127.0.0.1:8793 (use that exact host and port). This entry point supplies a synthetic owner and local D1 only. Use synthetic requests. Stop the preview with Ctrl-C. Both commands use the same local state directory by default; pass the same `--persist-to` to both if using another directory. Do not upload the local config or expose the server via a tunnel. The checked-in deployable Worker has no D1 binding or Access settings and denies requests by default.

## Four layers

| Layer | MVP 1A | Next increment |
| --- | --- | --- |
| Interface | Cloudflare Worker authenticates before serving assets or APIs. Responsive forms and Activity use same-origin requests. | Owner-only Cloudflare Access policy and live phone checks. |
| Task manager | D1 tasks and events. Submitted → cancelled is the only transition. Case-insensitive slug collisions and pending reservations are checked before provisioning exists. | Add execution attempts with lease fencing, attempt IDs, provider job IDs, timestamps, typed outputs, PR and preview refs, usage and redacted errors. Store approval decisions and deployment records separately. |
| Executor | No runner or outbound task processing. | One provider-independent adapter with start, status/events and cancel operations. It accepts an immutable task/revision, repo SHA and a budget envelope; returns a provider run ID and typed results. |
| Publishing | GitHub remains source of truth. Studio has no GitHub or Cloudflare publishing credentials. | Independently check risks against the reviewed commit and reuse protected GitHub deployment gates. Log commit SHA, Worker version, verification and rollback version. |

`GET /api/projects` returns the registry targets (Studio is managed separately). `GET /api/tasks` lists the authenticated subject's requests; `before` is an owner-scoped cursor. `POST /api/tasks` requires same-origin JSON and a UUID idempotency key. Same owner, key and normalized payload returns the existing record; a different payload with that key conflicts. The browser retains the key for unchanged retries in the current form session. `POST /api/tasks/:id/cancel` uses an owner-scoped conditional write and is repeatable. SQLite uniqueness constraints arbitrate concurrent requests, and triggers record state changes in the same transaction. Cancelled requests release their proposed slugs.

The [generated route inventory](../workers/studio-paths.json) checks repository reservations, all registry entries and top-level asset names. Run `python3 scripts/studio_paths.py` when changing them. This is a conservative intake check; live Cloudflare routes, unpublished work and target subpaths must be revalidated at provisioning time. A page request adds a page under the chosen existing site's assets and needs a separately reviewed apex mapping when necessary. An app request uses `scripts/projects.py new` and its own Worker, stages the canonical URL, then proposes the apex link. Studio performs neither operation yet.

## Threat model and private activation

- Anonymous or wrong-host requests fail before reaching assets or storage. The Worker accepts only an Access application JWT from the configured team with a valid RS256 signature, intended audience, expiry, issuer, subject and exact owner email. It reads public signing keys from the fixed Access team origin. It ignores client-supplied identity headers. Access policy and short sessions are still required; a stolen valid JWT can be used until it expires. Recheck signed claims against real Access in staging.
- Requests and paths are bounded and treated as data. No URLs are fetched from task text. Browser output uses text nodes, no third-party scripts, restrictive CSP and no-store responses. Writes require the exact Origin and reject cross-site Fetch Metadata. D1 stores prompt text privately; set retention and recovery rules before using sensitive content. Do not put secrets in prompts, logs or PRs.
- Treat repository files, prompts, links and any future uploads as untrusted instructions for executors. Run in an ephemeral workspace with controlled egress, scoped access and no production secrets. Keep GitHub App write credentials in a trusted patch and PR service, limited to this repo and task branches. Validate patches and policy independently of the runner; never trust the agent's claim that a change is safe.
- Default future publishing to review. Require explicit approval for authentication, credentials, sensitive data, infrastructure, release policy, destructive changes and arbitrary executable code. The eventual automatic path should accept only narrow structured edits validated by independently owned policy. Bind every approval to the exact commit and action; protect policy files and never let a runner approve its own changes.

Studio stays disabled in the public registry. The [private release checklist](studio-release.md) covers the dedicated GitHub environment, Cloudflare Access and D1, owner-approved deployment, separate hostname attachment and recovery. The existing `/admin` reservation stays inactive.

## MVP 1B evaluation and costs

[PR B executor setup](studio-executor.md) supersedes the provider and activation proposals below.

**PR A: D1 queue and Activity.** Migration 0002 adds execution rows and transition events alongside intake. An enabled Edit submission inserts both rows in one D1 batch. Old requests and Add New stay intake-only. The internal claim operation is atomic, prioritizes ASAP among eligible rows, and fences updates with a 15-minute claim ID and expiry. Queued work can be cancelled before claim; expired claims fail without automatic re-execution. Activity shows only stored state, typed failures, timestamps, and a link derived from a verified PR number when supplied by a future trusted publisher. There is no consumer or simulated progress. Queue intake is enabled only in the loopback entry point.

**Recovery.** Apply the additive migration before uploading the new Worker via the existing protected release. Verify intake/history against staging data. If the Worker needs rolling back, restore the previous Worker version and leave both execution tables and audit triggers in place. Existing intake and cancellations still work with that Worker; the database guards a claimed task against being cancelled through an older version. Queue activation is a later change. Do not reset D1 or remove migration history to recover; investigate from the private audit trail.

**Executor choice for PR B: OpenAI Agents API with an OpenAI-hosted sandbox.** The [managed Codex harness](https://developers.openai.com/api/docs/guides/agents-api/overview) supplies durable sessions, events, webhooks, and artifact output. The [sandbox setup API](https://developers.openai.com/api/docs/guides/agents-api/environments/prewarmed) can prepare files and dependencies before attaching the agent. Use a pinned public source snapshot and preloaded dependencies; prove that the sandbox can run the repo checks with restricted egress and export a bounded patch. Account access and that runtime compatibility have not been verified. The [Codex SDK](https://developers.openai.com/blog/codex-as-a-platform) is the fallback if the hosted sandbox or usage limits are unsuitable; it requires separately hosted ephemeral compute and Studio-owned lifecycle management. [GitHub Copilot cloud automations](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/create-automations) offer programmatic PR creation but bill in AI credits plus Actions minutes, and their GitHub publishing path gives Studio less control over patch approval before a PR opens.

**Setup and cost.** Confirm an OpenAI Platform billing project and a restricted key with Agents read/write and Responses write ([quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart)); keep the key outside the sandbox. ChatGPT subscription access is separate. Install a dedicated GitHub App only on this repo, with Contents and Pull requests write for the trusted publisher, no Actions, Workflows or administration write, and no branch protection bypass. Keep all credentials outside the agent and deploy environments. OpenAI bills model tokens, any metered tools and hosted container usage at [API rates](https://developers.openai.com/api/docs/pricing). For illustration, 100k uncached input and 10k output at $2/$10 per million plus one $0.12 container interval is $0.42; repeated calls, larger sandboxes and extra intervals increase the estimate. This PR makes zero provider calls.

**Activation gate.** Before dispatch, implement a scheduler, persisted provider IDs, reconciliation before retrying any ambiguous external operation, and a trusted publisher that accepts only independently validated changes to the selected site's existing public content. Reserve spend transactionally, bound model usage and sandbox runtime, and distinguish estimates from provider billing. Propose a $2 cap for one smoke test and $20 per month, subject to owner approval; if the provider cannot enforce a bounded run, leave dispatch off. ASAP changes order, never budget. Economy may target 24 hours when capacity permits. Validate first in protected staging with synthetic data: from a phone with both Macs offline, submit one copy edit to an existing public page. Verify the expected diff, checks, a new draft PR, reconciliation on a missed callback and matching Studio Activity. Do not merge or deploy the generated PR.

## Local verification

Verified in browser against local Wrangler and D1: empty history, Edit submission, reload, cancellation, Add New reservation error and ASAP app submission at 375 px. Automated tests use signed fixture JWTs and a test D1 instance for authentication, owner isolation, concurrency and audit history. Repository validation passed 199 source checks, 20 Python tests and 9 Node tests. Wrangler dry runs passed for all six registered Workers and all five staging configurations. Live Access, DNS, TLS, remote D1 and deployment were not exercised.
