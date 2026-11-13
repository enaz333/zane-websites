# Cool Strangers Club on Netlify

This folder is the publish directory. In Netlify, open the existing **Cool Strangers Club** project's **Deploys** page and drop this entire folder into the manual deploy area. Repeat that step after each update. The site is static and requires no install or build. Keep `index.html`, `_redirects`, and `_headers` at the top level.

| URL | Edit here |
| --- | --- |
| `/` | `index.html` |
| `/coachella/` | `coachella/index.html`, with poster crops, artist coordinates, and listening picks in `coachella/` |
| `/acl/` | `acl/index.html`, with the schedule data, styles, sample ZIP, and images in `acl/` |
| `/photo-notes/` | `photo-notes/index.html` |
| `/buildfest/` | `buildfest/index.html`, with the gallery at `buildfest/gallery.html` |
| `/redesign.html` | `redesign.html`, the alternate homepage |
| `/BuildFest` | `_redirects`, which sends the old link to `/buildfest/` |

BuildFest's local downloads and images are in `buildfest/`. Its video, form, and shared document links still point to their respective services. The ACL donation pages are under `/acl/donate/` and retain their existing outbound links and analytics beacon.

## ACL cutover

- Test `/acl/` with the built-in sample ZIP or an Exportify upload after deploying. This workflow requires no Spotify app setup.
- If you use the optional direct Spotify connection, add `https://www.coolstrangersclub.com/acl/` to your Spotify app's redirect URIs. Use the exact URI shown in the ACL settings panel if your primary hostname is different. Spotify must allow that URI, including the trailing slash. Browser data saved on the old ACL subdomain stays on that origin, so visitors may need to import again or reconnect.
- To keep bookmarks for `acl.coolstrangersclub.com` working after retiring the old app, configure forwarding for that hostname. Its root should forward to `https://www.coolstrangersclub.com/acl/` and old donation URLs should forward to their corresponding `/acl/donate/` paths. Verify forwarding before removing the old deployment. The main site's upload alone does not configure the subdomain.

## Coachella 2027

The page uses the supplied lineup poster. Update the full poster and day crops in `coachella/assets/` and their matching rectangles in `coachella/lineup-data.js` together. The default all-days view uses the full poster, including the undated appearances. Maintain the listening links in `coachella/artist-catalog.js` and the recommendation groups in `coachella/taste-data.js`. Recommendations use any genres present in the Exportify files, then look for familiar artists in the enabled sources. Everything is calculated in the browser.

For the optional direct Spotify connection, allow the exact `/coachella/` redirect URI shown in Settings. This is separate from the ACL callback. Exportify works without a Spotify developer app.

## Local preview

From this folder, run `python3 -m http.server 5173 --bind 127.0.0.1` and open `http://127.0.0.1:5173/`. The basic Python server serves the pages and files. Verify the Netlify redirect rules on the deployed site.
