import {test} from 'node:test';
import assert from 'node:assert/strict';
import {items,select,toggle} from './public/model.mjs';
test('combined search, categories and favorites', () => {
  assert.deepEqual(select(items,'rug','Textiles',['rug'],true).map(x=>x.id),['rug']);
  assert.equal(select(items,'rug','Art',[],false).length,0);
  assert.equal(select(items,'','',[],true).length,0);
  assert.deepEqual(toggle(toggle([],'rug'),'rug'),[]);
});
