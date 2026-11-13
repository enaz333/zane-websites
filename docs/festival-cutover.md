# ACL and Coachella launch

From protected main, open **Actions → Publish Workers → Run workflow**. Select target **festival-launch** and enter project **festivals**. Approve the revision in the **cloudflare-production** environment. The job deploys zane-acl and zane-coachella with their existing Wrangler configs. Those configs serve independent asset trees and include no custom-domain triggers.

## Proposed custom domains

| Exact hostname | Worker | Entry path |
| --- | --- | --- |
| acl.zanegiordano.com | zane-acl | /acl/ |
| coachella.zanegiordano.com | zane-coachella | /coachella/ |

Cloudflare showed no exact DNS records or Worker attachments for the two names and no zone Worker Routes. Both names currently resolve through the proxied wildcard CNAME to uixie.porkbun.com and return the parking redirect. Export the DNS zone and record the deployed Worker versions before cutover.

After separate domain approval, open each Worker in Cloudflare and select **Settings → Domains & Routes → Add → Custom Domain**. Enter the exact hostname above. Review Cloudflare’s preview and proceed only if it creates the exact Worker-managed hostname without altering any other record, including the wildcard. Wait for active TLS. Check HTTPS on the bare host, the 302 to its prefixed entry, poster and script loads, the sample ZIP, and each donation link’s local landing page. Verify the browser import and festival controls again. Leave Club, the apex and www outside this change.

To roll back a hostname, detach that exact Custom Domain from its Worker. Confirm the exact Worker-managed DNS record is removed and verify the wildcard serves the former parking response again. Roll back a code-only issue using the prior Worker version if one exists.

## Spotify

Both apps derive the Authorization Code with PKCE callback from the current origin and their slash-terminated app path. Add these exact Redirect URIs to the relevant Spotify app settings alongside existing callbacks.

- `https://acl.zanegiordano.com/acl/`
- `https://coachella.zanegiordano.com/coachella/`

Use a registered client ID and an account authorized for that Spotify app to test a complete sign-in after TLS is active. Users who supply their own Spotify client ID need to register the matching URL on their own app. Exportify is independent of OAuth and browser state is scoped to the hostname.

[Cloudflare Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) · [Spotify Redirect URIs](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri)
