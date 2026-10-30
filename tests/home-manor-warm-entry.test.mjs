import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {getManorFacadeLayout,getManorDoorWidth} from '../public/js/home-manor-layout.js';
import {createRoom,getFloorBoundarySegments,getFloorBounds,getRoomKind,roomOuterFaces,roomRect,resolveRooms} from '../public/js/home-layout.js';
import {createEstateManor} from '../public/js/home-estate-manor.js';
import {getHomeRoamEntrance} from '../public/js/home-roam-geometry.js';
import {HOME_THEMES} from '../public/js/home-theme.js';
import {createLookDevFixture} from '../scripts/qa/look-dev-fixtures.mjs';
import {createHomeState,validateHomeState} from '../public/js/home-engine.js';

const R=(kind,x,z,width=2.8,depth=2.6,id=kind)=>createRoom(kind,undefined,undefined,id,{minX:x,minZ:z,width,depth});
const choose=(home,structure=1)=>getManorFacadeLayout(home,{theme:HOME_THEMES.warm,structure}).entrance;
function legacyLayout(home){
  const sidePriority=side=>side==='front'?0:side==='right'?1:2;
  if(home.slab){
    const faces=getFloorBoundarySegments(home).flatMap(face=>{
      const length=face.to-face.from,target=face.side==='front'||face.side==='back'?2.8:2.6,count=Math.max(1,Math.round(length/target));
      return Array.from({length:count},(_,index)=>({room:null,face:{...face,from:face.from+length*index/count,to:face.from+length*(index+1)/count}}));
    });
    const entrance=faces.filter(({face})=>face.to-face.from>=1.4).sort((a,b)=>sidePriority(a.face.side)-sidePriority(b.face.side)||(b.face.to-b.face.from)-(a.face.to-a.face.from))[0]??null;
    return {faces,entrance};
  }
  const rooms=home.rooms??[],faces=rooms.flatMap(room=>roomOuterFaces(rooms,room).map(face=>({room,face}))),prefer=predicate=>faces.find(predicate);
  const entrance=prefer(({room,face})=>(getRoomKind(room.kind)?.baseKind??room.kind)==='hallway'&&face.side==='front')
    ??prefer(({room,face})=>(getRoomKind(room.kind)?.baseKind??room.kind)==='hallway'&&face.side==='right')
    ??prefer(({room,face})=>room.kind==='living'&&face.side==='front')??prefer(({face})=>face.side==='front')??prefer(({face})=>face.side==='right')??null;
  return {faces,entrance};
}

test('Warm chooses a kitchen right face before the only bathroom front face',()=>{
  const home={rooms:[R('bathroom',0,2.6),R('kitchen-compact',0,0)]},before=structuredClone(home),entry=choose(home);
  assert.equal(entry.room.kind,'kitchen-compact');assert.equal(entry.face.side,'right');assert.deepEqual(home,before);
  assert.equal(getManorFacadeLayout(home).entrance.room.kind,'bathroom','unscoped collision/legacy layout keeps the old rule');
});

test('Warm keeps hallway and living priority, uses front only after room priority and retains stable ties',()=>{
  const living={rooms:[R('bathroom',2.8,0),createRoom('living')]};assert.equal(choose(living).room.kind,'living');assert.equal(choose(living).face.side,'front');
  const hall={rooms:[createRoom('living'),R('hallway',2.8,-2.6),R('bathroom',2.8,0)]};assert.equal(choose(hall).room.kind,'hallway');assert.equal(choose(hall).face.side,'right');
  const peers={rooms:[R('kitchen',2.8,0,2.8,2.6,'first'),R('kitchen',0,0,2.8,2.6,'second')]};assert.equal(choose(peers).room.id,'first');assert.equal(choose(peers).face.side,'front');
  const bath={rooms:[R('bathroom-spacious',0,0)]};assert.equal(choose(bath).room.kind,'bathroom-spacious');assert.equal(choose(bath).face.side,'front');
});

test('Warm filters entrance faces against the selected modeled door width',()=>{
  const home={rooms:[R('hallway',8,8,1.2,1.2,'small-hall'),createRoom('living')]};
  assert.equal(choose(home,1).room.id,'small-hall');assert.equal(choose(home,2).room.id,'living');assert.equal(choose(home,3).room.id,'living');
  for(const structure of[1,2,3]){const entry=choose(home,structure);assert.ok(entry.face.to-entry.face.from>=getManorDoorWidth(structure));}
  assert.equal(choose({rooms:[R('bathroom',0,0,1.2,1.2)]},3),null,'no undersized facade receives an oversized door');
});

test('non-Warm callers retain the complete previous face data and entrance selection',()=>{
  const scenes=['living','bedroom','kitchen','bathroom','house','exterior'].map(id=>createLookDevFixture(id).home);
  const homes=[...scenes,...['starter','suite','atrium','mansion'].map(id=>({rooms:resolveRooms(id)})),{rooms:[R('bathroom',0,2.6),R('kitchen-compact',0,0)]}];
  for(const home of homes)for(const theme of[undefined,'default','toy',HOME_THEMES.default,HOME_THEMES.toy])for(const structure of[1,2,3])assert.deepEqual(getManorFacadeLayout(home,{theme,structure}),legacyLayout(home));
});

test('Warm slab bays identify their actual room and the swapped House opens into its living room',()=>{
  const fixture=createLookDevFixture('house'),before=structuredClone(fixture.home),entry=choose(fixture.home);
  assert.equal(entry.room.kind,'living');assert.equal(entry.face.side,'front');
  assert.deepEqual(fixture.home,before);assert.equal(getManorFacadeLayout(fixture.home).entrance.room,null,'legacy slab output is not annotated');
  const selected=getHomeRoamEntrance(fixture.home,{theme:HOME_THEMES.warm});assert.equal(selected.roomKind,'living');assert.equal(selected.roomId,entry.room.id);
  const model=createEstateManor({floors:[fixture.home],theme:HOME_THEMES.warm,roam:true});
  try{const bounds=getFloorBounds(fixture.home);model.position.set(bounds.x,0,bounds.z);model.updateMatrixWorld(true);const actual=model.getRoamEntry();assert.equal(actual.roomId,entry.room.id);assert.ok(actual.center.distanceTo(new THREE.Vector3(selected.center.x,selected.center.y,selected.center.z))<1e-6);}finally{model.dispose();}
});

test('Warm custom slab bays use each room real wall length instead of a midpoint owner borrowing adjacent width',()=>{
  const home=createHomeState({sandbox:false,profile:'upper',slab:{rects:[{minX:0,minZ:0,width:4,depth:2.6}]},rooms:[
    R('study',0,0,1.2,2.6,'study'),R('hallway',1.2,0,1.2,2.6,'hall'),R('bathroom',2.4,0,1.6,2.6,'bath'),
  ]}),before=structuredClone(home);
  assert.equal(validateHomeState(home),true,'the regression uses a legal independently divided floor');
  const small=choose(home,1);assert.equal(small.room.id,'hall');assert.equal(small.face.side,'front');assert.deepEqual([small.face.from,small.face.to],[1.2,2.4]);
  const medium=choose(home,2);assert.equal(medium.room.id,'bath');assert.equal(medium.face.side,'front');
  const large=choose(home,3);assert.equal(large.room.id,'bath');assert.equal(large.face.side,'right','no 1.2 m or 1.6 m front room may claim a 1.8 m door');
  for(const structure of[1,2,3]){
    const {room,face}=choose(home,structure),rect=roomRect(room),horizontal=face.side==='front';
    assert.ok(face.from>=(horizontal?rect.minX:rect.minZ)-1e-8&&face.to<=(horizontal?rect.maxX:rect.maxZ)+1e-8);
    assert.ok(face.to-face.from>=getManorDoorWidth(structure)-1e-8);
  }
  for(const theme of['default','toy'])assert.deepEqual(getManorFacadeLayout(home,{theme,structure:3}),legacyLayout(home));
  assert.deepEqual(home,before,'room-boundary splitting is presentation-only');
});
