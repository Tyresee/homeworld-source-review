import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StudentHomeStore} from '../server/student-homes/store.mjs';
import {validateStudentHome} from '../server/student-homes/profile.mjs';
import {accountCatalog,paymentOrderId,resaleOrderId} from '../server/student-homes/commerce.mjs';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const TENANT='fictional-resale-project',ACTOR='fictional-resale-teacher';
const failure=(status,code='injected')=>Object.assign(new Error(code),{status,code});
const clone=value=>structuredClone(value);
function bank(){
  const orders=new Map(),resales=new Map(),control={balance:100000,reserves:0,commits:0,creditCalls:0,credits:0,creditFailure:null,getFailure:null,replyPatch:null};
  const wallet=()=>({tenantId:TENANT,studentId:A,currency:'platform-points',balance:control.balance});
  return {control,orders,resales,
    async get(id){if(!orders.has(id))throw failure(404);return {order:clone(orders.get(id)),wallet:wallet()};},
    async reserve(quote){control.reserves++;if(!orders.has(quote.orderId)){
      if(control.balance<quote.amount)throw failure(409,'home_payment_insufficient');
      orders.set(quote.orderId,{...quote,id:quote.orderId,status:'reserved'});control.balance-=quote.amount;
    }return this.get(quote.orderId);},
    async commit(id){control.commits++;orders.get(id).status='committed';return this.get(id);},
    async getResale(id){if(control.getFailure)throw control.getFailure;if(!resales.has(id))throw failure(404,'home_resale_not_found');
      return {resale:{...clone(resales.get(id)),...control.replyPatch},wallet:wallet()};},
    async creditResale(quote){
      control.creditCalls++;
      if(control.creditFailure==='before')throw failure(503);
      if(control.creditFailure&&control.creditFailure!=='after')throw control.creditFailure;
      const original=orders.get(quote.originalOrderId);assert.equal(original.status,'committed');assert.equal(original.itemsHash,quote.originalItemsHash);
      assert.equal(quote.creditAmount,Math.floor(quote.paidUnitPrice/2));
      const duplicate=resales.has(quote.id);
      if(!duplicate){resales.set(quote.id,{...clone(quote),sourceGameId:'homeworld',currency:'platform-points',status:'credited',ledgerEntryId:`resale-ledger-${control.credits+1}`,
        createdBy:ACTOR,createdAt:'2026-10-25T00:00:00.000Z'});control.balance+=quote.creditAmount;control.credits++;}
      if(control.creditFailure==='after')throw failure(503);
      return {resale:{...clone(resales.get(quote.id)),...control.replyPatch},wallet:wallet(),duplicate};
    }
  };
}
async function fixture(t,{fsImpl}={}){
  const dir=await fs.mkdtemp(join(tmpdir(),'home-resale-store-'));let store;
  const start=async()=>{store=await new StudentHomeStore({dataDir:dir,...fsImpl?{fsImpl}:{}}).initialize();};
  await start();await store.initializeHome(TENANT,A,ACTOR);const payments=bank();
  t.after(async()=>{await store.close();await fs.rm(dir,{recursive:true,force:true});});
  return {payments,dir,get store(){return store;},async restart(){await store.close();await start();},
    command:(command,commandId,expectedRevision,studentId=A)=>store.executeCommand(TENANT,studentId,ACTOR,{command,commandId,expectedRevision},payments),
    async buy(skuId='bed-classic',quantity=1){return this.command({type:'checkout',lines:[{skuId,quantity}]},'resale-original-purchase',0);}};
}

test('stored furniture sells for half original paid price and retains immutable purchase and sold tombstone',async t=>{
  const f=await fixture(t);let bought=await f.buy();const id=bought.home.commerce.owned[0].id;
  // A historical paid price differs from today's 1,800-point catalog entry.
  const record=await f.store.readRecord(TENANT,A),order=record.home.commerce.orders[0];
  order.lines[0].unitPrice=3200;order.total=3200;record.home.commerce.wallet.initialBalance=3200;
  record.operations[0].receipt.amount=3200;record.operations[0].receipt.detail.order=clone(order);
  f.payments.orders.get(record.operations[0].receipt.orderId).amount=3200;f.payments.control.balance=96800;await f.store.writeRecord(record);
  const sold=await f.command({type:'sellItem',id},'resale-command-0001',1);
  assert.equal(sold.receipt.amount,0);assert.equal(sold.receipt.creditAmount,1600);assert.equal(sold.receipt.direction,'credit');assert.equal(sold.wallet.balance,98400);
  assert.equal(sold.home.commerce.owned[0].status,'sold');assert.equal(sold.home.commerce.owned[0].storey,null);
  assert.equal(sold.home.commerce.orders[0].lines[0].unitPrice,3200);assert.deepEqual(sold.home.commerce.wallet,{balance:0,initialBalance:1600});
  assert.equal(sold.home.commerce.resaleLedger.length,1);assert.equal(validateStudentHome(sold.home,A),true);
  const proof=[...f.payments.resales.values()][0];assert.equal(proof.originalOrderId,paymentOrderId(TENANT,A,'resale-original-purchase'));
  assert.equal(proof.id,resaleOrderId(TENANT,A,id,proof.originalOrderId));assert.equal(proof.originalItemsHash,record.operations[0].hash);
  await f.restart();const replay=await f.command({type:'sellItem',id},'resale-command-0001',1);assert.equal(replay.duplicate,true);
  assert.equal(replay.receipt.creditAmount,1600);assert.equal(replay.wallet.balance,98400);assert.equal(f.payments.control.credits,1);
  await assert.rejects(f.command({type:'sellItem',id},'resale-command-second',2),e=>e.status===422);
  await assert.rejects(f.command({type:'placeItem',id,pose:{x:0,z:0},storey:0},'resale-place-sold',2),e=>e.status===422);
  assert.equal(f.payments.control.reserves,1);assert.equal(f.payments.control.commits,1);
});

for(const phase of ['before','after'])test(`lost credit ${phase} acknowledgement recovers on GET after restart without repeat credit`,async t=>{
  const f=await fixture(t);let r=await f.buy(),id=r.home.commerce.owned[0].id;
  r=await f.command({type:'placeItem',id,pose:{x:0,z:0},storey:0},'resale-place-bed',r.home.revision);
  r=await f.command({type:'setRobotActivity',activity:{kind:'sleep',itemId:id,storey:0}},'resale-sleep-bed',r.home.revision);
  f.payments.control.creditFailure=phase;
  await assert.rejects(f.command({type:'sellItem',id},'resale-uncertain-credit',r.home.revision),e=>e.status===503);
  const pending=await f.store.readRecord(TENANT,A);assert.equal(pending.pending.kind,'resale-credit');assert.equal(pending.pending.amount,0);assert.equal(pending.pending.creditAmount,900);
  assert.equal(pending.home.commerce.owned[0].status,'placed');assert.equal(pending.home.commerce.home.furniture.length,1);
  assert.deepEqual(pending.operations.at(-1).receipt.detail.robotActivity,{kind:'sleep',itemId:id,storey:0});
  await assert.rejects(f.store.updateColors(TENANT,A,ACTOR,r.home.revision,{shell:'#aabbcc',accent:'#ddeeff'}),e=>e.code==='payment_pending');
  await f.restart();f.payments.control.creditFailure=null;
  const snapshot=await f.store.getSnapshot(TENANT,A,f.payments);
  assert.equal(snapshot.home.commerce.owned[0].status,'sold');assert.equal(snapshot.home.commerce.home.furniture.length,0);assert.equal(snapshot.robotActivity,null);
  assert.equal(snapshot.wallet.balance,99100);assert.equal(f.payments.control.credits,1);assert.equal((await f.store.readRecord(TENANT,A)).pending,null);
  const replay=await f.command({type:'sellItem',id},'resale-uncertain-credit',r.home.revision);assert.equal(replay.duplicate,true);assert.equal(f.payments.control.credits,1);
});

test('durable draft precedes credit and post-credit local write failure recovers exact proof',async t=>{
  let failWrite=false;const fsImpl={...fs,async rename(...args){if(failWrite)throw failure(503);return fs.rename(...args);}};
  const f=await fixture(t,{fsImpl}),bought=await f.buy(),id=bought.home.commerce.owned[0].id;
  failWrite=true;await assert.rejects(f.command({type:'sellItem',id},'resale-write-failure',1),e=>e.code==='storage_unavailable');
  assert.equal(f.payments.control.creditCalls,0);failWrite=false;
  const credit=f.payments.creditResale;f.payments.creditResale=async quote=>{const result=await credit.call(f.payments,quote);failWrite=true;return result;};
  await assert.rejects(f.command({type:'sellItem',id},'resale-write-failure',1),e=>e.code==='storage_unavailable');
  assert.equal(f.payments.control.credits,1);const pending=await f.store.readRecord(TENANT,A);assert.equal(pending.home.commerce.owned[0].status,'stored');assert.ok(pending.pending);
  failWrite=false;await f.restart();const recovered=await f.store.get(TENANT,A,f.payments);
  assert.equal(recovered.commerce.owned[0].status,'sold');assert.equal(f.payments.control.creditCalls,1);
});

test('concurrent different commands, stale pages, forged values and cross-student IDs cannot credit twice',async t=>{
  const f=await fixture(t),bought=await f.buy(),id=bought.home.commerce.owned[0].id;
  await f.store.initializeHome(TENANT,B,ACTOR);
  await assert.rejects(f.command({type:'sellItem',id},'resale-wrong-student',0,B),e=>e.status===422);
  for(const extra of [{creditAmount:999999},{amount:1},{paidUnitPrice:2},{sourceGameId:'other'}])
    await assert.rejects(f.command({type:'sellItem',id,...extra},'resale-forged-command',1),e=>e.status===422);
  await assert.rejects(f.command({type:'sellItem',id},'resale-stale-command',0),e=>e.code==='revision_conflict');
  const results=await Promise.allSettled(Array.from({length:6},(_,index)=>f.command({type:'sellItem',id},`resale-concurrent-${index}`,1)));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.ok(results.filter(result=>result.status==='rejected').every(result=>result.reason.code==='revision_conflict'));
  assert.equal(f.payments.control.credits,1);assert.equal(f.payments.control.creditCalls,1);assert.equal((await f.store.get(TENANT,B)).commerce.owned.length,0);
});

test('definite credit rejection preserves ownership and does not block a later valid command',async t=>{
  const f=await fixture(t),bought=await f.buy(),id=bought.home.commerce.owned[0].id;
  f.payments.control.creditFailure=failure(409,'game_points_limit');
  await assert.rejects(f.command({type:'sellItem',id},'resale-definite-failure',1),e=>e.code==='game_points_limit');
  let record=await f.store.readRecord(TENANT,A);assert.equal(record.pending,null);assert.equal(record.home.commerce.owned[0].status,'stored');assert.equal(record.home.revision,1);
  assert.equal(record.operations.at(-1).receipt.status,'failed');f.payments.control.creditFailure=null;
  await assert.rejects(f.command({type:'sellItem',id},'resale-definite-failure',1),e=>e.code==='game_points_limit');
  const sold=await f.command({type:'sellItem',id},'resale-new-valid-command',1);assert.equal(sold.home.commerce.owned[0].status,'sold');assert.equal(f.payments.control.credits,1);
});

test('a completed resale replay verifies the immutable credit receipt before refreshing wallet balance',async t=>{
  const f=await fixture(t),bought=await f.buy(),id=bought.home.commerce.owned[0].id;
  await f.command({type:'sellItem',id},'resale-completed-replay',1);
  f.payments.control.replyPatch={originalItemsHash:'b'.repeat(64)};
  await assert.rejects(f.command({type:'sellItem',id},'resale-completed-replay',1),e=>e.code==='resale_mismatch');
  assert.equal(f.payments.control.credits,1);assert.equal((await f.store.readRecord(TENANT,A)).home.commerce.owned[0].status,'sold');
  f.payments.control.replyPatch=null;f.payments.control.balance=12345;
  const replay=await f.command({type:'sellItem',id},'resale-completed-replay',1);assert.equal(replay.duplicate,true);assert.equal(replay.wallet.balance,12345);
  assert.equal(f.payments.control.creditCalls,1);
});

for(const patch of [{id:'wrong-resale'},{studentId:B},{sourceGameId:'other'},{ownedId:'other-item'},{skuId:'other-sku'},
  {creditAmount:1},{paidUnitPrice:2},{originalOrderId:'other-order'},{originalItemsHash:'b'.repeat(64)},{status:'pending'},{policy:'other-policy'}])
  test(`untrusted resale acknowledgement ${Object.keys(patch)[0]} cannot finalize sold stock`,async t=>{
    const f=await fixture(t),bought=await f.buy(),id=bought.home.commerce.owned[0].id;f.payments.control.replyPatch=patch;
    await assert.rejects(f.command({type:'sellItem',id},'resale-corrupt-proof',1),e=>e.code==='resale_mismatch');
    const pending=await f.store.readRecord(TENANT,A);assert.ok(pending.pending);assert.equal(pending.home.commerce.owned[0].status,'stored');assert.equal(pending.home.revision,1);
    f.payments.control.replyPatch=null;const home=await f.store.get(TENANT,A,f.payments);assert.equal(home.commerce.owned[0].status,'sold');assert.equal(f.payments.control.credits,1);
  });

test('placed outdoor stock sells, excluded construction/clothing stays owned, and purchase debit still works after resale',async t=>{
  const f=await fixture(t);let bought=await f.buy('outdoor-lounger'),id=bought.home.commerce.owned[0].id;
  let r=await f.command({type:'placeOutdoor',id,pose:{x:7,z:0}},'resale-place-outdoor',bought.home.revision);
  r=await f.command({type:'sellItem',id},'resale-sell-outdoor',r.home.revision);
  const price=accountCatalog().find(row=>row.skuId==='outdoor-lounger').price;assert.equal(r.receipt.creditAmount,Math.floor(price/2));assert.equal(r.home.commerce.owned[0].status,'sold');
  const clothing=accountCatalog().find(row=>row.productType==='clothing'),room=accountCatalog().find(row=>row.productType==='room');
  r=await f.command({type:'checkout',lines:[{skuId:clothing.skuId,quantity:1},{skuId:room.skuId,quantity:1}]},'resale-buy-exclusions',r.home.revision);
  for(const owned of r.home.commerce.owned.filter(row=>row.status!=='sold'))
    await assert.rejects(f.command({type:'sellItem',id:owned.id},`resale-excluded-${owned.id}`,r.home.revision),e=>e.status===422);
  assert.equal(f.payments.control.reserves,2);assert.equal(f.payments.control.commits,2);assert.equal(f.payments.control.credits,1);assert.equal(validateStudentHome(r.home,A),true);
});

test('an ambiguous signed GET failure never becomes a POST credit attempt',async t=>{
  const f=await fixture(t),bought=await f.buy(),id=bought.home.commerce.owned[0].id;
  f.payments.control.getFailure=failure(404,'home_resale_original_order_not_found');
  await assert.rejects(f.command({type:'sellItem',id},'resale-get-ambiguous',1),e=>e.code==='home_resale_original_order_not_found');
  assert.equal(f.payments.control.creditCalls,0);assert.ok((await f.store.readRecord(TENANT,A)).pending);
});

test('a malformed successful GET never authorizes a new credit attempt',async t=>{
  const f=await fixture(t),bought=await f.buy(),id=bought.home.commerce.owned[0].id;
  f.payments.getResale=async()=>null;
  await assert.rejects(f.command({type:'sellItem',id},'resale-get-null',1),e=>e.code==='resale_mismatch');
  assert.equal(f.payments.control.creditCalls,0);assert.equal(f.payments.control.credits,0);assert.ok((await f.store.readRecord(TENANT,A)).pending);
});

test('a historical one-point purchase rounds down to zero and sells without inventing a wallet credit',async t=>{
  const f=await fixture(t),bought=await f.buy(),id=bought.home.commerce.owned[0].id;
  const record=await f.store.readRecord(TENANT,A),order=record.home.commerce.orders[0];
  order.lines[0].unitPrice=1;order.total=1;record.home.commerce.wallet.initialBalance=1;
  record.operations[0].receipt.amount=1;record.operations[0].receipt.detail.order=clone(order);await f.store.writeRecord(record);
  const sold=await f.command({type:'sellItem',id},'resale-zero-credit',1);
  assert.equal(sold.receipt.creditAmount,0);assert.equal(sold.receipt.direction,'credit');assert.equal(sold.home.commerce.owned[0].status,'sold');
  assert.equal(sold.home.commerce.wallet.initialBalance,1);assert.equal(f.payments.control.creditCalls,0);assert.equal(validateStudentHome(sold.home,A),true);
});
