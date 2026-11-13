# Repository instructions

- Read README.md and docs/cloudflare.md before changing site behavior or routing. Files under docs/netlify-reference are historical reference material.
- Edit source under sites/<site>/public, Worker code under workers, and each site's config under sites/<site>/wrangler.json. Keep Static Assets scoped to one public directory per Worker.
- Club owns both Club pages, the Google Form join link, and all BuildFest content and downloads. Preserve the byte-checked Club baseline and keep the archived copies during the migration.
- Preserve the exact /PhotoNotes path and documented aliases. Personal forwards to the independently deployed Photo Notes Worker via PHOTO_NOTES. Keep the binding one-way and preserve queries.
- ACL and Coachella own their prefixed trees, posters, donation pages, and sample archives. Coachella owns all three vendored dependencies. Update provenance when changing those files.
- Keep migration aliases at 302 pending owner review after the observation period. The existing mixed-case BuildFest alias is 301. Keep real 404s for unknown paths.
- Keep credentials, runtime tokens, subscriber records, and private exports out of Git and public directories. Preserve public analytics IDs already in the archived content.
- Run python3 scripts/validate.py and node --test tests/workers.test.mjs after changes. Check route changes with Wrangler and verify browser interactions when they change. Record what was actually checked.
- Local tests cover source and routing. Live DNS, TLS, QR scanning, external integrations, and signup receipt require separate verification.
- Deployments, domain changes, real form submissions, commits, and pushes require explicit user instructions.
