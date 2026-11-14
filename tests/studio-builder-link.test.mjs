import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createStudio} from '../workers/studio.mjs';

test('builder discovery requires authentication and the explicit loopback entry point', async () => {
  const local = 'http://127.0.0.1:8793/api/builder';
  const denied = createStudio(async () => null, {localBuilder:true});
  assert.equal((await denied.fetch(new Request(local), {})).status,403);
  const production = createStudio(async () => 'fixture-owner');
  assert.deepEqual(await (await production.fetch(new Request(local), {})).json(), {local_url:null});
  const enabled = createStudio(async () => 'fixture-owner', {localBuilder:true});
  assert.deepEqual(await (await enabled.fetch(new Request(local), {})).json(),
    {local_url:'http://127.0.0.1:8794/'});
  assert.deepEqual(await (await enabled.fetch(new Request('https://studio.zanegiordano.com/api/builder'), {})).json(),
    {local_url:null});
});
