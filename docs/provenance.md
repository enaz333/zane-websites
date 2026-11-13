# Archive provenance and migration changes

Source: `Cool-Strangers-Club-Site-with-ACL-Redirect.zip` supplied from the Desktop. ZIP integrity passed before extraction. `__MACOSX`, AppleDouble entries and `.DS_Store` are packaging metadata and are excluded. Original README and migration plan are stored as reference documents, not operational instructions.

Archive SHA-256: `523b03aa2f8e605192dbf961a79a2e075616750f5266532510f5c9426fd300a8`. Per-file source hashes are in `archive-sha256.json`.

## Preserved material

Club baseline retains every original site file byte-for-byte (the original README is moved to docs). BuildFest, its gallery, downloads, both club pages, Google Form join destination, Photo Notes content, festival JavaScript/data, donation HTML/links, public analytics identifiers and samples are preserved. ACL is copied unchanged into its own prefixed publish tree. Photo Notes content is copied unchanged to `PhotoNotes/index.html`.

Coachella preserves original content except for three asset references in its HTML. Its own `styles.css` remains the second stylesheet. The imported files below are copied byte-for-byte from the supplied ACL folder, not downloaded from third parties.

| Original archive file | Independent Coachella file | Purpose |
| --- | --- | --- |
| `acl/styles.css` | `coachella/base-styles.css` | Shared base styling |
| `acl/assets/exportify-export-all.jpg` | `coachella/assets/exportify-export-all.jpg` | Import instructions |
| `acl/assets/select-spotify-playlists.png` | `coachella/assets/select-spotify-playlists.png` | Import instructions |

Validation compares these copies against the original hashes. Keep copies independent when updating either festival. Original asset ownership/license evidence is unchanged from the supplied archive; none is newly inferred.

## New material

Personal index, CSS, thank-you/404 pages; site-root entry files and redirects for standalone apps; scoped headers copied to each festival; release/configuration and HTTP validation tools; tests; operational documentation. Generated club/personal routes and project links are driven by config. Existing old club copies remain available in rollback deploys and on disk during transition.

## Evidence boundary

This archive is not a download of the currently published Netlify deploy. Live deploy ID, DNS, TLS, real printed QR, canonical club hostname, Spotify settings and analytics configuration were not verified. The owner confirmed no separate new Netlify projects exist yet.

## Personal homepage image derivatives

The November 12 homepage adds resized copies of public portfolio imagery and festival posters. Original source trees and the portfolio handoff are unchanged. See [homepage v1](homepage-v1.md#asset-provenance) for the complete source-to-output mapping.
