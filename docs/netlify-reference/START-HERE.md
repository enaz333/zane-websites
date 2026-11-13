# Launch this version, step by step

Prepared November 12, 2026. **The local preparation is complete; the live migration has not happened.** The remaining work requires your Netlify account, actual project URLs, domain records, and a real printed Photo Notes QR code. Do not upload the club migration candidate to the existing club project until Step 7.

## 1. Save the working website before changing it

Open the existing Cool Strangers Club project in Netlify. In Deploys, identify the currently published deploy. Copy its deploy ID and permalink into [the launch record](docs/launch-record.md), and download its published files to a private backup location outside the publish folders. This is the actual production rollback; the supplied ZIP is only an archive baseline.

Compare that download with the supplied archive, especially the Google Form join destination, homepage, `/redesign.html`, BuildFest files and downloads, `_redirects` and `_headers`. The preserved join destination is `https://forms.gle/QemuZmv9eEhDkomCA`. If production differs, reconcile those differences before replacing it.

At your domain/DNS provider, record the existing authoritative nameservers and all records that would change. Preserve mail, TXT verification, MX, DKIM, SPF, DMARC and other unrelated records. Check existing A/AAAA records for conflicts rather than leaving an old IPv6 route active. Record whether apex or www is the club's canonical hostname. Scan an actual Photo Notes card and copy the exact URL into the launch record. Check whether `acl.coolstrangersclub.com` is active and who controls it. Do not infer its paths from the ZIP name.

**Done when:** you have a recoverable production deploy, saved DNS values, the real QR URL, and an agreed baseline.

## 2. Create the four new Netlify projects and one temporary club staging project

Use your existing Netlify team. Review its current usage/billing page before uploads, especially bandwidth for the festival posters. No framework build or dependency installation is needed for these static sites.

In Netlify's manual deployment flow, create projects with these folders:

| New project | Folder to drag for initial creation | First URL to open |
| --- | --- | --- |
| Photo Notes | `sites/photo-notes/public` | `/PhotoNotes/` |
| ACL | `sites/acl/public` | `/acl/` |
| Coachella | `sites/coachella/public` | `/coachella/` |
| Personal | `setup/personal` (safe coming-soon page) | `/` |
| Club staging only | `sites/club/public` | `/` |

Each project gets its own stable `https://NAME.netlify.app` address. Rename projects before wiring URLs if you want friendlier names. Record the five actual URLs. For Photo Notes, use its project's stable production hostname, not a deploy-specific or branch-preview URL.

For the personal project, drag the already prepared `setup/personal` folder to the new-site drop area. This creates only a temporary coming-soon page. In that project's **Forms**, select **Enable form detection** before uploading the full release in Step 4. Netlify scans for forms on the next deploy. [Netlify Forms setup](https://docs.netlify.com/manage/forms/setup/)

These initial project deployments are public on their Netlify URLs. There is no DNS change yet. Keep any passwords/access controls compatible with the Photo Notes proxy; test rather than assuming a protected upstream can be proxied.

**Done when:** all five URLs exist, and personal form detection is enabled.

## 3. Enter those URLs and prepare the staging release

Open Terminal and run:

```sh
cd /Users/zane/Documents/ChatGPT/ZaneGiordano.com
cp config/staging.example.json config/staging.json
open -e config/staging.json
```

Replace every `REPLACE-...` value with the matching actual URL. Keep the double quotes and commas. Use origins only: `https://my-project.netlify.app`, with no `/acl/`, `/PhotoNotes/`, or other path. `club` must point to the **temporary club staging** project. `personal`, `acl`, `coachella`, and `photo_notes` point to the new projects. All five URLs must be different.

Then run:

```sh
python3 scripts/validate.py
python3 -m unittest discover -s tests -v
python3 scripts/prepare.py --config config/staging.json --output dist/staging-01
open dist/staging-01
```

You now have `club`, `personal`, `photo-notes`, `acl`, and `coachella` folders, one ZIP for each, and `release.json`. Every folder is a complete publish root. Staging packages include `X-Robots-Tag: noindex, nofollow`; this discourages indexing but does not provide access protection.

**Done when:** preparation succeeds without placeholders and produces all five folders. Never upload `release.json`, the entire `dist/staging-01` directory, or the repository root.

## 4. Upload the staging release and test it

For each project, open its **Deploys** page and drop the matching folder from `dist/staging-01`. The club folder goes only to the temporary club staging project. Upload Photo Notes, ACL and Coachella first, personal next, club staging last. Wait for each deploy to finish and record its deploy ID.

A manual drop publishes to the selected project's Netlify URL; it is not automatically a private preview. [Netlify manual deployments](https://docs.netlify.com/deploy/create-deploys/)

Run the read-only route suite:

```sh
python3 scripts/check_routes.py --config config/staging.json --report docs/staging-routes.json
```

It checks page markers, legacy paths, query forwarding, final hostnames, assets, scoped headers, donation pages, downloads, and 404 behavior. It does not submit forms, connect Spotify, follow donation-page JavaScript, or inspect pixels. Complete [the browser checklist](docs/browser-checklist.md) too.

For the signup, use an email you control, select consent, and submit once. Confirm the thank-you page and the stored `email`, `consent=yes`, `consent_version=v1` and Netlify receipt time. Review spam as well as verified submissions. Remove your synthetic test records after verification. Confirm CSV export contains what you need; do not put CSVs in this repository. See [subscriber handling](docs/subscribers.md).

To prove independent Photo Notes releases: temporarily add a small visible test marker to `sites/photo-notes/public/PhotoNotes/index.html`, deploy only that folder, and refresh the personal `/PhotoNotes` URL (allow for cache freshness). Restore the original file and redeploy Photo Notes. The personal project must not need a new deploy. Re-run source validation after restoration. Test publishing and restoring a temporary staged deploy as well.

**Done when:** automated routes pass, manual checks pass, and you have saved the evidence. A working local page is not a substitute for this step.

## 5. Prepare the production package and cutover record

```sh
cp config/production.example.json config/production.json
open -e config/production.json
```

Set `photo_notes` to the same stable upstream used in staging. Set `club` to the real canonical club origin (use www if that is currently canonical). Keep the personal origin as `https://zanegiordano.com` and the two proposed festival subdomains unless you deliberately choose different hosts. Do not add paths to origin values.

```sh
python3 scripts/prepare.py --config config/production.json --output dist/production-01
```

Fill out the launch record: staging URLs/results, chosen domains, exact DNS targets from each Netlify project's domain setup, previous DNS values and TTLs, known-good and candidate deploy IDs, owner, launch time and rollback steps. Domain targets cannot be filled in reliably from the archive; use the Netlify account's site-specific instructions.

**Review checkpoint:** the source plan calls for owner approval before production cutover. Review the concrete package and DNS worksheet now. Do not treat a passing local test as approval or proof of working production routing.

## 6. Attach new domains, configure DNS and launch the destinations

After the review, add `zanegiordano.com` and www to the **personal** project, `acl.zanegiordano.com` to **ACL**, and `coachella.zanegiordano.com` to **Coachella** in Netlify Domain management. Photo Notes needs no separate custom domain. Keep the existing authoritative DNS provider.

| DNS host | Target project | Record/action |
| --- | --- | --- |
| `@` for zanegiordano.com | Personal | Netlify's displayed apex ALIAS/ANAME/flattened-CNAME target, or its displayed A-record fallback |
| `www` | Personal | CNAME to personal project's stable Netlify hostname |
| `acl` | ACL | CNAME to ACL project's stable Netlify hostname |
| `coachella` | Coachella | CNAME to Coachella project's stable Netlify hostname |
| Club apex/www | Existing club | Normally no change; retain existing canonical configuration |
| `acl.coolstrangersclub.com` | Existing owner/host | Separate review if active; no wildcard assumption |

Enter DNS target hostnames without `https://` or paths. The apex must use a provider-supported record type. Netlify adds apex/www together, so configure and test both; choose the personal apex as primary to preserve the intended URL. [External DNS setup](https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/)

Upload `dist/production-01/photo-notes`, `acl`, `coachella`, then `personal` to their matching new projects. These production packages remove the staging noindex headers. Wait until Netlify confirms DNS and HTTPS certificates and each destination opens without a security warning. Test the personal form again after the production personal deploy. Do not upload the club candidate yet.

Open these directly in a fresh browser:

- `https://zanegiordano.com/`
- `https://zanegiordano.com/PhotoNotes`
- `https://www.zanegiordano.com/PhotoNotes` (should resolve to the personal primary hostname)
- `https://acl.zanegiordano.com/acl/`
- `https://coachella.zanegiordano.com/coachella/`

If direct Spotify is needed, register `https://acl.zanegiordano.com/acl/` and `https://coachella.zanegiordano.com/coachella/` in the relevant Spotify app(s), exactly including trailing slash. Keep existing callbacks during transition. Test with an authorized account. Exportify import is the fallback launch flow. [Spotify callback requirements](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri) Browser storage does not move between origins; users may need to reimport or reconnect.

**Done when:** every new destination and certificate works and the signup is recorded correctly.

## 7. Switch the club links last

Confirm the saved club rollback deploy is still available. In the **existing live club** project's Deploys page, upload only `dist/production-01/club`. This keeps club content and BuildFest, changes the three project links, and temporarily redirects migrated paths while retaining the old files for reversibility.

Run:

```sh
python3 scripts/check_routes.py --config config/production.json --report docs/production-routes.json --club-alias https://www.coolstrangersclub.com --club-alias http://coolstrangersclub.com --club-alias http://www.coolstrangersclub.com
```

If www is canonical, also include `--club-alias https://coolstrangersclub.com`. Scan the actual printed QR on cellular data. Check the exact original URL, query strings and expected casing. Any additional observed alias must be added to `ALIASES` in `scripts/prepare.py` (with an accompanying personal rule if necessary), regenerated and retested before cutover can be considered complete. Do not guess historical old-ACL paths; configure verified ones separately at that hostname's current host.

## 8. Observe, then finalize

Keep 302 migration redirects during an observation period you choose (for example, seven days), inspect real failures, and confirm join/signup/QR behavior again. BuildFest retains its existing 301. After review, promote only proven migration aliases to 301 in `scripts/prepare.py`, generate a new release and retest. Permanent redirects can be cached past rollback.

Do not remove legacy club copies until the archived live deploy and known-good candidate are recoverable. If removing them later, update the preservation validator intentionally and document that phase; it currently treats the complete club baseline as a required migration safeguard.

If something fails:

1. **Legacy club paths broken:** republish the saved pre-migration club deploy first. Confirm its homepage, QR and BuildFest paths recover.
2. **One new site broken:** republish that project's last known-good deploy. If Photo Notes is broken, restore Photo Notes; if its proxy is wrong, restore personal.
3. **DNS caused the problem:** restore the recorded previous values for the affected records only. Allow for the recorded TTL, verify TLS and recheck from a fresh browser/cellular connection.
4. **Signup records at risk:** export privately before replacing form definitions; verify records are still present after restoration.

Use Netlify's deploy history to restore a retained deploy rather than improvising file deletions. [Deploy management and rollback](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/)

## Routine updates after launch

Edit the appropriate `sites/.../public` source. Run local validation. Generate a fresh production release, such as `dist/production-02`. Upload **only the changed project's folder** to the matching Netlify project. A Photo Notes content-only update needs only its folder; a hostname change also needs the projects whose links/proxy reference it. Re-run the relevant HTTP checks and keep the prior deploy ID.

Manual deploys are the supported first workflow. If you later connect Git, set each project's build command to run the release generator with approved production config and publish only the matching generated folder. Do not point a Git project directly at raw club/personal source; those intentionally retain baseline/template routing. Keep config available to that build without committing credentials. Introduce scoped build triggers and preview-specific configuration as a separate tested change.

## Common problems

| Symptom | What to check |
| --- | --- |
| Preparation says placeholder / invalid origin | Replace every example URL; include `https://`, omit paths and ports |
| Output already exists | Use a new release number; do not edit the old package |
| Netlify 404 at homepage | You probably dropped the outer repository/release directory; drop the individual site folder |
| Photo Notes returns 404/502 | Verify upstream `/PhotoNotes/`, correct casing, public reachability and personal `_redirects` |
| Browser exposes Photo Notes upstream hostname | Check proxy response/redirect chain and canonical-domain redirects on the upstream project; it should retain its Netlify hostname |
| Old club page appears instead of redirect | Confirm generated club `_redirects` was uploaded with `302!`; inspect the published deploy, not local source |
| Signup not listed | Enable detection then redeploy; confirm `project-updates` exists, inspect spam, and submit a valid consented test |
| Festival looks unstyled | Upload the whole matching folder, preserving prefix; Coachella needs both `base-styles.css` and `styles.css` |
| Spotify callback fails | Match the HTTPS origin, exact prefix and trailing slash; retain Exportify access |
| Python SSL verification fails in route checker | Repair your Python certificate installation or verify with a trusted browser; do not disable TLS verification |
