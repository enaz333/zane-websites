import { Buffer } from 'node:buffer';
import { createSign } from 'node:crypto';
import { applyCopy, path, repo, sha } from './studio-copy.mjs';

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const github = 'https://api.github.com';
const project = '/repos/' + repo;

async function call(fetcher, route, { token, data, missing = false } = {}) {
  const response = await fetcher(github + route, {
    method: data ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Zane-Studio',
      'X-GitHub-Api-Version': '2026-03-10', ...(token && { Authorization: 'Bearer ' + token }),
      ...(data && { 'Content-Type': 'application/json' }) },
    ...(data && { body: JSON.stringify(data) }),
  });
  if (missing && response.status === 404) return null;
  if (!response.ok) throw new Error('GitHub request failed');
  const result = await response.json();
  if (result === null || typeof result !== 'object') throw new Error('Invalid GitHub response');
  return result;
}

export async function sourceAt(base, file, fetcher = fetch) {
  if (!sha(base)) throw new Error('Invalid revision');
  const result = await call(fetcher, project + '/contents/' + file + '?ref=' + base);
  if (result?.type !== 'file' || result.encoding !== 'base64' ||
      !Number.isSafeInteger(result.size) || result.size < 0 || result.size > 32_000 ||
      typeof result.content !== 'string' || result.content.length > 48_000) throw new Error('Invalid source');
  const encoded = result.content.replace(/[\r\n]/g, '');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length !== result.size || bytes.toString('base64') !== encoded) throw new Error('Invalid source');
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
}

export async function appToken(env, fetcher = fetch, now = Math.floor(Date.now() / 1000)) {
  const payload = encode({ alg: 'RS256', typ: 'JWT' }) + '.' + encode({
    iss: env.STUDIO_GITHUB_APP_ID, iat: now - 30, exp: now + 540,
  });
  const signature = createSign('RSA-SHA256').update(payload)
    .sign(env.STUDIO_GITHUB_PRIVATE_KEY, 'base64url');
  const result = await call(fetcher, '/app/installations/' + env.STUDIO_GITHUB_INSTALLATION_ID + '/access_tokens', {
    token: payload + '.' + signature,
    data: { repositories: ['zane-websites'], permissions: { contents: 'write', pull_requests: 'write' } },
  });
  if (typeof result?.token !== 'string' || !result.token) throw new Error('No installation token');
  return result.token;
}

export async function publish(run, source, token, fetcher = fetch, { canPublish = () => true } = {}) {
  if (!sha(run.base_sha) || !/^[a-f0-9-]{36}$/.test(run.task_id)) throw new Error('Invalid run');
  const content = applyCopy(source, run.replacement);
  const branch = 'studio/copy-' + run.task_id;
  const get = (route, options) => call(fetcher, project + route, { token, ...options });
  const post = (route, data) => get(route, { data });
  const pulls = () => get('/pulls?state=all&head=' + encodeURIComponent('enaz333:' + branch));
  const prs = await pulls();
  if (!Array.isArray(prs)) throw new Error('Invalid pull request list');
  if (prs.length) {
    const [pr] = prs;
    const revision = pr?.head?.sha;
    if (prs.length !== 1 || pr?.draft !== true || pr.state !== 'open' || pr.base?.ref !== 'main' || !sha(revision) ||
        !Number.isSafeInteger(pr.number) || pr.number < 1) throw new Error('Unexpected pull request');
    const ref = await get('/git/ref/heads/' + branch);
    const diff = await get('/commits/' + revision);
    if (ref.object.sha !== revision || diff.parents?.length !== 1 || diff.parents[0].sha !== run.base_sha ||
        diff.files?.length !== 1 || diff.files[0].filename !== path || diff.files[0].status !== 'modified' ||
        await sourceAt(revision, path, fetcher) !== content) throw new Error('Unexpected PR contents');
    return pr.number;
  }
  if (!canPublish()) return null;
  // Avoid testing against one tree and proposing against a different main.
  const mainMatches = async () => {
    const revision = (await get('/git/ref/heads/main')).object?.sha;
    if (!sha(revision)) throw new Error('Invalid main ref');
    return revision === run.base_sha;
  };
  if (!await mainMatches()) return null;
  const parent = await get('/git/commits/' + run.base_sha);
  if (!sha(parent?.tree?.sha)) throw new Error('Invalid parent tree');
  const tree = await post('/git/trees', { base_tree: parent.tree.sha,
    tree: [{ path, mode: '100644', type: 'blob', content }] });
  if (!sha(tree?.sha)) throw new Error('Invalid tree');
  const identity = { name: 'Zane Studio', email: 'studio@zanegiordano.com', date: run.started_at };
  const commit = await post('/git/commits', { message: 'Edit the Personal site projects heading',
    tree: tree.sha, parents: [run.base_sha], author: identity, committer: identity });
  if (!sha(commit.sha)) throw new Error('Invalid commit');
  const ref = await get('/git/ref/heads/' + branch, { missing: true });
  if (ref !== null && ref?.object?.sha !== commit.sha) throw new Error('Unexpected branch head');
  if (!canPublish()) return null;
  if (ref === null) {
    const created = await post('/git/refs', { ref: 'refs/heads/' + branch, sha: commit.sha });
    if (created?.object?.sha !== commit.sha) throw new Error('Unexpected created branch');
  }

  if (!await mainMatches() || !canPublish()) return null;
  const pr = await post('/pulls', { base: 'main', head: branch, draft: true,
    title: 'Edit the Personal site projects heading',
    body: 'Studio proposed a one-heading copy edit. The isolated runner passed the repository checks. Review the diff before merging.' });
  if (pr?.draft !== true || pr.state !== 'open' || pr.base?.ref !== 'main' || pr.head?.sha !== commit.sha ||
      !Number.isSafeInteger(pr.number) || pr.number < 1) throw new Error('Unexpected pull request');
  return pr.number;
}
