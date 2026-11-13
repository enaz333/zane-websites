import { redirect, serveAssets } from './routing.mjs';

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    const prefix = env.SITE_PREFIX;
    if (url.pathname === '/' || (url.pathname === prefix && prefix !== '/PhotoNotes')) {
      return redirect(url, prefix + '/');
    }
    if (url.pathname === '/PhotoNotes' && prefix === '/PhotoNotes') {
      url.pathname += '/';
    }
    return serveAssets(request, env.ASSETS, url);
  },
};
