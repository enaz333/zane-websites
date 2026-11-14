import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Buffer } from 'node:buffer';
import { tick } from '../workers/studio-dispatch.mjs';

const task = 'd8220ea5-6e14-4397-9fec-0e866f8c13d7';
const base = 'a'.repeat(40);
const now = () => new Date('2026-11-13T22:00:00Z');
const env = {
  STUDIO_EXECUTION_ENABLED: 'true', STUDIO_STAGING_ID: 'b034fcf2-2420-4ddc-8adc-3a88a649d37d',
  STUDIO_TEST_TASK_ID: task, STUDIO_BASE_SHA: base,
  STUDIO_RATE_CARD: 'gpt-6-luna:standard:0.10:0.01:0.125:0.50:0.20:0.02:0.25:0.75',
  STUDIO_RUN_MICROS: '262548', STUDIO_MONTH_MICROS: '262548',
  STUDIO_CHECK_ORIGIN: 'https://studio-validator-staging-7a3kki4cka-uc.a.run.app',
  STUDIO_CHECK_SECRET: 'a'.repeat(32), STUDIO_OPENAI_KEY: 'fixture',
  STUDIO_GITHUB_APP_ID: '1', STUDIO_GITHUB_INSTALLATION_ID: '2', STUDIO_GITHUB_PRIVATE_KEY: 'PRIVATE KEY-----',
};

test('prepare errors log fixed codes and leave the model unsent', async t => {
  const payload = 'fixture-private-payload';
  const source = '<h2 id="projects-title">A little of everything.</h2>';
  const okSource = () => Response.json({
    type: 'file', encoding: 'base64', size: Buffer.byteLength(source), content: Buffer.from(source).toString('base64'),
  });
  for (const stage of ['github_source', 'validator']) {
    for (const [suffix, fail, status] of [
      ['request_error', () => { throw new Error(payload); }, null],
      ['timeout', () => { throw new DOMException(payload, 'TimeoutError'); }, null],
      ['http_error', () => new Response(payload, { status: 403 }), 403],
      ['http_error', () => new Response(payload, { status: 201 }), 201],
      ['invalid_response', () => new Response(payload), null],
      ['invalid_response', () => Response.json(null), null],
      ...(stage === 'validator' ? [
        ['invalid_response', () => Response.json({ base: 'b'.repeat(40), passed: true }), null],
        ['invalid_response', () => Response.json({ base, passed: true, digest: '0'.repeat(64) }), null],
      ] : []),
      ['invalid_response', () => Response.json({ type: 'file', encoding: 'base64', size: 4, content: 'dGVzdA==!' }), null],
    ]) {
      await t.test(stage + '_' + suffix + (status ?? ''), async sub => {
        const updates = [];
        const run = { task_id: task, lock_id: 'fixture-lock', base_sha: base, phase: 'prepare',
          deadline: '2026-11-13T23:00:00Z', month: '2026-11', attempts: 1, description: payload };
        const db = {
          batch: async () => {},
          prepare: sql => ({ bind: () => ({
            first: async () => run,
            all: async () => { updates.push(sql); return { results: [{ task_id: task }] }; },
          }) }),
        };
        const warnings = sub.mock.method(console, 'warn', () => {});
        await tick({ ...env, DB: { withSession: () => db } }, { now, fetcher: async url => {
          const host = new URL(url).hostname;
          if (host === 'api.github.com') return stage === 'github_source' ? fail() : okSource();
          assert.equal(url, env.STUDIO_CHECK_ORIGIN + '/check');
          assert.equal(stage, 'validator');
          return fail();
        } });
        assert.deepEqual(warnings.mock.calls.map(call => call.arguments),
          [['studio_dispatch_prepare', stage + '_' + suffix, status]]);
        assert.equal(updates.length, 1);
        assert.match(updates[0], /SET lock_until =/);
      });
    }
  }
});
