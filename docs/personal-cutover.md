# Personal domain cutover for approval

## Verified baseline

GitHub Actions staging run [43353498413](https://github.com/enaz333/zane-websites/actions/runs/43353498413) tested commit `96f7c1c`. The staging homepage and direct Photo Notes URL returned 200. Through the personal Worker, `/PhotoNotes?card=launch`, `/PhotoNotes/`, and `/PhotoNotes/index.html` returned the Photo Notes page. An unknown child returned 404. `/photo-notes/index.html?card=launch` returned 302 to `/PhotoNotes?card=launch`. The signup POST returned 503 with the unavailable message.

Cloudflare DNS currently has these records with Proxy on and TTL Auto.

| Name | Type | Value |
| --- | --- | --- |
| `@` | A | `207.207.210.23` |
| `@` | A | `207.207.210.50` |
| `@` | A | `207.207.210.36` |
| `www` | CNAME | `uixie.porkbun.com` |
| `*` | CNAME | `uixie.porkbun.com` |

The zone dashboard showed zero Worker Routes, Redirect Rules and Page Rules. Workers & Pages searches found neither stable Worker name. Apex and www requests were forwarded to the parking destination `http://zanegiordano-com.l.ink/`.

## Publish the two Workers

After review, merge the workflow change. Dispatch **Publish Workers** from protected `main` with target `personal-launch` and project `personal`, and approve the exact revision in the existing GitHub environment. This publishes `zane-photo-notes` first and then `zane-personal` with the `PHOTO_NOTES` binding. Both have public preview URLs disabled. Confirm the two deployments and binding in Cloudflare before cutover. General production publishing remains disabled. This step uses the Worker token and the two existing Wrangler configs, which have no domain triggers.

## Apply after separate domain approval

1. Export the DNS zone for rollback. In **Workers & Pages → zane-personal → Settings → Domains & Routes → Add → Custom Domain**, enter `zanegiordano.com`. Review the conflict preview. The only existing records approved for replacement are the three apex A records above. If Cloudflare requires them removed before attachment, remove those three and attach immediately. Confirm the custom domain and TLS are active.
2. Keep the proxied `www` CNAME in place. In **Rules → Redirect Rules**, create **Personal www to apex**. Match `http.host eq "www.zanegiordano.com"`, use a dynamic target `concat("https://zanegiordano.com", http.request.uri.path)`, enable **Preserve query string**, and use **302** for the initial cutover. This uses the existing proxy record and leaves the old www origin ready for rollback.
3. Check the apex homepage, HTTPS and HTTP www redirect, and the Photo Notes paths listed above. Confirm `www.zanegiordano.com/PhotoNotes?card=launch` redirects to `https://zanegiordano.com/PhotoNotes?card=launch` and renders the correct page. Verify signup controls stay disabled and the empty POST still returns 503. Record the successful deployment and active domain. The wildcard, mail records, Club, ACL and Coachella are outside this change.

[Cloudflare Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) · [Cloudflare domain redirects](https://developers.cloudflare.com/fundamentals/manage-domains/redirect-domain/)

## Roll back

Disable **Personal www to apex**. Detach the apex Custom Domain from `zane-personal`, then restore the three proxied apex A records with Auto TTL from the table. Verify the apex and www return to their prior parking behavior. Keep the staged and stable Workers available while investigating. A code-only regression after a known-good production deployment can be rolled back from the corresponding Worker's deployment history without changing DNS.
