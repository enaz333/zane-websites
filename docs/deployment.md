# Deployment and recovery

1. Edit the owning project, run the [local checks](../README.md), then open a PR. Check the affected interactions locally and let GitHub validate the change.
2. Review the commit, registry and routing effects. The current publish workflow has scoped manual cutover targets and a hard-disabled general publish path. Consult the [current workflow](../.github/workflows/deploy.yml) before dispatching anything.
3. For an approved release, record active Worker versions and relevant domain assignments before starting. Publish prerequisites before consumers. Confirm canonical URLs before advertising new short URLs.
4. Verify the personal directory, the changed destination and its short URL, and affected legacy paths. For Photo Notes use the exact printed Club URL and confirm the personal destination with its query intact. Verify form links without submitting data.

For staging, use a separate approved deployment. Current staging uses per-run Worker names and the production environment. For infrastructure changes, review the specific account, zone, ownership, credentials and rollback plan separately. For a new site follow the [new-project guide](new-project-guide.md).

If a launch fails, pause publishing and record which steps completed. Withdraw a newly advertised route by restoring the prior personal version, then restore affected application versions in reverse deployment order. A version rollback does not remove a domain attachment or restore DNS. Review those separately and repeat the live checks. If a browser shows an ACL denial, inspect the zone security events before changing protections.

The [original publishing guide](publishing.md) records migration setup and launch-era operations. The [browser checklist](browser-checklist.md) covers interactive checks.
