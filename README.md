# Zane’s websites

Independently deployable Cloudflare Workers with Static Assets share this repository. Each site has its own `wrangler.json` and serves assets from its own `public/` directory.

| Project | Source and Wrangler config | Intended public entry |
| --- | --- | --- |
| Cool Strangers Club and BuildFest | [sites/club](sites/club) | `coolstrangersclub.com/` and `/buildfest/` |
| Personal site | [sites/personal](sites/personal) | `zanegiordano.com/` |
| Photo Notes | [sites/photo-notes](sites/photo-notes) | `zanegiordano.com/PhotoNotes`, via the personal Worker |
| ACL Schedule Creator | [sites/acl](sites/acl) | `acl.zanegiordano.com/acl/` |
| Coachella Schedule Maker | [sites/coachella](sites/coachella) | `coachella.zanegiordano.com/coachella/` |

- [workers/](workers) contains redirects, directory index handling, and Photo Notes forwarding. Club retains the archived copies of the former project paths. Scoped redirects take precedence over those copies.
- [scripts/](scripts) and [tests/](tests) contain the source and Worker route checks.
- [docs/](docs) contains [the Cloudflare migration notes](docs/cloudflare.md), asset provenance, and historical [Netlify references](docs/netlify-reference). The original migration project and separate portfolio handoff remain in the original workspace.

## Local checks

Use Python 3.12 and Node.js 22. Install the pinned Wrangler with `npm ci`.

```sh
python3 scripts/validate.py
python3 scripts/projects.py validate
python3 -m unittest discover -s tests -v
node --test tests/workers.test.mjs
```

With Wrangler 4 installed, preview the personal site and Photo Notes in the same local session. Open `http://localhost:8787/PhotoNotes?card=local` and confirm that the page stays on the personal origin.

```sh
wrangler dev -c sites/personal/wrangler.json -c sites/photo-notes/wrangler.json
```

Start a standalone project by passing its single config, for example `wrangler dev -c sites/club/wrangler.json`. The checked-in Club destination URLs are the intended production hosts. Use local Wrangler variable overrides to exercise redirects against other local Worker instances.

The personal signup UI is paused while a replacement for Netlify Forms is chosen. The thank-you page remains available as source, and a form POST receives 503. Wrangler configs omit domain routes and disable public Worker preview URLs. See [Cloudflare migration notes](docs/cloudflare.md) for staging and launch work.

Use [projects.json](projects.json) and the [onboarding and publishing guide](docs/publishing.md) to add a Worker, set up GitHub approvals, and configure optional subdomain provisioning.

See [Security](SECURITY.md) for reporting and credential handling and [public release preparation](docs/public-release.md) for the one-time history cleanup and GitHub Free setup.
