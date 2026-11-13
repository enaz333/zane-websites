# Personal homepage v1

November 12, 2026. Local implementation of the approved Good Company / One Big Feature direction. No deployment or DNS changes.

## Editing

- `sites/personal/public/index.html`: project cards are the content source. Edit the title, link, image, `data-category`, and `data-description` together. `data-featured="true"` includes a card in the photo carousel. Featured cards require an image. Keep the initial static feature synchronized with the first featured card for the no-JavaScript experience.
- `home.css`: homepage-only styling, separate from the existing signup/success/404 styles. Purple signature accent, neutral surfaces, 3/2/1-column grid and stacked mobile feature.
- `home.js`: 6.5-second rotation, previous/next, direct selectors, pause/play and category filters. Hover temporarily pauses; keyboard focus and manual selection stop rotation until Play. Hidden tabs suspend timers. Reduced-motion preference starts paused. The grid and initial feature remain usable without JavaScript.
- Assets are local optimized derivatives, up to 1400px for feature images and 900px for festival posters. Photo Notes uses a typographic cover pending a selected photo.
- ARRR.duino and Roses link to the existing zanegio.com case studies until those pages are migrated. BuildFest links to the club-owned support site. Keep project URLs in HTML: `prepare.py` rewrites canonical club/festival links for releases; JavaScript derives its links from those cards.
- Existing newsletter consent and Netlify form configuration are preserved.

## Asset provenance

Original handoff media remains unchanged. The following assets were resized with macOS `sips`; PNG inputs were converted to JPEG.

| New asset (`assets/projects/`) | Source |
| --- | --- |
| club.jpg | handoff/zanegio-portfolio/media/d58075_fe8453ab40bb443ebee4a53b8bc11f8e~mv2.jpg |
| buildfest.jpg | handoff/zanegio-portfolio/media/d58075_1181d9ebc61e418fa71cc8b47b4a1cf8~mv2.jpg |
| arrrduino.jpg | handoff/zanegio-portfolio/media/d58075_8498e3a5b9e441eca9fd89e1c694da6c~mv2.png |
| roses.jpg | handoff/zanegio-portfolio/media/d58075_678c8799c2fd433eae9c8e71b05d24ab~mv2.jpg |
| acl.jpg | sites/acl/public/acl/assets/friday-w1.png |
| coachella.jpg | sites/coachella/public/coachella/assets/full-poster.png |

## Verification

- Source validator: 194 checks, zero failures. Replaced the obsolete exact-four-links assertion with checks for all four required migrated destinations.
- Preparation regression suite: five tests pass.
- Local browser: 390px and 1280px layouts inspected; all seven image elements loaded, mobile document width matched viewport (390px). Side projects filter shows three entries and All restores seven. Keyboard Next selects BuildFest and stops rotation.
- Live Netlify routes, receipt of form submissions, DNS and TLS remain unverified. No form was submitted.
