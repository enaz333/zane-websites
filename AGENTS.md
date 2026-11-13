# Repository instructions

- Read README.md and docs/cloudflare.md before changing site behavior or routing. Files under docs/netlify-reference are historical reference material.
- Edit source under sites/<site>/public, Worker code under workers, and each site's config under sites/<site>/wrangler.json. Keep Static Assets scoped to one public directory per Worker.
- Club owns both Club pages, the Google Form join link, and all BuildFest content and downloads. Preserve the checked Club baseline, including documented privacy-safe asset replacements and keep the archived copies during the migration.
- Preserve the exact /PhotoNotes path and documented aliases. Personal forwards to the independently deployed Photo Notes Worker via PHOTO_NOTES. Keep the binding one-way and preserve queries.
- ACL and Coachella own their prefixed trees, posters, donation pages, and sample archives. Coachella owns all three vendored dependencies. Update provenance when changing those files.
- Keep migration aliases at 302 pending owner review after the observation period. The existing mixed-case BuildFest alias is 301. Keep real 404s for unknown paths.
- Keep credentials, runtime tokens, subscriber records, and private exports out of Git and public directories. Preserve public analytics IDs already in the archived content.
- Run the local checks in README.md after changes. Check route changes with Wrangler and verify browser interactions when they change. Record what was actually checked.
- Local tests cover source and routing. Live DNS, TLS, QR scanning, external integrations, and signup receipt require separate verification.
- Deployments, domain changes, real form submissions, commits, and pushes require explicit user instructions.
- Follow docs/publishing.md when adding projects. Use python3 scripts/projects.py new <slug>, list shared files and dependencies in projects.json, and keep new entries disabled until an owner-reviewed activation. Keep domain routes out of Wrangler configs.

## Public repository and production controls

- Apply these instructions to routine edits and new projects. Read SECURITY.md before handling credentials, signup, CI, or deployment configuration.
- Treat committed files, build logs, and everything under public/ as public. Keep actual keys, tokens, subscriber data, and private exports outside Git and assets. Check screenshots, document metadata, and archive contents for private data. Public HTML, public analytics IDs, and intentional public downloads are expected.
- Keep pull-request CI unprivileged. Give the publish job environment-scoped Cloudflare secrets only, keep its checkout pinned to the triggering commit, and preserve the protected-main and production environment gates. Keep WORKERS_PUBLISH_ENABLED unset until the owner approves staging verification.
- Keep newsletter signup disabled until a replacement backend and consent handling are verified. If a secret or private record entered Git, flag it for cleanup before publication. Rotate exposed credentials and obtain approval for any history rewrite or remote change.
- Every new public project must have a short URL under zanegiordano.com/<project-slug>. Register, test, and maintain it through projects.json automatically. Do not require a separate user request. Publish the destination and verify its health before updating the personal Worker. Add any required subpath routes explicitly.
