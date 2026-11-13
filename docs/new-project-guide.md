# New projects

For an ordinary page, add it under `sites/personal/public/<slug>/`. Preview the chosen URL and check it against [routing reservations](routing.md).

For an independent app, run `python3 scripts/projects.py new <slug>`. This creates a site, Wrangler config and disabled registry entry with a proposed subdomain and short URL. Implement the app, record shared code and Worker dependencies in the registry, run the README checks and open a PR.

Review public exposure, data handling, hostname ownership and the proposed URL before activation. The approved publisher must verify the domain is unclaimed or already belongs to the intended Worker. Check the canonical app before publishing its short URL and homepage entry. Confirm both from a browser after launch. The current general publish path is disabled. Coordinate the activation and first deployment with the owner using [deployment and recovery](deployment.md).
