# Zane Studio

Read [Studio architecture](../../docs/studio.md), [Security](../../SECURITY.md), and the [Brand Kit](../../design/BRAND.md).
Keep browser assets in public/, Worker code under workers/, and D1 migrations outside public/.
All production requests must pass the Access JWT and owner check, including assets. The separate local entry point is for loopback and synthetic data only; never deploy its config.
Keep the registry entry disabled and unmanaged. Do not add /admin or any other live route, runtime credentials, GitHub permissions, provider calls, or publication paths without separate owner approval.
Use bound SQL parameters, owner-scoped queries, atomic state transitions, and auditable events. Treat task content as text and keep it out of logs and Git.
Run the root checks and test form behavior with local Wrangler.
