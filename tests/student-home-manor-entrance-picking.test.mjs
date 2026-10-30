import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createEstateManor} from '../public/js/home-estate-manor.js';
import {createHomeState} from '../public/js/home-engine.js';
import {createRoom} from '../public/js/home-layout.js';
import {HOME_THEMES} from '../public/js/home-theme.js';
import {getManorDoorWidth} from '../public/js/home-manor-layout.js';

const nodes=root=>{const all=[];root.traverse(node=>all.push(node));return all;};
const targets=root=>nodes(root).filter(node=>node.userData.estateEntranceDoor===true);
function ancestor(node,predicate){for(let p=node;p;p=p.parent)if(predicate(p))return p;return null;}
const facade=node=>ancestor(node,p=>p.userData.buildingPart==='facade');
const normal=node=>new THREE.Vector3(0,0,1).applyQuaternion(facade(node).getWorldQuaternion(new THREE.Quaternion()));
const centre=node=>{node.geometry.computeBoundingBox();return node.localToWorld(node.geometry.boundingBox.getCenter(new THREE.Vector3()));};
const rayAt=(point,outward,distance=3)=>new THREE.Raycaster(point.clone().addScaledVector(outward,distance),outward.clone().negate(),0,distance+1);
const first=(model,point,outward)=>rayAt(point,outward).intersectObject(model,true)[0];
function homes(){const ground=createHomeState({sandbox:false,profile:'account'});return {ground,upper:createHomeState({sandbox:false,profile:'upper',slab:ground.slab})};}
function fingerprint(root){
  root.updateMatrixWorld(true);
  const rows=nodes(root).filter(node=>node.isMesh).map(mesh=>({matrix:mesh.matrixWorld.toArray(),geometry:Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([key,a])=>[key,Array.from(a.array)])),index:mesh.geometry.index?Array.from(mesh.geometry.index.array):null,material:{color:mesh.material.color?.getHexString(),roughness:mesh.material.roughness,metalness:mesh.material.metalness,side:mesh.material.side,opacity:mesh.material.opacity,map:mesh.material.map?.name??null}}));
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

test('Warm ordinary entrance picking marks only the real ground-floor door frame, leaf and handles',()=>{
  const {ground,upper}=homes();
  for(const structure of [1,2,3])for(const configuration of [{rooms:ground.rooms},{floors:[ground,upper]}]){
    const model=createEstateManor({...configuration,theme:HOME_THEMES.warm,plans:{structure,decor:3,detail:3}});
    try{
      model.updateMatrixWorld(true);const parts=targets(model),leaf=parts.find(node=>node.geometry.type==='ShapeGeometry');
      assert.equal(parts.length,6);assert.ok(leaf);assert.equal(parts.filter(node=>node.geometry.type==='ExtrudeGeometry').length,1);
      assert.equal(parts.filter(node=>node.geometry.type==='SphereGeometry').length,2);
      assert.ok(parts.every(node=>node.isMesh&&node.userData.storey===0&&node.userData.estateFeature==='manor'));
      assert.equal(model.userData.estateEntranceDoor,undefined);assert.equal(facade(leaf).userData.estateEntranceDoor,undefined);
      assert.equal(first(model,centre(leaf),normal(leaf)).object.uuid,leaf.uuid,'a real first-hit ray reaches the visible door panel');
      const frame=parts.find(node=>node.geometry.type==='ExtrudeGeometry');
      const framePoint=frame.localToWorld(new THREE.Vector3(getManorDoorWidth(structure)/2+.10,.6,.24));
      // Look around the real porch column; an occluding column must keep its
      // own hit behavior rather than acquiring the doorway's metadata.
      const lateral=new THREE.Vector3(1,0,0).applyQuaternion(facade(frame).getWorldQuaternion(new THREE.Quaternion()));
      const origin=framePoint.clone().addScaledVector(normal(frame),3).addScaledVector(lateral,-2);
      const frameHit=new THREE.Raycaster(origin,framePoint.clone().sub(origin).normalize(),0,4).intersectObject(model,true)[0];
      assert.equal(frameHit.object.uuid,frame.uuid,'visible door trim is clickable around the porch column');
      for(const handle of parts.filter(node=>node!==leaf&&node!==frame))assert.equal(first(model,centre(handle),normal(handle)).object.userData.estateEntranceDoor,true);
      assert.ok(nodes(model).filter(node=>node.userData.storey===1).every(node=>!node.userData.estateEntranceDoor));
    }finally{model.dispose();}
  }
});

test('roof, windows, facade body, upper floor and steps do not become entrance hit targets',()=>{
  const {ground,upper}=homes(),model=createEstateManor({floors:[ground,upper],theme:HOME_THEMES.warm,plans:{structure:1}});
  try{
    model.updateMatrixWorld(true);const all=nodes(model);
    for(const storey of [0,1]){
      const window=all.find(node=>node.userData.buildingPart==='window'&&node.userData.storey===storey);assert.ok(window);
      const hit=first(model,window.localToWorld(new THREE.Vector3(0,.75,.2)),normal(window));assert.ok(hit);
      assert.ok(ancestor(hit.object,node=>node===window),'ray hits the actual visible window');
      assert.equal(hit.object.userData.estateEntranceDoor,undefined);
    }
    const wall=all.find(node=>node.userData.buildingPart==='facade'&&node.userData.side==='back'&&node.userData.storey===0);
    const wallHit=first(model,wall.localToWorld(new THREE.Vector3(1.1,2.6,.07)),normal(wall));assert.ok(wallHit);
    assert.equal(wallHit.object.userData.buildingPart,'shell-volume');assert.equal(wallHit.object.userData.estateEntranceDoor,undefined);
    const roof=all.find(node=>node.isMesh&&node.userData.buildingPart==='roof');assert.ok(roof);
    const roofPoint=centre(roof),roofHit=first(model,roofPoint,new THREE.Vector3(0,1,0));assert.ok(roofHit);
    assert.equal(roofHit.object.userData.buildingPart,'roof');assert.equal(roofHit.object.userData.estateEntranceDoor,undefined);
    const step=all.find(node=>node.userData.buildingPart==='entrance-step'),stepHit=first(model,centre(step),normal(step));
    assert.ok(stepHit);assert.equal(stepHit.object.userData.buildingPart,'entrance-step');assert.equal(stepHit.object.userData.estateEntranceDoor,undefined);
    const marked=new Set(targets(model));assert.ok(all.filter(node=>!marked.has(node)).every(node=>node.userData.estateEntranceDoor===undefined));
  }finally{model.dispose();}
});

test('Default, Toy and the separate Warm roam model keep their existing picking contract',()=>{
  const {ground,upper}=homes();
  for(const theme of [HOME_THEMES.default,HOME_THEMES.toy])for(const roam of [false,true]){
    const model=createEstateManor({floors:[ground,upper],theme,roam});
    try{assert.equal(targets(model).length,0);}finally{model.dispose();}
  }
  const roam=createEstateManor({floors:[ground],theme:HOME_THEMES.warm,roam:true});
  try{assert.equal(targets(roam).length,0);assert.ok(roam.getRoamEntry().leaf.userData.roamDoor);}finally{roam.dispose();}
});

test('rebuilds replace the tagged door with the newly selected entrance and retain disposal ownership',()=>{
  const {ground,upper}=homes(),model=createEstateManor({floors:[ground],theme:HOME_THEMES.warm});
  try{
    model.updateMatrixWorld(true);const previous=targets(model),leaf=previous.find(node=>node.geometry.type==='ShapeGeometry'),oldPoint=centre(leaf),oldNormal=normal(leaf);let disposed=0;
    leaf.geometry.addEventListener('dispose',()=>disposed++);
    const expanded=createHomeState({sandbox:false,profile:'account',rooms:[...ground.rooms,createRoom('bedroom',-1,1,'front-bedroom')],slab:{rects:[{minX:-2.8,minZ:-2.6,width:5.6,depth:10.4}]}});
    model.setFloors([expanded,upper]);model.updateMatrixWorld(true);
    let next=targets(model),current=next.find(node=>node.geometry.type==='ShapeGeometry');
    assert.equal(disposed,1);assert.equal(next.length,6);assert.ok(previous.every(node=>!ancestor(node,parent=>parent===model)));
    assert.ok(centre(current).distanceTo(oldPoint)>1);assert.ok(normal(current).distanceTo(oldNormal)>1,'the chosen entrance now faces right');
    assert.equal(first(model,centre(current),normal(current)).object.uuid,current.uuid);
    assert.ok(!rayAt(oldPoint,oldNormal).intersectObject(model,true)[0]?.object.userData.estateEntranceDoor,'the old doorway is no longer a target');
    model.setCustomization({plans:{structure:3},color:'#aa6677'});next=targets(model);assert.equal(next.length,6);
    assert.ok(next.every(node=>node.userData.estateFeature==='manor'&&node.userData.storey===0));
    model.setRooms(ground.rooms);assert.equal(targets(model).length,6);model.setTier('atrium');assert.equal(targets(model).length,6);
  }finally{model.dispose();assert.equal(targets(model).length,0);}
});

// Captured from the equivalent public 237c565 model before adding picking metadata. All modeled transforms,
// vertex/index data and material values are included; userData is excluded.
const BEFORE={
  'default-legacy':'0cb47b27123a71530b970206556032cd19ebde8fa613a7cab0fc0aa74164f1da',
  'default-two-storeys':'e01e48018bebe5c32ff4653d84f0f2c34b2894d6561aa11b00ddd780c4ba180d',
  'toy-legacy':'873c2b7783bf7813f0b6050bf74a9c1bc4077c3e46e7d54f3889c86570f4d947',
  'toy-two-storeys':'e0f023ab49a1e34a78ba0a9121fda2f74b72d7c5b73ac8273ef42f456b42ee0c',
  'warm-legacy':'1786f8072f0ddc0ba47ef7a8dc289c2d56b3c4f9e4bd2087a3e1b2f0f7e03fb1',
  'warm-two-storeys':'bdf437833bd6e6571887409273d74f22a1f07e4a38b2daea993c8d9904783cb4',
};
test('door picking metadata leaves the modeled geometry, materials and world transforms unchanged in every theme',()=>{
  const {ground,upper}=homes();
  for(const theme of ['default','toy','warm'])for(const type of ['legacy','two-storeys']){
    const model=createEstateManor({theme:HOME_THEMES[theme],...(type==='legacy'?{rooms:ground.rooms}:{floors:[ground,upper]}),plans:{structure:3,decor:3,detail:3}});
    try{assert.equal(fingerprint(model),BEFORE[theme+'-'+type]);}finally{model.dispose();}
  }
});
