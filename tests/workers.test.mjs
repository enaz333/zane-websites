import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import club from '../workers/club.mjs';
import personal from '../workers/personal.mjs';
import prefixedSite from '../workers/prefixed-site.mjs';

const config = site => JSON.parse(readFileSync(new URL(`../sites/${site}/wrangler.json`, import.meta.url)));
const request = (path, method = 'GET') => new Request('https://local.test' + path, { method });

const mockAssets = paths => ({
  fetch(req) {
    const url = new URL(req.url);
    const exists = paths.includes(url.pathname);
    return new Response(req.method === 'HEAD' ? null : url.pathname + url.search, {
      status: exists ? 200 : 404,
    });
  },
});

test('Club aliases take precedence, preserve queries and leave BuildFest local', async () => {
  const env = { ...config('club').vars, ASSETS: mockAssets([
    '/index.html', '/redesign.html', '/buildfest/index.html', '/buildfest/gallery.html',
  ]) };
  for (const base of ['/PhotoNotes', '/photonotes', '/photo-notes']) {
    for (const suffix of ['', '/', '/index.html']) {
      const res = await club.fetch(request(base + suffix + '?card=1'), env);
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), env.PERSONAL_ORIGIN + '/PhotoNotes?card=1');
    }
  }
  for (const [prefix, origin] of [['/acl', env.ACL_ORIGIN], ['/coachella', env.COACHELLA_ORIGIN]]) {
    for (const suffix of ['', '/', '/donate/gaza/', '/sample-exportify/Exportify_Test.zip']) {
      const res = await club.fetch(request(prefix + suffix + '?source=archive'), env);
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), origin + prefix + (suffix || '/') + '?source=archive');
    }
  }
  const buildFest = await club.fetch(request('/BuildFest?x=1'), env);
  assert.equal(buildFest.status, 301);
  assert.equal(buildFest.headers.get('location'), 'https://local.test/buildfest/?x=1');
  for (const path of ['/', '/redesign.html', '/buildfest/', '/buildfest/gallery.html']) {
    assert.equal((await club.fetch(request(path), env)).status, 200);
  }
  assert.equal((await club.fetch(request('/acl-other'), env)).status, 404);
});

test('Personal serves QR routes through the binding on the original URL', async () => {
  const env = {
    ASSETS: mockAssets(['/index.html', '/thanks/index.html']),
    PHOTO_NOTES: { fetch: req => prefixedSite.fetch(req, {
      ...config('photo-notes').vars,
      ASSETS: mockAssets(['/PhotoNotes/index.html', '/PhotoNotes/test.txt']),
    }) },
  };
  for (const suffix of ['', '/', '/index.html']) {
    const res = await personal.fetch(request('/PhotoNotes' + suffix + '?card=1'), env);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '/PhotoNotes/index.html?card=1');
  }
  const alias = await personal.fetch(request('/photo-notes/index.html?card=1'), env);
  assert.equal(alias.status, 302);
  assert.equal(alias.headers.get('location'), 'https://local.test/PhotoNotes?card=1');
  assert.equal((await personal.fetch(request('/PhotoNotes/test.txt', 'HEAD'), env)).status, 200);
  assert.equal((await personal.fetch(request('/PhotoNotes/missing'), env)).status, 404);
  assert.equal((await personal.fetch(request('/PhotoNotes', 'POST'), env)).status, 405);
  assert.equal((await personal.fetch(request('/thanks/'), env)).status, 200);
  assert.equal((await personal.fetch(request('/thanks/', 'POST'), env)).status, 503);
  assert.equal((await personal.fetch(request('/missing'), env)).status, 404);
});

test('Standalone roots redirect and prefixed HTML retains explicit file URLs', async () => {
  for (const site of ['acl', 'coachella', 'photo-notes']) {
    const vars = config(site).vars;
    const entry = vars.SITE_PREFIX + '/index.html';
    const env = { ...vars, ASSETS: mockAssets([entry]) };
    const root = await prefixedSite.fetch(request('/?x=1'), env);
    assert.equal(root.status, 302);
    assert.equal(root.headers.get('location'), 'https://local.test' + vars.SITE_PREFIX + '/?x=1');
    assert.equal((await prefixedSite.fetch(request(entry), env)).status, 200);
    assert.equal((await prefixedSite.fetch(request(vars.SITE_PREFIX + '/'), env)).status, 200);
  }
});

test('Personal redirects exact registered short URLs and preserves the query', async () => {
  const env = { ASSETS: mockAssets([]) };
  for (const slug of ['acl', 'coachella']) {
    for (const slash of ['', '/']) {
      const response = await personal.fetch(request(`/${slug}${slash}?q=a%2Bb&tag=one&tag=two`), env);
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('Location'),
                   `https://${slug}.zanegiordano.com/${slug}/?q=a%2Bb&tag=one&tag=two`);
    }
  }
  for (const path of ['/unknown', '/acl/extra', '/ACL', '/acl//', '/api', '/BuildFest']) {
    assert.equal((await personal.fetch(request(path), env)).status, 404);
  }
  const staged = await personal.fetch(request('/acl'), {
    ...env, STAGING_PROJECT_ORIGINS: { acl: 'https://staged-acl.example' },
  });
  assert.equal(staged.headers.get('Location'), 'https://staged-acl.example/acl/');
});
