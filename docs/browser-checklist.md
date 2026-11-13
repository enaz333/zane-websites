# Browser release checklist

Mark each item PASS / FAIL with date, browser and deployment ID in your launch record. Local source preservation and syntax checks do not complete these checks.

## Club and printed links

- [ ] Both apex and www work over HTTPS and HTTP canonicalizes correctly.
- [ ] Main homepage and alternate redesign retain their content and join flow to the same Google Form. Do not submit an actual membership unless intended.
- [ ] `/BuildFest`, `/buildfest/`, `/buildfest/gallery.html`, plugin ZIP and design-brief download work.
- [ ] Migrated homepage links reach the right new destinations.
- [ ] A real printed QR works on cellular data. Record its exact original URL before scanning through redirects.
- [ ] All listed Photo Notes aliases, slash variants and queries preserve the personal hostname; no exposed upstream or loop.
- [ ] Unrelated club routes behave as in the saved baseline.
- [ ] Historical ACL hostname checked separately if active.

## Personal and signup

- [ ] Exactly four labeled project links reach their destinations.
- [ ] Mobile and desktop layouts are readable without horizontal scrolling; 200% zoom remains usable.
- [ ] Tab through links, email, submit and consent; visible focus is present. Space toggles consent; keyboard submission works when valid.
- [ ] Blank and malformed email are blocked. Valid email with unchecked consent is blocked.
- [ ] Consent begins unchecked. A valid consented submission reaches `/thanks/`.
- [ ] `project-updates` exists in Netlify Forms and records email, affirmative consent, consent version and receipt timestamp.
- [ ] Repeat signup behavior is understood; records are deduplicated before mailing, not assumed deduplicated by this form.
- [ ] Test a honeypot-filled submission only in staging (using browser dev tools or an HTTP client); it must not become an eligible verified subscriber. A success-looking response alone is not proof of acceptance.
- [ ] Inspect spam and export CSV privately; confirm expected fields and remove synthetic records.
- [ ] An unrelated path returns a real 404.

## ACL standalone

- [ ] Open a fresh/private browser at its standalone origin; both weekends and all day posters render.
- [ ] Built-in sample Exportify loads; compare counts/matches with the original app using the same sample.
- [ ] User-provided Exportify file imports with expected matches and schedule interaction.
- [ ] Click artists and schedule controls, inspect linked tracks; persistence/reload works.
- [ ] Each donation entry reaches its intended external destination; stop before making any donation.
- [ ] Scoped headers and existing Cloudflare analytics behavior verified. If analytics dashboard restricts hostnames, add the new hostname there; do not replace the preserved token blindly.

## Coachella standalone

- [ ] All-days and day views render with poster/overlay alignment intact.
- [ ] Both stylesheets and guide images load from Coachella's own origin, without ACL requests.
- [ ] Sample and user-provided Exportify imports match the baseline; recommendations and artist interactions work.
- [ ] Listening links and all donation destinations work without completing donations.
- [ ] Scoped headers verified.

## Optional Spotify and deployment independence

- [ ] Exact HTTPS callback URIs including trailing slash are registered if direct Spotify is retained.
- [ ] An authorized account can complete auth on each new origin; old callbacks retained through transition.
- [ ] Explain reimport/reconnect after origin change; do not promise browser storage migration.
- [ ] Updating only Photo Notes appears through the personal proxy; revert the test marker afterward.
- [ ] Publish and restore one staging deploy; other projects remain available.
- [ ] Repeat the critical signup, QR, join and route checks after production cutover.
