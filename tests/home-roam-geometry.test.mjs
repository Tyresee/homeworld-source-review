import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createEstateManor} from '../public/js/home-estate-manor.js';
import {createRoomExpansion,WALL_HEIGHT} from '../public/js/home-room-expansion.js';
import {getHomeRoamEntrance,ROAM_WALL_THICKNESS,ROAM_DOOR_DEPTH} from '../public/js/home-roam-geometry.js';
import {getManorFacadeLayout} from '../public/js/home-manor-layout.js';
import {getFloorBounds,roomRect,resolveRooms,createRoom} from '../public/js/home-layout.js';
import {HOME_THEMES} from '../public/js/home-theme.js';
import {createHomeFloorTextureManager,getFloorTextureCacheStats} from '../public/js/home-floor-textures.js';
import {createHomeWallTextureManager,getWallTextureCacheStats} from '../public/js/home-wall-textures.js';
import {createLookDevFixture} from '../scripts/qa/look-dev-fixtures.mjs';

const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-5,`${actual} != ${expected}`);
const meshes=root=>{const result=[];root.traverse(object=>{if(object.isMesh)result.push(object);});return result;};
function fingerprint(root) {
  root.updateMatrixWorld(true);
  const rows=meshes(root).map(mesh=>({matrix:mesh.matrixWorld.toArray(),geometry:Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([key,a])=>[key,Array.from(a.array)])),index:mesh.geometry.index?Array.from(mesh.geometry.index.array):null,material:{color:mesh.material.color?.getHexString(),roughness:mesh.material.roughness,metalness:mesh.material.metalness,side:mesh.material.side,opacity:mesh.material.opacity,map:mesh.material.map?.name??null}}));
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
function textures() {
  const createCanvas=()=>({width:0,height:0,getContext:()=>new Proxy({},{get:()=>()=>{},set:()=>true})});
  const floorTextureManager=createHomeFloorTextureManager({createCanvas}),wallTextureManager=createHomeWallTextureManager({createCanvas});
  return {floorTextureManager,wallTextureManager,dispose(){floorTextureManager.dispose();wallTextureManager.dispose();assert.equal(getFloorTextureCacheStats({createCanvas}).clones,0);assert.equal(getWallTextureCacheStats({createCanvas}).clones,0);}};
}
// Probe through the entry only; a narrow valid room can have its opposite wall
// less than a metre beyond a correctly recessed open door.
const rayAtEntry=(entry,{height=1,distance=1,far=1.6}={})=>new THREE.Raycaster(new THREE.Vector3(entry.center.x,height,entry.center.z).addScaledVector(entry.outward,distance),entry.outward.clone().negate(),0,far);
function alignManor(manor,home) {const b=getFloorBounds(home);manor.position.set(b.x,0,b.z);manor.updateMatrixWorld(true);return manor.getRoamEntry();}

test('roam exterior has genuinely hollow walls, a hollow arch and a thick hinged door with attached handles',()=>{
  const home=createLookDevFixture('house').home,before=JSON.stringify(home),manor=createEstateManor({floors:[home],theme:HOME_THEMES.warm,roam:true});
  try {
    const entry=alignManor(manor,home);assert.ok(entry);assert.ok(entry.parts.length>1);assert.equal(entry.leaf.parent,entry.hinge);assert.ok(entry.handles.every(handle=>handle.parent===entry.hinge));assert.equal(entry.leaf.material.side,THREE.DoubleSide);
    assert.ok(!meshes(manor).some(mesh=>['shell-volume','wall-volume'].includes(mesh.userData.buildingPart)));
    const shell=meshes(manor).filter(mesh=>mesh.userData.buildingPart==='roam-wall');assert.ok(shell.length>=4);for(const wall of shell)close(wall.userData.roamWall.thickness,.2);
    const ray=rayAtEntry(entry);assert.ok(ray.intersectObject(manor,true).some(hit=>hit.object===entry.leaf),'closed panel is present');
    const handlesBefore=entry.handles.map(handle=>handle.getWorldPosition(new THREE.Vector3()));entry.hinge.rotation.y=1.8;manor.updateMatrixWorld(true);
    assert.equal(ray.intersectObject(manor,true).length,0,'open door reveals empty space through the frame and wall, not a filled arch or box');
    assert.ok(entry.handles.every((handle,i)=>handle.getWorldPosition(new THREE.Vector3()).distanceTo(handlesBefore[i])>.05));
    entry.leaf.geometry.computeBoundingBox();close(entry.leaf.geometry.boundingBox.max.z-entry.leaf.geometry.boundingBox.min.z,.06);
    assert.equal(JSON.stringify(home),before);
  }finally{manor.dispose();}
});

test('entrance metadata follows the real selected facade and room without rotating or moving the saved floor',()=>{
  const homes=[createLookDevFixture('house').home,{profile:'upper',slab:{rects:[{minX:8,minZ:-5,width:1.2,depth:7.8}]},rooms:[createRoom('bedroom',undefined,undefined,'narrow',{minX:8,minZ:-5,width:1.2,depth:5.2}),createRoom('bathroom',undefined,undefined,'front-bath',{minX:8,minZ:.2,width:1.2,depth:2.6})]}];
  for(const home of homes) {
    const selected=getManorFacadeLayout(home,{theme:HOME_THEMES.warm}).entrance,spec=getHomeRoamEntrance(home),manor=createEstateManor({floors:[home],theme:HOME_THEMES.warm,roam:true});
    try {
      assert.equal(spec.side,selected.face.side);close(spec.from,selected.face.from);close(spec.to,selected.face.to);
      const entry=alignManor(manor,home);close(entry.center.x,spec.center.x);close(entry.center.z,spec.center.z);close(entry.wallCenter.x,spec.wallCenter.x);close(entry.wallCenter.z,spec.wallCenter.z);assert.equal(entry.roomId,spec.roomId);
      const owner=home.rooms.find(room=>room.id===entry.roomId),r=roomRect(owner),inside=entry.wallCenter.clone().addScaledVector(entry.outward,-.25);assert.ok(inside.x>=r.minX&&inside.x<=r.maxX&&inside.z>=r.minZ&&inside.z<=r.maxZ);
      const ray=rayAtEntry(entry);assert.ok(ray.intersectObject(entry.leaf).length);entry.hinge.rotation.y=1.8;manor.updateMatrixWorld(true);assert.equal(ray.intersectObject(manor,true).length,0);
    }finally{manor.dispose();}
  }
});

test('the full inward door swing stays clear of the solid wall and recessed frame for front and right entrances',()=>{
  const homes=[createLookDevFixture('house').home,{profile:'upper',slab:{rects:[{minX:8,minZ:-5,width:1.2,depth:7.8}]},rooms:[createRoom('bedroom',undefined,undefined,'narrow',{minX:8,minZ:-5,width:1.2,depth:5.2}),createRoom('bathroom',undefined,undefined,'front-bath',{minX:8,minZ:.2,width:1.2,depth:2.6})]}];
  for(const home of homes)for(const structure of[1,2,3]) {
    const manor=createEstateManor({floors:[home],theme:HOME_THEMES.warm,roam:true,plans:{structure}});
    try {
      const entry=alignManor(manor,home),normal=entry.outward,lateral=new THREE.Vector3(normal.z,0,-normal.x),closed=entry.leaf.localToWorld(new THREE.Vector3(0,entry.height/2,0));
      assert.ok(closed.distanceTo(entry.center)<1e-6,'controller entrance and actual closed panel use one plane');
      close(entry.center.clone().sub(entry.wallCenter).dot(normal),-ROAM_WALL_THICKNESS-ROAM_DOOR_DEPTH/2);
      entry.leaf.updateMatrix();const points=entry.leaf.geometry.attributes.position,local=new THREE.Vector3();
      // Analytic half-space bound: every leaf point has hinge-local x >= 0
      // and |z| <= depth/2. For theta in [0, 1.8], sin(theta) >= 0, so
      // -x*sin(theta)+z*cos(theta) <= depth/2. The entire leaf, including
      // triangle interiors, therefore stays behind the solid's inner plane.
      for(let i=0;i<points.count;i++){local.fromBufferAttribute(points,i).applyMatrix4(entry.leaf.matrix);assert.ok(local.x>=-1e-6);assert.ok(Math.abs(local.z)<=ROAM_DOOR_DEPTH/2+1e-6);}
      const wallRay=new THREE.Raycaster(entry.wallCenter.clone().addScaledVector(lateral,entry.width*.6).addScaledVector(normal,.5),normal.clone().negate(),0,1);assert.ok(wallRay.intersectObjects(manor.getRoamWalls()).length,'test includes actual solid jamb beside the opening');
      for(let step=0;step<=120;step++) {
        entry.hinge.rotation.y=1.8*step/120;manor.updateMatrixWorld(true);
        for(const part of entry.parts) {
          const p=part.geometry.attributes.position;
          for(let i=0;i<p.count;i++) {
            const world=part.localToWorld(new THREE.Vector3().fromBufferAttribute(p,i)),offset=world.clone().sub(entry.wallCenter),depth=offset.dot(normal);
            if(part===entry.leaf)assert.ok(depth<=-ROAM_WALL_THICKNESS+1e-6,'leaf cannot enter the wall/frame half-space anywhere during the swing');
            if(depth<=-ROAM_WALL_THICKNESS+1e-6||depth>=.04-1e-6)continue;
            const across=offset.dot(lateral),r=entry.width/2,top=entry.top-r+Math.sqrt(Math.max(0,r*r-across*across));
            assert.ok(Math.abs(across)<=r+1e-6&&world.y>=-1e-6&&world.y<=top+1e-6,'handles inside the reveal remain inside the actual arched opening');
          }
        }
      }
      const look=entry.center.clone().setY(entry.thresholdY+1.2),outside=entry.center.clone().addScaledVector(normal,2.8).setY(entry.thresholdY+1.45);
      entry.hinge.rotation.y=0;manor.updateMatrixWorld(true);let ray=new THREE.Raycaster(outside,look.clone().sub(outside).normalize(),0,3.2);assert.ok(ray.intersectObject(manor,true).some(hit=>hit.object===entry.leaf),'closed recessed leaf is reachable through the real arch');
      entry.hinge.rotation.y=1.8;manor.updateMatrixWorld(true);assert.equal(ray.intersectObject(manor,true).length,0,'final open leaf clears the actual approach ray');
    }finally{manor.dispose();}
  }
});

test('roam interior owns starter floors, all four full walls, matching arched entry and downward ceilings',()=>{
  const t=textures();
  try {
    for(const home of[{rooms:resolveRooms('starter')},createLookDevFixture('house').home]) {
      const spec=getHomeRoamEntrance(home),room=createRoomExpansion({...home,...t,theme:HOME_THEMES.warm,roam:true,roamEntrance:spec});
      try {
        assert.ok(room.userData.roomParts.floor.length);assert.equal(room.userData.standalone,true);assert.ok(room.getRoamWalls().length>=4);room.updateMatrixWorld(true);
        const entry={...spec,center:new THREE.Vector3(spec.center.x,spec.center.y,spec.center.z),outward:new THREE.Vector3(spec.outward.x,0,spec.outward.z)},entryWalls=room.getRoamWalls().filter(mesh=>mesh.userData.roamWall.entrance);
        assert.ok(entryWalls.length);assert.equal(rayAtEntry(entry).intersectObjects(entryWalls).length,0,'interior entry and exterior door align');
        const shoulder=new THREE.Vector3(entry.center.x,1,entry.center.z).addScaledVector(entry.outward,1),lateral=new THREE.Vector3(entry.outward.z,0,-entry.outward.x);shoulder.addScaledVector(lateral,spec.width*.75);
        assert.ok(new THREE.Raycaster(shoulder,entry.outward.clone().negate(),0,2).intersectObjects(entryWalls).length,'wall remains beside the door');
        for(const mesh of room.getRoamWalls()){const box=new THREE.Box3().setFromObject(mesh);assert.ok(box.max.y<=.06+WALL_HEIGHT+1e-5);assert.equal(mesh.userData.wallCutaway,undefined);assert.ok(mesh.userData.roamWall.maxY>2.8);}
        const ceilings=room.getRoamCeilings();assert.ok(ceilings.length>=home.rooms.length);for(const ceiling of ceilings){close(ceiling.position.y,.06+WALL_HEIGHT-.015);assert.ok(new THREE.Vector3(0,0,1).applyQuaternion(ceiling.quaternion).y<-.99);assert.ok(ceiling.userData.point);assert.equal(ceiling.userData.surfaceId,undefined);}
        for(const item of home.rooms)assert.ok(ceilings.some(mesh=>mesh.userData.roomId===item.id));
      }finally{room.dispose();}
    }
  }finally{t.dispose();}
});

test('roam walls preserve independent room finishes and expose clipping/attachment metadata with real doorway spans',()=>{
  const t=textures(),home=createLookDevFixture('house').home;home.rooms.find(room=>room.kind==='bathroom').wall={color:'#d4dfe7',material:'linen',styleId:'wall-stripe-fine',colorId:'wall-mist-blue'};
  const model=createRoomExpansion({...home,...t,theme:HOME_THEMES.warm,roam:true});
  try {
    const walls=model.getRoamWalls();assert.ok(walls.some(mesh=>mesh.userData.sharedPartitionAxis));
    const bath=walls.filter(mesh=>mesh.userData.roomKind==='bathroom'&&!mesh.userData.wallNeutralTrim);assert.ok(bath.length);assert.ok(bath.every(mesh=>mesh.material.map.name==='wall:stripe-fine'&&mesh.material.color.getHexString()==='d4dfe7'));
    for(const wall of walls){const descriptor=wall.userData.roamWall;assert.ok(['x','z'].includes(descriptor.axis));assert.ok(descriptor.to>descriptor.from);if(wall.userData.sharedPartitionAxis)close(descriptor.doorway.to-descriptor.doorway.from,Math.min(1.45,(descriptor.to-descriptor.from)*.5));}
    const attachments=model.userData.roomParts.windows;assert.ok(attachments.length);assert.ok(attachments.every(mesh=>mesh.userData.roamAttachment&&walls.some(wall=>wall.userData.roamWall.id===mesh.userData.roamWallId)));
  }finally{model.dispose();t.dispose();}
});

test('roam models rebuild and dispose their resources without retaining old door or texture references',()=>{
  const t=textures(),home=createLookDevFixture('house').home,manor=createEstateManor({floors:[home],theme:HOME_THEMES.warm,roam:true}),room=createRoomExpansion({...home,...t,theme:HOME_THEMES.warm,roam:true});
  try {
    const old=manor.getRoamEntry(),oldCeilings=room.getRoamCeilings();let disposed=0;old.leaf.geometry.addEventListener('dispose',()=>disposed++);
    manor.setCustomization({plans:{structure:2}});const next=manor.getRoamEntry();assert.notEqual(next.leaf,old.leaf);assert.notEqual(next.hinge,old.hinge);close(next.width,1.4);assert.equal(disposed,1);
    room.setRooms(home.rooms,{roam:false});assert.equal(room.getRoamWalls().length,0);assert.equal(room.getRoamCeilings().length,0);assert.ok(oldCeilings.every(mesh=>mesh.parent===null));
  }finally{manor.dispose();room.dispose();t.dispose();}
});

// Pinned from source 473abb3, before adding roaming. These include every mesh's
// world transform, vertices, normals, UVs, indices and material values.
const BASELINES={
  default:{rooms:'8acc305e2d80a37a9082265c50bf02d2b7db1484f1034a31d5ecd075bcf06097',manor:'c7e7afaa4cbb514d8f25a3d66cc2f3cca035a33b46a41f7a1824ab2c232f14c6'},
  toy:{rooms:'df9994048d28850592d0e35ba06e6464fde93d86a2e4723ca207e5378cb7a7ed',manor:'6068cd3f25f70c7a4e61df6b9ce493de055388e4f54bb001a650ea4373a8ad62'},
  warm:{rooms:'656eff6e2be31b00bf822082aff4227bb4bf36515b7fa4274047470f960882f2',manor:'4d385377fdaba86c55146b2654ed137cce985ce7306ba6ecd99c8605bfb2365f'},
};
test('Default and Toy meshes plus the Warm interior remain byte-identical while Warm exterior follows its selected entry',()=>{
  const t=textures();
  try {
    for(const id of['default','toy','warm'])for(const request of[{},...id==='warm'?[]:[{roam:true}]]) {
      const options={rooms:resolveRooms('atrium'),theme:HOME_THEMES[id],...t,...request},room=createRoomExpansion(options),manor=createEstateManor(options);
      try {assert.equal(fingerprint(room),BASELINES[id].rooms);if(id!=='warm')assert.equal(fingerprint(manor),BASELINES[id].manor);else {const entry=getManorFacadeLayout({rooms:options.rooms},{theme:HOME_THEMES.warm}).entrance;assert.equal(entry.room.kind,'gallery','the enclosed canonical living room has no eligible front/right wall in this preset');const steps=meshes(manor).filter(mesh=>mesh.userData.buildingPart==='entrance-step');assert.equal(steps.length,3);assert.ok(steps.every(mesh=>mesh.userData.roomId===entry.room.id));assert.ok(fingerprint(manor)!==BASELINES[id].manor,'Warm may move its entrance under the new room-kind rule');}assert.equal(manor.getRoamEntry(),null);assert.equal(room.getRoamWalls().length,0);}finally{room.dispose();manor.dispose();}
    }
  }finally{t.dispose();}
});
