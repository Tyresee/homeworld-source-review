import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {MODULAR_KITCHEN_COLLECTION as products} from '../public/js/home-modular-kitchen-collection.js';
import {createModularKitchenProduct as make,isModularKitchenProduct} from '../public/js/home-modular-kitchen-models.js';
const byId=new Map(products.map(row=>[row.id,row]));
const dispose=model=>model.traverse(node=>{if(node.isMesh){node.geometry.dispose();node.material.dispose();}});
const model=(id,options={})=>make({kind:id,...options});

test('36 original kitchen products cover cooking, washing, modular storage and countertop equipment',()=>{
 assert.equal(products.length,36);assert.equal(new Set(products.map(p=>p.id)).size,36);
 const counts=new Map();for(const p of products){const fit=p.kitchenFit;assert.ok(isModularKitchenProduct(p.id));assert.equal(p.category,'kitchen');assert.ok(p.description.length>=30);assert.ok(p.tags.length>=6);assert.ok(Number.isSafeInteger(p.price)&&p.price>0);assert.ok(fit.seriesLabel&&fit.moduleWidth===p.width&&fit.depth===p.depth);counts.set(fit.role,(counts.get(fit.role)??0)+1);}
 for(const [role,minimum] of [['hob',7],['dishwasher',5],['sink',4],['base',4],['hood',2],['wall-cabinet',2],['countertop-appliance',5]])assert.ok(counts.get(role)>=minimum,role);
 assert.deepEqual(new Set(products.map(p=>p.tier)),new Set(['essential','comfort','signature']));
 assert.equal(isModularKitchenProduct('unknown'),false);assert.throws(()=>make({kind:'unknown'}),RangeError);
 for(const p of products.filter(p=>p.robotAction))assert.ok(['cook','wash','dishwash'].includes(p.robotAction)&&p.placement==='floor');
});

test('every kitchen model remains inside its conservative placement envelope through all eight orientations',()=>{
 for(const p of products){const m=model(p.id),b=new THREE.Box3().setFromObject(m),s=b.getSize(new THREE.Vector3());
  assert.ok(Math.abs(b.min.y)<1e-6,`${p.id} grounded`);assert.ok(Math.abs(b.min.x+b.max.x)<1e-6,`${p.id} centre x`);
  assert.ok(p.placement==='wall'?Math.abs(b.min.z)<1e-6:Math.abs(b.min.z+b.max.z)<1e-6,`${p.id} mounting origin`);
  assert.ok(s.x>p.width*.85&&s.z>p.depth*.80&&s.y>p.height*.80,`${p.id} full useful volume ${s.toArray()}`);
  for(let degrees=0;degrees<360;degrees+=45){const angle=degrees*Math.PI/180;m.rotation.y=angle;m.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(m),size=box.getSize(new THREE.Vector3());
   assert.ok(size.x<=Math.abs(Math.cos(angle))*p.width+Math.abs(Math.sin(angle))*p.depth+1e-6,`${p.id} x ${degrees}`);
   assert.ok(size.z<=Math.abs(Math.sin(angle))*p.width+Math.abs(Math.cos(angle))*p.depth+1e-6,`${p.id} z ${degrees}`);assert.ok(size.y<=p.height+1e-6,`${p.id} height`);
  }dispose(m);
 }
});

test('hob, sink, dishwasher and base modules form a flush row with one common worktop height and depth',()=>{
 const selected=['mkBaseDoor','mkSlimDishwasher','mkSingleHob','mkDoubleSink','mkInduction','mkIntegratedDishwasher','mkWideDrawers'];let previous=null,edge=0;
 for(const id of selected){const p=byId.get(id),m=model(id),fit=p.kitchenFit;assert.equal(fit.canDock,true);assert.equal(fit.worktopHeight,1.02);assert.equal(fit.depth,.84);
  const tops=[];m.traverse(n=>{if(n.isMesh&&['worktop','sink-worktop'].includes(n.userData.part))tops.push(new THREE.Box3().setFromObject(n).max.y);});assert.ok(tops.length);for(const top of tops)assert.ok(Math.abs(top-1.02)<1e-6,`${id} flush surface`);
  m.position.x=edge+p.width/2;m.updateMatrixWorld(true);const current=new THREE.Box3().setFromObject(m);
  if(previous)assert.ok(Math.abs(previous.max.x-current.min.x)<1e-6,`${id} touches without overlap`);assert.ok(Math.abs(current.min.z+.42)<1e-6&&Math.abs(current.max.z-.42)<1e-6,`${id} depth aligned`);previous=current;edge+=p.width;dispose(m);
 }
});

test('all 36 products have distinct geometry and stay below 64 meshes and 9000 triangles each',()=>{
 const signatures=new Set();for(const p of products){const m=model(p.id),hash=createHash('sha256');let meshes=0,triangles=0;
  m.traverse(n=>{if(!n.isMesh)return;meshes++;const positions=n.geometry.attributes.position;assert.ok([...positions.array].every(Number.isFinite));triangles+=(n.geometry.index?.count??positions.count)/3;hash.update(Buffer.from(positions.array.buffer));hash.update(JSON.stringify([n.position.toArray(),n.quaternion.toArray(),n.scale.toArray()]));});
  const signature=hash.digest('hex');assert.ok(!signatures.has(signature),`${p.id} duplicate geometry`);signatures.add(signature);assert.ok(meshes>=4&&meshes<=64,`${p.id} meshes ${meshes}`);assert.ok(triangles<9000,`${p.id} triangles ${triangles}`);dispose(m);
 }
});

test('clear preparation counters and islands expose the real 1.02 support plane across all declared placements',()=>{
 for(const p of products.filter(p=>p.supportSurface)){const m=model(p.id),s=p.supportSurface;assert.deepEqual(m.userData.supportSurface,s);
  for(const x of[-s.width/2,0,s.width/2])for(const z of[-s.depth/2,0,s.depth/2]){const ray=new THREE.Raycaster(new THREE.Vector3(x,s.height+.5,z),new THREE.Vector3(0,-1,0)),hit=ray.intersectObject(m,true)[0];assert.ok(hit,`${p.id} ${x},${z}`);assert.equal(hit.object.userData.supportTop,true,`${p.id} unobstructed top`);assert.ok(Math.abs(hit.point.y-s.height)<.002,`${p.id} height`);}dispose(m);
 }
 for(const p of products.filter(p=>['hob','sink','dishwasher'].includes(p.kitchenFit.role)))assert.equal(p.supportSurface,undefined,'hot hobs, wet sinks and machines do not claim an unrestricted tabletop');
});

test('sinks are genuinely hollow and cookers expose different actual burner and oven counts',()=>{
 for(const id of ['mkSingleSink','mkFarmhouseSink']){const m=model(id),ray=new THREE.Raycaster(new THREE.Vector3(0,2,.13),new THREE.Vector3(0,-1,0)),hit=ray.intersectObject(m,true)[0];assert.ok(hit.point.y<.9,`${id} cavity is not filled by a counter slab`);dispose(m);}
 for(const [id,burners,ovens] of [['mkSingleHob',1,0],['mkDoubleGas',2,0],['mkFourGas',4,0],['mkRangeOven',4,1],['mkWideRange',6,2],['mkSteelRange',4,1]]){const m=model(id),count=name=>m.children.filter(n=>n.userData.part===name).length;assert.equal(count('burner-cap'),burners,id);assert.equal(count('oven-glass'),ovens,id);dispose(m);}
 const induction=model('mkInduction');assert.equal(induction.children.filter(n=>n.userData.part==='induction-zone').length,4);dispose(induction);
 const single=model('mkDishwasher'),drawer=model('mkDrawerDishwasher');assert.equal(single.children.filter(n=>n.userData.part==='dishwasher-door').length,1);assert.equal(drawer.children.filter(n=>n.userData.part==='dishwasher-door').length,2);dispose(single);dispose(drawer);
});

test('every product recolors independently without sharing disposable geometry or materials',()=>{
 for(const p of products){const a=model(p.id,{color:'#efba89',material:'ceramic'}),b=model(p.id,{color:'#498dab',material:'gold'}),resources=new Set(),painted=[[],[]];
  for(const [i,m] of [a,b].entries())m.traverse(n=>{if(!n.isMesh)return;for(const resource of[n.geometry,n.material]){assert.ok(!resources.has(resource),`${p.id} shared resource`);resources.add(resource);}if(n.userData.paintable)painted[i].push(n);});
  assert.ok(painted[0].length>0);assert.equal(painted[0].length,painted[1].length);assert.ok(painted[0].some((n,i)=>n.material.color.getHex()!==painted[1][i].material.color.getHex()));dispose(a);dispose(b);
 }
});
