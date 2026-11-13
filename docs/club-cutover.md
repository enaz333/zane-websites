# Cool Strangers Club cutover

> Historical migration record. For current environment setup and dispatch instructions, see [release automation](release-automation.md).

## Evidence and remaining QR check

The live apex served Netlify, and www returned a 301 to the apex with the path and query preserved. The zone showed no Worker Routes, and both exact hostnames had Netlify-facing A records rather than Worker-managed DNS entries.

Compared 51 live file URLs with the Club tree. All returned 200. Five had different bytes. Cloudflare email obfuscation accounted for the homepage and redesign differences. The live BuildFest homepage links to /buildfest/gallery, while source uses gallery.html. The Worker now serves both paths. The remaining two differences were the documented privacy-safe festival image replacements. Both Club pages retain the same Google Form signup. The BuildFest plugin and DOCX downloads matched the repository. This inventory covers known files and probed paths. Save the actual Netlify deploy ID and full deploy backup before cutover.

Live /photo-notes/ and /photo-notes/index.html returned 200. Netlify canonicalized uppercase /PHOTO-NOTES/ and its index variant to the lowercase entry. Live /PhotoNotes and /photonotes were 404, while the deployed staging Worker redirected their documented entry variants. The new candidate accepts mixed-case Photo Notes prefixes, redirects entry and index variants to /PhotoNotes, and preserves other suffixes and queries. A destination that does not exist still returns 404. The old acl.coolstrangersclub.com hostname did not resolve.

Before approval, scan a printed QR code from each batch or design and record its raw URL, including scheme, hostname, casing, trailing slash, subpath and query. Test each recorded path on the new staging candidate and check the corresponding personal destination. If a real QR points to a missing page or a different prefix, recover or map that exact destination before cutover. Synthetic requests do not establish what the printed codes contain.

## Deploy and verify

After the PR merges, dispatch **Publish Workers** from protected **main** with target **staging** and project **all**. Approve the run and confirm the expanded Club checks pass. Then dispatch from **main** with target **club-launch** and project **club**, and approve the exact revision in **cloudflare-production**. The job checks the three live destinations and uploads only zane-club. Its Wrangler config contains no domain triggers and the job receives no domain token. Public Worker previews remain disabled for the permanent Worker.

## DNS changes for separate approval

Save a Cloudflare DNS export. The observed records were all proxied with Auto TTL.

| Host | Type | Existing value |
| --- | --- | --- |
| coolstrangersclub.com | A | 52.52.192.191 |
| coolstrangersclub.com | A | 13.52.188.95 |
| www.coolstrangersclub.com | A | 98.84.224.111 |
| www.coolstrangersclub.com | A | 18.208.88.157 |

After approval, confirm the four records and ensure no competing exact Custom Domain or Route has appeared. In Cloudflare **Workers & Pages → zane-club → Settings → Domains & Routes**, add the apex Custom Domain first. Review the replacement preview. If manual removal is required, remove only the two apex A records listed above, then attach immediately. After apex TLS and HTTP checks pass, repeat for www and its two listed A records. The Worker sends www to HTTPS apex with a 301, retaining the path and query. Cloudflare manages DNS and TLS for the two exact hostnames.

Verify apex and www, the join link without submitting, the redesign, BuildFest gallery and downloads, all recorded QR variants, and festival deep links. Run the candidate checker against the live apex with the personal and festival production origins. Keep the cross-site redirects temporary during observation.

## Rollback

For each affected hostname, detach its exact Custom Domain and restore its two A records from the table as proxied with Auto TTL. Verify the Netlify apex content and the www canonical redirect, then check BuildFest and recorded QR paths. Keep the Netlify deployment and its domain configuration available throughout the observation period.
