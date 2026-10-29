import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {StudentHomeStore} from '../server/student-homes/store.mjs';
import {createStudentHome,validateStudentHome,starterHouse} from '../server/student-homes/profile.mjs';
import {accountCatalog,createAccountCommerce,prepareCommerceCommand,validateAccountCommerce} from '../server/student-homes/commerce.mjs';
import {getStoreyRoomSlots} from '../public/js/home-commerce.js';
import {getHomeStairs,getWallMountTargets} from '../public/js/home-engine.js';
const STUDENT='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222',TENANT='fictional-project',ACTOR='fictional-teacher';
const err=(status,message='injected')=>Object.assign(new Error(message),{status,code:status===402?'insufficient_points':'injected'});
function payments(){
  const orders=new Map(),control={balance:50_000,reserves:0,commits:0,getFailure:null,reserveFailure:null,commitFailure:null};
  const wallet=()=>({currency:'platform-points',balance:control.balance});
  return {control,orders,
    async get(id){if(control.getFailure)throw control.getFailure;if(!orders.has(id))throw err(404);return {order:structuredClone(orders.get(id)),wallet:wallet()};},
    async reserve(input){control.reserves++;if(control.reserveFailure==='before')throw err(503);if(input.amount>control.balance)throw Object.assign(err(409,"DisplayText0579"),{code:'home_payment_insufficient'});let order=orders.get(input.orderId);if(!order){order={id:input.orderId,...input,status:'reserved'};delete order.orderId;orders.set(order.id,order);control.balance-=order.amount;}if(control.reserveFailure==='after')throw err(503);return {order:structuredClone(order),wallet:wallet()};},
    async commit(id){control.commits++;if(control.commitFailure==='before')throw err(503);const order=orders.get(id);order.status='committed';if(control.commitFailure==='after')throw err(503);return {order:structuredClone(order),wallet:wallet()};}
  };
}
async function fixture(t,{fsImpl}={}){
  const dir=await fs.mkdtemp(join(tmpdir(),'student-home-commerce-'));
  let store=await new StudentHomeStore({dataDir:dir,...fsImpl?{fsImpl}:{}}).initialize();
  const bank=payments();await store.initializeHome(TENANT,STUDENT,ACTOR);
  t.after(async()=>{await store.close();await fs.rm(dir,{recursive:true,force:true});});
  return {dir,bank,get store(){return store;},async restart(){await store.close();store=await new StudentHomeStore({dataDir:dir,...fsImpl?{fsImpl}:{}}).initialize();},
    command(command,commandId='command-0001',expectedRevision=0,actor=ACTOR){return store.executeCommand(TENANT,STUDENT,actor,{command,commandId,expectedRevision},bank);}};
}
const checkout={type:'checkout',lines:[{skuId:'bed-classic',quantity:1}]};

test('account starts empty; canonical catalog has server prices and only robot-compatible clothes',()=>{
 const state=createAccountCommerce();assert.equal(validateAccountCommerce(state),true);assert.equal(state.home.profile,'account');assert.deepEqual(state.owned,[]);assert.equal(state.wallet.balance,0);assert.equal(state.home.paint,0);
 const catalog=accountCatalog();assert.ok(catalog.length>200);assert.ok(catalog.every(p=>Number.isSafeInteger(p.price)&&p.price>0&&p.productType!=='storey'));
 assert.equal(catalog.filter(p=>p.productType==='clothing').length,18);assert.equal(catalog.some(p=>p.skuId==='wear-petal-dress'),false);
 assert.equal(prepareCommerceCommand(state,checkout,'command-0001').amount,1800);
});
test('checkout charges server price once, delivers owned stock and survives restart and teacher switch',async t=>{
 const f=await fixture(t);const result=await f.command(checkout);assert.equal(result.home.revision,1);assert.equal(result.receipt.amount,1800);assert.equal(result.home.commerce.owned.length,1);assert.equal(f.bank.control.balance,48200);
 assert.deepEqual(result.home.commerce.wallet,{balance:0,initialBalance:1800});assert.equal(result.home.commerce.owned[0].status,'stored');assert.equal(validateStudentHome(result.home,STUDENT),true);
 await f.restart();const again=await f.command(checkout,'command-0001',0,'another-teacher');assert.equal(again.duplicate,true);assert.equal(again.home.revision,1);assert.equal(f.bank.control.reserves,1);assert.equal(f.bank.control.commits,1);
 const second=await f.store.initializeHome(TENANT,OTHER,ACTOR);assert.equal(second.home.commerce.owned.length,0);
 await assert.rejects(f.command({...checkout,lines:[{skuId:'bed-classic',quantity:2}]},'command-0001'),e=>e.status===409&&e.code==='command_conflict');
});
test('rejects forged prices, client snapshots, free upgrades, invalid ownership and stale revision',async t=>{
 const f=await fixture(t);
 for(const command of [{...checkout,amount:1},{...checkout,lines:[{skuId:'bed-classic',quantity:1,unitPrice:1}]},{type:'replace',commerce:createAccountCommerce()},{type:'checkout',lines:[{skuId:'unknown',quantity:1}]},{type:'placeItem',id:'stolen',pose:{x:0,z:0},storey:0}])await assert.rejects(f.command(command),e=>e.status===422);
 assert.equal(f.bank.control.reserves,0);const result=await f.command(checkout);const id=result.home.commerce.owned[0].id;
 await assert.rejects(f.command({type:'placeItem',id,pose:{x:0,z:0},storey:0},'command-stale',0),e=>e.status===409);
 await assert.rejects(f.command({type:'updateItem',id,patch:{level:3},storey:0},'command-forged',1),e=>e.status===422);
});
test('same concurrent command delivers exactly once; other stale command cannot spend',async t=>{
 const f=await fixture(t),results=await Promise.all(Array.from({length:8},()=>f.command(checkout)));assert.equal(results.filter(r=>!r.duplicate).length,1);assert.equal(f.bank.control.reserves,1);
 await assert.rejects(f.command(checkout,'command-second',0),e=>e.status===409);assert.equal(f.bank.control.balance,48200);
});
test('insufficient platform points leaves no goods and records definite failure without blocking future commands',async t=>{
 const f=await fixture(t);f.bank.control.balance=100;
 await assert.rejects(f.command(checkout),e=>e.status===409&&e.code==='home_payment_insufficient');assert.equal((await f.store.get(TENANT,STUDENT)).commerce.owned.length,0);
 f.bank.control.balance=50000;await assert.rejects(f.command(checkout),e=>e.status===409&&e.code==='home_payment_insufficient');
 const next=await f.command(checkout,'command-new-funds');assert.equal(next.home.commerce.owned.length,1);assert.equal(f.bank.control.balance,48200);
});
for(const step of ['reserve-before','reserve-after','commit-before','commit-after'])test(`${step} lost response retains durable draft and recovers exactly once on GET`,async t=>{
 const f=await fixture(t),[method,when]=step.split('-');f.bank.control[`${method}Failure`]=when;
 await assert.rejects(f.command(checkout),e=>e.status===503);const pending=await f.store.readRecord(TENANT,STUDENT);assert.equal(pending.home.commerce.owned.length,0);assert.equal(pending.pending.amount,1800);
 await assert.rejects(f.store.updateColors(TENANT,STUDENT,ACTOR,0,{shell:'#aabbcc',accent:'#ddeeff'}),e=>e.code==='payment_pending');
 await f.restart();f.bank.control[`${method}Failure`]=null;const home=await f.store.get(TENANT,STUDENT,f.bank);assert.equal(home.commerce.owned.length,1);assert.equal(home.revision,1);assert.equal(f.bank.control.balance,48200);assert.equal((await f.store.readRecord(TENANT,STUDENT)).pending,null);
 const replay=await f.command(checkout);assert.equal(replay.duplicate,true);assert.equal(f.bank.control.balance,48200);
});
test('draft write failure happens before any reserve; post-commit local failure recovers delivery',async t=>{
 let failWrite=false;const fsImpl={...fs,async rename(...args){if(failWrite)throw err(503);return fs.rename(...args);}};
 const f=await fixture(t,{fsImpl});failWrite=true;await assert.rejects(f.command(checkout),e=>e.status===503);assert.equal(f.bank.control.reserves,0);
 failWrite=false;const original=f.bank.commit;f.bank.commit=async(...args)=>{const reply=await original(...args);failWrite=true;return reply;};
 await assert.rejects(f.command(checkout),e=>e.status===503);assert.equal(f.bank.control.balance,48200);assert.equal((await f.store.readRecord(TENANT,STUDENT)).home.commerce.owned.length,0);
 failWrite=false;const home=await f.store.get(TENANT,STUDENT,f.bank);assert.equal(home.commerce.owned.length,1);assert.equal(f.bank.control.commits,1);
});
test('place, rotate, recolor and store purchased furniture persist and reject collision/outside room',async t=>{
 const f=await fixture(t);let r=await f.command(checkout),id=r.home.commerce.owned[0].id;
 r=await f.command({type:'placeItem',id,pose:{x:0,z:0,rotation:0},storey:0},'command-place',r.home.revision);assert.equal(r.home.commerce.home.furniture.length,1);
 r=await f.command({type:'updateItem',id,patch:{rotation:90,color:'#123456'},storey:0},'command-edit',r.home.revision);assert.equal(r.home.commerce.home.furniture[0].rotation,90);assert.equal(r.home.commerce.home.furniture[0].color,'#123456');
 await assert.rejects(f.command({type:'updateItem',id,patch:{x:99},storey:0},'command-invalid',r.home.revision),e=>e.status===422);
 r=await f.command({type:'storeItem',id,storey:0},'command-store',r.home.revision);assert.equal(r.home.commerce.home.furniture.length,0);assert.equal(r.home.commerce.owned[0].status,'stored');assert.equal(f.bank.control.balance,48200);
});
test('purchased floor area adds real support, new floor always has paired stairs and cannot overhang',async t=>{
 const f=await fixture(t);
 let r=await f.command({type:'constructFloor',selection:{storey:0,rects:[{minX:2.8,minZ:-2.6,width:2.8,depth:5.2}]}},'command-expand');
 assert.equal(r.receipt.amount,4368);assert.ok(r.home.house.floors[0].slab.rects.some(rect=>rect.minX+rect.width>2.8));
 await assert.rejects(f.command({type:'constructFloor',selection:{storey:1,rects:[{minX:20,minZ:20,width:5.6,depth:5.2}]}},'command-overhang',r.home.revision),e=>e.status===422);
 r=await f.command({type:'constructFloor',selection:{storey:1,rects:[{minX:-2.8,minZ:-2.6,width:5.6,depth:5.2}]}},'command-upstairs',r.home.revision);
 assert.equal(r.home.commerce.upperFloors.length,1);assert.equal(r.home.commerce.upperFloors[0].rooms.length,0);assert.equal(getHomeStairs(r.home.commerce.home)[0].direction,'up');assert.equal(getHomeStairs(r.home.commerce.upperFloors[0])[0].direction,'down');assert.equal(r.receipt.amount,14736);
});
test('drawing over the starter and previous expansions bills only new area after reopening',async t=>{
 const f=await fixture(t),select=width=>({type:'constructFloor',selection:{storey:0,rects:[{minX:-2.8,minZ:-2.6,width,depth:5.2}]}});
 let r=await f.command(select(5.6),'command-existing-only');
 assert.equal(r.receipt.amount,0);assert.equal(r.home.revision,0);assert.equal(f.bank.control.reserves,0);assert.equal(f.bank.control.balance,50000);
 r=await f.command(select(8.4),'command-enclose-starter',r.home.revision);
 assert.equal(r.receipt.detail.quote.fromArea,29.12);assert.equal(r.receipt.detail.quote.toArea,43.68);assert.equal(r.receipt.detail.quote.addedArea,14.56);
 assert.equal(r.receipt.amount,4368);assert.equal(f.bank.control.balance,45632);
 await f.restart();
 const reopened=await f.store.get(TENANT,STUDENT),same=await f.command(select(8.4),'command-cover-paid-again',reopened.revision);
 assert.equal(same.receipt.amount,0);assert.equal(same.home.revision,reopened.revision);assert.equal(same.home.commerce.constructionLedger.length,1);assert.equal(f.bank.control.reserves,1);
 r=await f.command(select(9.8),'command-enclose-previous',same.home.revision);
 assert.equal(r.receipt.detail.quote.fromArea,43.68);assert.equal(r.receipt.detail.quote.addedArea,7.28);assert.equal(r.receipt.amount,2184);
 assert.equal(f.bank.control.balance,43448);assert.equal(f.bank.control.reserves,2);
 const replay=await f.command(select(9.8),'command-enclose-previous',same.home.revision);
 assert.equal(replay.duplicate,true);assert.equal(f.bank.control.balance,43448);assert.equal(f.bank.control.reserves,2);
 assert.equal(validateStudentHome(r.home,STUDENT),true);
});
test('overlapping partial rectangles and cells deduct their already built fractions exactly once',async t=>{
 const f=await fixture(t);
 let r=await f.command({type:'constructFloor',selection:{storey:0,rects:[
  {minX:1.4,minZ:-2.6,width:2.8,depth:2.6},
  {minX:2.8,minZ:-2.6,width:1.4,depth:2.6}
 ]}},'command-overlap-pieces');
 assert.equal(r.receipt.detail.quote.addedArea,3.64);assert.equal(r.receipt.amount,1092);
 // The grid cell at x=2.2..3.2 is 60% inside the starter and 40% outside.
 r=await f.command({type:'constructFloor',selection:{storey:0,cells:[{cx:5,cz:3},{cx:5,cz:3}]}},'command-partial-grid',r.home.revision);
 assert.equal(r.receipt.detail.quote.addedArea,.4);assert.equal(r.receipt.amount,120);
 assert.equal(f.bank.control.balance,48788);assert.equal(validateStudentHome(r.home,STUDENT),true);
});
test('upper floor enlargement excludes its existing area and does not rebill the stairs',async t=>{
 const f=await fixture(t),select=(storey,width)=>({type:'constructFloor',selection:{storey,rects:[{minX:-2.8,minZ:-2.6,width,depth:5.2}]}});
 let r=await f.command(select(0,8.4),'command-support-upper');
 r=await f.command(select(1,5.6),'command-create-upper',r.home.revision);
 assert.equal(r.receipt.amount,14736);assert.equal(r.receipt.detail.quote.stairCost,6000);
 await f.restart();const reopened=await f.store.get(TENANT,STUDENT);
 r=await f.command(select(1,8.4),'command-expand-upper',reopened.revision);
 assert.equal(r.receipt.detail.quote.fromArea,29.12);assert.equal(r.receipt.detail.quote.addedArea,14.56);assert.equal(r.receipt.detail.quote.stairCost,0);assert.equal(r.receipt.amount,4368);
 const balance=f.bank.control.balance,revision=r.home.revision;
 await assert.rejects(f.command(select(1,9.8),'command-upper-outside',revision),e=>e.status===422);
 assert.equal(f.bank.control.balance,balance);assert.equal((await f.store.get(TENANT,STUDENT)).revision,revision);
 r=await f.command(select(0,9.8),'command-grow-lower',revision);
 r=await f.command(select(1,9.8),'command-follow-lower',r.home.revision);
 assert.equal(r.receipt.amount,2184);assert.equal(r.receipt.detail.quote.addedArea,7.28);assert.equal(r.receipt.detail.quote.stairCost,0);
 assert.equal(getHomeStairs(r.home.commerce.home).length,1);assert.equal(getHomeStairs(r.home.commerce.upperFloors[0]).length,1);
 assert.equal(validateStudentHome(r.home,STUDENT),true);
});
test('room purchased from catalog consumes owned stock on supported extension; exterior derives same rooms',async t=>{
 const f=await fixture(t);const product=accountCatalog().find(p=>p.productType==='room'&&p.kind==='bathroom-compact');
 let r=await f.command({type:'constructFloor',selection:{storey:0,rects:[{minX:2.8,minZ:-2.6,width:2.8,depth:5.2}]}},'command-slab');
 r=await f.command({type:'checkout',lines:[{skuId:product.skuId,quantity:1}]},'command-room-buy',r.home.revision);
 const owned=r.home.commerce.owned[0],slot=getStoreyRoomSlots(r.home.commerce,owned.item.kind,0)[0];assert.ok(slot);
 r=await f.command({type:'placeRoom',id:owned.id,pose:{cx:slot.cx,cz:slot.cz,...slot.bounds?{bounds:slot.bounds}:{}},storey:0},'command-room-place',r.home.revision);
 assert.equal(r.home.commerce.home.rooms.length,2);assert.equal(r.home.house.floors[0].rooms.length,2);assert.equal(r.home.commerce.owned[0].status,'placed');assert.equal(validateStudentHome(r.home,STUDENT),true);
});
test('v1 signed record migrates only its existing robot and empty starter, preserving revision and timestamps',async t=>{
 const f=await fixture(t);const home=createStudentHome(STUDENT);delete home.commerce;home.schemaVersion=1;home.house=starterHouse();home.revision=7;home.avatar.colors={shell:'#abcdef',accent:'#123456'};
 const body={schemaVersion:1,tenantId:TENANT,studentId:STUDENT,actorUserId:ACTOR,home};const record={...body,checksum:createHash('sha256').update(JSON.stringify(body)).digest('hex')};await fs.writeFile(f.store.fileFor(TENANT,STUDENT),JSON.stringify(record));
 const upgraded=await f.store.get(TENANT,STUDENT);assert.equal(upgraded.schemaVersion,2);assert.equal(upgraded.revision,7);assert.equal(upgraded.createdAt,home.createdAt);assert.deepEqual(upgraded.avatar.colors,home.avatar.colors);assert.deepEqual(upgraded.commerce.owned,[]);assert.equal(upgraded.commerce.wallet.balance,0);
 const raw=JSON.parse(await fs.readFile(f.store.fileFor(TENANT,STUDENT),'utf8'));assert.equal(raw.schemaVersion,1);
});

test('outdoor purchase uses paid ownership, rejects house overlap, persists move and storage',async t=>{
 const f=await fixture(t);let r=await f.command({type:'checkout',lines:[{skuId:'outdoor-lounger',quantity:1}]}),id=r.home.commerce.owned[0].id;
 await assert.rejects(f.command({type:'placeOutdoor',id,pose:{x:0,z:0,rotation:0}},'command-outdoor-invalid',r.home.revision),e=>e.status===422);
 r=await f.command({type:'placeOutdoor',id,pose:{x:7,z:0,rotation:0}},'command-outdoor-place',r.home.revision);assert.equal(r.home.commerce.owned[0].status,'placed');
 r=await f.command({type:'updateOutdoor',id,patch:{color:'#aabbcc',x:8}},'command-outdoor-edit',r.home.revision);assert.equal(r.home.commerce.owned[0].item.x,8);assert.equal(r.home.commerce.owned[0].item.color,'#aabbcc');
 r=await f.command({type:'storeOutdoor',id},'command-outdoor-store',r.home.revision);assert.equal(r.home.commerce.owned[0].status,'stored');assert.equal(f.bank.control.reserves,1);
});
test('wall purchase mounts on a real account wall and keeps nested wall coordinates',async t=>{
 const f=await fixture(t);let r=await f.command({type:'checkout',lines:[{skuId:'wallClock-classic',quantity:1}]}),id=r.home.commerce.owned[0].id;
 const wall=getWallMountTargets(r.home.commerce.home)[0];assert.ok(wall);
 await assert.rejects(f.command({type:'placeItem',id,pose:{mount:{type:'wall',wallId:wall.wallId,u:.5,v:.3}},storey:0},'command-wall-window',r.home.revision),e=>e.status===422);
 r=await f.command({type:'placeItem',id,pose:{mount:{type:'wall',wallId:wall.wallId,u:.2,v:.3}},storey:0},'command-wall-place',r.home.revision);
 assert.equal(r.home.commerce.owned[0].item.mount.wallId,wall.wallId);assert.equal(r.home.commerce.home.furniture.length,1);
 await assert.rejects(f.command({type:'updateItem',id,patch:{mount:{type:'wall',wallId:'fake-wall',u:.5,v:.3}},storey:0},'command-wall-invalid',r.home.revision),e=>e.status===422);
});
test('wrong platform order metadata never delivers stock or consumes the durable recovery draft',async t=>{
 const f=await fixture(t);const reserve=f.bank.reserve;f.bank.reserve=async input=>{const r=await reserve(input);r.order.amount=1;return r;};
 await assert.rejects(f.command(checkout),e=>e.code==='payment_mismatch');assert.equal((await f.store.readRecord(TENANT,STUDENT)).home.commerce.owned.length,0);assert.ok((await f.store.readRecord(TENANT,STUDENT)).pending);
 const home=await f.store.get(TENANT,STUDENT,f.bank);assert.equal(home.commerce.owned.length,1);assert.equal(f.bank.control.balance,48200);
});
test('room enlargement charges only real area difference; client cannot obtain a refund or free resize',async t=>{
 const f=await fixture(t);const product=accountCatalog().find(p=>p.productType==='room'&&p.kind==='bathroom-compact');
 let r=await f.command({type:'constructFloor',selection:{storey:0,rects:[{minX:2.8,minZ:-2.6,width:2.8,depth:5.2}]}},'command-resize-slab');
 r=await f.command({type:'checkout',lines:[{skuId:product.skuId,quantity:1}]},'command-resize-buy',r.home.revision);
 const id=r.home.commerce.owned[0].id,slot=getStoreyRoomSlots(r.home.commerce,product.kind,0).find(slot=>slot.bounds?.minX===2.8&&slot.bounds?.minZ===-2.6);assert.ok(slot);
 r=await f.command({type:'placeRoom',id,pose:{cx:slot.cx,cz:slot.cz,bounds:slot.bounds},storey:0},'command-resize-place',r.home.revision);
 const before=f.bank.control.balance;
 r=await f.command({type:'resizeRoom',id,size:{width:2.8,depth:4},storey:0},'command-room-enlarge',r.home.revision);
 const charge=Math.round(product.price*(2.8*4)/(2.8*2.6))-product.price;assert.equal(r.receipt.amount,charge);assert.equal(f.bank.control.balance,before-charge);assert.equal(r.home.commerce.owned[0].item.bounds.depth,4);
 await assert.rejects(f.command({type:'resizeRoom',id,size:{width:2.8,depth:2.6},storey:0},'command-room-shrink',r.home.revision),e=>e.status===422&&/DisplayText4638/.test(e.message));
 assert.equal(f.bank.control.balance,before-charge);
});
