# Zane Studio · MVP 1A

Studio is a private workspace for requesting changes to a website or proposing a new page or independent app. Edit captures a registry target, optional page and description. Add New captures a title, proposed apex slug and build type. Both default to economy and record the optional ASAP preference. Activity shows saved requests, with cancellation and paginated history. Submission does not create a job, modify a site, or commit to a delivery time.

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

Public registry activation would add Studio to the homepage and generic deploy workflow. This version guards against both by requiring a disabled, unmanaged registry entry. The existing `/admin` reservation keeps it unavailable for public projects; there is no redirect. No existing production route changes. Before authorizing private activation:

1. Create a Cloudflare Access self-hosted app for the entire Studio host, with a single owner allowed via an authenticated identity provider, short sessions and no bypass policy. Set the Worker runtime values `ACCESS_TEAM_ORIGIN` (HTTPS team origin without trailing slash), `ACCESS_AUD`, `STUDIO_OWNER_EMAIL` and `STUDIO_ORIGIN=https://studio.zanegiordano.com` outside Git. Configure a dedicated D1 `DB` binding and apply the checked-in migration in the approved deployment context. Test remote D1 separately from the local database.
2. In a separate reviewed private-release change, use a protected GitHub environment with main-only, required owner review, a pinned commit and narrowly scoped credentials. The generic staging and production workflows must continue to exclude Studio. Keep workers.dev and preview URLs disabled. Review the actual deployment and rollback records before deployment; the historical release SHA is not a verified live baseline.
3. With owner authorization, verify Access before attaching the intended hostname. Verify anonymous and other-account denial for both assets and API, valid owner sign-in from a phone, and submission, reload and cancellation against the private database. Review `/admin` separately after this works. No changes to existing protected branch or environment settings are needed for 1A.

## MVP 1B evaluation and costs

The [OpenAI Agents API](https://developers.openai.com/api/docs/guides/agents-api/architecture) documents a managed Codex harness with hosted or connected sandboxes. Evaluate it first for a one-task PR proof of concept: verify account access, sandbox repository bootstrap, network restrictions, artifact export and usage reporting. The [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk) in a separately hosted ephemeral Node sandbox is the fallback candidate if control over setup or output is better there. Both need an approved auth and budget arrangement; do not assume a ChatGPT subscription supplies the necessary API entitlement. Test with both Macs offline.

Initially use a single executor and a monthly budget with a transactionally reserved estimate before dispatch, explicit owner approval for overages, and actual costs only when documented usage supports them. Unchecked requests can wait up to 24 hours for a cheaper execution window; ASAP may spend more within budget but never bypass review. Consider a deterministic structured editor for simple copy changes. Optional future Mac workers should use outbound authenticated leases, restricted workspaces, and no public SSH or Ollama.

Local preview has no hosting or AI charges. Private hosting uses [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/) and Access; confirm the account's plan and quotas before activation. No AI calls or execution charges are incurred in 1A.

## Local verification

Verified in browser against local Wrangler and D1: empty history, Edit submission, reload, cancellation, Add New reservation error and ASAP app submission at 375 px. Automated tests use signed fixture JWTs and a test D1 instance for authentication, owner isolation, concurrency and audit history. Repository validation passed 199 source checks, 20 Python tests and 9 Node tests. Wrangler dry runs passed for all six registered Workers and all five staging configurations. Live Access, DNS, TLS, remote D1 and deployment were not exercised.
