import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildHomeRoamScene} from '../public/js/home-roam-world.js';
import {createHomeRoamInteractions} from '../public/js/home-roam-interactions.js';
import {createLookDevFixture} from '../scripts/qa/look-dev-fixtures.mjs';
import {HOME_THEMES} from '../public/js/home-theme.js';
import {getHomeRoamEntrance} from '../public/js/home-roam-geometry.js';
import {applyChange,getWallMountTargets,getFurniturePose} from '../public/js/home-engine.js';
import {getFloorTextureCacheStats} from '../public/js/home-floor-textures.js';
import {getWallTextureCacheStats} from '../public/js/home-wall-textures.js';

let priorDocument;
before(()=>{
  priorDocument=globalThis.document;
  globalThis.document={createElement(tag){assert.equal(tag,'canvas');const context=new Proxy({}, {get:(target,key)=>target[key]??(()=>{}),set:(target,key,value)=>(target[key]=value,true)});return {width:0,height:0,getContext:()=>context};}};
});
after(()=>{globalThis.document=priorDocument;});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<2e-5,`${actual} != ${expected}`);
const quietAudio=()=>({unlock(){},play(){},setMuted(){}});
const meshes=root=>{const result=[];root.traverse(mesh=>{if(mesh.isMesh)result.push(mesh);});return result;};
const lightCount=root=>{let count=0;root.traverse(node=>{if(node.isLight)count++;});return count;};

test('the real first-floor builder preserves inputs and produces the exact eighteen registry targets with four real ceiling lights',()=>{
  const home=createLookDevFixture('house').home,before=JSON.stringify(home),map=new THREE.Texture(),version=map.version,model=buildHomeRoamScene({home,theme:HOME_THEMES.warm,maps:{oak:map},robot:null});let mapDisposed=0;map.addEventListener('dispose',()=>mapDisposed++);
  const controller=createHomeRoamInteractions({root:model.interior,rooms:home.rooms,ceilingLights:model.ceilingLights,audio:quietAudio()});
  try {
    assert.equal(model.ceilingLights.length,4);assert.equal(model.ceilings.length,4);assert.equal(controller.targets.length,18);assert.deepEqual(controller.getState().counts,{'floor-lamp':1,hob:2,drawer:6,faucet:2,'cabinet-door':2,toilet:1,'ceiling-light':4});
    const lights=lightCount(model.scene);assert.equal(lights,7,'four ceiling lights plus the floor lamp and two hob glows');
    for(const row of model.furniture){const item=home.furniture.find(item=>item.id===row.itemId),pose=getFurniturePose(home,item);assert.deepEqual(row.group.position.toArray(),[pose.x,pose.y,pose.z]);near(row.group.rotation.y,pose.rotation*Math.PI/180);}
    for(const descriptor of model.ceilingLights){assert.ok(descriptor.disc.isMesh);assert.ok(descriptor.light.isPointLight);assert.equal(descriptor.light.castShadow,false);assert.equal(descriptor.light.distance,11);assert.equal(descriptor.light.decay,2);near(descriptor.disc.geometry.parameters.radiusTop,.26);}
    for(const target of controller.targets)controller.activate(target);for(let i=0;i<30;i++)controller.tick(.1);assert.equal(lightCount(model.scene),lights,'interaction toggles do not reallocate lights');assert.equal(JSON.stringify(home),before);assert.equal(map.version,version);
    assert.throws(()=>buildHomeRoamScene({home,theme:HOME_THEMES.default}),/Warm/);assert.throws(()=>buildHomeRoamScene({home,theme:HOME_THEMES.toy}),/Warm/);
  }finally{controller.dispose();model.dispose();assert.equal(mapDisposed,0,'borrowed furniture texture must remain owned by the caller');map.dispose();}
});

test('orbit wall clipping follows plane separation, uses 0.5 m bodies plus 4.5 cm caps, and restores without reallocating geometry',()=>{
  const home=createLookDevFixture('house').home,model=buildHomeRoamScene({home,theme:HOME_THEMES.warm}),walls=model.architecture.getRoamWalls(),caps=meshes(model.interior).filter(mesh=>mesh.userData.roamCutCap),count=meshes(model.scene).length;
  const camera=new THREE.PerspectiveCamera();camera.position.set(model.bounds.minX-4,1.45,model.bounds.minZ-4);const target=new THREE.Vector3(model.bounds.x,1.45,model.bounds.z);
  try {
    assert.ok(walls.length);assert.ok(caps.length);assert.ok(model.getWallState().every(row=>!row.cut));assert.ok(caps.every(cap=>!cap.visible));
    assert.equal(model.setOrbitCut(camera,target,true),true);const state=new Map(model.getWallState().map(row=>[row.id,row]));assert.ok([...state.values()].some(row=>row.cut));
    const planesByWall=new Map();
    for(const mesh of walls) {
      const info=mesh.userData.roamWall,expected=(camera.position[info.axis]-info.plane)*(target[info.axis]-info.plane)<-1e-5,row=state.get(info.id);assert.equal(row.cut,expected);near(row.bodyHeight,.5);near(row.capHeight,.045);
      for(const material of[].concat(mesh.material)){assert.equal(material.clippingPlanes.length,1);assert.deepEqual(material.clippingPlanes[0].normal.toArray(),[0,-1,0]);near(material.clippingPlanes[0].constant,expected?info.minY+.5:1e6);assert.equal(material.clipShadows,true);if(!planesByWall.has(info.id))planesByWall.set(info.id,new Set());planesByWall.get(info.id).add(material.clippingPlanes[0]);}
    }
    const unique=[...planesByWall.values()];for(let i=0;i<unique.length;i++)for(let j=i+1;j<unique.length;j++)assert.ok([...unique[i]].every(plane=>!unique[j].has(plane)),'separate walls cannot share a mutable clipping plane');
    for(const cap of caps){const b=new THREE.Box3().setFromObject(cap),size=b.getSize(new THREE.Vector3());near(size.y,.045);near(b.min.y,.56);near(b.max.y,.605);assert.ok([.17,.2].some(thickness=>Math.abs(Math.min(size.x,size.z)-thickness)<2e-5),'cut cap keeps its partition or outer-wall thickness');assert.equal(cap.material.color.getHexString(),'4a3f37');}
    assert.equal(model.setOrbitCut(camera,target,true),false,'unchanged camera separation needs no rebuild');assert.equal(meshes(model.scene).length,count);
    assert.equal(model.setOrbitCut(camera,target,false),true);assert.ok(model.getWallState().every(row=>!row.cut));assert.ok(caps.every(cap=>!cap.visible));assert.ok(walls.every(mesh=>[].concat(mesh.material).every(material=>material.clippingPlanes[0].constant===1e6)));assert.equal(meshes(model.scene).length,count);
  }finally{model.dispose();}
});

test('window attachments follow their own full wall cut and the closed door is the first exterior ray hit',()=>{
  const home=createLookDevFixture('house').home,model=buildHomeRoamScene({home,theme:HOME_THEMES.warm}),walls=model.architecture.getRoamWalls(),attachments=[];
  model.architecture.traverse(node=>{if(node.userData.roamWallId)attachments.push(node);});
  try {
    assert.ok(attachments.length);const wall=walls.find(mesh=>mesh.userData.roamWall.id===attachments[0].userData.roamWallId),info=wall.userData.roamWall,camera=new THREE.PerspectiveCamera(),target=new THREE.Vector3(model.bounds.x,1.45,model.bounds.z);camera.position.copy(target);camera.position[info.axis]=info.plane-3;target[info.axis]=info.plane+1;
    model.setOrbitCut(camera,target,true);assert.ok(attachments.filter(node=>node.userData.roamWallId===info.id).every(node=>!node.visible));model.setOrbitCut(camera,target,false);assert.ok(attachments.every(node=>node.visible));
    const entry=model.entrance,expected=getHomeRoamEntrance(home);near(entry.center.x,expected.center.x);near(entry.center.z,expected.center.z);assert.equal(entry.roomId,expected.roomId);
    model.scene.updateMatrixWorld(true);const direction=entry.outward.clone().negate(),origin=entry.center.clone().addScaledVector(entry.outward,2),first=new THREE.Raycaster(origin,direction).intersectObjects(meshes(model.scene),false)[0];
    assert.ok(first);assert.ok(first.object===entry.leaf||entry.handles.includes(first.object),'door hover ray is not blocked by a filled facade/frame');assert.equal(entry.leaf.material.side,THREE.DoubleSide);assert.equal(entry.handles.every(handle=>handle.parent===entry.hinge),true);
    const closed=entry.leaf.getWorldPosition(new THREE.Vector3());model.manor.visible=false;model.interior.visible=true;entry.hinge.rotation.y=1.8;model.scene.updateMatrixWorld(true);assert.equal(entry.hinge.parent,model.doorway);assert.equal(model.doorway.parent,model.scene);assert.equal(model.doorway.visible,true);assert.ok(entry.leaf.getWorldPosition(new THREE.Vector3()).distanceTo(closed)>.5,'the same open modeled door remains visible when the exterior shell is hidden');
  }finally{model.dispose();}
});

test('a valid wall-mounted clock near a corner hides according to its supporting wall, not the later adjacent row',()=>{
  const initial=createLookDevFixture('house').home,target=getWallMountTargets(initial).find(row=>row.axis==='x'),result=applyChange(initial,{type:'furniture',id:'corner-clock',kind:'wallClock',x:0,z:0,rotation:0,mount:{type:'wall',wallId:target.wallId,u:.04,v:.5}});assert.equal(result.ok,true,result.error);
  const home=result.state,before=JSON.stringify(home),model=buildHomeRoamScene({home,theme:HOME_THEMES.warm}),clock=model.furniture.find(row=>row.itemId==='corner-clock').group,camera=new THREE.PerspectiveCamera();camera.position.set(model.bounds.x,1.45,-5);
  try {
    model.setOrbitCut(camera,new THREE.Vector3(model.bounds.x,1.45,0),true);const infos=model.architecture.getRoamWalls().map(mesh=>mesh.userData.roamWall),back=infos.find(info=>info.exterior&&info.side==='back'),left=infos.find(info=>info.exterior&&info.side==='left');assert.equal(model.getWallState().find(row=>row.id===back.id).cut,true);assert.equal(model.getWallState().find(row=>row.id===left.id).cut,false);
    assert.equal(clock.visible,false,'the supporting back wall was cut even though the adjacent left wall was not');model.setOrbitCut(camera,new THREE.Vector3(model.bounds.x,1.45,0),false);assert.equal(clock.visible,true);assert.equal(JSON.stringify(home),before);
  }finally{model.dispose();}
});

test('the disposable scene privately clones a frozen robot and releases owned resources once while retaining borrowed maps',()=>{
  const home=createLookDevFixture('house').home,source=new THREE.Group(),geometry=new THREE.BoxGeometry(.3,.5,.2),texture=new THREE.Texture(),material=new THREE.MeshStandardMaterial({map:texture}),body=new THREE.Mesh(geometry,material);source.name='frozen-test-robot';body.position.set(.3,1.1,.4);body.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),.7);source.add(body);const original=source.toJSON();let sourceGeometryDisposed=0,sourceMaterialDisposed=0,sourceTextureDisposed=0;geometry.addEventListener('dispose',()=>sourceGeometryDisposed++);material.addEventListener('dispose',()=>sourceMaterialDisposed++);texture.addEventListener('dispose',()=>sourceTextureDisposed++);
  const model=buildHomeRoamScene({home,theme:HOME_THEMES.warm,robot:source}),copy=model.interior.getObjectByName('frozen-test-robot'),owned=new Map();
  for(const mesh of meshes(model.scene))for(const resource of[mesh.geometry,...[].concat(mesh.material)])if(!owned.has(resource)){owned.set(resource,0);resource.addEventListener('dispose',()=>owned.set(resource,owned.get(resource)+1));}
  assert.ok(copy);assert.notEqual(copy.children[0].geometry,geometry);assert.notEqual(copy.children[0].material,material);assert.notEqual(copy.children[0].geometry.attributes.position.array,geometry.attributes.position.array);assert.deepEqual(copy.children[0].position.toArray(),body.position.toArray());assert.deepEqual(copy.children[0].quaternion.toArray(),body.quaternion.toArray());
  model.dispose();model.dispose();
  assert.equal(model.scene.children.length,0);assert.ok([...owned.values()].every(count=>count===1),'each visible owned material and geometry is disposed exactly once');assert.equal(sourceGeometryDisposed,0);assert.equal(sourceMaterialDisposed,0);assert.equal(sourceTextureDisposed,0);assert.deepEqual(source.toJSON(),original);assert.equal(getFloorTextureCacheStats().clones,0);assert.equal(getWallTextureCacheStats().clones,0);geometry.dispose();material.dispose();texture.dispose();
});
