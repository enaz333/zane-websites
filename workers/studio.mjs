import projects from '../projects.json' with { type: 'json' };
import paths from './studio-paths.json' with { type: 'json' };
import { createAccessVerifier } from './studio-auth.mjs';

const reserved = new Set(paths);
const targets = Object.keys(projects).filter(slug => slug !== 'studio').sort();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fields = 'id, kind, project, title, page, slug, description, asap, status, created_at, updated_at';
const allowedAssets = new Set(['/', '/index.html', '/studio.css', '/studio.js']);
const headers = {
  'Cache-Control': 'private, no-store',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
const json = (data, status = 200) => Response.json(data, { status, headers });
const error = (message, status) => json({ error: message }, status);
const present = task => ({ ...task, asap: Boolean(task.asap) });

class InputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function normalize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new InputError('Enter a task.');
  }
  const { kind, asap } = input;
  if (!['edit', 'page', 'app'].includes(kind) || typeof asap !== 'boolean') {
    throw new InputError('Choose a request type and priority.');
  }
  const field = (key, label, max, optional = false) => {
    const value = input[key] ?? '';
    if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) {
      throw new InputError(`${label} must be ${optional ? 'at most' : 'between 1 and'} ${max} characters.`);
    }
    return value.trim() || null;
  };
  const project = kind === 'app' ? null : input.project;
  if (kind !== 'app' && !targets.includes(project)) throw new InputError('Choose a website.');
  const description = field('description', 'Description', 4000);
  if (kind === 'edit') {
    const page = field('page', 'Page', 512, true);
    if (page && !/^\/(?!\/)[^\\\s]*$/.test(page)) {
      let url;
      try { url = new URL(page); } catch { /* handled below */ }
      if (!url || !/^https:\/\//i.test(page) || url.username || url.password ||
          url.port || /[\s\\]/.test(page)) {
        throw new InputError('Enter a relative path starting with / or a full HTTPS URL.');
      }
      const canonical = new URL(projects[project].canonical_url).hostname;
      if (url.hostname !== canonical &&
          !(canonical === 'zanegiordano.com' && url.hostname === 'www.zanegiordano.com') &&
          !(canonical === 'coolstrangersclub.com' && url.hostname === 'www.coolstrangersclub.com')) {
        throw new InputError('The page URL must belong to the selected website.');
      }
    }
    return { kind, project, title: null, page, slug: null, description, asap };
  }
  const title = field('title', 'Title', 120);
  const slug = field('slug', 'URL slug', 57).toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,55}[a-z0-9])?$/.test(slug)) {
    throw new InputError('Use only letters, numbers and internal hyphens in the URL slug.');
  }
  if (reserved.has(slug)) throw new InputError('That URL is reserved or already in use.', 409);
  return { kind, project, title, page: null, slug, description, asap };
}

async function readTask(request) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new InputError('Send JSON.', 415);
  }
  const max = 24576;
  if (Number(request.headers.get('Content-Length')) > max) throw new InputError('Request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new InputError('Enter a task.');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let body = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        await reader.cancel();
        throw new InputError('Request is too large.', 413);
      }
      body += decoder.decode(value, { stream: true });
    }
    return normalize(JSON.parse(body + decoder.decode()));
  } catch (err) {
    if (err instanceof InputError) throw err;
    throw new InputError('Send valid JSON.');
  }
}

async function submit(request, db, owner) {
  const key = request.headers.get('Idempotency-Key');
  if (!uuid.test(key ?? '')) throw new InputError('A valid request key is required.');
  const task = await readTask(request);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(task)));
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  // A single write enforces both idempotency and active slug reservation across concurrent requests.
  const [insert, result] = await db.batch([
    db.prepare(`INSERT INTO tasks
      (id, owner_id, request_key, request_hash, kind, project, title, page, slug, description, asap, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`)
      .bind(id, owner, key, hash, task.kind, task.project, task.title, task.page, task.slug,
        task.description, Number(task.asap), now, now),
    db.prepare(`SELECT ${fields}, request_hash FROM tasks WHERE owner_id = ? AND request_key = ?`)
      .bind(owner, key),
  ]);
  if (!result.results.length) return error('An active request already uses that URL.', 409);
  const { request_hash, ...record } = result.results[0];
  if (request_hash !== hash) return error('This request key was already used for different details.', 409);
  return json({ task: present(record) }, insert.meta.changes ? 201 : 200);
}

export function createStudio(authenticate) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;
      const owner = await authenticate(request, env);
      if (!owner) return error('Access denied.', 403);
      if (method !== 'GET' && method !== 'HEAD' &&
          (request.headers.get('Origin') !== url.origin ||
           !['same-origin', null].includes(request.headers.get('Sec-Fetch-Site')))) {
        return error('This action must come from Studio.', 403);
      }
      if (allowedAssets.has(path) && ['GET', 'HEAD'].includes(method)) {
        const asset = await env.ASSETS.fetch(request);
        const secure = new Headers(asset.headers);
        for (const [key, value] of Object.entries(headers)) secure.set(key, value);
        return new Response(asset.body, { status: asset.status, headers: secure });
      }
      if (path === '/api/projects' && method === 'GET') return json({ projects: targets });
      const cancel = path.match(/^\/api\/tasks\/([^/]+)\/cancel$/);
      if (path !== '/api/tasks' && !(cancel && uuid.test(cancel[1]))) return error('Not found.', 404);
      if (!env.DB) return error('Task storage is unavailable.', 503);
      try {
        const db = env.DB.withSession('first-primary');
        if (path === '/api/tasks' && method === 'GET') {
          const before = url.searchParams.get('before');
          if (before && !uuid.test(before)) throw new InputError('Invalid history cursor.');
          const cursor = before && await db.prepare('SELECT created_at, id FROM tasks WHERE owner_id = ? AND id = ?')
            .bind(owner, before).first();
          if (before && !cursor) return error('Not found.', 404);
          const query = `SELECT ${fields} FROM tasks WHERE owner_id = ? ${cursor ? 'AND (created_at, id) < (?, ?)' : ''}
            ORDER BY created_at DESC, id DESC LIMIT 31`;
          const { results } = await db.prepare(query)
            .bind(...(cursor ? [owner, cursor.created_at, cursor.id] : [owner])).all();
          const tasks = results.slice(0, 30).map(present);
          return json({ tasks, next: results.length > 30 ? tasks.at(-1).id : null });
        }
        if (path === '/api/tasks' && method === 'POST') return await submit(request, db, owner);
        if (cancel && method === 'POST') {
          const [, result] = await db.batch([
            db.prepare("UPDATE tasks SET status = 'cancelled', updated_at = ? WHERE id = ? AND owner_id = ? AND status = 'submitted'")
              .bind(new Date().toISOString(), cancel[1], owner),
            db.prepare(`SELECT ${fields} FROM tasks WHERE id = ? AND owner_id = ?`).bind(cancel[1], owner),
          ]);
          return result.results[0] ? json({ task: present(result.results[0]) }) : error('Not found.', 404);
        }
        return error('Method not allowed.', 405);
      } catch (err) {
        if (err instanceof InputError) return error(err.message, err.status);
        return error('Task storage is unavailable. Try again.', 503);
      }
    },
  };
}

export default createStudio(createAccessVerifier());
