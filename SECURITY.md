# Security policy

## Reporting

Use GitHub **Security → Report a vulnerability** when private vulnerability reporting is available. Otherwise contact the repository owner privately and ask for a secure channel. Include the affected path, impact, and how to identify the issue. Keep credentials, personal data, and sensitive reproduction details out of public issues, PRs, and logs.

## Public source and private data

Public site code, intended public downloads, and browser-side analytics identifiers belong in this repository. Keep credentials, private keys, tokens, subscriber records, account screenshots, private exports, and local configuration outside Git and every Static Assets directory. Inspect archive members, screenshots, and document metadata before adding public assets. Use synthetic data for fixtures. Git ignore rules and asset ignore rules provide additional safeguards.

If a credential enters Git, revoke or rotate it promptly and review where it was exposed. If private material enters Git, remove it from publishable history and check remote PRs, cached views, and artifacts before changing visibility. Coordinate history cleanup with the owner.

## Publishing

Pull requests run validation with read-only access. Production publishes a pinned commit from protected main and uses the cloudflare-production environment. Keep Cloudflare tokens in that environment with the narrowest account and zone scope. Review the commit and changes to the registry, workflows, and deploy scripts before approving an environment run.

Keep production publishing disabled until Cloudflare staging verification is complete and the owner authorizes it. Keep subscriber collection disabled until its replacement backend and consent handling are verified. See [publishing setup](docs/publishing.md) for the approval flow.
