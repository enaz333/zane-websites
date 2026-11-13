# Cloudflare migration

The five configs are local preparation for Workers with Static Assets. Review actual host ownership, existing Netlify deploys and rollback targets before scheduling a cutover. The older Netlify guide describes historical preparation.

## Routes

| Request | Behavior |
| --- | --- |
| Club `/` and `/redesign.html` | Preserved Club pages and Google Form link |
| Club `/BuildFest` | Existing 301 to `/buildfest/` |
| Club BuildFest tree | Static content, gallery, assets and downloads |
| Club `/PhotoNotes`, `/photonotes`, `/photo-notes`, their slash and index variants | Temporary 302 to personal `/PhotoNotes` |
| Club `/acl` or `/coachella` and their subpaths | Temporary 302 to the respective origin, with prefix, suffix and query preserved |
| Personal `/PhotoNotes`, `/PhotoNotes/` and children | Photo Notes service binding, retaining the personal origin and query |
| Personal lowercase and hyphenated aliases, slash and index variants | Temporary 302 to `/PhotoNotes` |
| Personal signup | Disabled controls; POST to the former submission endpoint returns 503 |
| Personal unknown path | Custom 404 |
| ACL, Coachella and Photo Notes root | 302 to the site's prefixed entry |

The Club links still use their original relative paths and reach the new destinations through the aliases. Legacy Netlify redirect files are under `netlify-reference/`. Worker code handles route precedence and index serving. Cloudflare `_headers` files retain the scoped festival headers. The original site archive hashes are in [archive-sha256.json](archive-sha256.json). [Cloudflare asset routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/) · [Service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) · [Asset headers](https://developers.cloudflare.com/workers/static-assets/headers/)

## Future GitHub Actions

Use a validation job for pull requests and a matrix of the five explicit config paths for local Wrangler dry runs. Pin Wrangler and Actions versions when introducing CI. After staging and owner approval, add a separately triggered deploy job with a protected GitHub environment, a scoped Cloudflare API token stored as an environment secret, and the account ID configured in that environment. Deploy Photo Notes before personal to establish the binding. Deploy the two festival Workers before exposing Club redirects. Changes to shared Worker modules should validate every consumer. Preview personal with a preview-specific Photo Notes binding when doing remote validation. [Cloudflare GitHub Actions documentation](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)

## Before cutover

- Capture the known-good Netlify deploy IDs and private rollback copies. Record the authoritative DNS records, intended apex and www behavior, and proposed Cloudflare domain configuration. Verify historical `acl.coolstrangersclub.com` separately if it is active.
- Scan an actual printed QR code and check the exact URL, query and host on the candidate. Test a Photo Notes-only release to confirm it propagates through the personal binding. Check BuildFest downloads and both festival flows, including any Spotify callback registration and the Exportify fallback.
- Choose a signup backend before enabling the personal form. Preserve versioned affirmative consent, receipt time and private storage. Verify a controlled submission end to end. The [historical subscriber notes](netlify-reference/subscribers.md) record the previous consent fields.
- Stage and verify the four destinations first. Confirm the Club homepage, redesign, join link and redirect targets before moving Club traffic. Keep temporary redirects during the observation period and review permanent redirects separately.

## Local verification

- Source validation passed 195 checks in the Desktop checkout. The three Node route tests passed with mock bindings. The original Netlify workspace also passed its source validation and five packaging tests.
- Wrangler 4.161.0 completed dry runs for all five configs. The local Wrangler runtime passed 26 HTTP checks covering the Photo Notes binding, redirects and query strings, Club join and alternate pages, BuildFest gallery and ZIP, scoped festival headers, festival assets and samples, 404 responses, and the paused signup endpoint. Requests stayed on loopback, and redirects to public hosts were inspected without following them.
- Production routing, DNS, TLS, the physical QR code, browser interactions, and external services remain staging checks.
