import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRoomExpansion} from '../public/js/home-room-expansion.js';
import {createEstateManor} from '../public/js/home-estate-manor.js';
import {ROOM_PRODUCTS} from '../public/js/home-room-products.js';
import {ROOM_KINDS,createRoom,getRoomKind,resolveRooms} from '../public/js/home-layout.js';
import {createHomeState} from '../public/js/home-engine.js';
import {HOME_THEMES,getRoomTheme} from '../public/js/home-theme.js';

const meshes=object=>{const result=[];object.traverse(node=>{if(node.isMesh)result.push(node);});return result;};
const color=mesh=>'#'+mesh.material.color.getHexString();
const digest=value=>createHash('sha256').update(value).digest('hex');
function snapshot(object,{materials=true,filter=()=>true}={}) {
  object.updateMatrixWorld(true);
  return digest(JSON.stringify(meshes(object).filter(filter).map(mesh=>({
    geometry:Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([name,attribute])=>[name,digest(Buffer.from(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength))])),
    index:mesh.geometry.index?digest(Buffer.from(mesh.geometry.index.array.buffer,mesh.geometry.index.array.byteOffset,mesh.geometry.index.array.byteLength)):null,
    matrix:mesh.matrixWorld.toArray(),castShadow:mesh.castShadow,receiveShadow:mesh.receiveShadow,
    ...(materials?{materials:[].concat(mesh.material).map(mat=>({color:'#'+mat.color.getHexString(),roughness:mat.roughness,metalness:mat.metalness,opacity:mat.opacity,transparent:mat.transparent,side:mat.side}))}:{}),
  }))));
}
const purchasedFloor=()=>({profile:'account',rooms:[createRoom('living'),createRoom('bedroom',1,-1,'bedroom')],slab:{rects:[{minX:-2.8,minZ:-2.6,width:11.2,depth:5.2}]},includeGrid:false});

// Captured from the unmodified ef175ae builders, including material settings,
// geometry buffers and transforms. This guards the unselected default theme.
const DEFAULT_MODEL_SIGNATURES={
  legacy:'5c419ebfbe5457ba86698cbc9bc28ee4498a3e4848f620f172a36987d4d9812b',account:'ef0982b5fd75942a2345d829ad61f3155c8f393d8b00eebf137acafbc190b965',manor:'7020303a73a1778c8b0746c52cbae3807593b25516ae5e370b16faf04b4ac44a',
};
test('unselected room and manor builders retain the pre-candidate default models',()=>{
  const models={legacy:createRoomExpansion({rooms:resolveRooms('mansion')}),account:createRoomExpansion(purchasedFloor()),manor:createEstateManor({floors:[purchasedFloor()],color:'#976eb5'})};
  try {for(const[id,model]of Object.entries(models))assert.equal(snapshot(model),DEFAULT_MODEL_SIGNATURES[id],id);}
  finally {Object.values(models).forEach(model=>model.dispose());}
});

test('room theme changes reuse identical geometry and never mutate house input',()=>{
  for(const input of [{rooms:resolveRooms('mansion')},purchasedFloor()]) {
    const before=structuredClone(input),normal=createRoomExpansion({...input,theme:HOME_THEMES.default}),toy=createRoomExpansion({...input,theme:HOME_THEMES.toy});
    try {
      assert.equal(snapshot(normal,{materials:false}),snapshot(toy,{materials:false}));
      assert.deepEqual(input,before);
      assert.deepEqual(toy.userData.surfaceIds,normal.userData.surfaceIds,'theme cannot add interaction or paint targets');
      assert.equal(meshes(toy).length,meshes(normal).length,'no decorative volume or extra meshes');
    } finally {normal.dispose();toy.dispose();}
  }
});

test('theme room colors and trim support every actual room size without changing painted rooms',()=>{
  for(const kind of ROOM_KINDS.filter(kind=>!kind.core)) {
    const room=createRoom(kind.id,-1,-1,'themed-room'),before=structuredClone(room),skin=getRoomTheme(kind,room,HOME_THEMES.toy);
    assert.equal(skin.floor,HOME_THEMES.toy.rooms[kind.baseKind].floor,`${kind.id} purchased default floor is visibly themed`);
    assert.equal(skin.wall,HOME_THEMES.toy.rooms[kind.baseKind].wall,`${kind.id} purchased default wall is visibly themed`);
    const model=createRoomExpansion({rooms:[room],includeGrid:false,theme:HOME_THEMES.toy});
    try {
      assert.ok(model.userData.roomParts.floor.every(mesh=>color(mesh)===skin.floor),kind.id);
      assert.ok(model.userData.roomParts.walls.every(mesh=>color(mesh)===skin.wall),kind.id);
      assert.ok(meshes(model).some(mesh=>color(mesh)===HOME_THEMES.toy.rooms[kind.baseKind].trim),`${kind.id} has a visible colored boundary`);
      assert.deepEqual(room,before);
    } finally {model.dispose();}
    const painted={...room,floor:{color:'#16426b',material:'oak'},wall:{color:'#bb4567',material:'ceramic'}};
    for(const theme of [HOME_THEMES.default,HOME_THEMES.toy]) {
      const custom=createRoomExpansion({rooms:[painted],includeGrid:false,theme});
      try {
        assert.ok(custom.userData.roomParts.floor.every(mesh=>color(mesh)==='#16426b'));
        assert.ok(custom.userData.roomParts.walls.every(mesh=>color(mesh)==='#bb4567'));
      } finally {custom.dispose();}
    }
  }
});

test('actual account and upper single-room slab edges use room trim without changing paint targets',()=>{
  for(const kind of ['living','bedroom','bathroom-spacious']) {
    const rect={minX:-2.8,minZ:-2.6,width:5.6,depth:5.2};
    const room=createRoom(kind,undefined,undefined,kind==='living'?'living':'review-'+kind,rect);
    const home=createHomeState({sandbox:false,profile:kind==='living'?'account':'upper',slab:{rects:[rect]},rooms:[room]});
    const before=structuredClone(home),normal=createRoomExpansion({...home,includeGrid:false,theme:HOME_THEMES.default}),toy=createRoomExpansion({...home,includeGrid:false,theme:HOME_THEMES.toy});
    try {
      const skirting=toy.userData.roomParts.border.filter(mesh=>mesh.position.y>0&&mesh.position.y<.2);
      assert.equal(skirting.length,4,'both wall skirtings and both cutaway lips already exist');
      assert.ok(skirting.every(mesh=>color(mesh)===HOME_THEMES.toy.rooms[getRoomKind(kind).baseKind].trim),kind+' colored perimeter');
      const normalEdges=meshes(normal).filter(mesh=>mesh.userData.floorBoundary),toyEdges=meshes(toy).filter(mesh=>mesh.userData.floorBoundary);
      const interactionData=mesh=>{const {themeRoomId,...rest}=mesh.userData;return rest;};
      assert.deepEqual(toyEdges.map(interactionData),normalEdges.map(interactionData),'visual ownership cannot change paint or collision targets');
      assert.ok(toyEdges.filter(mesh=>mesh.userData.roomPart==='walls').every(mesh=>mesh.userData.themeRoomId===room.id));
      assert.ok(normalEdges.every(mesh=>!Object.hasOwn(mesh.userData,'themeRoomId')),'default metadata is unchanged');
      assert.equal(snapshot(normal,{materials:false}),snapshot(toy,{materials:false}));
      assert.deepEqual(home,before);
    } finally {normal.dispose();toy.dispose();}
  }
});

test('one unchanged slab strip spanning different rooms stays a shared neutral boundary',()=>{
  const model=createRoomExpansion({...purchasedFloor(),theme:HOME_THEMES.toy});
  try {
    const shared=model.userData.roomParts.border.filter(mesh=>mesh.userData.floorBoundary&&mesh.position.y>0&&mesh.position.y<.2&&mesh.userData.floorBoundary.to-mesh.userData.floorBoundary.from>6);
    assert.equal(shared.length,2,'the long back and front boundary remain single existing meshes');
    assert.ok(shared.every(mesh=>color(mesh)===HOME_THEMES.toy.shell.trim));
    const wall=model.userData.roomParts.walls.find(mesh=>mesh.userData.floorBoundary?.side==='back');
    assert.ok(wall);assert.equal(wall.userData.themeRoomId,undefined,'a mixed wall must not pretend to belong to one room');
  } finally {model.dispose();}
});

test('legacy room-owned slab boundary resolves saved defaults and preserves custom wall paint',()=>{
  const floor=purchasedFloor();delete floor.profile;
  for(const painted of [false,true]) {
    if(painted)floor.rooms[1].wall.color='#42719a';
    const model=createRoomExpansion({...floor,theme:HOME_THEMES.toy});
    try {
      const boundaries=model.userData.roomParts.walls.filter(mesh=>mesh.userData.roomId==='bedroom'&&mesh.userData.floorBoundary);
      assert.ok(boundaries.length>0);
      assert.ok(boundaries.every(mesh=>color(mesh)===(painted?'#42719a':HOME_THEMES.toy.rooms.bedroom.wall)));
    } finally {model.dispose();}
  }
});

test('purchased bare floor receives the candidate skin and keeps its actual structural extent',()=>{
  const input={profile:'account',rooms:[],slab:{rects:[{minX:-2.8,minZ:-2.6,width:5.6,depth:5.2}]},includeGrid:false},normal=createRoomExpansion({...input,theme:HOME_THEMES.default}),toy=createRoomExpansion({...input,theme:HOME_THEMES.toy});
  try {
    assert.ok(normal.userData.roomParts.floor.every(mesh=>color(mesh)===getRoomKind('living').floor));
    assert.ok(toy.userData.roomParts.floor.every(mesh=>color(mesh)===HOME_THEMES.toy.rooms.living.floor));
    assert.ok(toy.userData.roomParts.walls.every(mesh=>color(mesh)===HOME_THEMES.toy.rooms.living.wall));
    const caps=toy.userData.roomParts.border.filter(mesh=>mesh.position.y>2.85);
    assert.ok(caps.length>0);assert.ok(caps.every(mesh=>color(mesh)===HOME_THEMES.toy.shell.wallCap));
    assert.equal(snapshot(normal,{materials:false}),snapshot(toy,{materials:false}));
  } finally {normal.dispose();toy.dispose();}
});

test('candidate manor recolors the actual plain facade while preserving the selected roof and footprint',()=>{
  const input={floors:[purchasedFloor()],color:'#976eb5'},before=structuredClone(input),normal=createEstateManor({...input,theme:HOME_THEMES.default}),toy=createEstateManor({...input,theme:HOME_THEMES.toy});
  try {
    assert.equal(snapshot(normal,{materials:false}),snapshot(toy,{materials:false}));
    const roof=mesh=>mesh.userData.buildingPart==='roof';
    assert.equal(snapshot(normal,{filter:roof}),snapshot(toy,{filter:roof}),'roof geometry and every roof material remain student-selected');
    const walls=meshes(toy).filter(mesh=>['wall-volume','shell-volume'].includes(mesh.userData.buildingPart));
    assert.ok(walls.length>0);assert.ok(walls.every(mesh=>color(mesh)===HOME_THEMES.toy.manor.wall));
    assert.deepEqual(input,before);assert.deepEqual(normal.getCustomization(),toy.getCustomization(),'theme is absent from persistent customization');
    toy.setFloors([purchasedFloor(),purchasedFloor()]);
    assert.equal(toy.getCustomization().color,input.color);assert.ok(toy.userData.paintMaterials.wall.every(material=>'#'+material.color.getHexString()===HOME_THEMES.toy.manor.wall));
  } finally {normal.dispose();toy.dispose();}
});

test('Node room catalogue continues to use authoritative old colors and prices',()=>{
  assert.equal(ROOM_PRODUCTS.length,24);
  for(const product of ROOM_PRODUCTS) {
    const kind=getRoomKind(product.kind);
    assert.equal(product.color,kind.floor);assert.equal(product.wall,kind.wall);
    assert.ok(Number.isSafeInteger(product.price)&&product.price>0);
  }
});
