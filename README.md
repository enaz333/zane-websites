# Zane’s websites

[enaz333/zane-websites](https://github.com/enaz333/zane-websites) is the source of truth for five Cloudflare Workers. The older Netlify kit records the migration history.

For an everyday edit, describe the page and desired change. Edit its files in `sites/<project>/public/`, preview locally, run the checks below and open a PR. Shared request handling lives in `workers/`. The [project map](docs/projects.md) identifies each site and its public URL.

Use Python 3.12 and Node.js 22.

```sh
npm ci
python3 scripts/validate.py
python3 scripts/projects.py validate
python3 -m unittest discover -s tests -v
node --test tests/workers.test.mjs
```

Preview personal and Photo Notes together with `npx --no-install wrangler dev -c sites/personal/wrangler.json -c sites/photo-notes/wrangler.json`. For a standalone site, pass its own config. Local preview does not establish live DNS, TLS or third-party integration health.

See [agent instructions](AGENTS.md), [architecture](docs/architecture.md), [routing](docs/routing.md), [deployment and recovery](docs/deployment.md), [new projects](docs/new-project-guide.md), and [security](SECURITY.md).
