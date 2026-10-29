import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StudentHomeStore} from '../server/student-homes/store.mjs';
import {validateStudentHome} from '../server/student-homes/profile.mjs';
import {createAccountCommerce,prepareCommerceCommand} from '../server/student-homes/commerce.mjs';
import {validateCommerceState} from '../public/js/home-commerce.js';
import {getWallMountTargets} from '../public/js/home-engine.js';
import {getObjectCapabilities,getObjectState,validateObjectStates,OBJECT_CAPABILITY_KINDS,applyOwnedObjectState} from '../public/js/home-object-state.js';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const TENANT='isolated-object-state',ACTOR='isolated-object-teacher',copy=structuredClone;
function fakeBank(){
  const orders=new Map(),resales=new Map(),control={balance:500000,reserves:0,credits:0};
  const wallet=()=>({tenantId:TENANT,studentId:A,currency:'platform-points',balance:control.balance});
  return {control,
    async get(id){if(!orders.has(id))throw Object.assign(new Error('isolated missing order'),{status:404});return {order:copy(orders.get(id)),wallet:wallet()};},
    async reserve(quote){control.reserves++;if(!orders.has(quote.orderId)){orders.set(quote.orderId,{...quote,id:quote.orderId,status:'reserved'});control.balance-=quote.amount;}return this.get(quote.orderId);},
    async commit(id){orders.get(id).status='committed';return this.get(id);},
    async getResale(id){if(!resales.has(id))throw Object.assign(new Error('isolated missing credit'),{status:404,code:'home_resale_not_found'});return {resale:copy(resales.get(id)),wallet:wallet()};},
    async creditResale(quote){if(!resales.has(quote.id)){resales.set(quote.id,{...copy(quote),sourceGameId:'homeworld',currency:'platform-points',status:'credited',ledgerEntryId:'isolated-object-credit',createdBy:ACTOR,createdAt:'2026-10-26T00:00:00Z'});control.balance+=quote.creditAmount;control.credits++;}return {resale:copy(resales.get(quote.id)),wallet:wallet()};},
  };
}
async function fixture(t){
  const directory=await fs.mkdtemp(join(tmpdir(),'home-object-settings-'));let store=await new StudentHomeStore({dataDir:directory}).initialize(),serial=0;
  const payments=fakeBank();await store.initializeHome(TENANT,A,ACTOR);await store.initializeHome(TENANT,B,ACTOR);
  t.after(async()=>{await store.close();await fs.rm(directory,{recursive:true,force:true});});
  const command=async(value,{student=A,revision,id=`isolated-object-${++serial}`}={})=>store.executeCommand(TENANT,student,ACTOR,{command:value,commandId:id,expectedRevision:revision??(await store.get(TENANT,student)).revision},payments);
  return {payments,command,get store(){return store;},async restart(){await store.close();store=await new StudentHomeStore({dataDir:directory}).initialize();},
    async buy(skuId,options={}){const result=await command({type:'checkout',lines:[{skuId,quantity:1}]},options);return {id:result.home.commerce.owned.at(-1).id,home:result.home};},
    async lamp(options={}){const row=await this.buy('hhTripodLamp-classic',options);return {id:row.id,home:(await command({type:'placeItem',id:row.id,pose:{x:0,z:0,rotation:0},storey:0},options)).home};},
  };
}
const settings=(id,patch,storey=0)=>({type:'setObjectState',id,patch,storey});

test('old commerce remains unchanged and object defaults are typed defensive copies',()=>{
  const old=createAccountCommerce();assert.equal(validateCommerceState(old),true);assert.equal(Object.hasOwn(old,'objectStates'),false);
  const sample=kind=>({version:6,owned:[{id:'fixture',source:'purchase',status:'placed',storey:0,item:{id:'fixture',kind}}]});
  for(const [type,kinds]of Object.entries(OBJECT_CAPABILITY_KINDS))for(const kind of kinds){
    assert.equal(getObjectCapabilities(kind).type,type);const home=sample(kind),value=getObjectState(home,'fixture');assert.equal(validateObjectStates(home),true);
    if(type==='lamp')assert.deepEqual(value,{power:false,brightness:2});
    if(type==='clock')assert.deepEqual(value,{chime:true});
    if(type==='television')assert.deepEqual(value,{power:false,channel:0,volume:1});
    value.power='mutated';assert.notDeepEqual(getObjectState(home,'fixture'),value);
  }
  assert.equal(getObjectCapabilities('__proto__'),null);assert.equal(getObjectState(old,'missing'),null);
});

test('lamp setting survives student switch and service restart without any payment movement',async t=>{
  const f=await fixture(t),{id}=await f.lamp(),before=await f.store.get(TENANT,A),money={...f.payments.control};
  const changed=await f.command(settings(id,{power:true,brightness:3}),{id:'isolated-first-lamp-setting'});
  assert.equal(changed.receipt.amount,0);assert.equal(changed.receipt.orderId,null);assert.equal(changed.home.revision,before.revision+1);
  assert.deepEqual(getObjectState(changed.home.commerce,id),{power:true,brightness:3});assert.deepEqual(changed.home.commerce.wallet,before.commerce.wallet);
  assert.deepEqual(changed.home.commerce.orders,before.commerce.orders);assert.deepEqual(changed.home.commerce.owned,before.commerce.owned);assert.deepEqual(f.payments.control,money);
  assert.equal(Object.hasOwn((await f.store.get(TENANT,B)).commerce,'objectStates'),false);
  await assert.rejects(f.command(settings(id,{power:true}),{student:B}),e=>e.status===422);
  await f.restart();const restored=await f.store.get(TENANT,A);assert.deepEqual(getObjectState(restored.commerce,id),{power:true,brightness:3});assert.equal(validateStudentHome(restored,A),true);
  const replay=await f.command(settings(id,{power:true,brightness:3}),{id:'isolated-first-lamp-setting',revision:before.revision});assert.equal(replay.duplicate,true);assert.deepEqual(f.payments.control,money);
});

test('clock state uses the same placed wall identity and needs no animation/time fields in storage',async t=>{
  const f=await fixture(t),{id,home}=await f.buy('cuckooClock-classic'),wall=getWallMountTargets(home.commerce.home)[0];
  await f.command({type:'placeItem',id,pose:{mount:{type:'wall',wallId:wall.wallId,u:.2,v:.3}},storey:0});
  const saved=await f.command(settings(id,{chime:false}));assert.deepEqual(saved.home.commerce.objectStates[id],{chime:false});
  await f.restart();assert.deepEqual(getObjectState((await f.store.get(TENANT,A)).commerce,id),{chime:false});
  await assert.rejects(f.command(settings(id,{time:123})),e=>e.status===422);
});

for(const kind of OBJECT_CAPABILITY_KINDS.television)test(`${kind} is purchasable and keeps its channel and volume across a service restart`,async t=>{
  const f=await fixture(t),{id}=await f.buy(`${kind}-classic`);
  await f.command({type:'placeItem',id,pose:{x:0,z:0,rotation:90},storey:0});const money={...f.payments.control};
  const result=await f.command(settings(id,{power:true,channel:3,volume:0}));
  assert.deepEqual(getObjectState(result.home.commerce,id),{power:true,channel:3,volume:0});assert.equal(result.receipt.amount,0);assert.deepEqual(f.payments.control,money);
  await assert.rejects(f.command(settings(id,{channel:4})),e=>e.status===422);
  await assert.rejects(f.command(settings(id,{brightness:3})),e=>e.status===422);
  await f.restart();const restored=await f.store.get(TENANT,A);assert.deepEqual(restored.commerce.objectStates[id],{power:true,channel:3,volume:0});
  assert.equal(validateStudentHome(restored,A),true);assert.deepEqual(f.payments.control,money);
});

test('settings reject wrong floors, unknown objects, furniture capabilities, and injected fields',async t=>{
  const f=await fixture(t),{id}=await f.lamp(),bed=await f.buy('bedTimber-classic'),before=await f.store.get(TENANT,A),money={...f.payments.control};
  for(const value of [settings(id,{power:true},1),settings(id,{power:true},-1),settings('absent',{power:true}),settings(bed.id,{power:true}),
    settings(id,{power:1}),settings(id,{brightness:0}),settings(id,{brightness:4}),settings(id,{channel:1}),settings(id,{}),settings(id,[]),
    settings(id,JSON.parse('{"power":true,"__proto__":{"polluted":true}}')),settings('__proto__',{power:true}),settings('constructor',{power:true}),
    {...settings(id,{power:true}),amount:1}])await assert.rejects(f.command(value),e=>e.status===422,JSON.stringify(value));
  assert.deepEqual(await f.store.get(TENANT,A),before);assert.deepEqual(f.payments.control,money);assert.equal({}.polluted,undefined);
});

test('stored items cannot operate and storing or selling a lit lamp removes its settings',async t=>{
  const f=await fixture(t),{id}=await f.lamp();await f.command(settings(id,{power:true,brightness:3}));
  const stored=await f.command({type:'storeItem',id,storey:0});assert.equal(Object.hasOwn(stored.home.commerce,'objectStates'),false);
  assert.equal(getObjectState(stored.home.commerce,id),null);await assert.rejects(f.command(settings(id,{power:true})),e=>e.status===422);
  const placed=await f.command({type:'placeItem',id,pose:{x:0,z:0,rotation:90},storey:0});assert.deepEqual(getObjectState(placed.home.commerce,id),{power:false,brightness:2});
  await f.command(settings(id,{power:true}));const sold=await f.command({type:'sellItem',id});assert.equal(Object.hasOwn(sold.home.commerce,'objectStates'),false);
  assert.equal(getObjectState(sold.home.commerce,id),null);assert.equal(f.payments.control.credits,1);await f.restart();
  await assert.rejects(f.command(settings(id,{power:true})),e=>e.status===422);
});

test('moving, rotating, and painting an active object retain its settings and paid receipt',async t=>{
  const f=await fixture(t),{id}=await f.lamp();const lit=await f.command(settings(id,{power:true,brightness:1}));
  const moved=await f.command({type:'updateItem',id,patch:{x:.8,z:.4,rotation:90,color:'#aabbcc'},storey:0});
  assert.deepEqual(moved.home.commerce.objectStates,lit.home.commerce.objectStates);assert.deepEqual(moved.home.commerce.orders,lit.home.commerce.orders);
  assert.deepEqual(getObjectState(moved.home.commerce,id),{power:true,brightness:1});
});

test('bounded television fields and cross-type patches cannot forge object media or prototype data',()=>{
  const owned={id:'owned-tv',source:'purchase',status:'placed',storey:0,item:{id:'owned-tv',kind:'ipWideTelevision'}},base={version:6,owned:[owned]};
  const result=applyOwnedObjectState(base,owned.id,{power:true,channel:3,volume:2},{storey:0});assert.equal(result.ok,true);
  assert.deepEqual(getObjectState(result.state,owned.id),{power:true,channel:3,volume:2});assert.equal(validateObjectStates(result.state),true);
  for(const patch of [{channel:4},{channel:-1},{volume:3},{volume:.5},{brightness:1},{url:'https://untrusted.invalid/media'},JSON.parse('{"__proto__":{}}')])
    assert.equal(applyOwnedObjectState(base,owned.id,patch,{storey:0}).ok,false);
  for(const map of [[],null,{absent:{power:true,channel:0,volume:1}},JSON.parse('{"__proto__":{"power":true}}'),{'owned-tv':{power:true,channel:0,volume:1,extra:0}}])
    assert.equal(validateObjectStates({...base,objectStates:map}),false);
  assert.equal(validateObjectStates({...base,objectStates:{'owned-tv':{power:true,channel:0,volume:1}}}),true);
});

test('settings no-op does not advance the home revision or alter a standing robot checkpoint',async t=>{
  const f=await fixture(t),{id}=await f.lamp();await f.command({type:'setRobotActivity',activity:{kind:'stand',environment:'interior',storey:0,point:{x:1.7,z:1.5},rotation:.3}});
  const before=await f.store.getSnapshot(TENANT,A),result=await f.command(settings(id,{power:false,brightness:2}));
  assert.equal(result.home.revision,before.home.revision);assert.deepEqual(result.home,before.home);assert.deepEqual(result.robotActivity,before.robotActivity);
  const prepared=prepareCommerceCommand(result.home.commerce,settings(id,{power:false}),'isolated-noop-prepared');assert.equal(prepared.amount,0);assert.equal(prepared.changed,false);
  const changed=await f.command(settings(id,{power:true,brightness:3}));assert.equal(changed.home.revision,before.home.revision+1);assert.deepEqual(changed.robotActivity,before.robotActivity);
  for(const objectStates of [{absent:{power:true,brightness:2}}, {[id]:{power:true,brightness:2,amount:1}},JSON.parse('{"__proto__":{"power":true,"brightness":2}}')])
    assert.equal(validateCommerceState({...changed.home.commerce,objectStates}),false);
});

test('frequent setting edits keep bounded retry receipts and never erase purchase provenance or replay stale commands',async t=>{
  const f=await fixture(t),{id}=await f.lamp(),before=await f.store.get(TENANT,A),money={...f.payments.control};let home=before,lastRevision;
  for(let index=0;index<140;index++){
    lastRevision=home.revision;home=(await f.command(settings(id,{power:index%2===0}),{id:`isolated-many-settings-${index}`,revision:lastRevision})).home;
  }
  const record=await f.store.readRecord(TENANT,A);assert.equal(record.operations.filter(row=>row.receipt.type==='setObjectState').length,128);
  assert.equal(record.operations.filter(row=>row.receipt.type==='checkout').length,1);assert.deepEqual(f.payments.control,money);
  await f.restart();assert.deepEqual(getObjectState((await f.store.get(TENANT,A)).commerce,id),{power:false,brightness:2});
  const repeated=await f.command(settings(id,{power:false}),{id:'isolated-many-settings-139',revision:lastRevision});assert.equal(repeated.duplicate,true);
  await assert.rejects(f.command(settings(id,{power:true}),{id:'isolated-many-settings-0',revision:before.revision}),e=>e.status===409);
  const bought=record.operations.find(row=>row.receipt.type==='checkout');
  const repeatedPurchase=await f.command({type:'checkout',lines:[{skuId:'hhTripodLamp-classic',quantity:1}]},{id:bought.commandId,revision:0});
  assert.equal(repeatedPurchase.duplicate,true);assert.deepEqual(f.payments.control,money);assert.equal(repeatedPurchase.home.commerce.owned.length,1);
});

test('a latest explicit robot clear carried by an older setting receipt cannot be lost during setting compaction',async t=>{
  const f=await fixture(t),{id}=await f.lamp();
  await f.command({type:'setRobotActivity',activity:{kind:'stand',environment:'interior',storey:0,point:{x:1.7,z:1.5},rotation:.3}});
  await f.command(settings(id,{power:true}),{id:'isolated-setting-with-pose-clear'});
  // Receipts are the existing durable semantic-event carrier. A future object
  // operation may clear an invalid interaction without creating a pose command.
  const record=await f.store.readRecord(TENANT,A);record.operations.at(-1).receipt.detail.robotActivity=null;await f.store.writeRecord(record);
  for(let index=0;index<140;index++)await f.command(settings(id,{power:index%2===0}));
  const compacted=await f.store.readRecord(TENANT,A);assert.ok(compacted.operations.some(row=>row.commandId==='isolated-setting-with-pose-clear'));
  assert.equal(compacted.operations.filter(row=>row.receipt.type==='setObjectState').length,129);
  await f.restart();assert.equal((await f.store.getSnapshot(TENANT,A)).robotActivity,null);
});
