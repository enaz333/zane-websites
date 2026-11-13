import assert from 'node:assert/strict';
import { test } from 'node:test';
import { budget, propose } from '../workers/studio-provider.mjs';

const env = {
  STUDIO_OPENAI_KEY: 'fixture',
  STUDIO_RATE_CARD: 'gpt-6-luna:standard:0.10:0.01:0.125:0.50:0.20:0.02:0.25:0.75',
  STUDIO_RUN_MICROS: '262548',
  STUDIO_MONTH_MICROS: '262548',
};
const result = {
  model: 'gpt-6-luna', status: 'completed', service_tier: 'default',
  usage: { input_tokens: 1_050_000, input_tokens_details: { cache_write_tokens: 1_050_000 }, output_tokens: 64 },
  output: [{ type: 'message', content: [{ type: 'output_text', text: '{"replacement":"Selected projects"}' }] }],
};
const proposeWith = response => propose(env, {}, { description: 'Fixture' }, async () => Response.json(response));

test('Luna reserves the full long-context cache-write and output ceiling', async () => {
  assert.equal(budget(env).reservation, 262548);
  assert.equal(budget(env).month, 262548);
  for (const override of [
    { STUDIO_RATE_CARD: env.STUDIO_RATE_CARD.replace('0.75', '0.76') },
    { STUDIO_RATE_CARD: env.STUDIO_RATE_CARD.replace('0.125', '0.126') },
    { STUDIO_RATE_CARD: env.STUDIO_RATE_CARD.replace('gpt-6-luna', 'gpt-6-sol') },
    { STUDIO_RUN_MICROS: '262547' },
    { STUDIO_MONTH_MICROS: '262547' },
    { STUDIO_RUN_MICROS: undefined },
    { STUDIO_MONTH_MICROS: undefined },
  ]) {
    const config = { ...env, ...override };
    assert.equal(budget(config), null);
    await assert.rejects(propose(config, {}, {}, () => assert.fail('Unexpected request')), /Unapproved/);
  }
});

test('Luna accepts only the reviewed model, tier, completed output and bounded usage', async () => {
  assert.equal((await proposeWith(result)).replacement, 'Selected projects');
  for (const override of [
    { model: 'gpt-6-sol' }, { service_tier: 'fast' }, { status: 'incomplete' },
    { usage: { ...result.usage, input_tokens: 1_050_001 } },
    { usage: { ...result.usage, output_tokens: 65 } },
    { usage: { ...result.usage, output_tokens_details: { reasoning_tokens: 1 } } },
    { usage: { ...result.usage, input_tokens_details: { cache_write_tokens: 1_050_001 } } },
  ]) {
    await assert.rejects(proposeWith({ ...result, ...override }), /Unexpected model result/);
  }
  await assert.rejects(propose(env, {}, { description: 'é'.repeat(32_000) },
    () => assert.fail('Oversized request reached the provider')), /Context too large/);
});
