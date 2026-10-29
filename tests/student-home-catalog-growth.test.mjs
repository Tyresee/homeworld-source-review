import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MODULAR_KITCHEN_COLLECTION} from '../public/js/home-modular-kitchen-collection.js';
import {ROOMY_FURNITURE_COLLECTION} from '../public/js/home-roomy-furniture-collection.js';
import {getFurnitureRobotAction,isRobotBedKind} from '../public/js/home-furniture-capabilities.js';
import {getShopPage,getShopDepartment,isNewShopProduct,shopFamily} from '../public/js/home-shop-browse.js';
import {productMatchesRoom} from '../public/js/home-shop-rooms.js';
import {createHomeState,applyChange} from '../public/js/home-engine.js';
import {createStudentHomeRobotController} from '../public/js/student-home-robot-controller.js';
import {StudentHomeStore} from '../server/student-homes/store.mjs';
import {accountCatalog,CATALOG_VERSION} from '../server/student-homes/commerce.mjs';
import {validateStudentHome} from '../server/student-homes/profile.mjs';

const collections=[...MODULAR_KITCHEN_COLLECTION,...ROOMY_FURNITURE_COLLECTION];
const collectionIds=new Set(collections.map(row=>row.collection));
const TENANT='isolated-catalog-growth',ACTOR='isolated-growth-teacher';
const STUDENT='7900aabb-1111-4111-8111-111111111111',OTHER='7900aabb-2222-4222-8222-222222222222';
const clone=value=>structuredClone(value);
function bankFixture(){
  const orders=new Map(),control={balance:2_000_000,reserves:0,commits:0};
  return{control,async get(id){if(!orders.has(id))throw Object.assign(new Error('isolated missing order'),{status:404});return{order:clone(orders.get(id)),wallet:{balance:control.balance}};},
    async reserve({orderId,...quote}){assert.equal(orders.has(orderId),false);control.reserves++;const order={...quote,id:orderId,status:'reserved'};orders.set(orderId,order);control.balance-=quote.amount;return{order:clone(order),wallet:{balance:control.balance}};},
    async commit(id){control.commits++;const order=orders.get(id);assert.equal(order.status,'reserved');order.status='committed';return{order:clone(order),wallet:{balance:control.balance}};}};
}
async function storeFixture(t){
  const dir=await mkdtemp(join(tmpdir(),'home-catalog-growth-'));let store=await new StudentHomeStore({dataDir:dir}).initialize(),serial=0;
  const bank=bankFixture();await store.initializeHome(TENANT,STUDENT,ACTOR);await store.initializeHome(TENANT,OTHER,ACTOR);
  t.after(async()=>{await store.close();await rm(dir,{recursive:true,force:true});});
  return{bank,get store(){return store;},async restart(){await store.close();store=await new StudentHomeStore({dataDir:dir}).initialize();},
    async command(command){const home=await store.get(TENANT,STUDENT,bank);return store.executeCommand(TENANT,STUDENT,ACTOR,{command,commandId:`catalog-growth-${++serial}`,expectedRevision:home.revision,expectedCatalogVersion:CATALOG_VERSION},bank);}};
}
async function robotFixture(t){
  const bytes=await readFile(new URL('../public/assets/asset-lab/robot-v1/models/v4/robot.glb',import.meta.url));
  const source=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  const old={document:globalThis.document,raf:globalThis.requestAnimationFrame,cancel:globalThis.cancelAnimationFrame},frames=new Map(),controllers=[];let sequence=0;
  globalThis.document=new EventTarget();document.hidden=false;
  globalThis.requestAnimationFrame=callback=>{frames.set(++sequence,callback);return sequence;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
  t.after(()=>{controllers.forEach(c=>c.dispose());globalThis.document=old.document;globalThis.requestAnimationFrame=old.raf;globalThis.cancelAnimationFrame=old.cancel;});
  const advance=()=>{const pending=[...frames.values()];frames.clear();for(const callback of pending)callback(performance.now()+50);};
  return{create(options={}){const c=createStudentHomeRobotController({source,parent:new THREE.Group(),requestRender(){},...options});controllers.push(c);return c;},
    advance(count=1){for(let n=0;n<count;n++)advance();},until(c,action,limit=1000){for(let n=0;n<limit;n++){if(c.getState().action===action&&!c.getState().inTransition)return;advance();}assert.fail(`Expected ${action}, saw ${JSON.stringify(c.getState())}`);}};
}

test('every new fitted-kitchen and roomy-furniture SKU enters the formal account catalogue exactly once with its own price and dimensions',()=>{
  const catalog=accountCatalog(),byId=new Map(catalog.map(row=>[row.skuId,row]));
  assert.equal(byId.size,catalog.length);assert.equal(new Set(collections.map(row=>row.id)).size,collections.length);
  assert.ok(MODULAR_KITCHEN_COLLECTION.length>=32);assert.ok(ROOMY_FURNITURE_COLLECTION.filter(row=>isRobotBedKind(row.id)).length>=12);
  assert.ok(ROOMY_FURNITURE_COLLECTION.filter(row=>!isRobotBedKind(row.id)).length>=14);
  for(const spec of collections){
    const product=byId.get(`${spec.id}-classic`);assert.ok(product,spec.id);assert.equal(product.kind,spec.id);assert.equal(product.productType,'furniture');
    for(const key of['price','width','depth','height'])assert.equal(product[key],spec[key],`${spec.id} ${key}`);
    assert.ok(Number.isSafeInteger(product.price)&&product.price>0);assert.equal(product.placement,spec.placement);
  }
});

test('adding new goods preserves the 410 previous account SKUs, their prices, footprints and interrupted-purchase catalogue identity',()=>{
  const old=accountCatalog().filter(row=>!collectionIds.has(row.collection)&&row.collection!=='interactive-home-2026-10').map(({skuId,kind,price,width,depth,height})=>({skuId,kind,price,width,depth,height})).sort((a,b)=>a.skuId.localeCompare(b.skuId));
  assert.equal(old.length,410);
  // Snapshot was read from the last committed account-only release, before
  // these additive collections existed. It contains no student data.
  assert.equal(createHash('sha256').update(JSON.stringify(old)).digest('hex'),'7c86cec1af94ab3d37c2046d4b6db043b87cffd32bb3827e7345f4d668fdef8f');
  assert.equal(CATALOG_VERSION,'home-catalog-v2-20261019','additive stock cannot invalidate durable v2 payment drafts');
});

test('new room and function filters expose every new collection instead of hiding it behind old small daily utensils',()=>{
  const products=getShopDepartment(accountCatalog(),'shop');
  for(const spec of collections){
    const product=products.find(row=>row.kind===spec.id);assert.equal(isNewShopProduct(product),true,spec.id);
    const room=spec.category==='comfort'?'living':spec.category;
    assert.equal(productMatchesRoom(product,room),true,spec.id);
    const found=getShopPage(products,{room,family:shopFamily(product),newOnly:true,query:product.name});
    assert.ok(found.items.some(row=>row.kind===spec.id),`${spec.id} is searchable inside its room/function`);
  }
  const kitchen=getShopPage(products,{room:'kitchen'});
  assert.ok(kitchen.items.some(row=>row.kitchenFit?.role==='hob'),'first kitchen page includes real cookers');
  assert.ok(kitchen.items.some(row=>row.kitchenFit?.role==='dishwasher'),'first kitchen page includes dishwashers');
});

test('the real store purchases all new SKUs, preserves their paid prices on reload, and never grants them to another student',async t=>{
  const f=await storeFixture(t),lines=collections.map(spec=>({skuId:`${spec.id}-classic`,quantity:1}));
  const purchased=await f.command({type:'checkout',lines});
  assert.equal(purchased.home.commerce.owned.length,collections.length);assert.equal(purchased.receipt.amount,collections.reduce((sum,row)=>sum+row.price,0));
  assert.equal(f.bank.control.reserves,1);assert.equal(f.bank.control.commits,1);assert.equal(validateStudentHome(purchased.home,STUDENT),true);
  const paid=purchased.home.commerce.orders[0];assert.equal(paid.lines.length,collections.length);
  await f.restart();const restored=await f.store.get(TENANT,STUDENT,f.bank);
  assert.deepEqual(restored.commerce.orders[0],paid);assert.deepEqual(restored.commerce.owned,purchased.home.commerce.owned);
  assert.equal((await f.store.get(TENANT,OTHER)).commerce.owned.length,0);assert.equal(f.bank.control.reserves,1);
});

test('real new cooker, sink, dishwasher and roomy bed expose reachable matching robot actions in both orientations',async t=>{
  const rig=await robotFixture(t),controller=rig.create();
  const representatives=['cook','wash','dishwash'].map(action=>MODULAR_KITCHEN_COLLECTION.find(row=>getFurnitureRobotAction(row.id)===action));
  representatives.push(ROOMY_FURNITURE_COLLECTION.find(row=>row.id==='rfCloudDouble'));
  for(const spec of representatives){assert.ok(spec);
    for(const rotation of[0,90]){
      const placed=applyChange(createHomeState({profile:'account'}),{type:'furniture',id:'grown-item',kind:spec.id,x:0,z:0,rotation});assert.equal(placed.ok,true,placed.error);
      controller.setWorld(placed.state);const action=getFurnitureRobotAction(spec.id),choices=controller.interactions('furniture:grown-item');
      assert.ok(choices.some(row=>row.id===action),`${spec.id}/${rotation} offers ${action}`);
      assert.equal(controller.interact('furniture:grown-item',action).ok,true);rig.until(controller,action);
      assert.equal(controller.getState().action,action);
      const robot=controller.group.getObjectByName('robot-avatar'),before=robot.getObjectByName('ShoulderR').quaternion.clone();rig.advance(8);
      if(action!=='lie')assert.ok(before.angleTo(robot.getObjectByName('ShoulderR').quaternion)>.005,`${action} moves the actual arm`);
      controller.stand();rig.until(controller,'idle');assert.equal(controller.getState().scheduled,false);
    }
  }
});

test('every new wide bed retains a reachable sleep action in a spacious bedroom at either orientation',async t=>{
  const rig=await robotFixture(t),controller=rig.create();
  for(const spec of ROOMY_FURNITURE_COLLECTION.filter(row=>isRobotBedKind(row.id))){
    for(const rotation of[0,90]){
      const placed=applyChange(createHomeState({profile:'account',slab:{rects:[{minX:-5,minZ:-5,width:10,depth:10}]}}),{type:'furniture',id:'wide-bed',kind:spec.id,x:0,z:0,rotation});
      assert.equal(placed.ok,true,`${spec.id} placement: ${placed.error}`);controller.setWorld(placed.state);
      assert.ok(controller.interactions('furniture:wide-bed').some(row=>row.id==='lie'),`${spec.id}/${rotation} keeps a reachable mattress contact`);
      assert.equal(controller.interact('furniture:wide-bed','lie').ok,true);rig.until(controller,'lie');
      controller.stand();rig.until(controller,'idle');assert.equal(controller.getState().scheduled,false);
    }
  }
});

test('a purchased roomy bed supports robot-initiated sleep that survives store restart and restores only its owner',async t=>{
  const f=await storeFixture(t),rig=await robotFixture(t),writes=[],events=[];let saveTail=Promise.resolve();
  const bought=await f.command({type:'checkout',lines:[{skuId:'rfCloudDouble-classic',quantity:1}]}),id=bought.home.commerce.owned[0].id;
  const placed=await f.command({type:'placeItem',id,pose:{x:0,z:0,rotation:90},storey:0});
  // The renderer now emits recoverable approach and entrance checkpoints.
  // Serialize them like the editor so each write uses the acknowledged revision.
  const first=rig.create({onActivityChange:activity=>{events.push(activity);saveTail=saveTail.then(()=>f.command({type:'setRobotActivity',activity}));writes.push(saveTail);}});
  first.setWorld(placed.home.commerce.home);assert.equal(first.interact(`furniture:${id}`,'lie').ok,true);rig.until(first,'lie');await Promise.all(writes);
  const sleeping={kind:'sleep',itemId:id,storey:0};assert.ok(events.some(activity=>activity?.kind==='furniture'&&activity.phase==='enter'));assert.deepEqual(events.at(-1),sleeping);first.dispose();await f.restart();
  const saved=await f.store.getSnapshot(TENANT,STUDENT,f.bank),other=await f.store.getSnapshot(TENANT,OTHER,f.bank);assert.deepEqual(saved.robotActivity,sleeping);assert.equal(other.robotActivity,null);
  const restores=[],next=rig.create({onActivityChange:value=>restores.push(value)});next.setWorld(saved.home.commerce.home);next.setAvatar({...saved.home.avatar,activity:saved.robotActivity});
  assert.equal(next.getState().action,'lie');assert.equal(next.getState().scheduled,false);assert.deepEqual(restores,[]);
  const balance=f.bank.control.balance;const stored=await f.command({type:'storeItem',id,storey:0});assert.equal(stored.robotActivity,null);assert.equal(f.bank.control.balance,balance,'sleep and storing cannot charge more points');
});
