# Production projects

| Source under sites/ | Worker | Canonical URL | Personal short path |
| --- | --- | --- | --- |
| personal | zane-personal | https://zanegiordano.com/ | / |
| photo-notes | zane-photo-notes | https://zanegiordano.com/PhotoNotes | /PhotoNotes |
| acl | zane-acl | https://acl.zanegiordano.com/acl/ | /acl |
| coachella | zane-coachella | https://coachella.zanegiordano.com/coachella/ | /coachella |
| club | zane-club | https://coolstrangersclub.com/ | /club |

Each folder has `wrangler.json` and `public/`. The audited Cloudflare dashboard showed Club apex and www attached, festival subdomains attached, and Photo Notes without a public route. Personal binds `PHOTO_NOTES` to `zane-photo-notes`. The registry also tracks shared source files and the dependencies for Club's legacy redirects. For deployment dependencies, use [projects.json](../projects.json).

Keep `zane-stage-*`, the legacy `zane-websites` Worker and Netlify backups pending a resource-by-resource owner decision. Account inventory snapshots are evidence at a point in time. Verify current settings before changes.
