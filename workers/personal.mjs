import { isPhotoNotesAlias, photoNotesPath, redirect, serveAssets } from './routing.mjs';
import { addProjectDirectory, projectRedirect } from './project-directory.mjs';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (isPhotoNotesAlias(url.pathname)) {
      return redirect(url, photoNotesPath);
    }
    if (url.pathname === photoNotesPath || url.pathname.startsWith(photoNotesPath + '/')) {
      if (!['GET', 'HEAD'].includes(request.method)) {
        return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
      }
      return env.PHOTO_NOTES.fetch(request);
    }
    if (request.method === 'POST' && ['/thanks', '/thanks/', '/thanks/index.html'].includes(url.pathname)) {
      return new Response('Project update signups are currently unavailable.', {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      const project = projectRedirect(url, env.STAGING_PROJECT_ORIGINS);
      if (project) return project;
    }
    const homepage = url.pathname === '/' || url.pathname === '/index.html';
    const response = await serveAssets(request, env.ASSETS, url);
    if (homepage && request.method === 'GET' && response.ok) {
      return addProjectDirectory(response);
    }
    return response;
  },
};
