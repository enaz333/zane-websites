# Deployment and recovery

1. Edit the owning project, run the [local checks](../README.md), then open a PR. Check the affected interactions locally and let GitHub validate the change.
2. Review the commit, registry and routing effects. Production updates and provisioning are disabled by default. Use the approved dispatch and environment setup in [release automation](release-automation.md).
3. For an approved release, record active Worker versions and relevant domain assignments before starting. Publish prerequisites before consumers. Confirm canonical URLs before advertising new short URLs.
4. Verify the personal directory, the changed destination and its short URL, and affected legacy paths. For Photo Notes use the exact printed Club URL and confirm the personal destination with its query intact. Verify form links without submitting data.

For staging, use the protected staging environment and its dedicated token in the same Cloudflare account. The workflow deploys test-only configs to uniquely named workers.dev URLs. For infrastructure changes, review the specific account, zone, ownership, credentials and rollback plan separately. For a new site follow the [new-project guide](new-project-guide.md).

If a launch fails, pause publishing and record which steps completed. Withdraw a newly advertised route by restoring the prior personal version, then restore affected application versions in reverse deployment order. A version rollback does not remove a domain attachment or restore DNS. Review those separately and repeat the live checks. If a browser shows an ACL denial, inspect the zone security events before changing protections.

The [original publishing guide](publishing.md) records migration setup and launch-era operations. The [browser checklist](browser-checklist.md) covers interactive checks.
