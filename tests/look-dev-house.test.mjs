import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {LOOK_DEV_SIZE,LOOK_DEV_VIEWS,createLookDevFixture} from '../scripts/qa/look-dev-fixtures.mjs';
import {resolveLookDevBuild,describeLookDevWallGeometry} from '../scripts/qa/look-dev-runtime.mjs';
import {validateHomeState,findHomeCollision,getFurnitureFootprint} from '../public/js/home-engine.js';
import {roomRect,getFloorBoundarySegments} from '../public/js/home-layout.js';
import {createRoomExpansion} from '../public/js/home-room-expansion.js';
import {HOME_THEMES} from '../public/js/home-theme.js';
import {isAvatarPositionWalkable} from '../public/js/home-avatar-navigation.js';

const required=[
  ['h-sofa','sofa',0,-1.1],['h-table','lcCoffeeTable',0,.2],['h-rug','rug',0,.2],
  ['h-lamp','hhTripodLamp',-1.8,-1.15],['h-cooker','mkDoubleGas',3.4,-1.65],
  ['h-sink','mkSingleSink',4.35,-1.65],['h-dining','hhDropLeafTable',4.2,.9],
  ['h-bed','bedTimber',-.9,4.3],['h-bedside','bedsideCabinet',.3,3.4],
  ['h-bedrug','rug',-.6,6.4],['h-toilet','compactToilet',3.5,3.5],['h-vanity','bathroomVanity',4.7,3.4],
];

test('house is a sixth fresh account-free view with the exact reviewed four-room floor and furniture positions',()=>{
  assert.deepEqual(LOOK_DEV_SIZE,{width:1440,height:900});assert.equal(LOOK_DEV_VIEWS.length,6);assert.equal(new Set(LOOK_DEV_VIEWS.map(view=>view.id)).size,6);assert.ok(LOOK_DEV_VIEWS.some(view=>view.id==='house'));
  const fixture=createLookDevFixture('house'),home=fixture.home;
  assert.equal(fixture.view,'interior');assert.equal(fixture.floors.length,1);assert.equal(home.profile,'account');assert.equal(home.sandbox,false);assert.equal(validateHomeState(home),true);assert.deepEqual(fixture.upperFloors,[]);assert.deepEqual(fixture.owned,[]);
  assert.deepEqual(home.slab,{rects:[{minX:-2.8,minZ:-2.6,width:8.4,depth:10.4}]});
  assert.deepEqual(home.rooms.map(room=>[room.kind,roomRect(room).minX,roomRect(room).minZ,roomRect(room).width,roomRect(room).depth]),[
    ['living',-2.8,-2.6,5.6,5.2],['kitchen-compact',2.8,-2.6,2.8,5.2],['bedroom',-2.8,2.6,5.6,5.2],['bathroom',2.8,2.6,2.8,5.2],
  ]);
  assert.deepEqual(home.furniture.map(item=>[item.id,item.kind,item.x,item.z]),required.map(([id,...rest])=>['lookdev:'+id,...rest]));
  assert.ok(fixture.items.every(item=>item.color===item.defaultColor&&item.material===item.defaultMaterial));assert.deepEqual(fixture.robotPoint,{x:-1.4,z:6.4});assert.equal(isAvatarPositionWalkable(home,fixture.robotPoint),true);
  for(const item of home.furniture)assert.equal(findHomeCollision(home,{id:'furniture:'+item.id,item,kind:item.kind,x:item.x,z:item.z,...getFurnitureFootprint(item.kind,item.rotation),layer:item.kind==='rug'?'underlay':'solid'}),null,item.id+' uses the real placement collision rules');
  assert.deepEqual(new Set(getFloorBoundarySegments(home).map(edge=>edge.side)),new Set(['back','left','front','right']));
  assert.equal('studentId'in fixture,false);assert.equal('wallet'in fixture,false);assert.equal('wallet'in home,false);
  const rendered=createRoomExpansion({...home,theme:HOME_THEMES.default});try{const walls=describeLookDevWallGeometry(rendered).filter(row=>row.part==='walls');assert.ok(walls.some(row=>Math.abs(row.height-2.85)<1e-5));assert.ok(walls.some(row=>Math.abs(row.height-.98)<1e-5));assert.ok(walls.every(row=>row.cutaway===false&&row.cutawayCap===false));}finally{rendered.dispose();}
  const again=createLookDevFixture('house');home.rooms[1].wall.color='#123456';assert.notEqual(again.home.rooms[1].wall.color,home.rooms[1].wall.color);
});

test('both warm review presets apply to the four existing room kinds without altering geometry, legality or furniture',async()=>{
  for(const id of ['warm-floors','warm-walls']){
    const preset=JSON.parse(await readFile(new URL('../scripts/qa/look-dev-presets/'+id+'.json',import.meta.url),'utf8')),fixture=createLookDevFixture('house'),original=structuredClone(fixture.home);
    const theme=resolveLookDevBuild(fixture,preset);assert.equal(theme.id,'warm');assert.equal(validateHomeState(fixture.home),true);assert.deepEqual(fixture.home.slab,original.slab);assert.deepEqual(fixture.home.furniture,original.furniture);assert.equal(fixture.home.revision,original.revision);
    for(const room of fixture.home.rooms){const raw=original.rooms.find(row=>row.id===room.id);assert.deepEqual(roomRect(room),roomRect(raw));}
    assert.equal(fixture.home.rooms.find(room=>room.kind==='kitchen-compact').floor.finishId,'tile-terracotta');assert.equal(fixture.home.rooms.find(room=>room.kind==='bathroom').floor.finishId,'tile-blue');
    if(id==='warm-walls')for(const room of fixture.home.rooms.filter(room=>room.wall)){assert.equal(room.wall.styleId,'wall-plain');assert.equal(room.wall.colorId,'wall-warm-white');}
  }
});

test('the original five fixture payloads remain byte-stable when the house review is added',()=>{
  const baseline={living:'9b6b4c628a98e0619292a1638e9231ba85109f0fbb8c6d3db27b446d5f1427ec',bedroom:'0027517c4a846770bdd774fe737db72c694ef6a2a712d23a3742da475c641e94',kitchen:'87d3193aed0bd7edecee0289a926e4b65b711e9383ee6011c3ff8c375f2946c4',bathroom:'e4e6ff9b880e70bebf26d3c7bd68a5b6a3d6ba4af2972cedd96bde96423ee4a4',exterior:'d53b09c5d9287e6437e9f2d2949c31ba31ec1199664963665666e191d7ed7463'};
  for(const[id,hash]of Object.entries(baseline))assert.equal(createHash('sha256').update(JSON.stringify(createLookDevFixture(id))).digest('hex'),hash,id);
});
