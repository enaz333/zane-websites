# Routing

Use lowercase hyphenated slugs for new public URLs under `zanegiordano.com`. The registry maps independent projects to canonical HTTPS URLs and enables their homepage links. Exact short paths with or without a trailing slash redirect temporarily to the canonical URL and carry the original query. Deep paths on independent apps live at the canonical host. Unknown personal paths fall through to assets or the 404 page.

For an ordinary personal page, use a unique directory under personal `public/` with an index file. Check the planned path against registry slugs, internal routes and assets. Add a direct link when appropriate. Reserve existing paths for signup, assets, infrastructure and Photo Notes. The registry rejects duplicate keys and redirects back to the personal hostname.

The printed URL `https://www.coolstrangersclub.com/photo-notes/` canonicalizes to Club apex and then redirects to personal `/PhotoNotes`. Personal forwards GET and HEAD through `PHOTO_NOTES`, preserving the original request. Preserve case, queries and documented deep aliases. Club routes legacy ACL and Coachella prefixes to their own hosts. Keep temporary migration aliases at 302 pending owner approval. Club's `/BuildFest` remains 301.
