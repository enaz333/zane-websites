# Architecture decisions

These records describe implemented decisions and their engineering tradeoffs. They do not attribute unrecorded motives to the owner.

| Decision | Rationale and tradeoff |
| --- | --- |
| GitHub is the source of truth | A reviewed commit ties source to validation and deployment. Dashboard edits can drift from that history. |
| Cloudflare replaced Netlify | The current deployment combines Static Assets, programmable routing and service bindings. Netlify Forms did not carry over, and the signup stays paused. |
| Workers deploy independently | An app can change without republishing unrelated code. Shared routing and bindings require explicit dependency tracking. |
| Personal owns short URLs | A memorable URL survives a canonical host change. The personal Worker becomes responsible for validating and publishing directory changes. |
| The registry drives redirects | Deployment planning and public discovery share one source. A registry edit can affect multiple Workers and needs route checks. |
| Photo Notes uses a service binding | The app stays separately deployable while preserving the personal origin. Personal requires an available bound Worker. |
| Preserve printed QR destinations | Printed cards cannot be updated remotely. Legacy hostnames, casing and query behavior remain compatibility requirements. |
| New projects start disabled | Scaffolding is safe in ordinary PRs. Launch requires a separate review of public exposure and domain ownership. |
| Deployment credentials stay in CI | Untrusted PR jobs and coding agents can validate locally without production access. Protected jobs need separately managed credentials and recovery procedures. |
| One Cloudflare account with separate environments | Reduces account maintenance. Separate tokens and validation reduce accidental cross-environment changes. An account-scoped Workers token can still cross the naming boundary. |
