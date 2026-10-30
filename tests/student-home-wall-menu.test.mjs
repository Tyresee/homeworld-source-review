import test from 'node:test';
import assert from 'node:assert/strict';
import {getWarmWallMenu,getWallMenuTarget} from '../public/js/home-wall-menu.js';
import {createHomeState} from '../public/js/home-engine.js';
import {createRoom} from '../public/js/home-layout.js';
import {WALL_STYLES,WALL_COLORS} from '../public/js/home-wall-finishes.js';

const floor=()=>createHomeState({profile:'account'});
test('wall choices are warm-only and reject floors, missing rooms and the living alias',()=>{
  const homeFloor=floor(),onSelect=()=>{};
  for(const id of ['default','toy',undefined])assert.equal(getWarmWallMenu({homeFloor,surfaceId:'wall.inner',onSelect,theme:{id}}),null);
  for(const surfaceId of ['floor.main','furniture:any','room:missing.wall','room:living.wall','room:bedroom.floor',null]){
    assert.equal(getWallMenuTarget(homeFloor,surfaceId),null);
    assert.equal(getWarmWallMenu({homeFloor,surfaceId,onSelect,theme:{id:'warm'}}),null);
  }
  for(const surfaceId of ['wall.inner','wall.outer','wall.side'])assert.ok(getWallMenuTarget(homeFloor,surfaceId));
});
test('wall flyout shows three truthful style previews and five independent color choices',()=>{
  const homeFloor=floor();homeFloor.surfaces['wall.inner'].color='#326a7a';homeFloor.surfaces['wall.inner'].styleId='wall-dots';
  const before=structuredClone(homeFloor),selected=[],previewed=[];
  const menu=getWarmWallMenu({homeFloor,surfaceId:'wall.inner',theme:{id:'warm'},onSelect:patch=>selected.push(patch),getPreview:spec=>{previewed.push(spec);return 'actual-wall-texture';}});
  assert.equal(menu.id,'wall-finish');assert.equal(menu.children.length,8);
  const styles=menu.children.filter(item=>item.wallStyleId),colors=menu.children.filter(item=>item.wallColorId);
  assert.deepEqual(styles.map(item=>item.id),WALL_STYLES.map(item=>item.id));assert.deepEqual(colors.map(item=>item.id),WALL_COLORS.map(item=>item.id));
  assert.deepEqual(styles.filter(item=>item.current).map(item=>item.id),['wall-dots']);assert.equal(colors.some(item=>item.current),false);
  assert.equal(previewed.length,0);assert.equal(styles[1].image(),'actual-wall-texture');assert.deepEqual(previewed,[{pattern:'stripe-fine',color:'#326a7a'}]);
  assert.deepEqual(colors.map(item=>item.swatchColor),WALL_COLORS.map(item=>item.color));
  styles[1].action();colors[3].action();assert.deepEqual(selected,[{styleId:'wall-stripe-fine'},{colorId:'wall-lavender'}]);
  assert.deepEqual(homeFloor,before);
});
test('wall choices restore the current room independently of other rooms and starter surfaces',()=>{
  const homeFloor=floor(),room=createRoom('bedroom',0,0,'bedroom-a');room.wall.styleId='wall-dots';room.wall.colorId='wall-apricot';homeFloor.rooms.push(room);
  const menu=getWarmWallMenu({homeFloor,surfaceId:'room:bedroom-a.wall',theme:{id:'warm'},onSelect(){}});
  assert.deepEqual(menu.children.filter(item=>item.current).map(item=>item.id),['wall-dots','wall-apricot']);
  const main=getWarmWallMenu({homeFloor,surfaceId:'wall.outer',theme:{id:'warm'},onSelect(){}});
  assert.ok(main.children.find(item=>item.id==='wall-warm-white').current,'the thumbnail resolves the matching starter wall default');
});
