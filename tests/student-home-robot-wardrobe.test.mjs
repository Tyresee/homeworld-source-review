import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createRobotAvatar,poseRobotAvatar,disposeRobotAvatar} from '../public/js/robot-avatar.js';
import {createRobotWardrobe} from '../public/js/robot-wardrobe.js';
import {ROBOT_CLOTHING_PRODUCTS,isRobotClothingSku} from '../public/js/robot-wardrobe-catalog.js';
import {AVATAR_CLOTHING_PRODUCTS} from '../public/js/home-avatar-catalog.js';

let source,sourceTransforms;
const transform=root=>{const values=[];root.traverse(node=>values.push([node.uuid,node.visible,...node.position.toArray(),...node.quaternion.toArray(),...node.scale.toArray()]));return values;};
before(async()=>{const bytes=await readFile(new URL('../public/assets/asset-lab/robot-v1/models/v4/robot.glb',import.meta.url));
  source=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;sourceTransforms=transform(source);});
after(()=>assert.deepEqual(transform(source),sourceTransforms,'source GLB transforms and visibility remain unchanged'));
function setup(t) {const robot=createRobotAvatar(source),wardrobe=createRobotWardrobe(robot);t.after(()=>{wardrobe.dispose();disposeRobotAvatar(robot);});return{robot,wardrobe};}
function garments(robot) {const meshes=[];robot.traverse(node=>{if(node.isMesh&&node.userData.robotWardrobe)meshes.push(node);});return meshes;}
function bounds(meshes,root) {root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),matrix=new THREE.Matrix4(),vertex=new THREE.Vector3(),box=new THREE.Box3();
  for(const mesh of meshes){matrix.multiplyMatrices(inverse,mesh.matrixWorld);const positions=mesh.geometry.getAttribute('position');for(let i=0;i<positions.count;i++)box.expandByPoint(vertex.fromBufferAttribute(positions,i).applyMatrix4(matrix));}return box;}

test('only 18 real-robot fitted clothing SKUs are published with stable purchase IDs',()=>{
  assert.equal(ROBOT_CLOTHING_PRODUCTS.length,18);assert.equal(new Set(ROBOT_CLOTHING_PRODUCTS.map(p=>p.skuId)).size,18);
  assert.deepEqual(Object.fromEntries(['outfit','headwear','footwear'].map(slot=>[slot,ROBOT_CLOTHING_PRODUCTS.filter(p=>p.slot===slot).length])),{outfit:8,headwear:6,footwear:4});
  for(const product of ROBOT_CLOTHING_PRODUCTS){const prior=AVATAR_CLOTHING_PRODUCTS.find(p=>p.skuId===product.skuId);assert.ok(prior);assert.equal(prior.price,product.price);assert.ok(product.tags.includes("DisplayText3022"));assert.ok(!product.tags.includes("DisplayText0216"));assert.ok(isRobotClothingSku(product.skuId));assert.ok(Object.isFrozen(product));}
  for(const invalid of['wear-moon-explorer','wear-petal-dress','wear-summer-sandals',null,{},'ocean-overalls'])assert.equal(isRobotClothingSku(invalid),false);
});

test('every published SKU produces tagged real geometry fitted to the actual v4 skeleton',t=>{
  const{robot,wardrobe}=setup(t),signatures=new Set();
  for(const product of ROBOT_CLOTHING_PRODUCTS){wardrobe.setEquipment({[product.slot]:product.skuId});const meshes=garments(robot);assert.ok(meshes.length>=2,product.skuId);
    let triangles=0;
    for(const mesh of meshes){assert.equal(mesh.userData.surfaceId,'avatar');assert.equal(mesh.userData.avatar,true);assert.equal(mesh.userData.skuId,product.skuId);assert.ok(mesh.geometry.getAttribute('position').count>0);triangles+=(mesh.geometry.index?.count??mesh.geometry.getAttribute('position').count)/3;}
    assert.ok(triangles<22000,`${product.skuId} has bounded garment geometry (${triangles})`);
    const b=bounds(meshes,robot),size=b.getSize(new THREE.Vector3());assert.ok(b.min.y>=-.001,`${product.skuId} does not extend below the original sole`);assert.ok(b.max.y<1.72,'headwear remains compact');assert.ok(size.x<.85,'robot wardrobe is not oversized doll clothing');
    const signature=meshes.map(mesh=>{mesh.geometry.computeBoundingBox();return[mesh.geometry.getAttribute('position').count,...mesh.geometry.boundingBox.getSize(new THREE.Vector3()).toArray().map(v=>Math.round(v*1000))];}).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    assert.ok(!signatures.has(JSON.stringify(signature)),`${product.skuId} is not a recolor of another silhouette`);signatures.add(JSON.stringify(signature));
  }
});

test('sleeves, trousers, hats and shoes follow their actual joints through action poses',t=>{
  const{robot,wardrobe}=setup(t);wardrobe.setEquipment({outfit:'wear-cloud-hoodie',headwear:'wear-chef-toque',footwear:'wear-puddle-boots'});
  const tracked=[['sleeve-L','ShoulderL'],['trouser-L','HipL'],['toque-band','Head'],['shoe-L','AnkleL']].map(([part,joint])=>{
    const mesh=garments(robot).find(node=>node.name.endsWith(part));assert.ok(mesh,part);assert.equal(mesh.parent.parent,robot.getObjectByName(joint));return{mesh,joint:robot.getObjectByName(joint),local:mesh.matrix.clone()};});
  const start=new Map();poseRobotAvatar(robot,{action:'idle'});robot.updateMatrixWorld(true);for(const{mesh}of tracked)start.set(mesh,mesh.getWorldPosition(new THREE.Vector3()));
  for(const action of['walk','wave','sit','lie']){poseRobotAvatar(robot,{action,time:.23});robot.updateMatrixWorld(true);for(const{mesh,joint}of tracked){const expected=new THREE.Matrix4().multiplyMatrices(joint.matrixWorld,mesh.parent.matrix).multiply(mesh.matrix);for(let i=0;i<16;i++)assert.ok(Math.abs(mesh.matrixWorld.elements[i]-expected.elements[i])<1e-8,`${action} follows ${joint.name}`);}}
  assert.ok(tracked.some(({mesh})=>start.get(mesh).distanceTo(mesh.getWorldPosition(new THREE.Vector3()))>.2),'lying changes clothing world position');
});

test('headwear stays above the visor and footwear preserves grounded soles',t=>{
  const{robot,wardrobe}=setup(t);
  for(const product of ROBOT_CLOTHING_PRODUCTS.filter(p=>p.slot==='headwear')){wardrobe.setEquipment({headwear:product.skuId});const b=bounds(garments(robot),robot);assert.ok(b.min.y>1.23,`${product.skuId} leaves face/eyes open`);}
  for(const product of ROBOT_CLOTHING_PRODUCTS.filter(p=>p.slot==='footwear')){wardrobe.setEquipment({footwear:product.skuId});for(const side of['L','R']){
    const own=garments(robot).filter(m=>m.name.endsWith(`sole-${side}`)),b=bounds(own,robot);assert.ok(Math.abs(b.min.y)<.00001,`${product.skuId} sole is at floor`);
    const width=b.max.x-b.min.x;assert.ok(width<.22,'shoes remain close to original 20.3 cm robot sole width');}}
});

test('equipment replacement is atomic, unchanged gear is reused, and unsupported old doll SKUs fail',t=>{
  const{robot,wardrobe}=setup(t);const outfit='wear-little-chef';wardrobe.setEquipment({outfit});const meshes=garments(robot);
  wardrobe.setEquipment({outfit});assert.deepEqual(garments(robot),meshes,'same equipment does not recreate draw resources');
  assert.throws(()=>wardrobe.setEquipment({outfit,headwear:'wear-cloud-hoodie'}),/Unsupported/);assert.deepEqual(garments(robot),meshes);
  assert.throws(()=>wardrobe.setEquipment({outfit:'wear-moon-explorer'}),/Unsupported/);assert.deepEqual(garments(robot),meshes);
  wardrobe.setEquipment({headwear:'wear-little-crown'});assert.ok(garments(robot).every(mesh=>mesh.userData.slot==='headwear'),'omitted slots are unequipped');
  wardrobe.setEquipment({});assert.equal(garments(robot).length,0);
});

test('changing and disposing clothes releases only owned materials and cloned geometry exactly once',t=>{
  const{robot,wardrobe}=setup(t);let borrowedDisposed=0;const originalResources=new Set();robot.traverse(node=>{if(node.isMesh){originalResources.add(node.geometry);for(const m of[].concat(node.material))originalResources.add(m);}});
  for(const resource of originalResources)resource.addEventListener('dispose',()=>borrowedDisposed++);
  wardrobe.setEquipment({outfit:'wear-ocean-overalls',headwear:'wear-bunny-headband',footwear:'wear-bear-slippers'});
  const owned=new Set();for(const mesh of garments(robot)){owned.add(mesh.geometry);owned.add(mesh.material);assert.ok(!originalResources.has(mesh.geometry));assert.ok(!originalResources.has(mesh.material));}
  const counts=new Map([...owned].map(r=>[r,0]));for(const r of owned)r.addEventListener('dispose',()=>counts.set(r,counts.get(r)+1));
  wardrobe.setEquipment({outfit:'wear-storybook-knight'});for(const count of counts.values())assert.equal(count,1);
  wardrobe.dispose();wardrobe.dispose();assert.equal(garments(robot).length,0);assert.equal(borrowedDisposed,0,'borrowed model resources survive wardrobe disposal');
  assert.throws(()=>wardrobe.setEquipment({}),/disposed/);
});
