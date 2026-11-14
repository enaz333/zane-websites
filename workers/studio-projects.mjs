import paths from './studio-paths.json' with { type: 'json' };

const reserved = new Set(paths);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const fields = 'id, slug, name, brief, created_at';
const head = "(SELECT id FROM studio_project_requests WHERE project_id=p.id AND state='ready' ORDER BY rowid DESC LIMIT 1)";
const required = (value, limit) => typeof value === 'string' && value.trim() && value.length <= limit;

export async function projectApi({ request, db, owner, path, fixture, readJson, json, error }) {
  const method = request.method;
  const rows = async (sql, ...args) => (await db.prepare(sql).bind(...args).all()).results;
  const query = `SELECT ${fields}, ${head} AS current_version FROM studio_projects p WHERE owner_id=?`;
  if (path === '/api/workspace-projects') {
    if (method === 'GET') return json({ projects: await rows(query + ' ORDER BY rowid DESC LIMIT 100', owner), fixture });
    if (method !== 'POST') return error('Method not allowed.', 405);
    const input = await readJson(request);
    const id = request.headers.get('Idempotency-Key');
    const { slug, name, brief } = input ?? {};
    if (!uuid.test(id ?? '') || typeof slug !== 'string' ||
        !/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(slug) || reserved.has(slug) ||
        slug.startsWith('stage-') || !required(name, 120) || !required(brief, 4000)) {
      return error('Enter a valid name, brief and available slug.', 400);
    }
    const inserted = await db.prepare(
      'INSERT INTO studio_projects(id,owner_id,slug,name,brief) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING'
    ).bind(id, owner, slug, name.trim(), brief.trim()).run();
    const [project] = await rows(query + ' AND id=?', owner, id);
    if (!project || project.slug !== slug || project.name !== name.trim() || project.brief !== brief.trim()) {
      return error('Project slug or request key is already in use.', 409);
    }
    return json({ project }, inserted.meta.changes ? 201 : 200);
  }

  const match = path.match(/^\/api\/workspace-projects\/([^/]+)(?:\/requests(?:\/([^/]+)\/(build|cancel))?)?$/);
  if (!match || !uuid.test(match[1]) || (match[2] && !uuid.test(match[2]))) return error('Not found.', 404);
  const [project] = await rows(query + ' AND id=?', owner, match[1]);
  if (!project) return error('Not found.', 404);
  const history = 'SELECT id,parent_id,restore_id,message,brief,state,artifact,digest,created_at FROM studio_project_requests WHERE project_id=?';
  if (path.endsWith(project.id) && method === 'GET') {
    return json({ project, requests: await rows(history + ' ORDER BY rowid DESC LIMIT 100', project.id), fixture });
  }
  if (method !== 'POST' || path.endsWith(project.id)) return error('Method not allowed.', 405);
  if (match[2]) {
    const [run] = await rows(history + ' AND id=?', project.id, match[2]);
    if (!run) return error('Not found.', 404);
    const build = match[3] === 'build';
    if (build && !fixture) return error('No build runner is enabled.', 409);
    const artifact = build ? JSON.stringify({ kind: 'collection-fixture', title: project.name,
      brief: run.brief, items: ['Anatolian rug', 'Woven blanket', 'Ceramic vase'] }) : null;
    const bytes = build ? await crypto.subtle.digest('SHA-256', new TextEncoder().encode(artifact)) : null;
    const digest = bytes ? Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('') : null;
    const state = build ? 'ready' : 'cancelled';
    await db.prepare(`UPDATE studio_project_requests SET state=?,artifact=?,digest=?
      WHERE project_id=? AND id=? AND state='queued'`).bind(state, artifact, digest, project.id, run.id).run();
    const [result] = await rows(history + ' AND id=?', project.id, run.id);
    return result.state === state ? json({ request: result }) : error('Request already resolved.', 409);
  }
  const input = await readJson(request);
  const id = request.headers.get('Idempotency-Key');
  const { parent = null, restore = null, message, brief } = input ?? {};
  if (!uuid.test(id ?? '') || (parent !== null && !uuid.test(parent)) ||
      (restore !== null && !uuid.test(restore)) || !required(message, 4000) || !required(brief, 4000)) {
    return error('Enter a brief and change request.', 400);
  }
  const [older] = restore ? await rows(history + " AND id=? AND state='ready'", project.id, restore) : [];
  if (restore && !older) return error('Version not found.', 404);
  const specification = older?.brief ?? brief.trim();
  const written = await db.prepare(`INSERT INTO studio_project_requests(id,project_id,parent_id,restore_id,message,brief)
    SELECT ?,p.id,?,?,?,? FROM studio_projects p WHERE p.id=? AND owner_id=? AND ${head} IS ?
    ON CONFLICT DO NOTHING`).bind(id, parent, restore, message.trim(), specification, project.id, owner, parent).run();
  const [run] = await rows(history + ' AND id=?', project.id, id);
  if (!run || run.parent_id !== parent || run.restore_id !== restore ||
      run.message !== message.trim() || run.brief !== specification) {
    return error('Refresh the project before submitting another request.', 409);
  }
  return json({ request: run }, written.meta.changes ? 201 : 200);
}
