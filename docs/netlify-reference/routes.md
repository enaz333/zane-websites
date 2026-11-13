# Routing contract

Source `sites/club/public` is a byte-preserved archive baseline (except the archive README lives under docs). Its only redirect is BuildFest. The migration candidate exists in generated `dist/<release>/club`, where forced 302s override the retained legacy files. Do not confuse the baseline with the candidate.

| Incoming route | Expected behavior in the generated release |
| --- | --- |
| Club `/` and `/redesign.html` | Original club pages and join destination; migrated project links use configured destinations |
| Club `/BuildFest` | Existing 301 to `/buildfest/` |
| Club `/buildfest/`, gallery, assets, files | Served locally and unchanged |
| Club `/PhotoNotes`, `/photonotes`, `/photo-notes` | Forced 302 to personal `/PhotoNotes` |
| Club same Photo Notes aliases plus `/` or `/index.html` | Forced 302 to personal `/PhotoNotes` |
| Club `/acl` | Forced 302 to ACL origin `/acl/` |
| Club `/acl/*` | Forced 302 to ACL origin `/acl/:splat` |
| Club `/coachella` and `/coachella/*` | Equivalent suffix-preserving rules to Coachella origin |
| Personal `/` | Index and signup |
| Personal lower-case/hyphenated Photo Notes aliases, slash and index variants | Temporary 302 to `/PhotoNotes` |
| Personal `/PhotoNotes` | 200 proxy to upstream `/PhotoNotes/` |
| Personal `/PhotoNotes/*` | 200 proxy to upstream `/PhotoNotes/:splat` |
| Personal `/thanks/` | Submission confirmation |
| Personal unrelated path | 404; no SPA catch-all |
| ACL `/` | Forced 302 to `/acl/` |
| Coachella `/` | Forced 302 to `/coachella/` |
| Photo Notes upstream `/` | Forced 302 to `/PhotoNotes/` |

Aliases include explicit index.html variants as compatibility coverage; they are not evidence of the real printed QR URL. Scan the real QR before release. There are no generalized club Photo Notes child redirects because the source has no child pages.

The intended personal public path is `/PhotoNotes`; a harmless trailing slash normalization is acceptable only if it stays on the personal hostname and shows the correct page. Verify query forwarding, first-hop status, final host and content on Netlify. HTTP and www canonicalization happen at hosting/domain level, not in these generated path rules. Do not add a domain redirect to the upstream Photo Notes project pointing to the personal domain: that can produce a proxy loop.

Netlify 200 rewrites serve upstream content under the requested browser URL. Forced rules override files that would otherwise shadow redirects. [Rewrites, proxies and shadowing](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/)

The route checker tests all listed Photo Notes aliases with a synthetic query, plus both festival legacy asset/download/donation suffixes. It tests donation HTML without running its automatic external navigation. Exact outbound destinations are recorded in `donation-destinations.json`; verify those manually without donating.

Historical `acl.coolstrangersclub.com` forwarding is deliberately absent: ownership, hosting, root behavior and historical deep paths remain unverified. Record those facts and add a separate reviewed mapping if that hostname is active.

Project IDs, deployed release IDs, canonical host decisions, DNS values and rollback targets belong in [launch-record.md](launch-record.md). Keep private exports outside the repo.
