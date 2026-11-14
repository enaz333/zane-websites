import {test} from 'node:test';
import assert from 'node:assert/strict';
import {habits,completion,toggle} from './public/model.mjs';
test('habit progress follows checked items', () => {
  assert.equal(completion([]),0);
  assert.equal(completion(habits),100);
  assert.equal(completion(toggle([],habits[0])),33);
  assert.deepEqual(toggle(toggle([],habits[0]),habits[0]),[]);
});
