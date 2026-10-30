import test from 'node:test';
import assert from 'node:assert/strict';
import {getWarmFloorMenu} from '../public/js/student-home-floor-menu.js';
import {createHomeState} from '../public/js/home-engine.js';
import {createRoom} from '../public/js/home-layout.js';
import {FLOOR_FINISHES} from '../public/js/home-floor-finishes.js';

const floor=()=>createHomeState({profile:'account'});
test('new floor choices are opt-in and only target real current-floor surfaces',()=>{
  const homeFloor=floor(),onSelect=()=>{};
  for(const id of ['default','toy',undefined])assert.equal(getWarmFloorMenu({homeFloor,surfaceId:'floor.main',onSelect,theme:{id}}),null);
  for(const surfaceId of ['wall.inner','furniture:any','room:missing.floor','room:living.floor','room:bedroom.wall',null])assert.equal(getWarmFloorMenu({homeFloor,surfaceId,onSelect,theme:{id:'warm'}}),null);
});
test('warm floor flyout has six wood and eight tile samples with a real-renderer preview callback',async()=>{
  const homeFloor=floor(),before=structuredClone(homeFloor),selected=[],previewed=[];
  const menu=getWarmFloorMenu({homeFloor,surfaceId:'floor.main',theme:{id:'warm'},onSelect:finish=>selected.push(finish.id),getPreview:finish=>{previewed.push(finish);return 'texture-source-reference';}});
  assert.equal(menu.id,'floor-finish');assert.equal(menu.children.length,14);
  assert.equal(menu.children.filter(item=>item.group==='wood').length,6);assert.equal(menu.children.filter(item=>item.group==='tile').length,8);
  assert.deepEqual(menu.children.map(item=>item.id),FLOOR_FINISHES.map(item=>item.id));
  assert.ok(menu.children.every(item=>item.swatchColor===FLOOR_FINISHES.find(finish=>finish.id===item.id).color&&/DisplayText4714/.test(item.detail)));
  assert.equal(previewed.length,0,'opening a menu does not eagerly generate every texture');
  assert.equal(await menu.children[0].image(),'texture-source-reference');assert.equal(previewed[0],FLOOR_FINISHES[0]);
  menu.children.at(-1).action();assert.deepEqual(selected,[FLOOR_FINISHES.at(-1).id]);assert.deepEqual(homeFloor,before);
});
test('saved room finish is selected independently of every other room and the public floor',()=>{
  const homeFloor=floor();homeFloor.rooms.push(createRoom('bedroom',0,0,'private-bedroom'));
  homeFloor.rooms.at(-1).floor.finishId=FLOOR_FINISHES[2].id;
  const menu=getWarmFloorMenu({homeFloor,surfaceId:'room:private-bedroom.floor',theme:{id:'warm'},onSelect(){}});
  assert.deepEqual(menu.children.filter(item=>item.current).map(item=>item.id),[FLOOR_FINISHES[2].id]);
  const main=getWarmFloorMenu({homeFloor,surfaceId:'floor.main',theme:{id:'warm'},onSelect(){}});
  assert.equal(main.children.some(item=>item.current),false);
});
