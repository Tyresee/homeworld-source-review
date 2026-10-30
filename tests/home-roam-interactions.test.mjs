import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createLookDevFixture} from '../scripts/qa/look-dev-fixtures.mjs';
import {createLuxuryItem} from '../public/js/home-luxury-models.js';
import {getFurniturePose} from '../public/js/home-engine.js';
import {createHomeRoamInteractions} from '../public/js/home-roam-interactions.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const step=(controller,seconds)=>{for(let t=0;t<seconds;t+=.025)controller.tick(.025);};
function quietAudio() {const calls=[];return {calls,unlock(){calls.push(['unlock']);},play(...args){calls.push(args);},setMuted(value){this.muted=value;},getMuted(){return this.muted??false;}};}
function fixtureWorld() {
  const fixture=createLookDevFixture('house'),root=new THREE.Group(),audio=quietAudio();
  for(const item of fixture.home.furniture) {const model=createLuxuryItem(item),pose=getFurniturePose(fixture.home,item);model.position.set(pose.x,pose.y,pose.z);model.rotation.y=pose.rotation*Math.PI/180;model.userData.furnitureId=item.id;root.add(model);}
  const ceilingLights=fixture.home.rooms.map((room,i)=>{
    const disc=new THREE.Mesh(new THREE.CircleGeometry(.26,24),new THREE.MeshStandardMaterial({emissive:'#ffe1b8',emissiveIntensity:1}));disc.position.set(i*2,2.6,0);disc.rotation.x=Math.PI/2;root.add(disc);
    const light=new THREE.PointLight('#ffe1b8',24,11,2);root.add(light);return {id:'ceiling:'+room.id,roomId:room.id,disc,light,on:true,setEnabled(on){light.intensity=on?24:0;}};
  });
  const controller=createHomeRoamInteractions({root,rooms:fixture.home.rooms,ceilingLights,audio});
  return {fixture,root,audio,ceilingLights,controller,dispose(){controller.dispose();release(root);}};
}
function release(root) {const geometries=new Set(),materials=new Set();root.traverse(mesh=>{if(mesh.geometry)geometries.add(mesh.geometry);for(const material of[].concat(mesh.material??[]))materials.add(material);});for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();}

test('real House models identify exactly the specified eighteen interactions and their furniture types',()=>{
  const world=fixtureWorld(),{controller,fixture}=world,before=JSON.stringify(fixture.home);
  try {
    assert.equal(controller.targets.length,18);assert.deepEqual(controller.getState().counts,{'floor-lamp':1,hob:2,drawer:6,faucet:2,'cabinet-door':2,toilet:1,'ceiling-light':4});
    const counts={};for(const target of controller.targets)counts[`${target.type}:${target.kind}`]=(counts[`${target.type}:${target.kind}`]??0)+1;
    assert.deepEqual(counts,{'floor-lamp:hhTripodLamp':1,'hob:mkDoubleGas':2,'drawer:mkDoubleGas':2,'faucet:mkSingleSink':1,'cabinet-door:mkSingleSink':2,'drawer:hhDropLeafTable':1,'drawer:bedsideCabinet':1,'toilet:compactToilet':1,'faucet:bathroomVanity':1,'drawer:bathroomVanity':2,'ceiling-light:ceiling':4});
    assert.equal(controller.tick(.1),false,'idle interaction layer does not request a continuous render');assert.equal(JSON.stringify(fixture.home),before);assert.deepEqual(world.audio.calls,[],'building/hover preparation never unlocks audio');
  }finally{world.dispose();}
});

test('all real drawers and doors animate to visible open states, reverse, and stop requesting frames',()=>{
  const world=fixtureWorld();
  try {
    for(const target of world.controller.targets.filter(target=>['drawer','cabinet-door'].includes(target.type))) {
      const initial=new THREE.Matrix4();target.panel.updateWorldMatrix(true,false);initial.copy(target.panel.matrixWorld);
      assert.ok(world.controller.activate(target));step(world.controller,.8);assert.equal(target.progress,1);target.panel.updateWorldMatrix(true,false);assert.notDeepEqual(target.panel.matrixWorld.elements,initial.elements);
      if(target.type==='drawer') {near(target.mover.position.length(),target.distance);if(target.drawerBox.length){assert.equal(target.drawerBox.length,4);assert.ok(target.drawerBox.every(mesh=>mesh.material.color.getHexString()==='e7d2ae'));}}
      else {const owner=world.root.children.find(group=>group.userData.kind===target.kind),forward=new THREE.Vector3(0,0,1).transformDirection(owner.matrixWorld),delta=target.panel.getWorldPosition(new THREE.Vector3()).sub(new THREE.Vector3().setFromMatrixPosition(initial));assert.ok(delta.dot(forward)>0,'both cabinet leaves swing outwards');target.mover.getWorldPosition(new THREE.Vector3()).toArray().forEach((value,i)=>near(value,target.hinge.toArray()[i]));}
      assert.ok(world.controller.activate(target));step(world.controller,.8);assert.equal(target.progress,0);target.panel.updateWorldMatrix(true,false);target.panel.matrixWorld.elements.forEach((value,i)=>near(value,initial.elements[i]));assert.equal(world.controller.tick(.1),false);
    }
  }finally{world.dispose();}
});

test('both faucets, both fourteen-flame hobs, room lights and floor lamp toggle with bounded resources',()=>{
  const world=fixtureWorld();
  const count=()=>{let nodes=0,lights=0;world.root.traverse(object=>{nodes++;if(object.isLight)lights++;});return {nodes,lights};};
  try {
    const before=count();
    for(const target of world.controller.targets.filter(target=>['faucet','hob','floor-lamp','ceiling-light'].includes(target.type))) {
      const original=target.on;assert.ok(world.controller.activate(target));assert.notEqual(target.on,original);world.controller.tick(.05);
      if(target.type==='faucet'){assert.equal(target.stream.visible,true);near(target.stream.material.opacity,.72);near(target.stream.geometry.parameters.radiusTop,.009);near(target.stream.geometry.parameters.radiusBottom,.013);assert.notEqual(target.ripple.material.opacity,.6);}
      if(target.type==='hob'){assert.equal(target.flame.children.length,14);assert.equal(target.flame.visible,true);near(target.light.intensity,.2);assert.ok(target.flame.children.some(mesh=>mesh.scale.y!==1));}
      if(target.type==='floor-lamp'){near(target.light.intensity,16);near(target.floorLight.intensity,8);near(target.shade.material.emissiveIntensity,1.6);assert.equal(target.shade.material.emissive.getHexString(),'ffc477');}
      if(target.type==='ceiling-light'){assert.equal(target.descriptor.light.intensity,0);assert.equal(target.descriptor.enabled,false);}
      assert.ok(world.controller.activate(target));assert.equal(target.on,original);assert.equal(world.controller.tick(.1),false);
    }
    assert.deepEqual(count(),before,'toggling never creates a new light or mesh');assert.ok(world.audio.calls.some(call=>call[0]==='water'&&call[1]===false));assert.ok(world.audio.calls.some(call=>call[0]==='gas'&&call[1]===false));
  }finally{world.dispose();}
});

test('a placed floor lamp keeps two fixed nonshadow lights and a 1.4 m downward floor footprint while ceiling lights remain unchanged',()=>{
  const root=new THREE.Group();root.position.set(3,0,-2);root.rotation.y=.63;
  const lamp=createLuxuryItem({kind:'hhTripodLamp'});lamp.position.set(-1.8,.06,4.05);root.add(lamp);
  const disc=new THREE.Mesh(new THREE.CircleGeometry(.26,24),new THREE.MeshStandardMaterial({emissive:'#ffe1b8',emissiveIntensity:1})),ceilingLight=new THREE.PointLight('#ffe1b8',24,11,2);root.add(disc,ceilingLight);
  const ceilingLights=[{id:'ceiling:test',disc,light:ceilingLight,on:true}],controller=createHomeRoamInteractions({root,ceilingLights,audio:quietAudio()});
  const world={root,controller,ceilingLights,dispose(){controller.dispose();release(root);}},target=controller.targets.find(target=>target.type==='floor-lamp'),light=target.light,pool=target.floorLight;
  try {
    const borrowedShadeMaterial=target.shade.material,originalShadeColor=borrowedShadeMaterial.color.getHexString(),originalRoughness=borrowedShadeMaterial.roughness;
    const originalCeilings=world.ceilingLights.map(({disc,light})=>({disc:disc.material.emissiveIntensity,intensity:light.intensity,distance:light.distance,castShadow:light.castShadow}));
    world.root.updateMatrixWorld(true);const origin=pool.getWorldPosition(new THREE.Vector3()),floor=pool.target.getWorldPosition(new THREE.Vector3()),shadeBounds=new THREE.Box3().setFromObject(target.shade),height=origin.y-floor.y;
    assert.ok(light.isPointLight);assert.equal(light.distance,5);assert.equal(light.decay,2);assert.equal(light.castShadow,false);
    assert.ok(pool.isSpotLight);assert.equal(pool.castShadow,false);assert.equal(pool.decay,2);near(origin.x,floor.x);near(origin.z,floor.z);assert.ok(height>1);near(2*Math.tan(pool.angle)*height,1.4);assert.ok(origin.y<shadeBounds.min.y,'cone starts below the shade rim');
    assert.equal(pool.target,target.floorTarget);assert.equal(pool.target.parent,world.root);assert.ok(pool.penumbra>=.75,'the floor spot has a soft edge');
    const positions=[light.position.toArray(),pool.position.toArray(),pool.target.position.toArray()];assert.equal(light.intensity,0);assert.equal(pool.intensity,0);assert.equal(light.visible,true);assert.equal(pool.visible,true);
    for(let i=0;i<3;i++) {
      world.controller.activate(target);assert.equal(light.intensity,16);assert.equal(pool.intensity,8);assert.equal(target.shade.material.emissiveIntensity,1.6);assert.notEqual(target.shade.material,borrowedShadeMaterial);assert.equal(target.shade.material.color.getHexString(),'fff4df');assert.equal(target.shade.material.roughness,originalRoughness);assert.equal(borrowedShadeMaterial.color.getHexString(),originalShadeColor);
      world.controller.activate(target);assert.equal(light.intensity,0);assert.equal(pool.intensity,0);assert.equal(target.shade.material.emissiveIntensity,0);assert.equal(target.shade.material.color.getHexString(),originalShadeColor);assert.equal(borrowedShadeMaterial.color.getHexString(),originalShadeColor);
    }
    assert.deepEqual([light.position.toArray(),pool.position.toArray(),pool.target.position.toArray()],positions);assert.equal(light.visible,true);assert.equal(pool.visible,true);
    assert.deepEqual(world.ceilingLights.map(({disc,light})=>({disc:disc.material.emissiveIntensity,intensity:light.intensity,distance:light.distance,castShadow:light.castShadow})),originalCeilings,'floor lamp cannot edit room lighting');
    world.controller.activate(target);world.controller.dispose();assert.equal(light.parent,null);assert.equal(pool.parent,null);assert.equal(pool.target.parent,null);assert.equal(target.shade.material,borrowedShadeMaterial);assert.equal(target.shade.material.color.getHexString(),originalShadeColor);
  }finally{world.dispose();}
});

test('toilet presses its real button, swirls and lowers water for 2.8 seconds, then restores and unlocks',()=>{
  const world=fixtureWorld(),target=world.controller.targets.find(target=>target.type==='toilet');
  try {
    const position=target.water.position.clone(),rotation=target.water.rotation.clone(),buttonY=target.button.position.y;
    assert.equal(world.controller.activate(target),true);assert.equal(world.controller.activate(target),false,'busy flush ignores repeated clicks');world.controller.tick(.1);assert.ok(target.button.position.y<buttonY);step(world.controller,.7);
    assert.ok(target.water.position.y<position.y);assert.ok(target.water.scale.x<1);assert.notEqual(target.water.rotation.z,rotation.z);step(world.controller,2.1);
    assert.equal(target.busy,false);assert.deepEqual(target.water.position.toArray(),position.toArray());assert.deepEqual(target.water.rotation.toArray(),rotation.toArray());near(target.button.position.y,buttonY);near(target.water.scale.x,1);assert.equal(world.controller.tick(.1),false);assert.equal(world.controller.activate(target),true);
  }finally{world.dispose();}
});

test('ceiling light callbacks can edit the disc without mutating its borrowed material or losing the on emission',()=>{
  const world=fixtureWorld(),target=world.controller.targets.find(target=>target.type==='ceiling-light'),disc=target.descriptor.disc,original=disc.material;
  target.descriptor.setEnabled=on=>{target.descriptor.light.intensity=on?24:0;disc.material.emissiveIntensity=on?1:0;};
  try {world.controller.activate(target);assert.equal(disc.material.emissiveIntensity,0);assert.equal(original.emissiveIntensity,1);world.controller.activate(target);assert.equal(disc.material.emissiveIntensity,1);assert.equal(original.emissiveIntensity,1);}
  finally{world.dispose();}
});

test('generic recognition works for an unknown cabinet kind across all four rotations',()=>{
  for(const degrees of[0,90,180,270]) {
    const root=new THREE.Group(),model=new THREE.Group();model.userData.kind='future-catalog-cabinet';model.rotation.y=degrees*Math.PI/180;model.position.set(3,.08,-2);root.add(model);
    const add=(size,position,metadata)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshStandardMaterial());mesh.position.set(...position);mesh.userData=metadata;model.add(mesh);return mesh;};
    add([1,.8,.7],[0,.4,0],{paintable:true,part:'cabinet-shell'});const panel=add([.8,.2,.04],[0,.6,.38],{paintable:true,part:'drawer-front'});add([.14,.02,.03],[0,.6,.42],{paintable:false,part:'new-handle'});
    const controller=createHomeRoamInteractions({root,audio:quietAudio()});
    try {
      assert.equal(controller.targets.length,1);const target=controller.targets[0];assert.equal(target.type,'drawer');assert.equal(target.panel,panel);root.updateMatrixWorld(true);const before=panel.getWorldPosition(new THREE.Vector3()),direction=new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),degrees*Math.PI/180);
      controller.activate(target);step(controller,.5);const delta=panel.getWorldPosition(new THREE.Vector3()).sub(before);near(delta.dot(direction),.32);near(delta.length(),.32);assert.equal(target.drawerBox.length,4);
      const box=new THREE.Box3();for(const mesh of target.drawerBox)box.union(new THREE.Box3().setFromObject(mesh));const boxSize=box.getSize(new THREE.Vector3());near(boxSize[degrees%180?'z':'x'],.75);near(boxSize.y,.15);near(boxSize[degrees%180?'x':'z'],.34);
    }finally{controller.dispose();release(root);}
  }
});

test('picking respects the first visible surface, hidden ancestors and the six metre limit; hover clones safely',()=>{
  const root=new THREE.Group(),model=createLuxuryItem({kind:'hhTripodLamp'});root.add(model);
  const blocker=new THREE.Mesh(new THREE.BoxGeometry(2,3,.1),new THREE.MeshStandardMaterial());blocker.position.set(0,1,1);root.add(blocker);
  const controller=createHomeRoamInteractions({root,audio:quietAudio()}),target=controller.targets[0],originals=target.meshes.map(mesh=>mesh.material),ray=new THREE.Raycaster(new THREE.Vector3(0,1.4,3),new THREE.Vector3(0,0,-1));
  try {
    assert.equal(controller.pick(ray),null,'opaque unrelated wall blocks the lamp');blocker.visible=false;assert.equal(controller.hover(ray)?.target,target);
    assert.ok(target.meshes.every((mesh,i)=>mesh.material!==originals[i]));assert.ok(originals.every(material=>material.emissive.getHexString()==='000000'||material.emissive.getHexString()==='e8bb67'),'borrowed materials remain unchanged');
    model.visible=false;assert.equal(controller.hover(ray),null);model.visible=true;ray.ray.origin.z=9;assert.equal(controller.pick(ray),null,'targets beyond six metres cannot be used');
  }finally{controller.dispose();assert.ok(target.meshes.every((mesh,i)=>mesh.material===originals[i]));release(root);}
});

test('disposing restores every original transform, material reference and parent; borrowed geometry is never disposed',()=>{
  const fixture=createLookDevFixture('house'),root=new THREE.Group(),snapshots=[];let originalDisposals=0;
  for(const item of fixture.home.furniture){const model=createLuxuryItem(item),pose=getFurniturePose(fixture.home,item);model.position.set(pose.x,pose.y,pose.z);model.rotation.y=pose.rotation*Math.PI/180;root.add(model);model.traverse(mesh=>{if(mesh.isMesh){snapshots.push({mesh,parent:mesh.parent,index:mesh.parent.children.indexOf(mesh),material:mesh.material,position:mesh.position.toArray(),quaternion:mesh.quaternion.toArray(),scale:mesh.scale.toArray()});mesh.geometry.addEventListener('dispose',()=>originalDisposals++);}});}
  const audio=quietAudio(),controller=createHomeRoamInteractions({root,audio});
  for(const target of controller.targets)controller.activate(target);step(controller,.8);controller.dispose();controller.dispose();
  try {
    assert.equal(originalDisposals,0);for(const row of snapshots){assert.equal(row.mesh.parent,row.parent);assert.equal(row.parent.children.indexOf(row.mesh),row.index);assert.equal(row.mesh.material,row.material);assert.deepEqual(row.mesh.position.toArray(),row.position);assert.deepEqual(row.mesh.quaternion.toArray(),row.quaternion);assert.deepEqual(row.mesh.scale.toArray(),row.scale);}
    assert.equal(controller.tick(.1),false);assert.equal(controller.activate(controller.targets[0]),false);assert.equal(controller.getState().disposed,true);
  }finally{release(root);}
});
