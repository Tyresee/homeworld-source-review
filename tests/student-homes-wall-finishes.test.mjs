import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StudentHomeStore} from '../server/student-homes/store.mjs';
import {createAccountCommerce,prepareCommerceCommand,validateAccountCommerce} from '../server/student-homes/commerce.mjs';
import {getFloorHome,getStoreyRoomSlots} from '../public/js/home-commerce.js';
import {STARTER_WALL_SURFACE_IDS} from '../public/js/home-wall-finishes.js';

const style=(surfaceId='wall.inner',styleId='wall-stripe-fine',storey=0)=>({type:'setWallFinish',surfaceId,styleId,storey});
const color=(surfaceId='wall.inner',colorId='wall-mist-blue',storey=0)=>({type:'setWallFinish',surfaceId,colorId,storey});

test('authoritative wall writes are free, strict, no-op safe and do not create an order or inventory item',()=>{
  const state=createAccountCommerce(),before=structuredClone(state),first=prepareCommerceCommand(state,style(),'wall-style-first');
  assert.equal(first.amount,0);assert.equal(first.changed,true);assert.equal(validateAccountCommerce(first.commerce),true);
  for(const id of STARTER_WALL_SURFACE_IDS)assert.equal(first.commerce.home.surfaces[id].styleId,'wall-stripe-fine');
  const second=prepareCommerceCommand(first.commerce,color('wall.side'),'wall-color-second');assert.equal(second.amount,0);
  for(const id of STARTER_WALL_SURFACE_IDS){assert.equal(second.commerce.home.surfaces[id].styleId,'wall-stripe-fine');assert.equal(second.commerce.home.surfaces[id].colorId,'wall-mist-blue');assert.equal(second.commerce.home.surfaces[id].color,state.home.surfaces[id].color);}
  assert.deepEqual(second.commerce.wallet,state.wallet);assert.deepEqual(second.commerce.owned,state.owned);assert.deepEqual(second.commerce.orders,state.orders);
  assert.equal(prepareCommerceCommand(second.commerce,color('wall.outer'),'wall-color-noop').changed,false);
  for(const command of [{...style(),price:0},{...style(),colorId:'wall-apricot'},{...style(),storey:99},{...style(),styleId:null},{...style(),color:'#123456'},style('floor.main'),style('room:missing.wall'),style('wall.inner','unknown'),style('wall.inner','wall-dots',-1),{type:'setWallFinish',surfaceId:'wall.inner',storey:0}])assert.throws(()=>prepareCommerceCommand(state,command,'wall-style-invalid'),error=>error.status===422);
  assert.deepEqual(state,before);
});

test('purchased room wall choices remain paired with owned room metadata and preserve its original raw appearance',()=>{
  let state=createAccountCommerce();const run=(command,id)=>{const result=prepareCommerceCommand(state,command,id);state=result.commerce;return result;};
  run({type:'constructFloor',selection:{storey:0,rects:[{minX:2.8,minZ:-2.6,width:2.8,depth:5.2}]}},'wall-room-expand');
  run({type:'checkout',lines:[{skuId:'room-bedroom-compact',quantity:1}]},'wall-room-buy');
  const owned=state.owned[0],slot=getStoreyRoomSlots(state,owned.item.kind,0)[0];assert.ok(slot);
  run({type:'placeRoom',id:owned.id,pose:{cx:slot.cx,cz:slot.cz,...slot.bounds?{bounds:slot.bounds}:{}},storey:0},'wall-room-place');
  const room=state.home.rooms.find(row=>row.id!=='living'),before=structuredClone(room),surfaceId='room:'+room.id+'.wall';
  assert.equal(run(style(surfaceId,'wall-dots'),'wall-room-style').amount,0);assert.equal(run(color(surfaceId,'wall-lavender'),'wall-room-color').amount,0);
  const expected={...before,wall:{...before.wall,styleId:'wall-dots',colorId:'wall-lavender'}};
  assert.deepEqual(state.home.rooms.find(row=>row.id===room.id),expected);assert.deepEqual(state.owned.find(row=>row.id===owned.id).item,expected);assert.equal(validateAccountCommerce(state),true);
  for(const part of ['floor','wall']){const invalid=structuredClone(state);invalid.owned[0].item[part][part==='floor'?'styleId':'colorId']='unknown';assert.equal(validateAccountCommerce(invalid),false);}
});

test('wall choices persist across restart, teacher switch and replay without touching another student or points',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'home-wall-finish-')),tenant='fictional-wall-project',student='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
  let store=await new StudentHomeStore({dataDir:directory}).initialize();t.after(async()=>{await store.close();await rm(directory,{recursive:true,force:true});});
  await store.initializeHome(tenant,student,'fictional-teacher-a');await store.initializeHome(tenant,other,'fictional-teacher-a');
  const bank={reserve(){assert.fail('free wall choices must not reserve points');},commit(){assert.fail('free wall choices must not commit points');}};
  const payload={command:style('wall.side','wall-dots'),commandId:'wall-style-persistent',expectedRevision:0};
  let result=await store.executeCommand(tenant,student,'fictional-teacher-a',payload,bank);assert.equal(result.receipt.amount,0);assert.equal(result.home.revision,1);
  result=await store.executeCommand(tenant,student,'fictional-teacher-a',{command:color('wall.outer','wall-apricot'),commandId:'wall-color-persistent',expectedRevision:1},bank);assert.equal(result.receipt.amount,0);assert.equal(result.home.revision,2);
  await store.close();store=await new StudentHomeStore({dataDir:directory}).initialize();
  result=await store.executeCommand(tenant,student,'fictional-teacher-b',payload,bank);assert.equal(result.duplicate,true);assert.equal(result.home.revision,2);
  const saved=await store.get(tenant,student),untouched=await store.get(tenant,other);
  for(const id of STARTER_WALL_SURFACE_IDS){assert.equal(saved.commerce.home.surfaces[id].styleId,'wall-dots');assert.equal(saved.commerce.home.surfaces[id].colorId,'wall-apricot');assert.equal(untouched.commerce.home.surfaces[id].styleId,undefined);assert.equal(untouched.commerce.home.surfaces[id].colorId,undefined);}
  const noChange=await store.executeCommand(tenant,student,'fictional-teacher-b',{command:color('wall.inner','wall-apricot'),commandId:'wall-color-no-change',expectedRevision:2},bank);assert.equal(noChange.receipt.amount,0);assert.equal(noChange.home.revision,2);
});

test('upper-floor wall choices stay on that floor and preserve its geometry',()=>{
  let state=createAccountCommerce();const run=(command,id)=>{const result=prepareCommerceCommand(state,command,id);state=result.commerce;return result;};
  run({type:'constructFloor',selection:{storey:1,rects:[{minX:-2.8,minZ:-2.6,width:5.6,depth:5.2}]}},'wall-upper-create');
  const lower=structuredClone(state.home),paid=structuredClone(state.wallet),upper=structuredClone(getFloorHome(state,1));
  assert.equal(run(style('wall.side','wall-dots',1),'wall-upper-shared-style').amount,0);
  for(const id of STARTER_WALL_SURFACE_IDS)assert.equal(state.upperFloors[0].surfaces[id].styleId,'wall-dots');
  assert.deepEqual(state.home,lower);assert.deepEqual(state.wallet,paid);
  assert.equal(run(color('wall.inner','wall-lavender',1),'wall-upper-shared-color').amount,0);
  for(const id of STARTER_WALL_SURFACE_IDS){assert.equal(state.upperFloors[0].surfaces[id].styleId,'wall-dots');assert.equal(state.upperFloors[0].surfaces[id].colorId,'wall-lavender');assert.equal(state.upperFloors[0].surfaces[id].color,upper.surfaces[id].color);}
  for(const key of ['slab','rooms','stairs','staircases'])assert.deepEqual(state.upperFloors[0][key],upper[key]);
  assert.deepEqual(state.home,lower);assert.deepEqual(state.wallet,paid);assert.equal(validateAccountCommerce(JSON.parse(JSON.stringify(state))),true);
});
