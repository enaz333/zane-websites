import { isPhotoNotesAlias, photoNotesPath, redirect, serveAssets } from './routing.mjs';

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/BuildFest') {
      return redirect(url, '/buildfest/', 301);
    }
    if ([photoNotesPath, photoNotesPath + '/', photoNotesPath + '/index.html'].includes(path)
        || isPhotoNotesAlias(path)) {
      return redirect(url, photoNotesPath, 302, env.PERSONAL_ORIGIN);
    }
    for (const [prefix, origin] of [['/acl', env.ACL_ORIGIN], ['/coachella', env.COACHELLA_ORIGIN]]) {
      if (path === prefix || path.startsWith(prefix + '/')) {
        return redirect(url, path === prefix ? prefix + '/' : path, 302, origin);
      }
    }
    return serveAssets(request, env.ASSETS, url);
  },
};
