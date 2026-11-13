# Protected release workflow

Private Studio is excluded from these workflows. See the [Studio release checklist](studio-release.md) for its separate manual workflow and owner approvals.

Use the same existing Cloudflare account ID in all three GitHub environments. Configure these environments before the first approved dispatch. Restrict all three to main, require an owner reviewer and disable administrator bypass.

| Environment | Variables | Secrets |
| --- | --- | --- |
| cloudflare-staging | `CLOUDFLARE_ACCOUNT_ID`, `STAGING_WORKERS_DEV_SUBDOMAIN` (label only) | `STAGING_CLOUDFLARE_API_TOKEN` |
| cloudflare-production | `CLOUDFLARE_ACCOUNT_ID`, `WORKERS_PUBLISH_ENABLED` (unset by default) | `CLOUDFLARE_API_TOKEN` |
| cloudflare-provisioning | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`, `WORKERS_PUBLISH_ENABLED` and `WORKERS_PROVISIONING_ENABLED` (both unset by default) | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_DOMAIN_API_TOKEN` |

Use a dedicated staging token with Workers Scripts write on the existing account. Grant no DNS, Workers Routes, storage or secret management permissions. Keep production and provisioning tokens in their own environments. The production token needs Worker deploy, rollback and read-only domain lookup. Scope the domain token to the existing account and intended zone, with Workers write, Workers Routes write and DNS read for conflict checks. Keep token values out of repository variables and ordinary agent environments.

Staging uses reviewed source, synthetic data and `zane-stage-<run-id>-<attempt>-<project>` workers.dev URLs. It validates all generated configs before uploading any Worker. Configs allow static assets and same-run service bindings, use explicit test variables, and exclude custom domains, routes, storage bindings and runtime secrets. workers.dev URLs are public. Use local preview for private material.

Sharing an account provides weaker isolation than separate accounts. The staging token's Workers write scope can extend to production Workers. Naming and configuration checks prevent accidental writes in the reviewed workflow and are not a security boundary against a compromised token or malicious privileged code. Cloudflare zone permissions provide a separate control for domains and routes.

Keep the latest successful staging set and any incident or rollback hold. After seven days, generate a read-only list of superseded or failed sets. Check domains, routes, inbound bindings, active jobs and holds before seeking owner approval. Remove consumers before providers. Future automation should default to reporting and use a separately approved deletion job with exact Worker names.

After a successful approved staging test and owner authorization, set WORKERS_PUBLISH_ENABLED to true in the relevant protected environments. Set WORKERS_PROVISIONING_ENABLED to true only in the reviewed provisioning environment. Keep both settings absent from repository variables. Every production release is a manual dispatch from protected main and waits for environment approval.

For an existing site, merge the validated PR and choose Update in Publish Workers. Supply the full SHA of the last successful deployed main commit. Review the selected changes and confirm the baseline matches the actual release history. Record the successful run and new commit as the next baseline. Production runs share a concurrency group. Avoid dashboard deploys while a release is active.

The planner skips conventional project instruction files at the site root and prose in `sites/<slug>/docs/`. Keep runtime documentation and other build inputs in `src/` or `public/`, and declare shared Worker inputs in the registry's watch list. Published Markdown counts as a public asset. Root npm build inputs select all enabled Workers.

For a new project, merge the disabled scaffold first. Review and merge a separate activation PR. Choose Provision, use the last deployed SHA and approve the provisioning environment. The job checks domain conflicts, publishes in dependency order, checks the canonical destination before advertising its short URL and verifies the public routes. DNS and domain conflicts halt the run. The current generic health check for a new project verifies its host, path and status. Add an application-specific content check if a generic response is insufficient.

The job reports prior versions before publishing. On a detected failure it attempts to restore existing versions in reverse order. A new Worker and any domain it acquired require owner review. A runner cancellation, Cloudflare API outage, or failed rollback may require manual recovery. Use the recorded versions in the Actions summary and verify live URLs. Cloudflare rollback covers versioned code and configuration. Domain attachments and external data need separate recovery.
