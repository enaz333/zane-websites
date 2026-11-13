# Protected release workflow

Configure these GitHub environments before the first approved dispatch. Restrict all three to main, require an owner reviewer and disable administrator bypass.

| Environment | Settings |
| --- | --- |
| cloudflare-staging | Separate Cloudflare account. Set STAGING_CLOUDFLARE_ACCOUNT_ID, PRODUCTION_ACCOUNT_ID and STAGING_WORKERS_DEV_SUBDOMAIN. Store STAGING_CLOUDFLARE_API_TOKEN here with access only to the staging account. |
| cloudflare-production | Set CLOUDFLARE_ACCOUNT_ID and store CLOUDFLARE_API_TOKEN with the permissions required for Worker deploy, rollback and read-only domain lookup. |
| cloudflare-provisioning | Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_ZONE_ID. Store the Worker token and a separate CLOUDFLARE_DOMAIN_API_TOKEN restricted to the required account and zone. |

After a successful approved staging test and owner authorization, set WORKERS_PUBLISH_ENABLED to true in the relevant protected environments. Set WORKERS_PROVISIONING_ENABLED to true only in the reviewed provisioning environment. Keep both settings absent from repository variables. Every production release is a manual dispatch from protected main and waits for environment approval.

For an existing site, merge the validated PR and choose Update in Publish Workers. Supply the full SHA of the last successful deployed main commit. Review the selected changes and confirm the baseline matches the actual release history. Record the successful run and new commit as the next baseline. Production runs share a concurrency group. Avoid dashboard deploys while a release is active.

For a new project, merge the disabled scaffold first. Review and merge a separate activation PR. Choose Provision, use the last deployed SHA and approve the provisioning environment. The job checks domain conflicts, publishes in dependency order, checks the canonical destination before advertising its short URL and verifies the public routes. DNS and domain conflicts halt the run. The current generic health check for a new project verifies its host, path and status. Add an application-specific content check if a generic response is insufficient.

The job reports prior versions before publishing. On a detected failure it attempts to restore existing versions in reverse order. A new Worker and any domain it acquired require owner review. A runner cancellation, Cloudflare API outage, or failed rollback may require manual recovery. Use the recorded versions in the Actions summary and verify live URLs. Cloudflare rollback covers versioned code and configuration. Domain attachments and external data need separate recovery.
