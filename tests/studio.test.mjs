import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test, before, after } from 'node:test';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import production, { createStudio } from '../workers/studio.mjs';
import { claimExecution, transitionExecution, expireExecutions } from '../workers/studio-execution.mjs';
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
  for (const name of ['0001_tasks.sql', '0002_execution.sql', '0003_dispatch.sql']) {
    const migration = await readFile(new URL(`../sites/studio/migrations/${name}`, import.meta.url), 'utf8');
    await db.batch(migration.trim().split(/;\s*(?=CREATE )/).map(sql => db.prepare(sql)));
  }
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
  for (const [stage, keyResponse, status] of [
    ['jwks_http_status', new Response(null, { status: 503 }), 503],
    ['jwks_redirect', Response.redirect('https://example.net/'), 302],
    ['jwks_format', new Response('not JSON')],
    ['jwks_format', Response.json({ keys: {} })],
    ['signing_key_import', Response.json({ keys: [{ ...jwk, n: undefined }] })],
  ]) {
    const verifier = createAccessVerifier(async () => keyResponse, (...args) => stages.push(args));
    assert.equal(await verifier(request('/'), config), null);
    assert.deepEqual(stages.pop(), status === undefined ? [stage] : [stage, status]);
  }
  for (const timedOut of [false, true]) {
    const verifier = createAccessVerifier(async () => { throw new Error('private exception detail'); },
      (...args) => stages.push(args));
    const timeout = AbortSignal.timeout;
    try {
      if (timedOut) AbortSignal.timeout = () => AbortSignal.abort();
      assert.equal(await verifier(request('/'), config), null);
      assert.deepEqual(stages.pop(), [timedOut ? 'jwks_timeout' : 'jwks_fetch_exception']);
    } finally {
      AbortSignal.timeout = timeout;
    }
  }
  assert.equal(await authenticate(request('/'), config), issuer + '#owner-id');
  assert.deepEqual(stages, []);
});

test('Workers runtime retrieves keys and verifies a signed Access token', async () => {
  const source = await readFile(new URL('../workers/studio-auth.mjs', import.meta.url), 'utf8');
  const runtime = new Miniflare(convertV4MiniflareOptions({ workers: [
    {
      name: 'studio-auth', compatibilityDate: '2026-11-12', outboundService: 'certs',
      modules: [
        { type: 'ESModule', path: 'auth-test.mjs', contents: `
          import { createAccessVerifier } from './studio-auth.mjs';
          const verify = createAccessVerifier();
          export default { async fetch(request, env) {
            return new Response(await verify(request, env) ? 'verified' : 'denied');
          }};
        ` },
        { type: 'ESModule', path: 'studio-auth.mjs', contents: source },
      ],
      bindings: config,
    },
    {
      name: 'certs', modules: true, bindings: { jwk, issuer },
      script: `export default { fetch(request, env) {
        if (request.url !== env.issuer + '/cdn-cgi/access/certs') return new Response(null, { status: 404 });
        return Response.json({ keys: [env.jwk] });
      }};`,
    },
  ] }));
  try {
    const response = await runtime.dispatchFetch(origin + '/', {
      headers: { 'Cf-Access-Jwt-Assertion': good },
    });
    assert.equal(await response.text(), 'verified');
  } finally {
    await runtime.dispose();
  }
});

const copy = { ...edit, project: 'personal', page: '/' };

test('enabled queue is durable, prioritizes ASAP, fences claims and audits results', async () => {
  const queued = createStudio(verify, { queueEdits: true });
  const call = (path, options) => queued.fetch(request(path, options), { ...config, DB: db });
  const submit = async (body, key) => (await (await call('/api/tasks', { body, key })).json()).task;
  const key = crypto.randomUUID();
  const economy = await submit(copy, key);
  assert.equal(economy.status, 'queued');
  assert.equal((await submit(copy, key)).id, economy.id);
  const urgent = await submit({ ...copy, asap: true });
  const now = new Date(Date.now() + 16 * 60_000);
  const jobs = await Promise.all([claimExecution(db, now), claimExecution(db, now)]);
  assert.deepEqual(new Set(jobs.map(job => job.id)), new Set([urgent.id, economy.id]));
  const job = jobs.find(row => row.id === urgent.id);
  assert.equal(await claimExecution(db, now), null);
  assert.equal((await call(`/api/tasks/${urgent.id}/cancel`, { method: 'POST' })).status, 409);
  assert.equal(await transitionExecution(db, job.id, 'wrong-claim', 'validating', {}, now), false);
  assert.equal(await transitionExecution(db, job.id, job.claim, 'pr_ready', { prNumber: 123 }, now), false);
  assert.equal(await transitionExecution(db, job.id, job.claim, 'validating', {}, now), true);
  assert.equal(await transitionExecution(db, job.id, job.claim, 'pr_ready', { prNumber: 123 }, now), true);
  const later = new Date(now.getTime() + 15 * 60_000);
  const other = jobs.find(row => row.id === economy.id);
  assert.equal(await transitionExecution(db, other.id, other.claim, 'validating', {}, later), false);
  await expireExecutions(db, later);
  const { tasks } = await (await call('/api/tasks')).json();
  const ready = tasks.find(row => row.id === urgent.id);
  assert.equal(ready.pr_number, 123);
  assert.equal(ready.check_status, 'passed');
  assert.equal(ready.status, 'pr_ready');
  assert.equal(ready.claim_id, undefined);
  assert.equal(tasks.find(row => row.id === economy.id).failure_code, 'lease_expired');
  const audit = await db.prepare('SELECT state FROM execution_events WHERE task_id = ? ORDER BY id').bind(job.id).all();
  assert.deepEqual(audit.results.map(row => row.state), ['queued', 'running', 'validating', 'pr_ready']);

  const pending = await submit(copy);
  const cancelled = await call(`/api/tasks/${pending.id}/cancel`, { method: 'POST' });
  assert.equal((await cancelled.json()).task.status, 'cancelled');
  assert.equal(await claimExecution(db, new Date(later.getTime() + 1000)), null);
});

test('an eligible ASAP request is claimed before an older economy request', async () => {
  const queued = createStudio(verify, { queueEdits: true });
  const submit = async body => (await (await queued.fetch(request('/api/tasks', { body }),
    { ...config, DB: db })).json()).task;
  const economy = await submit(copy);
  const urgent = await submit({ ...copy, asap: true });
  const now = new Date(Date.now() + 16 * 60_000);
  assert.equal((await claimExecution(db, now)).id, urgent.id);
  assert.equal((await claimExecution(db, now)).id, economy.id);
});

test('dispatcher rejects unapproved origins and reports only fixed configuration codes', async () => {
  const { configured, tick } = await import('../workers/studio-dispatch.mjs');
  const origin = 'https://studio-validator-staging-7a3kki4cka-uc.a.run.app';
  const env = {
    DB: { withSession: () => assert.fail('Invalid config reached D1') },
    STUDIO_EXECUTION_ENABLED: 'true', STUDIO_STAGING_ID: crypto.randomUUID(),
    STUDIO_TEST_TASK_ID: crypto.randomUUID(), STUDIO_BASE_SHA: 'a'.repeat(40),
    STUDIO_CHECK_ORIGIN: origin, STUDIO_CHECK_SECRET: 'x'.repeat(32),
    STUDIO_OPENAI_KEY: 'fixture-key', STUDIO_GITHUB_PRIVATE_KEY: 'PRIVATE KEY-----',
    STUDIO_GITHUB_APP_ID: '1', STUDIO_GITHUB_INSTALLATION_ID: '2',
    STUDIO_RATE_CARD: 'gpt-6-luna:standard:0.10:0.01:0.125:0.50:0.20:0.02:0.25:0.75',
    STUDIO_RUN_MICROS: '262548', STUDIO_MONTH_MICROS: '262548',
  };
  assert.equal(configured(env), true);
  const warnings = [];
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    for (const value of [undefined, 'https://example.run.app', origin.replace('https:', 'http:'),
      origin + '/', origin + ':443', origin + '/check?token=fixture-key', origin + '@example.com',
      origin + '.example.com', origin + '\n']) {
      await tick({ ...env, STUDIO_CHECK_ORIGIN: value }, { fetcher: () => assert.fail('Unexpected request') });
      assert.deepEqual(warnings.pop(), ['studio_dispatch_config', 'invalid_validator_origin']);
    }
    await tick({ ...env, STUDIO_CHECK_SECRET: 'short-fixture' }, { fetcher: () => assert.fail('Unexpected request') });
    assert.deepEqual(warnings.pop(), ['studio_dispatch_config', 'invalid_checker_secret']);
    await tick({ ...env, STUDIO_EXECUTION_ENABLED: 'false' }, { fetcher: () => assert.fail('Unexpected request') });
    assert.deepEqual(warnings, []);
  } finally {
    console.warn = warn;
  }
});

test('staging verifier accepts only its configured staging host and Access audience', async () => {
  const stagingOrigin = 'https://studio-staging.zanegiordano.com';
  const stagingAud = 'staging-audience';
  const stagingVerifier = createAccessVerifier(async () => Response.json({ keys: [jwk] }), undefined, stagingOrigin);
  const env = { ...config, STUDIO_ORIGIN: stagingOrigin, ACCESS_AUD: stagingAud };
  const header = value => ({ headers: { 'Cf-Access-Jwt-Assertion': value } });
  const stagingToken = await token({ aud: [stagingAud] });
  assert.equal(await stagingVerifier(new Request(stagingOrigin, header(stagingToken)), env), issuer + '#owner-id');
  assert.equal(await stagingVerifier(new Request(stagingOrigin, header(good)), env), null);
  assert.equal(await stagingVerifier(new Request(origin, header(stagingToken)), env), null);
  assert.equal(await verify(new Request(stagingOrigin, header(stagingToken)), env), null);
});
