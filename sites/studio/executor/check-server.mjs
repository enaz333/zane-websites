import { timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, cp, mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyCopy, copyDigest, path, sha } from '../../../workers/studio-copy.mjs';

const local = Boolean(process.env.STUDIO_CHECK_SOURCE);
const source = process.env.STUDIO_CHECK_SOURCE || '/studio-source';
const base = process.env.STUDIO_CHECK_BASE;
const secret = process.env.STUDIO_CHECK_SECRET;
if (!sha(base) || !secret || secret.length < 32) throw new Error('Configure validator before serving');
const checks = [
  ['python3', ['scripts/validate.py']],
  ['python3', ['scripts/projects.py', 'validate']],
  ['python3', ['-m', 'unittest', 'discover', '-s', 'tests', '-v']],
  ['python3', ['scripts/studio_paths.py', '--check']],
  ['node', ['--test', ...(await readdir(join(source, 'tests'))).filter(name => name.endsWith('.test.mjs')).sort().map(name => 'tests/' + name)]],
  ['python3', ['scripts/release_studio.py', 'dry-run']],
];
const snapshot = await readFile(join(source, path), 'utf8');
let busy = false;

function run(command, args, cwd, timeout) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, detached: true, stdio: 'ignore',
      env: { PATH: local ? process.env.PATH : '/usr/local/bin:/usr/bin:/bin', HOME: cwd, CI: 'true', WRANGLER_SEND_METRICS: 'false' } });
    const timer = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ }
    }, timeout);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); resolve(code === 0); });
  });
}

createServer({ headersTimeout: 10_000, requestTimeout: 10_000, connectionsCheckingInterval: 1000, maxHeaderSize: 8192 }, async (request, response) => {
  const reply = (status, data) => {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(data));
  };
  if (request.method !== 'POST' || request.url !== '/check') return reply(404, {});
  const auth = Buffer.from(request.headers.authorization ?? '');
  const expected = Buffer.from('Bearer ' + secret);
  if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) return reply(403, {});
  if (busy) return reply(503, {});
  busy = true;
  let folder;
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 2048) return reply(413, {});
      chunks.push(chunk);
    }
    let body, updated;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString());
      if (body.base !== base || Object.keys(body).sort().join() !== 'base,replacement') return reply(400, {});
      updated = applyCopy(snapshot, body.replacement);
    } catch { return reply(400, {}); }
    const deadline = Date.now() + 270_000;
    folder = await mkdtemp(join(tmpdir(), 'studio-check-'));
    await cp(source, folder, { recursive: true, filter: file => file !== join(source, 'node_modules') });
    // Use dependencies installed from the exact revision at image build time.
    await cp(join(source, 'node_modules'), join(folder, 'node_modules'), { recursive: true, verbatimSymlinks: true });
    await writeFile(join(folder, path), updated);
    for (const [command, args] of checks) {
      if (Date.now() >= deadline || !await run(command, args, folder, deadline - Date.now())) {
        return reply(200, { base, passed: false });
      }
    }
    const checked = await readFile(join(folder, path), 'utf8');
    if (checked !== updated) return reply(200, { base, passed: false });
    return reply(200, { base, passed: true, digest: await copyDigest(checked) });
  } catch {
    return reply(500, {});
  } finally {
    try { if (folder) await rm(folder, { recursive: true, force: true }); } finally { busy = false; }
  }
}).listen(Number(process.env.PORT || 8080), local ? '127.0.0.1' : '0.0.0.0');
