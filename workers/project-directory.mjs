import projects from '../projects.json' with { type: 'json' };

const directory = Object.entries(projects).filter(([slug, project]) =>
  project.enabled && !['personal', 'photo-notes'].includes(slug));
const destinations = new Map(directory.map(([slug, project]) => [project.short_path, [slug, project.canonical_url]]));

export function projectRedirect(url, stagingOrigins) {
  const entry = destinations.get(url.pathname.replace(/\/$/, ''));
  if (!entry) return;
  const [slug, canonical] = entry;
  const destination = new URL(canonical);
  if (stagingOrigins?.[slug]) {
    destination.host = new URL(stagingOrigins[slug]).host;
  }
  destination.search = url.search;
  return Response.redirect(destination, 302);
}

export function addProjectDirectory(response) {
  const links = directory.map(([slug, project]) =>
    `<li><a href="${project.short_path}">${slug}</a></li>`).join('');
  return new HTMLRewriter().on('#hosted-project-links', {
    element(element) {
      element.setInnerContent(links, { html: true });
    },
  }).transform(response);
}
