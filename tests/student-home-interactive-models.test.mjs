import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {INTERACTIVE_COLLECTION} from '../public/js/home-interactive-collection.js';
import {EXTRA_SHOP_BY_KIND} from '../public/js/home-shop-catalog.js';
import {createLuxuryItem,LUXURY_ITEM_DIMENSIONS} from '../public/js/home-luxury-models.js';
import {SHOP_CATALOG} from '../public/js/home-commerce.js';

const parts=(root,part)=>{const rows=[];root.traverse(n=>{if(n.userData.objectPart===part)rows.push(n);});return rows;};
const model=kind=>{const p=EXTRA_SHOP_BY_KIND.get(kind);return createLuxuryItem({kind,color:p?.defaultColor,material:p?.material});};
const dispose=root=>root.traverse(n=>{n.geometry?.dispose();for(const m of[].concat(n.material??[]))m.dispose();});
const inside=(root,p)=>{root.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(root),s=b.getSize(new THREE.Vector3());
  assert.ok(s.x<=p.width+1e-6,`${p.id} width ${s.x}`);assert.ok(s.y<=p.height+1e-6,`${p.id} height ${s.y}`);assert.ok(s.z<=p.depth+1e-6,`${p.id} depth ${s.z}`);return b;};

test('three television constructions are real independently priced purchasable floor products',()=>{
  const widths=[],prices=[];
  for(const spec of INTERACTIVE_COLLECTION){
    const product=SHOP_CATALOG.find(p=>p.kind===spec.id);assert.ok(product,spec.id);assert.equal(product.productType,'furniture');assert.equal(product.category,'living');
    assert.equal(product.price,spec.price);assert.equal(product.placement,'floor');assert.equal(product.family,'televisions');
    const root=model(spec.id),b=inside(root,spec),size=b.getSize(new THREE.Vector3());
    assert.ok(Math.abs(b.min.y)<1e-6);assert.ok(Math.abs(b.min.x+b.max.x)<1e-6);assert.ok(Math.abs(b.min.z+b.max.z)<1e-6);
    assert.ok(size.x>spec.width*.90&&size.y>spec.height*.90,'usable volume rather than tiny object in large nominal box');
    assert.deepEqual(LUXURY_ITEM_DIMENSIONS[spec.id],{width:spec.width,depth:spec.depth,height:spec.height});
    widths.push(size.x);prices.push(product.price);dispose(root);
  }
  assert.ok(widths[0]<widths[1]&&widths[1]<widths[2]);assert.ok(prices[0]<prices[1]&&prices[1]<prices[2]);
});

test('each television has one front-facing screen and one removable remote with an actual reachable dock',()=>{
  for(const spec of INTERACTIVE_COLLECTION){const root=model(spec.id),[face]=parts(root,'tv-screen'),[remote]=parts(root,'tv-remote');
    assert.equal(parts(root,'tv-screen').length,1);assert.equal(parts(root,'tv-remote').length,1);
    assert.ok(face.isMesh&&face.geometry.type==='PlaneGeometry');assert.ok(face.userData.screenAspect>1.4&&face.userData.screenAspect<2.2);
    assert.deepEqual(root.userData.remoteDock,{x:remote.position.x,y:remote.position.y,z:remote.position.z});assert.ok(remote.position.y>=.65&&remote.position.y<=.95);assert.ok(remote.position.z>0);
    assert.deepEqual(new THREE.Vector3(0,0,1).applyQuaternion(face.quaternion).toArray(),[0,0,1]);
    const before=parts(root,'tv-remote')[0].children.length;assert.ok(before>=5);remote.visible=false;
    assert.equal(parts(root,'tv-remote').length,1,'hide the existing object rather than create a second source copy');dispose(root);
  }
});

test('all supported clocks expose three independent centred pivot hands and pendulums are articulated',()=>{
  for(const kind of['deskClock','wallClock','cuckooClock','wallPendulum','wallDaisyClock']){
    const root=model(kind);inside(root,EXTRA_SHOP_BY_KIND.get(kind));
    for(const part of['clock-hour','clock-minute','clock-second']){
      const rows=parts(root,part);assert.equal(rows.length,1,`${kind} ${part}`);const pivot=rows[0],before=pivot.position.clone();
      assert.ok(pivot.isGroup&&pivot.children.some(n=>n.isMesh));pivot.rotation.z=-Math.PI/2;assert.deepEqual(pivot.position.toArray(),before.toArray(),'hand rotates around clock centre');
    }
    assert.equal(parts(root,'clock-pendulum').length,['cuckooClock','wallPendulum'].includes(kind)?1:0);dispose(root);
  }
});

test('cuckoo has hinged double doors and a travelling bird whose full motion fits the existing wall collision depth',()=>{
  const root=model('cuckooClock'),spec=EXTRA_SHOP_BY_KIND.get('cuckooClock');
  const [bird]=parts(root,'cuckoo-bird');assert.ok(bird?.isGroup);assert.equal(bird.visible,false);assert.ok(bird.userData.objectTravel>0);
  assert.equal(parts(root,'cuckoo-wing-left').length,1);assert.equal(parts(root,'cuckoo-wing-right').length,1);
  const left=parts(root,'cuckoo-door-left')[0],right=parts(root,'cuckoo-door-right')[0];assert.ok(left?.isGroup&&right?.isGroup);assert.ok(left.position.x<right.position.x);
  const base=bird.position.z;bird.visible=true;
  for(const progress of[0,.25,.5,.75,1]){
    bird.position.z=base+bird.userData.objectTravel*progress;left.rotation.y=-Math.PI*.49*progress;right.rotation.y=Math.PI*.49*progress;
    parts(root,'cuckoo-wing-left')[0].rotation.z=.4;parts(root,'cuckoo-wing-right')[0].rotation.z=-.4;
    inside(root,spec);
  }
  dispose(root);
});

test('all fifteen actual lamp models expose luminous surfaces rather than relying on a UI-only switch',()=>{
  for(const kind of['lamp','candelabra','chandelier','taskLamp','readingLamp','hhTripodLamp','hhArcLamp','hhLanternLamp','hhMushroomLamp','hhTaskLamp','hhPleatedLamp','hhWallSconce','hhFlowerSconce','decorLavaLamp','decorOrbLamp']){
    const root=model(kind),emitters=parts(root,'lamp-emitter');assert.ok(emitters.length,kind);
    for(const emitter of emitters){assert.ok(emitter.isMesh&&emitter.material.emissive?.isColor,kind);assert.ok(emitter.material.emissive.getHex()>0,kind);}
    dispose(root);
  }
});

test('television model instances never share disposable geometry or materials',()=>{
  for(const spec of INTERACTIVE_COLLECTION){const a=model(spec.id),b=model(spec.id),resources=new Set();
    for(const root of[a,b])root.traverse(n=>{if(!n.isMesh)return;assert.ok(!resources.has(n.geometry));assert.ok(!resources.has(n.material));resources.add(n.geometry);resources.add(n.material);});
    dispose(a);dispose(b);
  }
});
