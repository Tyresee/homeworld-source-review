import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveLookDevBuild} from '../scripts/qa/look-dev-runtime.mjs';
import {createLookDevFixture} from '../scripts/qa/look-dev-fixtures.mjs';
import {validateHomeState} from '../public/js/home-engine.js';
import {resolveHomeWallFinish} from '../public/js/home-wall-finishes.js';

const preset=async id=>JSON.parse(await readFile(new URL('../scripts/qa/look-dev-presets/'+id+'.json',import.meta.url),'utf8'));
test('warm-walls defines independent white/plain walls for all nine rooms while retaining floors and v6 lighting',async()=>{
  const walls=await preset('warm-walls'),floors=await preset('warm-floors');
  assert.equal(walls.build.theme.id,'warm');assert.equal(Object.keys(walls.build.theme.rooms).length,9);
  assert.deepEqual(walls.render,floors.render);assert.deepEqual(walls.backdrop,floors.backdrop);assert.deepEqual(walls.build.furniture,floors.build.furniture);
  for(const [kind,role]of Object.entries(walls.build.theme.rooms)){
    assert.equal(role.wallStyleId,'wall-plain');assert.equal(role.wallColorId,'wall-warm-white');assert.equal(role.wall,null);assert.equal(role.wallMaterial,null);
    assert.equal(role.floorFinishId,floors.build.theme.rooms[kind].floorFinishId);
  }
});
test('lookdev applies real wall IDs to each isolated room and global shell without changing furniture, prices or revisions',async()=>{
  const value=await preset('warm-walls');
  for(const id of ['living','bedroom','kitchen','bathroom']){
    const fixture=createLookDevFixture(id),before=structuredClone(fixture.floors);
    value.build.theme.rooms[id].wallStyleId='wall-dots';value.build.theme.rooms[id].wallColorId='wall-apricot';
    resolveLookDevBuild(fixture,value);
    for(const [i,floor]of fixture.floors.entries()){
      assert.equal(validateHomeState(floor),true);assert.equal(floor.revision,before[i].revision);assert.deepEqual(floor.furniture,before[i].furniture);
      for(const room of floor.rooms)if(room.wall){assert.equal(room.wall.styleId,'wall-dots');assert.equal(room.wall.colorId,'wall-apricot');}else assert.equal(room.id,'living');
      for(const name of ['wall.inner','wall.outer','wall.side']){assert.equal(floor.surfaces[name].styleId,'wall-dots');assert.equal(floor.surfaces[name].colorId,'wall-apricot');}
    }
  }
});
test('lookdev custom wall color clears only its color ID and invalid IDs fail before rendering',async()=>{
  const value=await preset('warm-walls'),role=value.build.theme.rooms.bedroom;
  role.wall='#326a7a';role.wallStyleId='wall-stripe-fine';role.wallColorId=null;
  const fixture=createLookDevFixture('bedroom');resolveLookDevBuild(fixture,value);
  const skin=fixture.floors[0].rooms[0].wall,finish=resolveHomeWallFinish('bedroom',skin,{themeId:'warm'});
  assert.equal(skin.colorId,undefined);assert.equal(finish.color,'#326a7a');assert.equal(finish.styleId,'wall-stripe-fine');
  role.wallStyleId='unknown-wall-style';assert.throws(()=>resolveLookDevBuild(createLookDevFixture('bedroom'),value),/Unknown wall finish/);
});
