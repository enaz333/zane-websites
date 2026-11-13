# Website migration plan

## What the archive contains

Inspected and integrity-tested `Cool-Strangers-Club-Site-with-ACL-Redirect(1).zip`. Its inner folder is a complete static Netlify publish directory. The `__MACOSX` entries are packaging metadata.

| Archive evidence | Migration implication |
| --- | --- |
| `_redirects:2` contains only `/BuildFest /buildfest/ 301`. There is no ACL redirect, Photo Notes redirect, or catch-all in the file. | Preserve BuildFest’s rule. Verify the live site’s published files and any routing outside the archive before using it as the production baseline. |
| `index.html:166–174` contains the club’s Google Forms join flow and links to Coachella, ACL, Photo Notes, and BuildFest. `redesign.html` is an alternate club page. | Keep both club pages, their join links, and the complete BuildFest tree, including gallery and downloads. Update the three migrated project links when their destinations pass testing. |
| `photo-notes/index.html` is a static page with inline styling and artwork plus Google Fonts. Its folder is `photo-notes/`. | Move the page under `PhotoNotes/` with the required casing. Printed QR URLs need an explicit redirect. |
| `coachella/index.html:8,101,112` loads `../acl/styles.css` and two ACL import-guide images. | Copy those three dependencies into Coachella’s own publish tree and update the references. Record their provenance in the repo. |
| Both festival apps derive their Spotify callback from the current origin and a fixed app path. Both use browser storage. Both ship donation subpages and a sample Exportify ZIP. `_headers` applies headers to `/acl/*` and `/coachella/*`. | Preserve app prefixes, assets, sample files, and scoped headers. Visitors changing origins may need to reimport or reconnect. Preserve and verify outbound donation destinations and ACL’s existing analytics behavior. |

The archive README proposes forwarding `acl.coolstrangersclub.com`. Its DNS, TLS, current hosting, and historical paths require verification. The audit above covers archive files. No live configuration or production behavior was verified.

## Target architecture

Use five static Netlify projects under one local repository. Each publishes independently.

| Project | Public entry point | Publish folder |
| --- | --- | --- |
| Club | `https://coolstrangersclub.com/` or its existing canonical www host | `sites/club/public` |
| Personal index | `https://zanegiordano.com/` | `sites/personal/public` |
| Photo Notes | `https://zanegiordano.com/PhotoNotes` via a scoped Netlify rewrite to the Photo Notes deployment | `sites/photo-notes/public` |
| ACL | `https://acl.zanegiordano.com/acl/` | `sites/acl/public` |
| Coachella | `https://coachella.zanegiordano.com/coachella/` | `sites/coachella/public` |

The festival subdomains are proposed defaults. Retaining their existing path prefixes keeps the absolute donation links and computed callback paths intact. Each festival deployment can redirect its own root to its app prefix. Photo Notes needs the rewrite because its address must stay on the personal domain while its content deploys independently. DNS maps hostnames, so the personal Netlify project owns the path routing. Use the Photo Notes project’s stable Netlify production hostname as the upstream and keep its `PhotoNotes/index.html` layout. [Netlify rewrites and proxies](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/)

The personal page has one heading, **Zane Giordano**, a labeled email signup for new-project announcements, and four links labeled **Cool Strangers Club**, **Photo Notes**, **ACL Schedule**, and **Coachella Schedule Maker**. Use plain HTML and CSS, visible keyboard focus, and a small confirmation page. Use the club’s canonical hostname for its link.

### Routing to stage

Put `_redirects` and any `_headers` at the root of each applicable publish folder. The following are proposed files. Replace `PHOTO_SITE` with the actual Netlify project name before staging.

Personal `_redirects`:

```text
/photonotes              /PhotoNotes                                 302
/photo-notes             /PhotoNotes                                 302
/PhotoNotes              https://PHOTO_SITE.netlify.app/PhotoNotes/  200
/PhotoNotes/*            https://PHOTO_SITE.netlify.app/PhotoNotes/:splat 200
```

Club `_redirects` during cutover:

```text
/BuildFest               /buildfest/                                 301
/PhotoNotes              https://zanegiordano.com/PhotoNotes          302!
/photonotes              https://zanegiordano.com/PhotoNotes          302!
/photo-notes             https://zanegiordano.com/PhotoNotes          302!
/acl                     https://acl.zanegiordano.com/acl/            302!
/acl/*                   https://acl.zanegiordano.com/acl/:splat      302!
/coachella               https://coachella.zanegiordano.com/coachella/ 302!
/coachella/*             https://coachella.zanegiordano.com/coachella/:splat 302!
```

Netlify matches path case. Scan a real printed QR code and record its exact URL, then add any evidenced spelling or explicit `index.html` aliases before cutover. The archive has no Photo Notes child pages. Test slash normalization and query forwarding on Netlify, including both club hostnames. The forced rules allow a reversible cutover while the old files are still present. Keep the first cutover temporary and promote proven migration aliases to permanent redirects after sign-off. [Netlify redirect syntax](https://docs.netlify.com/manage/routing/redirects/overview/) · [Netlify redirect options](https://docs.netlify.com/manage/routing/redirects/redirect-options/)

### Signup and subscriber records

- Use Netlify Forms on the personal project. Enable form detection before the deploy used for testing. Use a stable form name such as `project-updates`, a native POST, a required email input, an unchecked required consent checkbox, a honeypot, and a local confirmation page.
- Use explicit copy such as “Email me when Zane Giordano releases a new project.” Include a version field such as `consent_version=v1` and keep the exact corresponding wording in the repo. Verify that the submission record includes email, consent value, version, and receipt time. The browser’s required checkbox handles ordinary UI validation. For mailing, include only records with the expected affirmative consent and version.
- Keep verified submissions in the personal project’s Forms dashboard. Export a private backup after launch and before any form or site change. Keep subscriber data out of the repository and deploy folders. Deduplicate by email before importing into a mailing service and preserve opt-outs across future imports. Use a mailing service with unsubscribe handling when sending begins. Add double opt-in through that service if confirming ownership of each address becomes a requirement. [Forms setup](https://docs.netlify.com/manage/forms/setup/) · [Submission storage and CSV export](https://docs.netlify.com/manage/forms/submissions/)
- Check the Netlify team’s actual plan before launch. On credit-based plans, forms are free and unlimited, while production publishes, traffic, and bandwidth draw from the team’s allowance. Legacy plans meter forms differently. Watch bandwidth on the poster-heavy schedule apps and budget for staged and production publishes. [Forms usage and billing](https://docs.netlify.com/manage/forms/usage-and-billing/) · [Credit-based pricing](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/)

## Phases and deliverables

1. **Capture the current state.** Save the current club production deploy ID and downloadable files. Compare them with the archive, especially the club join link and BuildFest. Inventory both domains’ registrar, authoritative DNS, apex/www records, certificate status, and old ACL subdomain ownership. Record exact QR URLs, sample legacy URLs, and current Spotify callback settings if direct Spotify is used.
2. **Prepare the repo and publish folders.** Create `README.md` with the publish map and local preview steps, `AGENTS.md` with per-site ownership and testing instructions, and `docs/routes.md` with URL expectations and rollback IDs. Put the static app trees in the publish folders above. Keep docs and test fixtures outside publish folders except for samples intentionally offered to users. Preserve club content and vendor Coachella’s three borrowed files. Add the minimal personal page and form. Deliver five drag-and-drop folders, a route test script driven by test hostnames, and a manual browser test checklist.
3. **Verify on staging.** Deploy the four new projects to Netlify URLs and use a separate staging project for the club candidate. Test the Photo Notes rewrite against the actual upstream and the club redirects against staging destinations. Submit and remove a test signup. Test each festival app in a fresh browser on its standalone deployment. An ordinary local static server is sufficient for HTML and assets. Use Netlify to verify its routing, headers, and form processing.
4. **Present a cutover for approval.** Show the staging URLs, acceptance results, exact DNS changes, intended production deploy IDs, and rollback steps. After approval, add the personal apex/www and festival hostnames to their respective projects. Keep the existing authoritative DNS provider. Apply the site-specific apex target shown by Netlify and CNAMEs for www and the festival subdomains. Save old values and preserve unrelated records, including mail and verification records. Verify propagation and TLS, then test all production destinations before publishing the club redirect change to its existing project. If the old ACL hostname is active, configure forwarding at its current host after separate review, mapping root and verified deep paths individually. [Netlify external DNS](https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/)
5. **Verify and finalize.** Scan a printed QR on cellular data. Run the production checks below and keep the temporary redirects during a short observation window. After approval, publish permanent aliases and remove obsolete project copies from the club publish folder once rollback deploys are confirmed. If cutover fails, republish the saved club deploy first when legacy URLs are affected. Roll back the specific new project if its content broke, or restore saved DNS records if the DNS change caused the issue. Confirm recovery from a fresh browser. A cached 301 can outlast a rollback, which is why the first cutover uses 302s. [Netlify deploy rollback](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/)

### Day-to-day updates

Start with manual deploys. Edit the appropriate folder, preview, and drop that folder into the matching project’s **Deploys** page. For optional remote edits, connect the existing projects to a private Git repository, configure each publish directory, and scope build triggers to the affected project. Codex works on a branch, supplies a preview and test results, and opens a PR. The owner reviews the merge or production publish. Keep Netlify and DNS credentials outside the repo. [Manual deploys](https://docs.netlify.com/deploy/create-deploys/) · [Netlify monorepos](https://docs.netlify.com/build/configure-builds/monorepos/)

## Acceptance tests

| Check | Pass condition |
| --- | --- |
| Club independence | Apex and www resolve over HTTPS to the working club homepage. Join opens the same Google Form. `/redesign.html`, `/BuildFest`, `/buildfest/`, the gallery, and a local BuildFest download work. |
| Printed QR and aliases | Real QR plus `/PhotoNotes`, `/PhotoNotes/`, `/photonotes`, and `/photo-notes/` land on the personal hostname’s Photo Notes page on mobile. Test HTTP and HTTPS on apex and www, any additional observed aliases, and a synthetic query string. No loop or exposed upstream hostname. |
| Personal project index | Exactly four project links reach their stated destinations. The signup and links work on mobile and by keyboard. An unrelated path returns 404. |
| Signup | A valid, consented submission reaches the success page and appears in Netlify’s verified submissions and CSV with the expected fields. Test empty or malformed email, unchecked consent, honeypot handling, and repeat signup. Remove synthetic records after verification. |
| ACL | Both weekends render. Sample and user-provided Exportify uploads produce matching results. Verify poster assets, schedule interaction, app headers, and each donation destination without completing a donation. |
| Coachella | All-days and day views render with correctly aligned posters and artist interaction. Styles and guide images load from its own deployment. Sample and user-provided imports, recommendations, listening links, donation destinations, and headers work. |
| Legacy schedule links | Club schedule roots and sampled assets and donation routes preserve their suffixes on the correct new host. Verify the historical ACL subdomain separately if it is in use. Unrelated club paths retain baseline behavior. |
| Optional direct Spotify | If retained, register the exact new HTTPS callback for each app, including trailing slash. Test with an authorized account and confirm browser state on the new origin. Keep the old callbacks during transition. Exportify remains the launch path if direct Spotify is unavailable. [Spotify redirect URI rules](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri) |
| Deploy isolation and rollback | Update Photo Notes in staging and observe the update through the personal URL without publishing the personal project. Publish and restore one staged deploy and confirm the other projects remain available. |

## Codex handoff

Use this plan and the original ZIP as inputs. Complete phases 1–3 with local work and approved staging access. If staging access is unavailable, deliver the five publish folders, validation results, and exact staging instructions. Bring the tested artifacts, route results, and DNS change list to the owner before touching production. Treat the club join flow and printed Photo Notes QR as release gates.
