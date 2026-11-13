import { photoNotesPath, redirect, serveAssets } from './routing.mjs';

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (url.hostname === 'www.coolstrangersclub.com') {
      return redirect(url, path, 301, 'https://coolstrangersclub.com');
    }
    if (path === '/BuildFest') {
      return redirect(url, '/buildfest/', 301);
    }
    const photoNotes = /^\/(?:photonotes|photo-notes)(?=\/|$)(.*)$/i.exec(path);
    if (photoNotes) {
      const suffix = photoNotes[1];
      const entry = ['', '/', '/index.html'].includes(suffix.toLowerCase());
      return redirect(url, entry ? photoNotesPath : photoNotesPath + suffix,
                      302, env.PERSONAL_ORIGIN);
    }
    if (path === '/buildfest/gallery') {
      url.pathname += '.html';
      return env.ASSETS.fetch(new Request(url, request));
    }
    for (const [prefix, origin] of [['/acl', env.ACL_ORIGIN], ['/coachella', env.COACHELLA_ORIGIN]]) {
      if (path === prefix || path.startsWith(prefix + '/')) {
        return redirect(url, path === prefix ? prefix + '/' : path, 302, origin);
      }
    }
    return serveAssets(request, env.ASSETS, url);
  },
};
