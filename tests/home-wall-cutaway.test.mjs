import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createRoomExpansion} from '../public/js/home-room-expansion.js';
import {createRoom,roomRect,resolveRooms,getFloorBoundarySegments} from '../public/js/home-layout.js';
import {createHomeState,getWallMountTargets,findHomeCollision} from '../public/js/home-engine.js';
import {getHomeBuildingVolumes} from '../public/js/home-building-collision.js';
import {isAvatarPositionWalkable,planAvatarWalk} from '../public/js/home-avatar-navigation.js';
import {createHomeFloorTextureManager,getFloorTextureCacheStats} from '../public/js/home-floor-textures.js';
import {createHomeWallTextureManager,getWallTextureCacheStats} from '../public/js/home-wall-textures.js';
import {captureHomeFloor} from '../public/js/home-house-overview.js';
import {createEstateManor} from '../public/js/home-estate-manor.js';
import {HOME_THEMES} from '../public/js/home-theme.js';

// Exercise actual Three geometry and the real material managers without a
// renderer, account, saved home or native canvas dependency.
function resources() {
  const createCanvas=()=>({width:0,height:0,getContext:()=>new Proxy({}, {get:(target,key)=>target[key]??(()=>{}),set:(target,key,value)=>(target[key]=value,true)})});
  const floorTextureManager=createHomeFloorTextureManager({createCanvas});
  const wallTextureManager=createHomeWallTextureManager({createCanvas});
  const models=[];
  return {
    createCanvas,floorTextureManager,wallTextureManager,
    make:options=>{const model=createRoomExpansion({theme:HOME_THEMES.warm,includeGrid:false,floorTextureManager,wallTextureManager,...options});models.push(model);return model;},
    dispose(){for(const model of models)model.dispose();floorTextureManager.dispose();wallTextureManager.dispose();assert.equal(getFloorTextureCacheStats({createCanvas}).clones,0);assert.equal(getWallTextureCacheStats({createCanvas}).clones,0);},
  };
}
const close=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<2e-5,`${label}: ${actual} != ${expected}`);
const bounds=mesh=>{mesh.updateWorldMatrix(true,true);return new THREE.Box3().setFromObject(mesh);};
const allMeshes=model=>{const list=[];model.traverse(mesh=>{if(mesh.isMesh)list.push(mesh);});return list;};
const cutBodies=model=>model.userData.roomParts.walls.filter(mesh=>mesh.userData.wallCutaway);
const cutCaps=model=>model.userData.roomParts.border.filter(mesh=>mesh.userData.wallCutawayCap);
const fullWalls=model=>model.userData.roomParts.walls.filter(mesh=>bounds(mesh).getSize(new THREE.Vector3()).y>2);
function signature(meshes) {
  return meshes.map(mesh=>({position:mesh.position.toArray(),rotation:mesh.rotation.toArray(),scale:mesh.scale.toArray(),
    geometry:Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([name,a])=>[name,createHash('sha256').update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength)).digest('hex')])),
    index:mesh.geometry.index?Array.from(mesh.geometry.index.array):null,
    color:mesh.material.color?.getHexString(),map:mesh.material.map?.name??null,
    surfaceId:mesh.userData.surfaceId??null,wallId:mesh.userData.wallId??null,roomPart:mesh.userData.roomPart??null}));
}
function twoRooms({profile}={}) {
  const bed=createRoom('bedroom',1,-1,'bedroom');bed.wall={...bed.wall,styleId:'wall-stripe-fine',colorId:'wall-mist-blue'};
  return createHomeState({...(profile?{profile}:{}),rooms:[createRoom('living'),bed],slab:{rects:[{minX:-2.8,minZ:-2.6,width:11.2,depth:5.2}]}});
}
function assertCutDimensions(model) {
  const bodies=cutBodies(model),caps=cutCaps(model);assert.ok(bodies.length,'real cut wall bodies exist');assert.ok(caps.length,'separate dark cut faces exist');
  // Shared walls are split into room-facing triangles and neutral edge strips.
  // A rounded face alone need not reach the solid's exact top or bottom.
  for(const mesh of bodies) {const b=bounds(mesh);assert.ok(b.min.y>=.06-2e-5&&b.max.y<=.56+2e-5,'each split face stays inside the 0.5 m body');}
  for(const mesh of caps) {
    const b=bounds(mesh),size=b.getSize(new THREE.Vector3());close(b.min.y,.56,'cap bottom');close(b.max.y,.60,'cap top');close(size.y,.04,'4 cm cap');close(Math.min(size.x,size.z),.17,'cap retains wall thickness');
    assert.equal(mesh.material.color.getHexString(),'4a3f37');assert.equal(mesh.material.map,null);assert.equal(mesh.userData.wallNeutralTrim,true);assert.equal(mesh.userData.surfaceId,undefined,'cut cap is not a paint target');
    // The written dimensions take precedence over the prototype's wider cap.
    const matching=bodies.filter(body=>{const x=bounds(body);return x.min.x>=b.min.x-2e-5&&x.max.x<=b.max.x+2e-5&&x.min.z>=b.min.z-2e-5&&x.max.z<=b.max.z+2e-5;});
    assert.ok(matching.length,'every cap covers an existing cut body');
    const union=new THREE.Box3();for(const body of matching)union.union(bounds(body));close(union.min.x,b.min.x,'body/cap minX');close(union.max.x,b.max.x,'body/cap maxX');close(union.min.z,b.min.z,'body/cap minZ');close(union.max.z,b.max.z,'body/cap maxZ');close(union.min.y,.06,'wall floor datum');close(union.max.y,.56,'0.5 m body top');
  }
}

test('Warm cutaway has a 0.5 m body and a separate matching 4 cm dark cap, without changing window walls',()=>{
  const r=resources(),home=twoRooms({profile:'account'}),before=JSON.stringify(home),normal=r.make({...home}),cut=r.make({...home,cutaway:true});
  try {
    assert.equal(normal.userData.cutaway,false);assert.equal(cut.userData.cutaway,true);assertCutDimensions(cut);
    assert.deepEqual(signature(fullWalls(cut)),signature(fullWalls(normal)),'full window-wall triangles, UVs and IDs are unchanged');
    assert.deepEqual(signature(cut.userData.roomParts.windows),signature(normal.userData.roomParts.windows),'window geometry is not rebuilt as a short wall');
    assert.ok(normal.userData.roomParts.columns.some(mesh=>bounds(mesh).max.y<2),'fixture contains obsolete partition posts');
    assert.ok(cut.userData.roomParts.columns.every(mesh=>bounds(mesh).max.y>2.85),'only explicit full-height corner posts may remain');
    assert.equal(JSON.stringify(home),before);
  }finally{r.dispose();}
});

test('a starter room gets front and right cut walls, with its two historical full walls left to their original builder',()=>{
  const r=resources(),room=createRoom('living'),rect=roomRect(room),normal=r.make({rooms:[room]}),cut=r.make({rooms:[room],cutaway:true});
  try {
    assert.equal(allMeshes(normal).length,0);assertCutDimensions(cut);assert.equal(cutBodies(cut).length,2);assert.equal(cutCaps(cut).length,2);assert.equal(cut.userData.roomParts.windows.length,0);
    const front=cutBodies(cut).find(mesh=>mesh.userData.wallTextureAxis==='x'),right=cutBodies(cut).find(mesh=>mesh.userData.wallTextureAxis==='z');
    close(bounds(front).getCenter(new THREE.Vector3()).z,rect.maxZ-.02,'front wall location');close(bounds(right).getCenter(new THREE.Vector3()).x,rect.maxX-.02,'right wall location');
    assert.equal(front.userData.surfaceId,'wall.inner');assert.equal(right.userData.surfaceId,'wall.side');
  }finally{r.dispose();}
});

test('legacy added-room layouts also cut low walls and exposed lips without changing their tall window walls',()=>{
  const r=resources();
  try {
    for(const preset of['suite','atrium','mansion']) {
      const rooms=resolveRooms(preset),normal=r.make({rooms}),cut=r.make({rooms,cutaway:true});assertCutDimensions(cut);
      assert.deepEqual(signature(fullWalls(cut)),signature(fullWalls(normal)),`${preset}: tall shell is unchanged`);
      assert.deepEqual(signature(cut.userData.roomParts.windows),signature(normal.userData.roomParts.windows),`${preset}: original windows remain`);
      assert.ok(cut.userData.roomParts.columns.every(mesh=>bounds(mesh).max.y>2.85),`${preset}: no short decorative partition posts`);
    }
  }finally{r.dispose();}
});

test('shared partition doorway location and width stay fixed while only the visible height changes',()=>{
  const r=resources(),home=twoRooms({profile:'account'}),normal=r.make({...home}),cut=r.make({...home,cutaway:true});
  const intervals=model=>{
    const rows=model.userData.roomParts.walls.filter(mesh=>mesh.userData.sharedPartitionAxis).map(mesh=>{const axis=mesh.userData.sharedPartitionAxis,b=bounds(mesh);return[axis,+b.min[axis].toFixed(5),+b.max[axis].toFixed(5)];});
    return[...new Set(rows.map(row=>JSON.stringify(row)))].sort();
  };
  try {
    assert.ok(intervals(normal).length);assert.deepEqual(intervals(cut),intervals(normal),'door jamb XY intervals retain their original extent');
    for(const model of[normal,cut]) {
      model.updateMatrixWorld(true);const walls=model.userData.roomParts.walls.filter(mesh=>mesh.userData.sharedPartitionAxis);
      const ray=(y,z)=>new THREE.Raycaster(new THREE.Vector3(1,y,z),new THREE.Vector3(1,0,0)).intersectObjects(walls);
      assert.equal(ray(.25,0).length,0,'the centred 1.45 m doorway stays open');assert.ok(ray(.25,-1.8).length,'solid wall remains beside the doorway');
      assert.equal(ray(.75,-1.8).length>0,model===normal,'only the rendered upper partition is cut away');
    }
  }finally{r.dispose();}
});

test('cut walls retain independently editable room sides and wall texture world scale; dark caps never repaint',()=>{
  const r=resources(),home=twoRooms({profile:'account'}),model=r.make({...home,cutaway:true});
  try {
    const bedroom=cutBodies(model).filter(mesh=>mesh.userData.surfaceId==='room:bedroom.wall'&&!mesh.userData.wallNeutralTrim),living=cutBodies(model).filter(mesh=>mesh.userData.roomId==='living'&&!mesh.userData.wallNeutralTrim);
    assert.ok(bedroom.length);assert.ok(living.length);
    for(const mesh of bedroom){assert.equal(mesh.material.color.getHexString(),'d4dfe7');assert.equal(mesh.material.map.name,'wall:stripe-fine');assert.deepEqual(mesh.material.map.repeat.toArray(),[1/1.2,1/2.85]);}
    assert.ok(model.userData.surfaceIds['room:bedroom.wall']);
    const livingColors=living.map(mesh=>mesh.material.color.getHexString()),next=structuredClone(home);next.rooms.find(room=>room.id==='bedroom').wall={...home.rooms[1].wall,styleId:'wall-dots',colorId:'wall-lavender'};
    model.syncWallFinishes(next);
    assert.ok(bedroom.every(mesh=>mesh.material.map.name==='wall:dots'&&mesh.material.color.getHexString()==='e1dbe8'));
    assert.deepEqual(living.map(mesh=>mesh.material.color.getHexString()),livingColors);assertCutDimensions(model);
  }finally{r.dispose();}
});

test('upper floors with independent room layouts and an empty purchased slab use the same cutaway geometry',()=>{
  const r=resources();
  try {
    const slab={rects:[{minX:-2.8,minZ:-2.6,width:8.4,depth:7.8}]},room=createRoom('bedroom',undefined,undefined,'up-bed',{minX:-2.8,minZ:-2.6,width:5.6,depth:5.2});
    for(const rooms of[[],[room]]) {
      const home=createHomeState({profile:'upper',slab,rooms}),model=r.make({...home,cutaway:true});assertCutDimensions(model);assert.equal(model.userData.standalone,true);assert.equal(model.userData.rooms.length,rooms.length);
      assert.ok(fullWalls(model).length,'upper floors keep back/left full walls');
      const sides=new Set(cutBodies(model).map(mesh=>mesh.userData.floorBoundary?.side).filter(Boolean));assert.ok(sides.has('front'));assert.ok(sides.has('right'));
    }
  }finally{r.dispose();}
});

test('default and Toy ignore cutaway, and Warm render toggling restores the complete original snapshot geometry',()=>{
  const r=resources(),home=twoRooms({profile:'account'});let beforeCapture,afterCapture,manor;
  try {
    for(const theme of[HOME_THEMES.default,HOME_THEMES.toy]) {
      const normal=r.make({...home,theme}),requested=r.make({...home,theme,cutaway:true});assert.equal(requested.userData.cutaway,false);assert.deepEqual(signature(allMeshes(requested)),signature(allMeshes(normal)));assert.equal(cutCaps(requested).length,0);
    }
    const model=r.make({...home}),before=signature(allMeshes(model));beforeCapture=captureHomeFloor(model,{home});
    manor=createEstateManor({rooms:home.rooms,theme:HOME_THEMES.warm});const exteriorBefore=signature(allMeshes(manor));
    model.setRooms(home.rooms,{cutaway:true});assertCutDimensions(model);model.setRooms(home.rooms,{cutaway:false});
    assert.equal(model.userData.cutaway,false);assert.equal(cutCaps(model).length,0);assert.deepEqual(signature(allMeshes(model)),before);
    afterCapture=captureHomeFloor(model,{home});assert.deepEqual(signature(allMeshes(afterCapture)),signature(allMeshes(beforeCapture)),'full-building capture can retain its original geometry');
    assert.deepEqual(signature(allMeshes(manor)),exteriorBefore,'interior cutaway does not mutate the independent exterior');
  }finally{beforeCapture?.userData.dispose();afterCapture?.userData.dispose();manor?.dispose();r.dispose();}
});

test('render cutaway cannot change wall mounting, collision volumes, doorway navigation or saved layout',()=>{
  const r=resources(),home=twoRooms({profile:'account'}),saved=JSON.stringify(home);
  const probes=[{x:2.8,z:-1.8},{x:2.8,z:0},{x:8.2,z:1.8}],candidate={id:'probe',x:2.8,z:-1.8,halfX:.1,halfZ:.1,layer:'solid'};
  const logic=()=>({mounts:getWallMountTargets(home),volumes:getHomeBuildingVolumes(home),collision:findHomeCollision(home,candidate),walkable:probes.map(point=>isAvatarPositionWalkable(home,point)),path:planAvatarWalk(home,{x:2,z:0},{x:3.8,z:0})});
  try {
    const before=logic();assert.equal(before.walkable[0],false);assert.equal(before.walkable[1],true);assert.equal(before.path.ok,true);
    assert.ok(before.volumes.some(volume=>volume.roomPart==='walls'&&volume.maxY>.9&&volume.maxY<1.5),'logical partitions retain their original height');
    const model=r.make({...home,cutaway:true});assertCutDimensions(model);assert.deepEqual(logic(),before);model.setRooms(home.rooms,{cutaway:false});assert.deepEqual(logic(),before);assert.equal(JSON.stringify(home),saved);
  }finally{r.dispose();}
});

test('partly shared starter edges retain a cut wall along every exposed front/right boundary segment',()=>{
  const r=resources(),living=createRoom('living'),small=createRoom('bedroom',undefined,undefined,'small-front',{minX:0,minZ:2.6,width:2.8,depth:2.6});
  const home=createHomeState({rooms:[living,small],slab:{rects:[{minX:-2.8,minZ:-2.6,width:5.6,depth:5.2},{minX:0,minZ:2.6,width:2.8,depth:2.6}]}}),model=r.make({...home,cutaway:true});
  try {
    model.updateMatrixWorld(true);
    for(const edge of getFloorBoundarySegments(home).filter(edge=>edge.side==='front'||edge.side==='right')) {
      const alongX=edge.side==='front',mid=(edge.from+edge.to)/2,origin=new THREE.Vector3(alongX?mid:edge.at+1,.25,alongX?edge.at+1:mid),direction=new THREE.Vector3(alongX?0:-1,0,alongX?-1:0);
      const hits=new THREE.Raycaster(origin,direction,0,1.3).intersectObjects(cutBodies(model));assert.ok(hits.length,`${edge.side} boundary ${edge.from}..${edge.to} at ${edge.at} must have a visible cut wall`);
    }
  }finally{r.dispose();}
});
