# Studio Projects

Projects is a tab in the authenticated Studio Worker. It uses additive D1 migration 0004. Existing task, dispatch and reservation tables are preserved. The project API is separate from the website picker and legacy Activity API.

The owner comes from Access verification. Same-origin JSON writes use UUID request keys for project creation and iteration. A single queued request per project and an atomic parent check prevent concurrent requests from moving the version head unexpectedly. Ready requests are immutable versions. Restoration saves a new request using an older brief and retains the old versions. Cancellation resolves queued work without deleting it.

The loopback fixture produces inspectable collection JSON and a SHA-256 digest. It stores the result with the resolved request. This is an artifact demonstration. The Python app engine, interactive previews, publisher and durable remote executor remain separate. The fixture route requires the explicit local Worker entry point. Production can record requests, and the UI reports that the build runner is unavailable.

## Local verification

```sh
npx --no-install wrangler d1 migrations apply DB --local -c sites/studio/local/wrangler.json --persist-to /tmp/studio-projects-d1
npx --no-install wrangler dev --local -c sites/studio/local/wrangler.json --port 8796 --var STUDIO_LOCAL_PORT:8796 --persist-to /tmp/studio-projects-d1
```

Open http://127.0.0.1:8796/#projects. Use a synthetic brief. Create a project, save a request, build its fixture and inspect the artifact. Repeat with a different brief, then restore an older specification and verify that history retains all three versions.

## Protected staging proposal

1. Review draft PRs in stack order. Confirm the exact staging D1 identity and marker, Access policy, active Worker and validator revisions, and disabled dispatcher configuration using read-only access.
2. Approve a separate release to apply migration 0004 to staging D1 before uploading the web Worker. The historical staging initializer explicitly gates migrations 0001–0003. Prepare a reviewed additive migration workflow for the existing staging database before rollout.
3. With the dispatcher inert, verify owner-scoped creation, requests and cancellation under Access and confirm existing tasks remain visible. Record the previous web version. Roll back the web Worker to that version if needed and preserve the additive tables.
4. Add an isolated cloud runner, persistent job identity and private artifact storage. Bind results to the exact parent and source revision. Obtain separate approval for hosting and any paid provider test after reviewing quotas and prices. This sprint incurred zero model calls.
5. Connect independent validation and the constrained publisher with stale-base rejection and lost-reply reconciliation. Review the resulting staging acceptance flow before authorizing any app publication.
