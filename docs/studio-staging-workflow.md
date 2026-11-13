# Initialize private Studio staging

After review and merge, open **Settings → Environments → New environment** and create
`cloudflare-studio-staging`. Under **Required reviewers**, add repository owner
`enaz333`. Restrict deployment branches to `main`, keep main protected, and disable
administrator bypass. If you enable **Prevent self-review**, have a separate authorized
operator dispatch the run so the owner can review it. The workflow also checks the
GitHub approval history for a recorded owner approval before loading Cloudflare credentials.

Store these values on this environment only:

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Existing Cloudflare account ID |
| Variable | `STUDIO_STAGING_D1_ID` | `b034fcf2-2420-4ddc-8adc-3a88a649d37d` (`zane-studio-staging`) |
| Variable | `STUDIO_PRODUCTION_D1_ID` | `561e30fc-6f6e-4ecb-8ca9-ad09f63d72b4` (`zane-studio`, identity check only) |
| Variable | `STUDIO_STAGING_RELEASE_ENABLED` | Leave unset until ready to dispatch, then set to `true` |
| Secret | `STUDIO_STAGING_DEPLOY_TOKEN` | Account **Workers Scripts: Edit** only |
| Secret | `STUDIO_STAGING_D1_TOKEN` | Account **D1: Edit** only, for metadata checks, migrations and marker |
| Secret | `STUDIO_STAGING_ACCESS_TEAM_ORIGIN` | Staging Access team origin, `https://<team>.cloudflareaccess.com` |
| Secret | `STUDIO_STAGING_ACCESS_AUD` | Application Audience (AUD) from the owner-only staging Access app |
| Secret | `STUDIO_STAGING_OWNER_EMAIL` | Exact approved owner email from the staging Access policy |

Restrict both tokens to the existing Cloudflare account. Grant no zone, DNS,
Workers Routes, Access administration, or unrelated storage permissions. Do not
reuse production or generic staging tokens. Cloudflare account-scoped Workers
and D1 grants can reach other resources in the same account. The script fences
writes by exact Worker names and database identity; separate credentials limit
the API capabilities of each command, but are not a Cloudflare resource-level
boundary. If account-level scope is unacceptable, use a separate account and
review a different plan.

Verify the Access app protects the full staging hostname for the owner and leave
the hostname unattached. In **Actions → Initialize Studio staging → Run workflow**,
select main and enter the full reviewed current main SHA after merge. The
dispatcher is pinned to that SHA with execution disabled. Rebuild and smoke-test
the Cloud Run validator against that reviewed SHA before any later live trial.
Approve the pending environment deployment only after checking the SHA and
the staging configuration. Use a fresh dispatch instead of rerunning an attempt.

The run regenerates both configs in private runner storage, verifies both D1
names and UUIDs, applies migrations 0001–0003, and reads back the staging marker
before deploying either Worker. The web Worker receives the staging Access
settings and the fixed origin `https://studio-staging.zanegiordano.com`. Both
Workers have public preview URLs and workers.dev disabled. The dispatcher has
no routes, cron, task UUID, or AI credentials. DNS and custom domains are out of
scope, so live hostname checks wait for separate approval.

Use the Actions summary as the deployment record. It records the reviewed SHA,
both database UUIDs, verified marker, and Worker version IDs. This workflow is
initialization-only and stops if either Worker already exists. If it stops after
migrations but before either upload, inspect the summary and D1 before a fresh
approved dispatch. If it stops after an upload, inspect Cloudflare Deployments
for both staging Workers and compare them with the summary before authorizing
any manual recovery. Preserve D1 and its marker, keep the hostname unattached,
and leave dispatch disabled. Unset the opt-in after initialization.

## Recover the recorded partial initialization

Cloudflare's rollout history shows web version
`427e7aff-6a11-4ce0-a6b0-f3d89ff8f735` from
`c8465075f889f7cb4db2e243f4ebac48d0ebcccf` automatically deployed at 100%.
The dispatcher was never reached. No separate activation is needed.

After this recovery change is reviewed and merged, verify the same web version
is still at 100%, the dispatcher is absent, and the hostname remains
unattached. Start a **fresh** Initialize Studio staging dispatch on protected
main, enter the current reviewed main SHA, and select **recover_dispatcher**.
Approve that run in **cloudflare-studio-staging** as the required owner.
The workflow verifies the active web version, its source tag and bindings, and
reads the existing marker before deploying only the missing disabled
dispatcher. It does not rerun migrations, write the marker, or redeploy the web
Worker. If any precondition fails, inspect the summary and stop; do not switch
to initialization mode to bypass it.

## Refresh the existing disabled dispatcher to Luna

Review and merge the workflow change on protected main. Fetch `origin/main` and
record its full SHA. Build and smoke-test the validator from that SHA. After
separate approval, push that exact image and deploy its registry digest to
staging Cloud Run. Verify the new revision receives 100% of traffic and repeat
the HTTPS probes, including a passing response with the reviewed base SHA.

Confirm GitHub main still matches that SHA and copy the full UUID of the
active dispatcher version from Cloudflare Deployments. After separate
dispatcher deployment approval, start a fresh **Initialize Studio staging**
run on main. Set `reviewed_sha` to that same full SHA, enter the active
dispatcher UUID in `refresh_dispatcher_version`, and leave
`recover_dispatcher` off. Use the existing `cloudflare-studio-staging`
environment, set its staging release opt-in as documented above, and approve
the pending run as the owner. The workflow verifies the checkout against the
reviewed main SHA and uses it for both the bundle and `STUDIO_BASE_SHA`.
If main advances, review the new SHA and rebuild the validator before release.
The summary records the previous and new Worker versions and the verified
D1 marker.

The refresh deploys only the dispatcher. It uses the existing staging D1
binding and reads the marker without applying migrations. The dispatcher has
execution disabled, no task UUID, and no public endpoints or cron. The
generator declares the validator origin and both GitHub App IDs so Wrangler
deploys the reviewed values. Wrangler retains existing encrypted secrets.
The refresh checks the names of the existing approved secret bindings and
verifies that the new version retains the same names. Both budget variables are `262548`, and the rate card is
`gpt-6-luna:standard:0.10:0.01:0.125:0.50:0.20:0.02:0.25:0.75`.

If a disabled refresh fails at Wrangler upload, check the sanitized error in
the Actions log and confirm the active dispatcher version in Cloudflare before
starting another run. Wrangler strict mode can reject a dashboard-managed
version when the reviewed refresh changes its base SHA. The refresh validates
the existing disabled settings and exact version before allowing that change.
Keep the recorded previous version for recovery. If the failed run created or
activated a different version, inspect it before approving any further action.
