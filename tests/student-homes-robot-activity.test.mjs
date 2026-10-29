import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {StudentHomeStore} from '../server/student-homes/store.mjs';
import {createStudentHomesService,API_PREFIX} from '../server/student-homes/app.mjs';
import {prepareCommerceCommand,houseFromCommerce} from '../server/student-homes/commerce.mjs';
import {validateStudentHome} from '../server/student-homes/profile.mjs';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const TENANT='isolated-activity-project',ACTOR='isolated-activity-teacher',PUBLIC='http://127.0.0.1:18805';
const copy=value=>structuredClone(value);
const sleep=(itemId,storey=0)=>({type:'setRobotActivity',activity:{kind:'sleep',itemId,storey}});
const wake={type:'setRobotActivity',activity:null};
function paymentFixture(){
  const orders=new Map(),control={balance:150000,reserves:0,commits:0,loseCommitReply:false};
  const wallet=()=>({currency:'platform-points',balance:control.balance});
  return {control,orders,async get(id){if(!orders.has(id))throw Object.assign(new Error('missing'),{status:404});return {order:copy(orders.get(id)),wallet:wallet()};},
    async reserve(input){control.reserves++;let order=orders.get(input.orderId);if(!order){order={...input,id:input.orderId,status:'reserved'};delete order.orderId;orders.set(order.id,order);control.balance-=order.amount;}return {order:copy(order),wallet:wallet()};},
    async commit(id){control.commits++;const order=orders.get(id);order.status='committed';if(control.loseCommitReply)throw Object.assign(new Error('isolated lost reply'),{status:503});return {order:copy(order),wallet:wallet()};}};
}
async function fixture(t,{fsImpl}={}){
  const directory=await fs.mkdtemp(join(tmpdir(),'student-home-activity-'));
  let store=await new StudentHomeStore({dataDir:directory,...fsImpl?{fsImpl}:{}}).initialize(),sequence=0;
  const bank=paymentFixture();await store.initializeHome(TENANT,A,ACTOR);await store.initializeHome(TENANT,B,ACTOR);
  t.after(async()=>{await store.close();await fs.rm(directory,{recursive:true,force:true});});
  const command=async(command,{id=`activity-command-${++sequence}`,student=A,revision,actor=ACTOR}={})=>{
    const expectedRevision=revision??(await store.get(TENANT,student,bank)).revision;
    return store.executeCommand(TENANT,student,actor,{expectedRevision,commandId:id,command},bank);
  };
  return {directory,bank,command,get store(){return store;},
    async restart(){await store.close();store=await new StudentHomeStore({dataDir:directory,...fsImpl?{fsImpl}:{}}).initialize();},
    async bed({student=A}={}){let result=await command({type:'checkout',lines:[{skuId:'bed-classic',quantity:1}]},{student});const id=result.home.commerce.owned.at(-1).id;
      result=await command({type:'placeItem',id,pose:{x:0,z:0,rotation:0},storey:0},{student});return {id,home:result.home};}};
}

test('old homes without activity remain readable and GET snapshots do not rewrite their records',async t=>{
  const f=await fixture(t),file=f.store.fileFor(TENANT,A),before=await fs.readFile(file,'utf8');
  const result=await f.store.getSnapshot(TENANT,A);assert.equal(result.robotActivity,null);assert.equal(validateStudentHome(result.home,A),true);
  assert.equal(await fs.readFile(file,'utf8'),before);assert.equal(Object.hasOwn(result.home.avatar,'activity'),false);
  assert.deepEqual(await f.store.getSnapshot(TENANT,'33333333-3333-4333-8333-333333333333'),{home:null,robotActivity:null});
});

test('sleep stores only a semantic owned-bed reference and survives A/B switching, teacher change and restart',async t=>{
  const f=await fixture(t),{id}=await f.bed(),before=await f.store.get(TENANT,A),balance=f.bank.control.balance;
  const saved=await f.command(sleep(id),{id:'activity-sleep-persist'});
  assert.deepEqual(saved.robotActivity,{kind:'sleep',itemId:id,storey:0});assert.equal(saved.receipt.amount,0);assert.equal(saved.receipt.orderId,null);
  assert.deepEqual(saved.home.commerce,before.commerce);assert.deepEqual(saved.home.avatar,before.avatar);assert.deepEqual(saved.home.house,before.house);
  assert.equal(saved.home.revision,before.revision+1);assert.equal(f.bank.control.balance,balance);assert.equal(f.bank.control.reserves,1);
  const raw=await f.store.readRecord(TENANT,A);assert.deepEqual(raw.operations.at(-1).receipt.detail.robotActivity,saved.robotActivity);
  assert.equal(validateStudentHome(raw.home,A),true);assert.equal(f.store.validTransactions(raw),true);
  assert.equal((await f.store.getSnapshot(TENANT,B)).robotActivity,null);assert.equal((await f.store.getSnapshot('isolated-other-tenant',A)).home,null);
  await f.restart();assert.deepEqual((await f.store.getSnapshot(TENANT,A)).robotActivity,saved.robotActivity);
  const reinit=await f.store.initializeHome(TENANT,A,'isolated-other-teacher');assert.equal(reinit.created,false);assert.deepEqual(reinit.robotActivity,saved.robotActivity);
  const recolored=await f.store.updateColorsSnapshot(TENANT,A,'isolated-other-teacher',saved.home.revision,{shell:'#aabbcc',accent:'#667788'});
  assert.deepEqual(recolored.robotActivity,saved.robotActivity);assert.equal(recolored.home.avatar.colors.shell,'#aabbcc');
});

test('same command ID is idempotent, conflicts reject, and replay returns current activity after wake-up',async t=>{
  const f=await fixture(t),{id,home}=await f.bed(),commandId='activity-idempotent-sleep';
  const rows=await Promise.all(Array.from({length:6},()=>f.command(sleep(id),{id:commandId,revision:home.revision})));
  assert.equal(rows.filter(row=>!row.duplicate).length,1);
  assert.equal(rows.at(-1).home.revision,home.revision+1);
  await assert.rejects(f.command(wake,{id:commandId,revision:home.revision}),e=>e.status===409&&e.code==='command_conflict');
  const awake=await f.command(wake);assert.equal(awake.robotActivity,null);
  const replay=await f.command(sleep(id),{id:commandId,revision:home.revision});assert.equal(replay.duplicate,true);assert.equal(replay.robotActivity,null);
  assert.equal(replay.home.revision,awake.home.revision);await f.restart();assert.equal((await f.store.getSnapshot(TENANT,A)).robotActivity,null);
});

test('different concurrent activity commands use the existing home revision lock',async t=>{
  const f=await fixture(t),{id,home}=await f.bed();
  const results=await Promise.allSettled([f.command(sleep(id),{id:'activity-first-race',revision:home.revision}),f.command(sleep(id),{id:'activity-second-race',revision:home.revision})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='revision_conflict').length,1);
});

test('invalid, forged, unowned, unplaced and wrong-floor sleep targets cannot be stored',async t=>{
  const f=await fixture(t),{id}=await f.bed();
  const otherPurchase=await f.command({type:'checkout',lines:[{skuId:'bed-classic',quantity:2}]},{student:B}),other={id:otherPurchase.home.commerce.owned.at(-1).id};
  await f.command({type:'placeItem',id:other.id,pose:{x:0,z:0,rotation:0},storey:0},{student:B});
  let result=await f.command({type:'checkout',lines:[{skuId:'bed-classic',quantity:1},{skuId:'sofa-classic',quantity:1}]});
  const storedBed=result.home.commerce.owned.find(row=>row.status==='stored'&&row.item.kind==='bed');
  const storedSofa=result.home.commerce.owned.find(row=>row.item.kind==='sofa');
  for(const command of [sleep('unowned-bed'),sleep(other.id),sleep(storedBed.id),sleep(storedSofa.id),sleep(id,1),sleep(id,-1),sleep(id,'0'),
    {type:'setRobotActivity',activity:{kind:'sleep',itemId:id,storey:0,x:99}},
    {type:'setRobotActivity',activity:{kind:'lie',itemId:id,storey:0}},
    {type:'setRobotActivity',activity:{kind:'sleep',itemId:'',storey:0}},
    {type:'setRobotActivity',activity:null,balance:999999}]){
    await assert.rejects(f.command(command),e=>e.status===422,JSON.stringify(command));
  }
  assert.equal((await f.store.getSnapshot(TENANT,A)).robotActivity,null);
});

test('moving and rotating a bed preserve its sleep reference; storing it clears sleep permanently',async t=>{
  const f=await fixture(t),{id}=await f.bed();await f.command(sleep(id));
  let result=await f.command({type:'updateItem',id,patch:{x:.5,z:.2,rotation:90},storey:0});
  assert.deepEqual(result.robotActivity,{kind:'sleep',itemId:id,storey:0});assert.equal(result.home.commerce.home.furniture[0].rotation,90);
  result=await f.command({type:'storeItem',id,storey:0});assert.equal(result.robotActivity,null);assert.equal(result.receipt.detail.robotActivity,null);
  result=await f.command({type:'placeItem',id,pose:{x:0,z:0,rotation:0},storey:0});assert.equal(result.robotActivity,null);
  await f.restart();assert.equal((await f.store.getSnapshot(TENANT,A)).robotActivity,null);
});

test('an old-version edit that invalidated a target is readable and cannot revive sleep on replacement',async t=>{
  const f=await fixture(t),{id}=await f.bed();await f.command(sleep(id));
  const record=await f.store.readRecord(TENANT,A),prepared=prepareCommerceCommand(record.home.commerce,{type:'storeItem',id,storey:0},'legacy-store-bed');
  record.home={...record.home,commerce:prepared.commerce,house:houseFromCommerce(prepared.commerce),revision:record.home.revision+1};
  await f.store.writeRecord(record);assert.equal((await f.store.getSnapshot(TENANT,A)).robotActivity,null);
  const result=await f.command({type:'placeItem',id,pose:{x:0,z:0,rotation:0},storey:0});assert.equal(result.robotActivity,null);assert.equal(result.receipt.detail.robotActivity,null);
});

test('an activity write failure leaves the whole original record unchanged and retry is safe',async t=>{
  let fail=false;const fsImpl={...fs,async rename(...args){if(fail)throw new Error('isolated failed rename');return fs.rename(...args);}};
  const f=await fixture(t,{fsImpl}),{id,home}=await f.bed(),filename=f.store.fileFor(TENANT,A),before=await fs.readFile(filename,'utf8');
  fail=true;await assert.rejects(f.command(sleep(id),{id:'activity-atomic-retry',revision:home.revision}),e=>e.status===503);
  assert.equal(await fs.readFile(filename,'utf8'),before);assert.equal((await f.store.getSnapshot(TENANT,A)).robotActivity,null);
  fail=false;const result=await f.command(sleep(id),{id:'activity-atomic-retry',revision:home.revision});assert.equal(result.robotActivity.itemId,id);
  assert.equal((await f.command(sleep(id),{id:'activity-atomic-retry',revision:home.revision})).duplicate,true);
});

test('a recovered paid order preserves the latest sleep activity without charging for it',async t=>{
  const f=await fixture(t),{id}=await f.bed();await f.command(sleep(id));
  const before=f.bank.control.balance;f.bank.control.loseCommitReply=true;
  await assert.rejects(f.command({type:'checkout',lines:[{skuId:'bed-classic',quantity:1}]},{id:'activity-paid-recovery'}),e=>e.status===503);
  await f.restart();f.bank.control.loseCommitReply=false;
  const snapshot=await f.store.getSnapshot(TENANT,A,f.bank);assert.deepEqual(snapshot.robotActivity,{kind:'sleep',itemId:id,storey:0});
  assert.equal(snapshot.home.commerce.owned.length,2);assert.equal(f.bank.control.balance,before-1800);assert.equal(f.bank.control.reserves,2);
});

test('HTTP snapshots expose activity beside the unchanged profile for GET, commands, init and colors',async t=>{
  const f=await fixture(t),{id}=await f.bed();
  const service=await createStudentHomesService({store:f.store,dataDir:f.directory,publicOrigin:PUBLIC,platformClient:{
    async session(cookie){assert.ok(cookie);return {authenticated:true,tenantId:TENANT,actor:{id:ACTOR,role:'owner'}};},
    async students(){return [{id:A,displayName:"DisplayText4653 A"},{id:B,displayName:"DisplayText4653 B"}];},paymentAdapter(){return f.bank;}}});
  const origin=await new Promise(done=>service.server.listen(0,'127.0.0.1',()=>done(`http://127.0.0.1:${service.server.address().port}`)));
  t.after(()=>service.close());
  async function call(suffix,body,method='GET'){const response=await fetch(origin+API_PREFIX+`/students/${A}/`+suffix,{method,headers:{cookie:'isolated=1',origin:PUBLIC,'content-type':'application/json'},...body?{body:JSON.stringify(body)}:{}});return {status:response.status,body:await response.json()};}
  const initial=await call('home');assert.equal(initial.body.robotActivity,null);
  const saved=await call('home/commands',{expectedUserId:ACTOR,expectedRevision:initial.body.home.revision,commandId:'activity-http-sleep',command:sleep(id)},'POST');
  assert.equal(saved.status,200);assert.deepEqual(saved.body.robotActivity,{kind:'sleep',itemId:id,storey:0});assert.equal(Object.hasOwn(saved.body.home.avatar,'activity'),false);
  assert.deepEqual((await call('home')).body.robotActivity,saved.body.robotActivity);
  assert.deepEqual((await call('home/init',{expectedUserId:ACTOR},'POST')).body.robotActivity,saved.body.robotActivity);
  const colored=await call('home/avatar',{expectedUserId:ACTOR,expectedRevision:saved.body.home.revision,colors:{shell:'#445566',accent:'#778899'}},'PATCH');
  assert.equal(colored.status,200);assert.deepEqual(colored.body.robotActivity,saved.body.robotActivity);
});
