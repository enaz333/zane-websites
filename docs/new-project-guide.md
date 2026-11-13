# New projects

Find the owning site and its live URL in the [project map](projects.md). Read that site's `AGENTS.md` and the [Brand Kit](../design/BRAND.md). Edit assets under `sites/<slug>/public/` and the Worker config at `sites/<slug>/wrangler.json`. List shared Worker files in that project's `watch` array and registered service bindings in `depends_on`.

For an ordinary personal page, add `sites/personal/public/<slug>/index.html` and preview it at `/<slug>/`. For an independent app, scaffold one Worker with its own asset directory.

```sh
python3 scripts/projects.py new <slug>
python3 scripts/studio_paths.py
python3 scripts/projects.py validate
python3 scripts/studio_paths.py --check
npx --no-install wrangler dev --local -c sites/<slug>/wrangler.json
```

The template creates a disabled registry entry and keeps public Worker URLs off. Check the slug against [routing reservations](routing.md) and unpublished work. The personal Worker builds its project links and short redirects from enabled registry entries. Studio's generated inventory also includes disabled reservations. Check the existing [legacy paths](routing.md), including the printed Club QR and case-sensitive `/PhotoNotes` service binding, when changing shared routing.

Run the [README checks](../README.md) plus the affected route and browser checks, then open a PR. Keep domain attachments out of Wrangler config.

Review public exposure, data handling, hostname ownership and the proposed URL before activation. The approved publisher must verify the domain is unclaimed or already belongs to the intended Worker. Check the canonical app before publishing its short URL and homepage entry. Confirm both from a browser after launch. The current general publish path is disabled. Coordinate the activation and first deployment with the owner using [deployment and recovery](deployment.md).
