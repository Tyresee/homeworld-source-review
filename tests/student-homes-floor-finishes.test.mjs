import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StudentHomeStore} from '../server/student-homes/store.mjs';
import {createAccountCommerce,prepareCommerceCommand,validateAccountCommerce} from '../server/student-homes/commerce.mjs';
import {getStoreyRoomSlots} from '../public/js/home-commerce.js';

const finish=(surfaceId='floor.main',finishId='wood-walnut',storey=0)=>({type:'setFloorFinish',surfaceId,finishId,storey});

test('authoritative finish commands are free, strict, no-op safe and do not grant an inventory unit',()=>{
 const state=createAccountCommerce(),before=structuredClone(state),result=prepareCommerceCommand(state,finish(),'floor-finish-first');
 assert.equal(result.amount,0);assert.equal(result.changed,true);assert.equal(result.commerce.home.surfaces['floor.main'].finishId,'wood-walnut');assert.equal(validateAccountCommerce(result.commerce),true);
 assert.deepEqual(result.commerce.wallet,state.wallet);assert.deepEqual(result.commerce.owned,state.owned);assert.deepEqual(result.commerce.orders,state.orders);assert.deepEqual(state,before);
 assert.equal(prepareCommerceCommand(result.commerce,finish(),'floor-finish-same').changed,false);
 for(const command of [{...finish(),price:0},{...finish(),storey:99},finish('wall.inner'),finish('room:missing.floor'),finish('floor.main','invalid'),finish('floor.main','wood-walnut',-1)])assert.throws(()=>prepareCommerceCommand(state,command,'floor-finish-invalid'),error=>error.status===422);
});

test('purchased room floor finish remains paired with its owned room record after reconciliation',()=>{
 let state=createAccountCommerce();
 const run=(command,id)=>{const result=prepareCommerceCommand(state,command,id);state=result.commerce;return result;};
 run({type:'constructFloor',selection:{storey:0,rects:[{minX:2.8,minZ:-2.6,width:2.8,depth:5.2}]}},'finish-room-expand');
 run({type:'checkout',lines:[{skuId:'room-bedroom-compact',quantity:1}]},'finish-room-buy');
 const owned=state.owned[0],slot=getStoreyRoomSlots(state,owned.item.kind,0)[0];assert.ok(slot);
 run({type:'placeRoom',id:owned.id,pose:{cx:slot.cx,cz:slot.cz,...slot.bounds?{bounds:slot.bounds}:{}},storey:0},'finish-room-place');
 const room=state.home.rooms.find(room=>room.id!=='living'),before=structuredClone(room.floor),result=run(finish('room:'+room.id+'.floor','tile-sand'),'finish-room-change');
 assert.equal(result.amount,0);assert.equal(validateAccountCommerce(state),true);
 assert.deepEqual(state.home.rooms.find(row=>row.id===room.id).floor,{...before,finishId:'tile-sand'});
 assert.equal(state.owned.find(row=>row.id===owned.id).item.floor.finishId,'tile-sand');
 const invalid=structuredClone(state);invalid.owned[0].item.wall.finishId='tile-sand';assert.equal(validateAccountCommerce(invalid),false);
 const missing=structuredClone(state);missing.owned[0].item.floor=null;assert.equal(validateAccountCommerce(missing),false);
});

test('free finishes persist across restart and teacher switch, replay once, and stay isolated per student',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'home-floor-finish-')),tenant='fictional-floor-project',student='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 let store=await new StudentHomeStore({dataDir:directory}).initialize();t.after(async()=>{await store.close();await rm(directory,{recursive:true,force:true});});
 await store.initializeHome(tenant,student,'fictional-teacher-a');await store.initializeHome(tenant,other,'fictional-teacher-a');
 const bank={reserve(){assert.fail('free finishes must never reserve points');},commit(){assert.fail('free finishes must never commit points');}};
 const payload={command:finish(),commandId:'floor-finish-persistent',expectedRevision:0};
 let result=await store.executeCommand(tenant,student,'fictional-teacher-a',payload,bank);assert.equal(result.receipt.amount,0);assert.equal(result.home.revision,1);assert.equal(result.home.commerce.home.surfaces['floor.main'].finishId,'wood-walnut');
 await store.close();store=await new StudentHomeStore({dataDir:directory}).initialize();
 result=await store.executeCommand(tenant,student,'fictional-teacher-b',payload,bank);assert.equal(result.duplicate,true);assert.equal(result.home.revision,1);
 assert.equal((await store.get(tenant,student)).commerce.home.surfaces['floor.main'].finishId,'wood-walnut');assert.equal((await store.get(tenant,other)).commerce.home.surfaces['floor.main'].finishId,undefined);
});
