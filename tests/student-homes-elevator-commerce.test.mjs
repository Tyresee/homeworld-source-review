import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StudentHomeStore} from '../server/student-homes/store.mjs';
import {validateStudentHome} from '../server/student-homes/profile.mjs';
import {createAccountCommerce,prepareCommerceCommand,validateAccountCommerce,accountCatalog} from '../server/student-homes/commerce.mjs';
import {quoteStaircaseUpgrade,upgradeStaircase,validateCommerceState,migrateCommerceState,purchaseFloorConstruction,placeOwnedStorey,ELEVATOR_UPGRADE_PRODUCT} from '../public/js/home-commerce.js';
import {applyChange} from '../public/js/home-engine.js';
import {getHomeStairs,getStaircaseVolume,isStaircaseValid,FLOOR_Y,STOREY_HEIGHT} from '../public/js/home-staircase-shape.js';

const STUDENT='11111111-1111-4111-8111-111111111111',TENANT='fictional-elevator-project',ACTOR='fictional-elevator-teacher';
const rect={minX:-2.8,minZ:-3.8,width:5.6,depth:7.8};
const construct=(storey,area=rect)=>({type:'constructFloor',selection:{storey,rects:[area]}});
const fakeError=status=>Object.assign(new Error('injected isolated failure'),{status,code:'injected'});
const floors=state=>[state.home,...state.upperFloors];
const upperLink=(state,storey=0)=>getHomeStairs(floors(state)[storey]).find(row=>row.direction==='up');
const payable=state=>({...structuredClone(state),wallet:{balance:100_000,initialBalance:state.wallet.initialBalance+100_000}});
function readyCommerce(count=2,area=rect) {
  let state=createAccountCommerce();
  for(let storey=0;storey<count;storey++)state=prepareCommerceCommand(state,construct(storey,area),`isolated-floor-${storey}`).commerce;
  return state;
}
function bank(){
  const orders=new Map(),control={balance:500_000,reserves:0,commits:0,reserveFailure:null,commitFailure:null};
  const wallet=()=>({currency:'platform-points',balance:control.balance});
  return {control,orders,
    async get(id){if(!orders.has(id))throw fakeError(404);return {order:structuredClone(orders.get(id)),wallet:wallet()};},
    async reserve(input){
      control.reserves++;if(control.reserveFailure==='before')throw fakeError(503);
      let order=orders.get(input.orderId);
      if(!order){if(input.amount>control.balance)throw Object.assign(fakeError(409),{code:'home_payment_insufficient'});
        order={id:input.orderId,...input,status:'reserved'};delete order.orderId;orders.set(order.id,order);control.balance-=order.amount;}
      if(control.reserveFailure==='after')throw fakeError(503);
      return {order:structuredClone(order),wallet:wallet()};
    },
    async commit(id){control.commits++;if(control.commitFailure==='before')throw fakeError(503);const order=orders.get(id);order.status='committed';
      if(control.commitFailure==='after')throw fakeError(503);return {order:structuredClone(order),wallet:wallet()};},
  };
}
async function fixture(t){
  const dir=await fs.mkdtemp(join(tmpdir(),'student-home-elevator-'));let store=await new StudentHomeStore({dataDir:dir}).initialize();
  const payments=bank();await store.initializeHome(TENANT,STUDENT,ACTOR);
  t.after(async()=>{await store.close();await fs.rm(dir,{recursive:true,force:true});});
  const command=(command,id,revision)=>store.executeCommand(TENANT,STUDENT,ACTOR,{command,commandId:id,expectedRevision:revision},payments);
  let result=await command(construct(0),'isolated-expand-ground',0);
  result=await command(construct(1),'isolated-create-upper',result.home.revision);
  const id=upperLink(result.home.commerce).id;
  return {payments,command,id,revision:result.home.revision,get store(){return store;},
    async restart(){await store.close();store=await new StudentHomeStore({dataDir:dir}).initialize();}};
}

test('legacy stairs retain their footprint and height; elevators reserve the full cabin on both floors',()=>{
  const stairs={id:'legacy-stairs',x:0,z:0,rotation:90,direction:'up'};
  assert.equal(isStaircaseValid(stairs),true);assert.equal(isStaircaseValid({...stairs,type:'escalator'}),false);
  const old=getStaircaseVolume(stairs),elevator=getStaircaseVolume({...stairs,type:'elevator'}),upper=getStaircaseVolume({...stairs,type:'elevator',direction:'down'});
  for(const key of ['minX','maxX','minZ','maxZ','minY'])assert.equal(elevator[key],old[key]);
  assert.equal(elevator.maxY,FLOOR_Y+STOREY_HEIGHT+2.2);assert.equal(upper.maxY,FLOOR_Y+2.2);
  assert.ok(elevator.maxY>old.maxY);
});
test('dedicated transport product does not become an ordinary account inventory SKU',()=>{
  assert.equal(ELEVATOR_UPGRADE_PRODUCT.price,12000);assert.equal(ELEVATOR_UPGRADE_PRODUCT.productType,'transport');
  assert.equal(accountCatalog().some(row=>row.skuId===ELEVATOR_UPGRADE_PRODUCT.skuId),false);
  assert.throws(()=>prepareCommerceCommand(createAccountCommerce(),{type:'checkout',lines:[{skuId:ELEVATOR_UPGRADE_PRODUCT.skuId,quantity:1}]},'isolated-buy-elevator'),e=>e.status===422);
});
test('quote and paid installation update a single pair atomically, preserve its pose, and record actual spending',()=>{
  const before=payable(readyCommerce()),original=structuredClone(before),stair=upperLink(before);
  const quote=quoteStaircaseUpgrade(before,stair.id,{storey:1});assert.equal(quote.ok,true);assert.equal(quote.quote.lowerStorey,0);assert.equal(quote.quote.upperStorey,1);assert.equal(quote.quote.amount,12000);
  assert.deepEqual(before,original);
  const result=upgradeStaircase(before,stair.id,'isolated-upgrade-first',{storey:1});assert.equal(result.ok,true,result.error);assert.equal(validateCommerceState(result.state),true);
  assert.equal(result.state.wallet.balance,before.wallet.balance-12000);assert.equal(result.state.revision,before.revision+1);
  for(const [index,direction] of [[0,'up'],[1,'down']])assert.deepEqual(getHomeStairs(floors(result.state)[index])[0],{...stair,direction,type:'elevator'});
  assert.equal(result.state.constructionLedger.at(-1).type,'elevator-upgrade');assert.equal(result.state.constructionLedger.at(-1).total,12000);
  const noOp=upgradeStaircase(result.state,stair.id,'isolated-already-upgraded',{storey:0});assert.equal(noOp.ok,true);assert.equal(noOp.quote.amount,0);assert.equal(noOp.state,result.state);
  const replay=upgradeStaircase(result.state,stair.id,'isolated-upgrade-first',{storey:1});assert.equal(replay.repeated,true);assert.equal(replay.quote.amount,0);assert.equal(replay.state,result.state);
  assert.equal(purchaseFloorConstruction(result.state,{storey:0,rects:[rect]},'isolated-upgrade-first').ok,false);
});
test('missing floors, mismatched peer records, forged upgrade charges and invalid command keys are rejected',()=>{
  assert.equal(quoteStaircaseUpgrade(payable(createAccountCommerce()),'absent',{storey:0}).ok,false);
  const state=readyCommerce(),id=upperLink(state).id;
  for(const corrupt of [s=>delete s.upperFloors[0].stairs,s=>s.upperFloors[0].stairs.x+=.2,s=>s.upperFloors[0].stairs.type='elevator']){
    const invalid=structuredClone(state);corrupt(invalid);assert.equal(validateAccountCommerce(invalid),false);
    assert.throws(()=>prepareCommerceCommand(invalid,{type:'upgradeStaircase',id,storey:0},'isolated-invalid-peer'),e=>e.status===503);
  }
  for(const command of [{type:'upgradeStaircase',id,storey:5},{type:'upgradeStaircase',id,storey:0,amount:1},{type:'upgradeStaircase',id,storey:0,typeOverride:'stairs'},{type:'upgradeStaircase',id,storey:0.5}])
    assert.throws(()=>prepareCommerceCommand(state,command,'isolated-invalid-command'),e=>e.status===422);
  const done=prepareCommerceCommand(state,{type:'upgradeStaircase',id,storey:0},'isolated-upgrade-valid').commerce;
  const unpaid=structuredClone(done);unpaid.constructionLedger.pop();assert.equal(validateAccountCommerce(unpaid),false);
  const duplicate=structuredClone(done),entry=structuredClone(duplicate.constructionLedger.at(-1));entry.id='another-upgrade';entry.transactionId='another-upgrade-payment';
  duplicate.constructionLedger.push(entry);duplicate.wallet.initialBalance+=entry.total;assert.equal(validateAccountCommerce(duplicate),false);
});
test('full-height upper cabin rejects an existing chandelier without charging or moving any goods',()=>{
  let state=readyCommerce();state=prepareCommerceCommand(state,{type:'checkout',lines:[{skuId:'chandelier-classic',quantity:1}]},'isolated-buy-lamp').commerce;
  state=prepareCommerceCommand(state,{type:'placeItem',id:state.owned[0].id,pose:{x:0,z:0,rotation:0},storey:1},'isolated-place-lamp').commerce;
  assert.equal(validateAccountCommerce(state),true);const before=structuredClone(state),result=upgradeStaircase(payable(state),upperLink(state).id,'isolated-lamp-conflict',{storey:0});
  assert.equal(result.ok,false);assert.match(result.error,/DisplayText4639.*DisplayText0783/);assert.deepEqual(state,before);
});
test('doorway clearance covers both landings and refuses a furnishing outside the old reserved footprint',()=>{
  for(const storey of [0,1]){
    let state=readyCommerce();state=prepareCommerceCommand(state,{type:'checkout',lines:[{skuId:'plant-classic',quantity:1}]},`isolated-buy-plant-${storey}`).commerce;
    state=prepareCommerceCommand(state,{type:'placeItem',id:state.owned[0].id,pose:{x:0,z:storey===0?2.35:-2.35,rotation:0},storey},`isolated-place-plant-${storey}`).commerce;
    assert.equal(validateAccountCommerce(state),true);const result=upgradeStaircase(payable(state),upperLink(state).id,`isolated-blocked-door-${storey}`,{storey:0});
    assert.equal(result.ok,false);assert.match(result.error,/DisplayText4640.*DisplayText4641/);
  }
});
test('middle-floor connections upgrade independently and later floor construction retains the installed elevator',()=>{
  const area={minX:-5.6,minZ:-3.8,width:11.2,depth:7.8};let state=readyCommerce(2,area),first=upperLink(state);
  state=prepareCommerceCommand(state,{type:'upgradeStaircase',id:first.id,storey:0},'isolated-elevator-lower').commerce;
  state=prepareCommerceCommand(state,construct(2,area),'isolated-third-floor').commerce;
  assert.equal(upperLink(state,0).type,'elevator');assert.equal(upperLink(state,1).type,undefined);
  assert.equal(getHomeStairs(state.upperFloors[0]).find(row=>row.direction==='down').type,'elevator');
  // Isolated geometry fixture: move the new, ordinary pair to clear landings.
  // This modifies no production home and does not bypass the upgrade checks.
  const second=upperLink(state,1);
  for(const index of [1,2]){
    const floor=floors(state)[index],stair=getHomeStairs(floor).find(row=>row.id===second.id),changed=applyChange(floor,{type:'stairs',stairs:{...stair,x:3.4,z:0}});
    assert.equal(changed.ok,true,changed.error);state.upperFloors[index-1]=changed.state;
  }
  assert.equal(validateAccountCommerce(state),true);
  state=prepareCommerceCommand(state,{type:'upgradeStaircase',id:second.id,storey:2},'isolated-elevator-upper').commerce;
  assert.equal(validateAccountCommerce(state),true);assert.equal(getHomeStairs(state.upperFloors[0]).filter(row=>row.type==='elevator').length,2);
  assert.equal(state.constructionLedger.filter(row=>row.type==='elevator-upgrade').length,2);
});
test('legacy v2 commerce without a type remains readable and migrates without charging an elevator',()=>{
  // Build a genuine already-paid v3 kit receipt here so a committed release
  // does not depend on untracked demo-test helpers in the developer checkout.
  const old=payable(createAccountCommerce());old.version=3;
  for(const key of ['avatar','constructionBasis','constructionLedger'])delete old[key];
  old.orders.push({id:'legacy-order-1',transactionId:'historical-kit-1',lines:[{skuId:'second-storey-kit',quantity:1,unitPrice:26000}],total:26000,ownedIds:['legacy-kit-1']});
  old.owned.push({id:'legacy-kit-1',skuId:'second-storey-kit',source:'purchase',orderId:'legacy-order-1',status:'stored',storey:null,item:{id:'legacy-kit-1',kind:'second-storey'}});
  old.wallet.balance-=26000;assert.equal(validateCommerceState(old),true);
  const historical=migrateCommerceState(old);assert.equal(historical.ok,true,historical.error);
  const installed=placeOwnedStorey(historical.state,'legacy-kit-1');
  assert.equal(installed.ok,true,installed.error);const legacy=installed.state;legacy.version=2;
  for(const key of ['avatar','areaLedger','constructionBasis','constructionLedger'])delete legacy[key];
  assert.equal(validateCommerceState(legacy),true);
  const migrated=migrateCommerceState(legacy);assert.equal(migrated.ok,true,migrated.error);assert.equal(validateCommerceState(migrated.state),true);
  assert.equal(upperLink(migrated.state).type,undefined);assert.equal(migrated.state.constructionLedger.length,0);assert.equal(migrated.state.wallet.balance,74000);
});
test('platform payment is atomic, versioned, persisted and idempotent across concurrent clicks and restart',async t=>{
  const f=await fixture(t),command={type:'upgradeStaircase',id:f.id,storey:0},balance=f.payments.control.balance,reserves=f.payments.control.reserves;
  const results=await Promise.all(Array.from({length:5},()=>f.command(command,'isolated-upgrade-command',f.revision)));
  assert.equal(results.filter(row=>!row.duplicate).length,1);assert.equal(f.payments.control.balance,balance-12000);assert.equal(f.payments.control.reserves,reserves+1);
  const result=results[0];assert.equal(result.receipt.amount,12000);assert.equal(result.receipt.detail.quote.type,'elevator');assert.equal(result.receipt.detail.quote.lowerStorey,0);
  assert.equal(result.home.house.floors[0].stairs.type,'elevator');assert.equal(result.home.house.floors[1].stairs.type,'elevator');assert.equal(validateStudentHome(result.home,STUDENT),true);
  await f.restart();const replay=await f.command(command,'isolated-upgrade-command',f.revision);assert.equal(replay.duplicate,true);assert.equal(f.payments.control.balance,balance-12000);
  await assert.rejects(f.command(command,'isolated-stale-upgrade',f.revision),e=>e.status===409);
  const again=await f.command({...command,storey:1},'isolated-second-upgrade',result.home.revision);assert.equal(again.receipt.amount,0);assert.equal(again.home.revision,result.home.revision);
  assert.equal(f.payments.control.reserves,reserves+1);
});
test('insufficient platform points keep both original stairs and allow a later funded command',async t=>{
  const f=await fixture(t),command={type:'upgradeStaircase',id:f.id,storey:0};f.payments.control.balance=11999;
  await assert.rejects(f.command(command,'isolated-not-enough',f.revision),e=>e.status===409&&e.code==='home_payment_insufficient');
  const before=await f.store.get(TENANT,STUDENT);assert.equal(upperLink(before.commerce).type,undefined);assert.equal(before.revision,f.revision);
  f.payments.control.balance=12000;const result=await f.command(command,'isolated-now-enough',f.revision);assert.equal(result.receipt.amount,12000);assert.equal(f.payments.control.balance,0);
});
for(const method of ['reserve','commit'])for(const when of ['before','after'])test(`elevator ${method}-${when} interrupted payment recovers the same paired installation once`,async t=>{
  const f=await fixture(t),command={type:'upgradeStaircase',id:f.id,storey:0},balance=f.payments.control.balance;
  f.payments.control[`${method}Failure`]=when;
  await assert.rejects(f.command(command,'isolated-lost-elevator-reply',f.revision),e=>e.status===503);
  const pending=await f.store.readRecord(TENANT,STUDENT);assert.equal(pending.pending.amount,12000);assert.equal(upperLink(pending.home.commerce).type,undefined);
  await f.restart();f.payments.control[`${method}Failure`]=null;const restored=await f.store.get(TENANT,STUDENT,f.payments);
  assert.equal(upperLink(restored.commerce).type,'elevator');assert.equal(getHomeStairs(restored.commerce.upperFloors[0])[0].type,'elevator');
  assert.equal(f.payments.control.balance,balance-12000);assert.equal(restored.commerce.constructionLedger.filter(row=>row.type==='elevator-upgrade').length,1);
  assert.equal((await f.store.readRecord(TENANT,STUDENT)).pending,null);
  assert.equal((await f.command(command,'isolated-lost-elevator-reply',f.revision)).duplicate,true);
});
