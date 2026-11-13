import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test, before, after } from 'node:test';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import production, { createStudio } from '../workers/studio.mjs';
import { createAccessVerifier } from '../workers/studio-auth.mjs';

const origin = 'https://studio.zanegiordano.com';
const issuer = 'https://example.cloudflareaccess.com';
const config = { ACCESS_TEAM_ORIGIN: issuer, ACCESS_AUD: 'studio-test-audience',
  STUDIO_OWNER_EMAIL: 'owner@example.com', STUDIO_ORIGIN: origin };
const keys = await crypto.subtle.generateKey({
  name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256',
}, true, ['sign', 'verify']);
const jwk = { ...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'test-key' };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
async function token(claims = {}, header = {}) {
  const payload = encode({ alg: 'RS256', kid: jwk.kid, ...header }) + '.' + encode({
    iss: issuer, aud: [config.ACCESS_AUD], email: config.STUDIO_OWNER_EMAIL,
    exp: Math.floor(Date.now() / 1000) + 60, type: 'app', sub: 'owner-id', ...claims,
  });
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, Buffer.from(payload));
  return payload + '.' + Buffer.from(signature).toString('base64url');
}
const good = await token();
const verify = createAccessVerifier(async url => {
  assert.equal(url, issuer + '/cdn-cgi/access/certs');
  return Response.json({ keys: [jwk] });
});
const studio = createStudio(verify);
let mf, db;
before(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ modules: true, script: 'export default { fetch() {} }', d1Databases: ['DB'] }] }));
  db = await mf.getD1Database('DB');
  const migration = await readFile(new URL('../sites/studio/migrations/0001_tasks.sql', import.meta.url), 'utf8');
  await db.batch(migration.trim().split(/;\s*(?=CREATE )/).map(sql => db.prepare(sql)));
});
after(async () => mf?.dispose());

function request(path, { auth = good, body, key = crypto.randomUUID(), method = body ? 'POST' : 'GET', ...extra } = {}) {
  return new Request(origin + path, {
    method, body: body && JSON.stringify(body),
    headers: { 'Cf-Access-Jwt-Assertion': auth, 'Idempotency-Key': key,
      'Content-Type': 'application/json', Origin: origin, ...extra.headers },
  });
}
const api = (path, options) => studio.fetch(request(path, options), { ...config, DB: db });
const edit = { kind: 'edit', project: 'photo-notes', page: '/PhotoNotes?card=test',
  description: 'Synthetic request', asap: false };
const app = { kind: 'app', title: 'Test', slug: 'studio-test-project', description: 'Synthetic request', asap: true };

test('Access fails closed for both page assets and API', async () => {
  for (const path of ['/', '/index.html', '/studio.js', '/studio.css', '/api/projects', '/api/tasks']) {
    assert.equal((await production.fetch(new Request(origin + path), {})).status, 403);
    assert.equal((await api(path, { auth: '' })).status, 403);
  }
  for (const auth of [
    await token({ email: 'other@example.com' }), await token({ aud: ['other'] }),
    await token({ iss: 'https://different.cloudflareaccess.com' }), await token({ exp: 1 }),
    await token({ nbf: 4102444800 }), await token({ type: 'service' }),
    await token({}, { alg: 'HS256' }), await token({}, { kid: 'unknown' }),
    good.replace(/\.[^.]+$/, '.aabbcc'),
  ]) {
    assert.equal((await api('/api/tasks', { auth })).status, 403);
  }
  assert.equal(await verify(new Request('https://alternate.example.com/', {
    headers: { 'Cf-Access-Jwt-Assertion': good },
  }), config), null);
  assert.equal((await api('/api/projects')).status, 200);
  const asset = await studio.fetch(request('/'), { ...config, ASSETS: { fetch: () => new Response('Studio') } });
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get('Cache-Control'), 'private, no-store');
  assert.match(asset.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
});

test('missing configuration, forged identity headers and missing signing keys fail closed', async () => {
  const never = () => { throw new Error('Unauthenticated request reached a binding'); };
  const env = { ...config, ASSETS: { fetch: never }, DB: { withSession: never } };
  for (const path of ['/', '/studio.js', '/api/tasks']) {
    const forged = request(path, { auth: '', headers: {
      'Cf-Access-Authenticated-User-Email': config.STUDIO_OWNER_EMAIL,
      Cookie: 'CF_Authorization=' + good,
    } });
    assert.equal((await production.fetch(forged, env)).status, 403);
  }
  for (const key of Object.keys(config)) {
    assert.equal((await studio.fetch(request('/api/tasks'), { ...env, [key]: '' })).status, 403);
  }
  const unavailable = createStudio(createAccessVerifier(async () => new Response(null, { status: 503 })));
  assert.equal((await unavailable.fetch(request('/'), env)).status, 403);
  const denied = await api('/api/tasks', { auth: '', body: edit });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('Cache-Control'), 'private, no-store');
});

test('task submission checks origin, input, page targets and reserved paths', async () => {
  assert.equal((await api('/api/tasks', { body: edit, headers: { Origin: 'https://other.example' } })).status, 403);
  assert.equal((await api('/api/tasks', { body: edit, headers: { 'Sec-Fetch-Site': 'same-site' } })).status, 403);
  for (const body of [{ ...edit, project: 'studio' }, { ...edit, page: 'https://other.example/' },
    { ...edit, page: '//other.example' }, { ...edit, description: ' ' }, { ...edit, asap: 'true' },
    { ...app, slug: '../example' }, { ...app, kind: 'page' }]) {
    assert.equal((await api('/api/tasks', { body })).status, 400, JSON.stringify(body));
  }
  for (const slug of ['admin', 'PHOTONOTES', 'buildfest', 'thanks', 'assets', 'acl', 'studio']) {
    assert.equal((await api('/api/tasks', { body: { ...app, slug } })).status, 409, slug);
  }
  assert.equal((await api('/api/tasks', { body: { ...edit, description: '🌱'.repeat(10000) } })).status, 413);
  const response = await api('/api/tasks', { body: { ...app, kind: 'page', project: 'club', slug: 'studio-test-page' } });
  assert.equal(response.status, 201);
  const { task } = await response.json();
  assert.equal(task.kind, 'page');
  assert.equal(task.project, 'club');
});

test('persistent history is owner scoped; retries and concurrent changes are safe', async () => {
  const auth = await token({ sub: 'second-identity' });
  const key = crypto.randomUUID();
  const responses = await Promise.all(Array.from({ length: 4 }, () => api('/api/tasks', { body: app, key })));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 200, 200, 201]);
  const records = await Promise.all(responses.map(response => response.json()));
  const { task } = records[0];
  assert.ok(records.every(record => record.task.id === task.id && record.task.status === 'submitted'));
  assert.equal(task.asap, true);
  assert.equal(task.owner_id, undefined);
  assert.equal((await api('/api/tasks', { body: { ...app, title: 'Changed' }, key })).status, 409);
  assert.equal((await api('/api/tasks', { body: app, auth })).status, 409);
  assert.deepEqual((await (await api('/api/tasks', { auth })).json()).tasks, []);
  assert.equal((await api('/api/tasks?before=' + task.id, { auth })).status, 404);
  const path = '/api/tasks/' + task.id + '/cancel';
  assert.equal((await api(path, { method: 'POST', auth })).status, 404);
  for (const response of await Promise.all([api(path, { method: 'POST' }), api(path, { method: 'POST' })])) {
    assert.equal((await response.json()).task.status, 'cancelled');
  }
  const { tasks } = await (await api('/api/tasks')).json();
  assert.equal(tasks.find(row => row.id === task.id).status, 'cancelled');
  const events = await db.prepare('SELECT event FROM task_events WHERE task_id = ? ORDER BY id').bind(task.id).all();
  assert.deepEqual(events.results.map(event => event.event), ['submitted', 'cancelled']);
  assert.equal((await api('/api/tasks', { body: app, auth })).status, 201);
  assert.equal((await api('/api/tasks', { body: edit })).status, 201);
});

test('Access reports only the failed stage and keeps the HTTP denial generic', async () => {
  const stages = [];
  const authenticate = createAccessVerifier(async () => Response.json({ keys: [jwk] }),
    (...args) => stages.push(args));
  const app = createStudio(authenticate);
  const cases = [
    ['runtime_config', request('/'), { ...config, ACCESS_AUD: '' }],
    ['request_origin', new Request('https://other.example/'), config],
    ['assertion_missing', request('/', { auth: '' }), config],
    ['jwt_format', request('/', { auth: 'malformed' }), config],
    ['issuer', request('/', { auth: await token({ iss: 'https://other.cloudflareaccess.com' }) }), config],
    ['token_type', request('/', { auth: await token({ type: 'org' }) }), config],
    ['audience', request('/', { auth: await token({ aud: ['other'] }) }), config],
    ['owner_email', request('/', { auth: await token({ email: 'other@example.com' }) }), config],
    ['token_time', request('/', { auth: await token({ exp: 1 }) }), config],
    ['subject', request('/', { auth: await token({ sub: '' }) }), config],
    ['signing_key', request('/', { auth: await token({}, { kid: 'unknown' }) }), config],
    ['signature', request('/', { auth: good.replace(/\.[^.]+$/, '.aabbcc') }), config],
  ];
  for (const [stage, req, env] of cases) {
    const response = await app.fetch(req, env);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'Access denied.' });
    assert.deepEqual(stages.pop(), [stage]);
  }
  for (const [stage, keyResponse] of [
    ['jwks_fetch', new Response(null, { status: 503 })],
    ['jwks_format', Response.json({ keys: {} })],
    ['signing_key_import', Response.json({ keys: [{ ...jwk, n: undefined }] })],
  ]) {
    const verifier = createAccessVerifier(async () => keyResponse, (...args) => stages.push(args));
    assert.equal(await verifier(request('/'), config), null);
    assert.deepEqual(stages.pop(), [stage]);
  }
  assert.equal(await authenticate(request('/'), config), issuer + '#owner-id');
  assert.deepEqual(stages, []);
});
