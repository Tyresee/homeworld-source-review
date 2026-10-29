import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StudentHomeStore} from '../server/student-homes/store.mjs';

const STUDENT='11111111-1111-4111-8111-111111111111',TENANT='isolated-checkpoint-history',ACTOR='isolated-checkpoint-teacher';
test('frequent robot checkpoints stay bounded while purchase retries and the latest pose survive restart',async t=>{
  const dir=await fs.mkdtemp(join(tmpdir(),'robot-pose-history-'));let store=await new StudentHomeStore({dataDir:dir}).initialize();
  t.after(async()=>{await store.close();await fs.rm(dir,{recursive:true,force:true});});
  const orders=new Map();let balance=150000,reserves=0;
  const payments={async get(id){if(!orders.has(id))throw Object.assign(new Error('missing fixture order'),{status:404});return{order:structuredClone(orders.get(id)),wallet:{balance}};},
    async reserve(quote){reserves++;const order={...quote,id:quote.orderId,status:'reserved'};delete order.orderId;orders.set(order.id,order);balance-=quote.amount;return{order:structuredClone(order),wallet:{balance}};},
    async commit(id){orders.get(id).status='committed';return{order:structuredClone(orders.get(id)),wallet:{balance}};}};
  let home=(await store.initializeHome(TENANT,STUDENT,ACTOR)).home,last,lastRevision,purchaseRevision;
  const buy={type:'checkout',lines:[{skuId:'bed-classic',quantity:1}]};
  for(let i=0;i<130;i++){
    if(i===12){purchaseRevision=home.revision;home=(await store.executeCommand(TENANT,STUDENT,ACTOR,{commandId:'isolated-original-purchase',expectedRevision:home.revision,command:buy},payments)).home;}
    lastRevision=home.revision;
    last=await store.executeCommand(TENANT,STUDENT,ACTOR,{commandId:`isolated-checkpoint-${i}`,expectedRevision:lastRevision,command:{type:'setRobotActivity',activity:{kind:'stand',environment:'interior',storey:0,point:{x:0,z:1.5},rotation:i/100}}},payments);home=last.home;
  }
  const record=await store.readRecord(TENANT,STUDENT);assert.equal(record.operations.filter(row=>row.receipt.type==='setRobotActivity').length,64);
  assert.equal(record.operations.filter(row=>row.receipt.type==='checkout').length,1);assert.equal(reserves,1);const afterPurchase=balance;
  await store.close();store=await new StudentHomeStore({dataDir:dir}).initialize();
  assert.deepEqual((await store.getSnapshot(TENANT,STUDENT)).robotActivity,last.robotActivity);
  const purchaseReplay=await store.executeCommand(TENANT,STUDENT,ACTOR,{commandId:'isolated-original-purchase',expectedRevision:purchaseRevision,command:buy},payments);
  assert.equal(purchaseReplay.duplicate,true);assert.equal(purchaseReplay.home.commerce.owned.length,1);assert.equal(reserves,1);assert.equal(balance,afterPurchase);
  const repeat=await store.executeCommand(TENANT,STUDENT,ACTOR,{commandId:'isolated-checkpoint-129',expectedRevision:lastRevision,command:{type:'setRobotActivity',activity:last.robotActivity}},payments);
  assert.equal(repeat.duplicate,true);assert.equal(repeat.home.revision,home.revision);
  await assert.rejects(store.executeCommand(TENANT,STUDENT,ACTOR,{commandId:'isolated-checkpoint-0',expectedRevision:0,command:{type:'setRobotActivity',activity:{kind:'stand',environment:'interior',storey:0,point:{x:0,z:1.5},rotation:0}}},payments),error=>error.status===409);
});
