import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {DEFAULT_ROOM_FLOOR_FINISHES} from '../public/js/home-floor-finishes.js';

const read=name=>readFile(new URL('../scripts/qa/look-dev-presets/'+name+'.json',import.meta.url));
test('supplied v6 preset remains byte-identical to the reviewer archive',async()=>{
  const bytes=await read('warm-v6');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'69e7c65924e3af54111ce9aab2655a3adc6210f12536a9204057d162d3317d8f');
});
test('warm floors uses supplied v6 appearance with independent catalogue floors',async()=>{
  const raw=JSON.parse(await read('warm-v6')),floors=JSON.parse(await read('warm-floors'));
  assert.deepEqual(floors.render,raw.render);assert.deepEqual(floors.backdrop,raw.backdrop);
  assert.deepEqual(floors.build.theme.backdrop,raw.backdrop);
  assert.notDeepEqual(raw.build.theme.backdrop,raw.backdrop,'the source has a stale nested duplicate');
  assert.equal(floors.build.theme.id,'warm');assert.equal(floors.build.theme.surfaceRemap['floor.main'],undefined);
  assert.deepEqual(floors.build.theme.shell,raw.build.theme.shell);assert.deepEqual(floors.build.theme.manor,raw.build.theme.manor);
  for(const[kind,role]of Object.entries(raw.build.theme.rooms)){
    const actual=floors.build.theme.rooms[kind];
    for(const key of ['wall','wallMaterial','trim'])assert.equal(actual[key],role[key]);
    assert.equal(actual.floor,null);assert.equal(actual.floorMaterial,null);
    assert.equal(actual.floorFinishId,DEFAULT_ROOM_FLOOR_FINISHES[kind]);
  }
  assert.deepEqual(floors.build.furniture,{mode:'default',examples:{}});
});
