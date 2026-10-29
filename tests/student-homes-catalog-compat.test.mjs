import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StudentHomeStore} from '../server/student-homes/store.mjs';
import {validateStudentHome} from '../server/student-homes/profile.mjs';
import {CATALOG_VERSION,LEGACY_CATALOG_VERSION,accountCatalog,prepareCommerceCommand,commandHash,paymentOrderId} from '../server/student-homes/commerce.mjs';

const TENANT='isolated-catalog-test',STUDENT='6178babc-1111-4111-8111-111111111111',ACTOR='isolated-teacher';
const LEGACY_PRICE=1600,checkout={type:'checkout',lines:[{skuId:'bedTimber-classic',quantity:1}]};
const failure=status=>Object.assign(new Error('isolated payment failure'),{status});
const copy=value=>structuredClone(value);

async function fixture(t){
  const dir=await fs.mkdtemp(join(tmpdir(),'student-home-catalog-compat-'));
  let store=await new StudentHomeStore({dataDir:dir}).initialize();
  await store.initializeHome(TENANT,STUDENT,ACTOR);
  const orders=new Map(),control={balance:50000,reserves:0,commits:0,failGet:false};
  const bank={
    async get(id){if(control.failGet)throw failure(503);if(!orders.has(id))throw failure(404);return {order:copy(orders.get(id)),wallet:{balance:control.balance}};},
    async reserve(input){
      control.reserves++;assert.equal(orders.has(input.orderId),false,'an existing reservation must be recovered rather than recreated');
      const {orderId,...quote}=input,order={id:orderId,...quote,status:'reserved'};
      orders.set(orderId,order);control.balance-=input.amount;
      return {order:copy(order),wallet:{balance:control.balance}};
    },
    async commit(id){control.commits++;const order=orders.get(id);assert.equal(order.status,'reserved');order.status='committed';return {order:copy(order),wallet:{balance:control.balance}};}
  };
  t.after(async()=>{await store.close();await fs.rm(dir,{recursive:true,force:true});});
  return {get store(){return store;},bank,orders,control,
    async restart(){await store.close();store=await new StudentHomeStore({dataDir:dir}).initialize();},
    command(commandId,expectedRevision=0){return store.executeCommand(TENANT,STUDENT,ACTOR,{command:checkout,commandId,expectedRevision},bank);}
  };
}

// Only this temporary fixture receives historical prices. Its signed stock and
// receipts reproduce a v1 process interrupted before/after platform payment.
async function legacyDraft(f,commandId='legacy-purchase-001'){
  const record=await f.store.readRecord(TENANT,STUDENT);
  const prepared=prepareCommerceCommand(record.home.commerce,checkout,commandId);
  prepared.commerce.orders[0].lines[0].unitPrice=LEGACY_PRICE;
  prepared.commerce.orders[0].total=LEGACY_PRICE;
  prepared.commerce.wallet.initialBalance=LEGACY_PRICE;
  prepared.detail.order=copy(prepared.commerce.orders[0]);
  const draft={...copy(record.home),commerce:prepared.commerce,revision:record.home.revision+1};
  assert.equal(validateStudentHome(draft,STUDENT),true);
  const pending={commandId,hash:commandHash(checkout),command:copy(checkout),draft,amount:LEGACY_PRICE,
    orderId:paymentOrderId(TENANT,STUDENT,commandId),detail:prepared.detail,actorUserId:ACTOR,phase:'prepared',createdAt:record.home.createdAt};
  return {record,pending};
}

for(const status of ['not-reserved','reserved','committed'])test(`v1 ${status} draft resumes at its original amount and version after a catalog change`,async t=>{
  const f=await fixture(t),{record,pending}=await legacyDraft(f);
  assert.equal(Object.hasOwn(pending,'catalogVersion'),false);
  if(status!=='not-reserved'){
    f.orders.set(pending.orderId,{id:pending.orderId,studentId:STUDENT,amount:LEGACY_PRICE,catalogVersion:LEGACY_CATALOG_VERSION,itemsHash:pending.hash,status});
    f.control.balance-=LEGACY_PRICE;pending.phase='commit-intent';
  }
  record.pending=pending;await f.store.writeRecord(record);await f.restart();
  const home=await f.store.get(TENANT,STUDENT,f.bank),after=await f.store.readRecord(TENANT,STUDENT);
  assert.equal(home.commerce.owned.length,1);assert.equal(home.commerce.orders[0].total,LEGACY_PRICE);
  assert.equal(home.commerce.orders[0].lines[0].unitPrice,LEGACY_PRICE);
  assert.equal(after.pending,null);assert.equal(after.operations[0].receipt.amount,LEGACY_PRICE);
  assert.equal(f.orders.get(pending.orderId).catalogVersion,LEGACY_CATALOG_VERSION);
  assert.equal(f.control.balance,50000-LEGACY_PRICE);
  assert.equal(f.control.reserves,status==='not-reserved'?1:0);
  assert.equal(f.control.commits,status==='committed'?0:1);
  const replay=await f.command(pending.commandId);
  assert.equal(replay.duplicate,true);assert.equal(replay.receipt.amount,LEGACY_PRICE);
  assert.equal(f.control.balance,50000-LEGACY_PRICE);
});

test('new pending purchase stores the catalog version before payment and reuses it on restart',async t=>{
  const f=await fixture(t),price=accountCatalog().find(row=>row.skuId==='bedTimber-classic').price;
  assert.notEqual(CATALOG_VERSION,LEGACY_CATALOG_VERSION);
  f.control.failGet=true;
  await assert.rejects(f.command('new-purchase-001'),error=>error.status===503);
  const before=await f.store.readRecord(TENANT,STUDENT);
  assert.equal(before.pending.catalogVersion,CATALOG_VERSION);assert.equal(before.pending.amount,price);
  assert.equal(before.home.commerce.owned.length,0);assert.equal(f.control.reserves,0);
  await f.restart();f.control.failGet=false;
  const home=await f.store.get(TENANT,STUDENT,f.bank);
  assert.equal(home.commerce.owned.length,1);assert.equal(f.control.balance,50000-price);
  assert.equal([...f.orders.values()][0].catalogVersion,CATALOG_VERSION);
  const replay=await f.command('new-purchase-001');assert.equal(replay.duplicate,true);
  assert.equal(f.control.reserves,1);assert.equal(f.control.commits,1);
});

test('completed v1 order and inventory retain old paid prices while new purchases use the new catalog',async t=>{
  const f=await fixture(t),{record,pending}=await legacyDraft(f);
  const receipt={commandId:pending.commandId,type:'checkout',amount:LEGACY_PRICE,orderId:pending.orderId,status:'delivered',detail:pending.detail};
  record.home=pending.draft;record.operations=[{commandId:pending.commandId,hash:pending.hash,receipt}];
  await f.store.writeRecord(record);f.control.balance-=LEGACY_PRICE;await f.restart();
  const original=await f.store.get(TENANT,STUDENT,f.bank),replay=await f.command(pending.commandId);
  assert.deepEqual(replay.home,original);assert.deepEqual(replay.receipt,receipt);assert.equal(replay.duplicate,true);
  assert.equal(f.control.reserves,0);assert.equal(f.control.commits,0);
  const price=accountCatalog().find(row=>row.skuId==='bedTimber-classic').price;
  const next=await f.command('new-purchase-after-v1',original.revision);
  assert.equal(next.receipt.amount,price);assert.equal(next.home.commerce.owned.length,2);
  assert.deepEqual(next.home.commerce.orders[0],original.commerce.orders[0]);
  assert.deepEqual(next.home.commerce.owned[0],original.commerce.owned[0]);
  assert.equal(next.home.commerce.orders[1].lines[0].unitPrice,price);
  assert.equal(f.control.balance,50000-LEGACY_PRICE-price);assert.equal(f.control.reserves,1);
});

test('pending catalog identity mismatch keeps stock and locked payment draft intact',async t=>{
  const f=await fixture(t),{record,pending}=await legacyDraft(f);
  record.pending=pending;await f.store.writeRecord(record);
  f.orders.set(pending.orderId,{id:pending.orderId,studentId:STUDENT,amount:LEGACY_PRICE,catalogVersion:CATALOG_VERSION,itemsHash:pending.hash,status:'reserved'});
  await assert.rejects(f.store.get(TENANT,STUDENT,f.bank),error=>error.code==='payment_mismatch');
  const after=await f.store.readRecord(TENANT,STUDENT);
  assert.deepEqual(after.pending,pending);assert.equal(after.home.commerce.owned.length,0);
  assert.equal(f.control.reserves,0);assert.equal(f.control.commits,0);
  for(const catalogVersion of [null,'','unrecognized-catalog']){
    assert.equal(f.store.validTransactions({...record,pending:{...pending,catalogVersion}}),false);
  }
});
