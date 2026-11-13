export const photoNotesPath = '/PhotoNotes';
const photoNotesAliases = new Set(
  ['/photonotes', '/photo-notes'].flatMap(path => [path, path + '/', path + '/index.html']),
);

export function isPhotoNotesAlias(path) {
  return photoNotesAliases.has(path);
}

export function redirect(url, path, status = 302, origin = url.origin) {
  const destination = new URL(origin);
  destination.pathname = path;
  destination.search = url.search;
  return Response.redirect(destination, status);
}

// Cloudflare HTML canonicalization is disabled to keep explicit .html URLs.
export function serveAssets(request, assets, url) {
  if (!url.pathname.endsWith('/') || !['GET', 'HEAD'].includes(request.method)) {
    return assets.fetch(request);
  }
  url.pathname += 'index.html';
  return assets.fetch(new Request(url, request));
}
