import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FLOOR_FINISHES,DEFAULT_ROOM_FLOOR_FINISHES} from '../public/js/home-floor-finishes.js';
import {HOME_THEMES,resolveHomeTheme,preserveHomeTheme} from '../public/js/home-theme.js';

test('warm is an explicit candidate and survives navigation without becoming the default',()=>{
  assert.equal(resolveHomeTheme().id,'default');
  assert.equal(resolveHomeTheme('?theme=warm').id,'warm');
  assert.equal(resolveHomeTheme('?theme=toy').id,'toy');
  assert.equal(HOME_THEMES.default.floorFinishes,undefined);
  assert.equal(HOME_THEMES.toy.floorFinishes,undefined);
  assert.equal(HOME_THEMES.warm.floorFinishes,true);
  assert.equal(preserveHomeTheme('/games/homeworld/student-homes.html','?theme=warm'),'/games/homeworld/student-homes.html?theme=warm');
});
test('warm-floors preset assigns every required room default using only catalogue finish ids',async()=>{
  const value=JSON.parse(await readFile(new URL('../scripts/qa/look-dev-presets/warm-floors.json',import.meta.url),'utf8'));
  assert.equal(value.id,'warm-floors');assert.equal(value.build.theme.id,'warm');
  const ids=new Set(FLOOR_FINISHES.map(row=>row.id));
  assert.equal(ids.size,14);
  for(const[kind,id]of Object.entries(DEFAULT_ROOM_FLOOR_FINISHES)){
    assert.equal(value.build.theme.rooms[kind].floorFinishId,id);assert.ok(ids.has(id));
  }
  assert.equal(value.build.theme.rooms.living.floorFinishId,'wood-light-oak');
  assert.deepEqual(value.build.furniture,{mode:'default',examples:{}});
});
