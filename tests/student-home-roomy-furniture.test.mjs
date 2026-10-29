import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {ROOMY_FURNITURE_COLLECTION} from '../public/js/home-roomy-furniture-collection.js';
import {createRoomyFurniture,isRoomyFurniture} from '../public/js/home-roomy-furniture-models.js';

const specById=new Map(ROOMY_FURNITURE_COLLECTION.map(row=>[row.id,row]));
function dispose(model){const g=new Set(),m=new Set();model.traverse(n=>{if(n.geometry)g.add(n.geometry);for(const mat of[].concat(n.material??[]))m.add(mat);});g.forEach(v=>v.dispose());m.forEach(v=>v.dispose());}
function meshes(model){const out=[];model.traverse(n=>{if(n.isMesh)out.push(n);});return out;}

test('roomy assortment adds twelve beds and fourteen separately authored tables with clear size and price tiers',()=>{
 assert.equal(ROOMY_FURNITURE_COLLECTION.length,26);assert.equal(new Set(ROOMY_FURNITURE_COLLECTION.map(s=>s.id)).size,26);
 assert.equal(ROOMY_FURNITURE_COLLECTION.filter(s=>s.family==='beds').length,12);
 const tiers=new Set(),families=new Set();
 for(const spec of ROOMY_FURNITURE_COLLECTION){
  assert.ok(Object.isFrozen(spec)&&Object.isFrozen(spec.designFeatures));assert.ok(spec.description&&spec.designFeatures.length>=3);
  assert.equal(spec.placement,'floor');assert.equal(spec.collection,'roomy-furniture-2026-10-25');
  assert.ok(Number.isSafeInteger(spec.price)&&spec.price>=1000&&spec.price<=12000);assert.ok(spec.width>=1.5);
  assert.equal(spec.robotAction,spec.family==='beds'?'lie':'read');assert.equal(isRoomyFurniture(spec.id),true);
  tiers.add(spec.tier);families.add(spec.family);
 }
 assert.equal(tiers.size,3);assert.equal(families.size,5);assert.equal(isRoomyFurniture('bedTimber'),false);
 assert.throws(()=>createRoomyFurniture({kind:'missing'}),RangeError);
 assert.ok(specById.get('rfGrandHotel').width>specById.get('rfCloudDouble').width);
 assert.ok(specById.get('rfEightSeatTable').width>specById.get('rfFourSeatTable').width);
});

test('every final-scale construction is grounded and centred, and rotates inside its actual declared collision envelope',()=>{
 for(const spec of ROOMY_FURNITURE_COLLECTION){
  const model=createRoomyFurniture({kind:spec.id}),bounds=new THREE.Box3().setFromObject(model),centre=bounds.getCenter(new THREE.Vector3());
  assert.ok(Math.abs(bounds.min.y)<1e-7,`${spec.id} floor`);assert.ok(Math.abs(centre.x)<1e-7&&Math.abs(centre.z)<1e-7,`${spec.id} centre`);
  assert.equal(model.userData.origin,'bottom');assert.equal(model.userData.noUpgrade,true);assert.equal(model.userData.robotAction,spec.robotAction);
  assert.equal(model.position.length(),0,'normalization must not be an overwritten outer transform');
  for(const degrees of[0,30,45,90,180,270]){
   model.rotation.y=degrees*Math.PI/180;model.updateMatrixWorld(true);const size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
   const c=Math.abs(Math.cos(model.rotation.y)),s=Math.abs(Math.sin(model.rotation.y));
   assert.ok(size.x<=spec.width*c+spec.depth*s+1e-6,`${spec.id} width ${degrees}`);
   assert.ok(size.z<=spec.depth*c+spec.width*s+1e-6,`${spec.id} depth ${degrees}`);
   assert.ok(size.y<=spec.height+1e-6,`${spec.id} height ${degrees}`);
  }
  dispose(model);
 }
});

test('all twenty-six shapes differ in geometry, stay finite and fit bounded real-time rendering budgets',()=>{
 const signatures=new Set();
 for(const spec of ROOMY_FURNITURE_COLLECTION){
  const model=createRoomyFurniture({kind:spec.id}),hash=createHash('sha256');model.updateMatrixWorld(true);let triangles=0;
  const parts=meshes(model);
  for(const mesh of parts){const positions=mesh.geometry.attributes.position;assert.ok([...positions.array].every(Number.isFinite));triangles+=(mesh.geometry.index?.count??positions.count)/3;
   hash.update(Buffer.from(positions.array.buffer));hash.update(JSON.stringify(mesh.matrixWorld.toArray()));}
  const sig=hash.digest('hex');assert.ok(!signatures.has(sig),`${spec.id} is not just a recolour`);signatures.add(sig);
  assert.ok(parts.length>=3&&parts.length<=60,`${spec.id} mesh count ${parts.length}`);
  assert.ok(triangles<18000,`${spec.id} triangle budget ${triangles}`);dispose(model);
 }
});

test('beds have broad usable sleep surfaces and distinct large structural changes without objects piled over the duvet',()=>{
 const expected={rfBirchSingle:'broad-head-slat',rfDrawerSingle:'bed-storage-drawer',rfCloudDouble:'soft-arched-headboard',rfOakPlatform:'horizontal-head-plank',rfCaneDouble:'woven-cane-vertical',rfWalnutSleigh:'sleigh-curved-foot',rfFlutedKing:'broad-upholstery-panel',rfCanopyKing:'canopy-post',rfGrandHotel:'low-headboard-wing',rfHouseSingle:'house-roof-ridge',rfRoundBed:'circular-padded-frame',rfPanelStorageKing:'headboard-open-ledge'};
 for(const spec of ROOMY_FURNITURE_COLLECTION.filter(s=>s.family==='beds')){
  const model=createRoomyFurniture({kind:spec.id}),parts=meshes(model),mattress=parts.filter(n=>n.userData.part==='mattress');
  assert.ok(parts.some(n=>n.userData.part===expected[spec.id]),`${spec.id} structure`);assert.equal(mattress.length,1);
  const bedBox=new THREE.Box3().setFromObject(mattress[0]),size=bedBox.getSize(new THREE.Vector3());
  assert.ok(size.x>=1.25&&size.z>=2.1,`${spec.id} usable broad mattress ${size.toArray()}`);
  const duvet=parts.find(n=>n.userData.part==='duvet');assert.ok(duvet);const cover=new THREE.Box3().setFromObject(duvet);
  const centre=bedBox.getCenter(new THREE.Vector3());const ray=new THREE.Raycaster(new THREE.Vector3(centre.x,1.5,centre.z+.20),new THREE.Vector3(0,-1,0));
  const hit=ray.intersectObject(model,true).find(h=>h.object.userData.part!=='canopy-side-rail'&&h.object.userData.part!=='canopy-end-rail');
  assert.ok(['duvet','duvet-border'].includes(hit?.object.userData.part),`${spec.id} central sleep surface remains clear: ${hit?.object.userData.part}`);
  assert.ok(cover.max.y<.95,`${spec.id} is not an unnecessarily high bed`);dispose(model);
 }
});

test('all fourteen table support zones really sit on clear horizontal surfaces, including L and circular shapes',()=>{
 const tables=ROOMY_FURNITURE_COLLECTION.filter(s=>s.supportSurface);assert.equal(tables.length,14);
 for(const spec of tables){
  const model=createRoomyFurniture({kind:spec.id}),zone=spec.supportSurface,cx=zone.offsetX??0,cz=zone.offsetZ??0;
  for(const u of[-.49,0,.49])for(const v of[-.49,0,.49]){
   const ray=new THREE.Raycaster(new THREE.Vector3(cx+u*zone.width,spec.height+.4,cz+v*zone.depth),new THREE.Vector3(0,-1,0));
   const hit=ray.intersectObject(model,true)[0];assert.ok(hit,`${spec.id} surface ray`);
   assert.ok(Math.abs(hit.point.y-zone.height)<2e-5,`${spec.id} support ${hit.point.y} vs ${zone.height}`);
   assert.ok(hit.object.userData.supportTop||['plank-joint','extension-leaf-seam'].includes(hit.object.userData.part),`${spec.id} clear tabletop ${hit.object.userData.part}`);
  }
  const top=model.getObjectByName('furniture-support-top');assert.ok(top?.userData.supportTop);dispose(model);
 }
});

test('material and colour edits are visible, retain sizes, and separate instances do not share disposable GPU resources',()=>{
 for(const kind of['rfCloudDouble','rfCaneDouble','rfEightSeatTable','rfCornerDesk']){
  const first=createRoomyFurniture({kind,color:'#b04050',material:'velvet'}),second=createRoomyFurniture({kind,color:'#2070b0',material:'gold'});
  const a=meshes(first),b=meshes(second),firstBounds=new THREE.Box3().setFromObject(first),nextBounds=new THREE.Box3().setFromObject(second);
  assert.ok(firstBounds.min.distanceTo(nextBounds.min)<1e-7&&firstBounds.max.distanceTo(nextBounds.max)<1e-7);
  const paintA=a.find(n=>n.userData.paintable),paintB=b.find(n=>n.userData.paintable);
  assert.equal(paintA.material.color.getHexString(),'b04050');assert.equal(paintB.material.color.getHexString(),'2070b0');
  assert.equal(paintB.material.metalness,.6);assert.ok(paintA.material.roughness>paintB.material.roughness);
  assert.ok(a.every(mesh=>!b.some(other=>mesh.geometry===other.geometry||mesh.material===other.material)));
  dispose(first);dispose(second);
 }
});
