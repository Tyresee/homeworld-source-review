import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {StudentHomeStore} from '../server/student-homes/store.mjs';
import {accountCatalog,createAccountCommerce,prepareCommerceCommand,validateAccountCommerce} from '../server/student-homes/commerce.mjs';
import {createStudentHome,starterHouse,validateStudentHome} from '../server/student-homes/profile.mjs';
import {ROBOT_CLOTHING_PRODUCTS,isRobotClothingSku} from '../public/js/robot-wardrobe-catalog.js';
import {setCartQuantity,checkoutCart,validateCommerceState} from '../public/js/home-commerce.js';

const STUDENT='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
const TENANT='fictional-robot-shop',ACTOR='fictional-wardrobe-teacher';
const copy=value=>structuredClone(value);
const outfit='wear-ocean-overalls',hat='wear-baseball-cap',shoes='wear-canvas-sneakers';
const buy=(...skuIds)=>({type:'checkout',lines:skuIds.map(skuId=>({skuId,quantity:1}))});
const equip=(skuId,slot)=>({type:'equipClothing',skuId,slot});
const price=skuId=>accountCatalog().find(product=>product.skuId===skuId).price;
const unavailable=()=>Object.assign(new Error('Isolated payment response lost'),{status:503,code:'fixture_unavailable'});
function paymentFixture(){
  const orders=new Map(),balances=new Map([[STUDENT,50_000],[OTHER,50_000]]);
  const control={reserves:0,commits:0,loseNextReserveResponse:false};
  const wallet=studentId=>({currency:'platform-points',balance:balances.get(studentId)});
  return {orders,balances,control,
    async get(id){const order=orders.get(id);if(!order)throw Object.assign(new Error('Not found'),{status:404});return {order:copy(order),wallet:wallet(order.studentId)};},
    async reserve(input){
      control.reserves++;let order=orders.get(input.orderId);
      if(!order){
        if(input.amount>balances.get(input.studentId))throw Object.assign(new Error('Insufficient isolated points'),{status:409,code:'home_payment_insufficient'});
        order={...input,id:input.orderId,status:'reserved'};delete order.orderId;orders.set(order.id,order);
        balances.set(input.studentId,balances.get(input.studentId)-input.amount);
      }
      if(control.loseNextReserveResponse){control.loseNextReserveResponse=false;throw unavailable();}
      return {order:copy(order),wallet:wallet(order.studentId)};
    },
    async commit(id){control.commits++;const order=orders.get(id);order.status='committed';return {order:copy(order),wallet:wallet(order.studentId)};}
  };
}
async function fixture(t){
  const dir=await fs.mkdtemp(join(tmpdir(),'student-home-robot-commerce-'));
  let store=await new StudentHomeStore({dataDir:dir}).initialize();const bank=paymentFixture();
  await store.initializeHome(TENANT,STUDENT,ACTOR);await store.initializeHome(TENANT,OTHER,ACTOR);
  t.after(async()=>{await store.close();await fs.rm(dir,{recursive:true,force:true});});
  return {dir,bank,get store(){return store;},
    command(command,commandId,expectedRevision=0,studentId=STUDENT){return store.executeCommand(TENANT,studentId,ACTOR,{command,commandId,expectedRevision},bank);},
    async restart(){await store.close();store=await new StudentHomeStore({dataDir:dir}).initialize();}
  };
}

test('formal robot catalog exposes exactly 18 modeled garments in three slots at canonical prices',()=>{
  const clothes=accountCatalog().filter(product=>product.productType==='clothing');
  assert.equal(clothes.length,18);assert.deepEqual(new Set(clothes.map(product=>product.skuId)),new Set(ROBOT_CLOTHING_PRODUCTS.map(product=>product.skuId)));
  assert.deepEqual(Object.fromEntries(['outfit','headwear','footwear'].map(slot=>[slot,clothes.filter(product=>product.slot===slot).length])),{outfit:8,headwear:6,footwear:4});
  assert.ok(clothes.every(product=>isRobotClothingSku(product.skuId)&&Number.isSafeInteger(product.price)&&product.price>0));
  assert.ok(clothes.every(product=>product.collection==='robot-wardrobe-v1'&&product.tags.includes("DisplayText3022")&&!product.tags.includes("DisplayText0216")));
  assert.equal(accountCatalog().some(product=>product.productType==='storey'),false);
  assert.equal(accountCatalog().some(product=>product.skuId==='wear-moon-explorer'),false);
  const state=createAccountCommerce(),prepared=prepareCommerceCommand(state,buy(outfit,hat,shoes),'wardrobe-catalog-price');
  assert.equal(prepared.amount,price(outfit)+price(hat)+price(shoes));assert.equal(state.owned.length,0);
});

test('purchased outfit, hat and shoes equip for free and persist without changing robot identity or shell color',async t=>{
  const f=await fixture(t);const initial=await f.store.get(TENANT,STUDENT),identity=copy(initial.avatar);
  let result=await f.command(buy(outfit,hat,shoes),'wardrobe-buy-all');
  const cost=price(outfit)+price(hat)+price(shoes),balance=50_000-cost;
  assert.equal(result.receipt.amount,cost);assert.equal(f.bank.balances.get(STUDENT),balance);
  assert.equal(result.home.commerce.owned.length,3);
  for(const [skuId,slot] of [[outfit,'outfit'],[hat,'headwear'],[shoes,'footwear']]){
    result=await f.command(equip(skuId,slot),`wardrobe-equip-${slot}`,result.home.revision);
    assert.equal(result.receipt.amount,0);assert.equal(result.receipt.orderId,null);assert.equal(result.home.commerce.avatar.equipped[slot],skuId);
    assert.deepEqual(result.home.avatar,identity);assert.equal(validateStudentHome(result.home,STUDENT),true);
  }
  assert.equal(f.bank.control.reserves,1);assert.equal(f.bank.control.commits,1);assert.equal(f.bank.balances.get(STUDENT),balance);
  await f.restart();const saved=await f.store.get(TENANT,STUDENT);
  assert.deepEqual(saved.commerce.avatar.equipped,{outfit,headwear:hat,footwear:shoes});assert.deepEqual(saved.avatar,identity);
  assert.equal(saved.commerce.owned.every(owned=>owned.status==='stored'&&owned.storey===null),true);
  const raw=JSON.parse(await fs.readFile(f.store.fileFor(TENANT,STUDENT),'utf8'));
  assert.deepEqual(raw.home.commerce.avatar.equipped,saved.commerce.avatar.equipped);
});

test('concurrent checkout and restart replay deliver one garment and debit platform points once',async t=>{
  const f=await fixture(t),command=buy(outfit),id='wardrobe-concurrent-buy';
  const results=await Promise.all(Array.from({length:6},()=>f.command(command,id)));
  assert.equal(results.filter(result=>!result.duplicate).length,1);assert.equal(f.bank.control.reserves,1);assert.equal(f.bank.control.commits,1);
  assert.equal((await f.store.get(TENANT,STUDENT)).commerce.owned.length,1);
  await f.restart();const repeated=await f.command(command,id);
  assert.equal(repeated.duplicate,true);assert.equal(repeated.home.commerce.owned.length,1);assert.equal(f.bank.balances.get(STUDENT),50_000-price(outfit));
  await assert.rejects(f.command(buy(hat),id),error=>error.status===409&&error.code==='command_conflict');
});

test('lost clothing payment response recovers after restart without duplicate charge or stock',async t=>{
  const f=await fixture(t);f.bank.control.loseNextReserveResponse=true;
  await assert.rejects(f.command(buy(hat),'wardrobe-payment-recovery'),error=>error.status===503);
  const pending=await f.store.readRecord(TENANT,STUDENT);assert.equal(pending.home.commerce.owned.length,0);assert.equal(pending.pending.amount,price(hat));
  await f.restart();const home=await f.store.get(TENANT,STUDENT,f.bank);
  assert.equal(home.commerce.owned.length,1);assert.equal(home.commerce.owned[0].skuId,hat);assert.equal(f.bank.balances.get(STUDENT),50_000-price(hat));
  const replay=await f.command(buy(hat),'wardrobe-payment-recovery');assert.equal(replay.duplicate,true);
  assert.equal(f.bank.control.reserves,1);assert.equal(f.bank.control.commits,1);assert.equal((await f.store.readRecord(TENANT,STUDENT)).pending,null);
});

test('unowned clothing, mismatched slots, unsupported models and forged prices cannot alter wardrobe or spend points',async t=>{
  const f=await fixture(t);
  const invalid=[equip(outfit,'outfit'),equip(null,'hands'),equip(outfit,null),equip('wear-moon-explorer','outfit'),equip('wear-does-not-exist','outfit'),
    buy('wear-petal-dress'),buy('wear-does-not-exist'),{...buy(outfit),amount:1},{type:'checkout',lines:[{skuId:outfit,quantity:1,unitPrice:1}]},
    {...equip(null,'outfit'),equipped:{outfit}}, {type:'equipClothing',skuId:outfit}];
  for(let index=0;index<invalid.length;index++)await assert.rejects(f.command(invalid[index],`wardrobe-invalid-${index}`),error=>error.status===422);
  assert.equal(f.bank.control.reserves,0);assert.equal(f.bank.balances.get(STUDENT),50_000);
  let result=await f.command(buy(outfit),'wardrobe-valid-purchase');
  await assert.rejects(f.command(equip(outfit,'headwear'),'wardrobe-slot-mismatch',result.home.revision),error=>error.status===422);
  const home=await f.store.get(TENANT,STUDENT);assert.equal(home.revision,result.home.revision);assert.deepEqual(home.commerce.avatar.equipped,{outfit:null,headwear:null,footwear:null});
});

test('each student owns an independent wardrobe and cannot wear another student purchase',async t=>{
  const f=await fixture(t);let first=await f.command(buy(outfit),'wardrobe-student-buy');
  first=await f.command(equip(outfit,'outfit'),'wardrobe-student-wear',first.home.revision);
  await assert.rejects(f.command(equip(outfit,'outfit'),'wardrobe-other-unowned',0,OTHER),error=>error.status===422);
  const untouched=await f.store.get(TENANT,OTHER);assert.equal(untouched.revision,0);assert.equal(untouched.commerce.owned.length,0);assert.equal(f.bank.balances.get(OTHER),50_000);
  // Identical operation IDs remain scoped to the student account.
  let second=await f.command(buy(hat),'wardrobe-student-buy',0,OTHER);
  second=await f.command(equip(hat,'headwear'),'wardrobe-student-wear',second.home.revision,OTHER);
  assert.equal(second.home.commerce.avatar.equipped.outfit,null);assert.equal(second.home.commerce.avatar.equipped.headwear,hat);
  assert.equal((await f.store.get(TENANT,STUDENT)).commerce.avatar.equipped.outfit,outfit);assert.equal(f.bank.orders.size,2);
  assert.equal(f.bank.balances.get(STUDENT),50_000-price(outfit));assert.equal(f.bank.balances.get(OTHER),50_000-price(hat));
});

test('wear replay is idempotent, switching garments and restoring bare robot spend no additional points',async t=>{
  const f=await fixture(t),alternate='wear-cloud-hoodie';let result=await f.command(buy(outfit,alternate),'wardrobe-switch-buy');
  const before=result.home.revision,balance=f.bank.balances.get(STUDENT),command=equip(outfit,'outfit');
  result=await f.command(command,'wardrobe-idempotent-equip',before);
  const replay=await f.command(command,'wardrobe-idempotent-equip',before);assert.equal(replay.duplicate,true);assert.equal(replay.home.revision,result.home.revision);
  const noChange=await f.command(command,'wardrobe-already-equipped',result.home.revision);assert.equal(noChange.home.revision,result.home.revision);
  result=await f.command(equip(alternate,'outfit'),'wardrobe-switch-outfit',result.home.revision);assert.equal(result.home.commerce.avatar.equipped.outfit,alternate);
  result=await f.command(equip(null,'outfit'),'wardrobe-remove-outfit',result.home.revision);assert.equal(result.home.commerce.avatar.equipped.outfit,null);assert.equal(result.receipt.amount,0);
  assert.equal(result.home.commerce.owned.length,2);assert.equal(f.bank.balances.get(STUDENT),balance);assert.equal(f.bank.control.reserves,1);
  await f.restart();assert.equal((await f.store.get(TENANT,STUDENT)).commerce.avatar.equipped.outfit,null);
});

test('an unavailable human garment cannot enter formal saves through a shared demo snapshot',()=>{
  let state=createAccountCommerce();state.wallet={balance:50_000,initialBalance:50_000};
  state=setCartQuantity(state,'wear-petal-dress',1).state;state=checkoutCart(state,'legacy-demo-dress').state;
  const spent=state.wallet.initialBalance-state.wallet.balance;state.wallet={balance:0,initialBalance:spent};
  assert.equal(validateCommerceState(state),true);assert.equal(validateAccountCommerce(state),false);
  assert.throws(()=>prepareCommerceCommand(state,equip(null,'outfit'),'wardrobe-forged-save'),error=>error.status===503&&error.code==='storage_unavailable');
});

test('existing v2 homes stay compatible with empty wardrobe; first purchase preserves furniture and robot colors',async t=>{
  const f=await fixture(t);let result=await f.command(buy('bed-classic'),'wardrobe-existing-bed');
  const colors={shell:'#abcdef',accent:'#123456'};
  await f.store.updateColors(TENANT,STUDENT,ACTOR,result.home.revision,colors);
  await f.restart();const old=await f.store.get(TENANT,STUDENT),owned=copy(old.commerce.owned),house=copy(old.house);
  result=await f.command(buy(outfit),'wardrobe-existing-buy',old.revision);
  result=await f.command(equip(outfit,'outfit'),'wardrobe-existing-equip',result.home.revision);
  assert.deepEqual(result.home.commerce.owned.slice(0,owned.length),owned);assert.deepEqual(result.home.house,house);assert.deepEqual(result.home.avatar.colors,colors);
  assert.equal(result.home.schemaVersion,2);assert.equal(validateStudentHome(result.home,STUDENT),true);
});

test('legacy signed v1 starter migrates before clothing purchase without replacing robot identity',async t=>{
  const f=await fixture(t),home=createStudentHome(STUDENT);delete home.commerce;home.schemaVersion=1;home.house=starterHouse();home.revision=7;
  home.avatar.colors={shell:'#aabbcc',accent:'#ddeeff'};
  const body={schemaVersion:1,tenantId:TENANT,studentId:STUDENT,actorUserId:ACTOR,home};
  await fs.writeFile(f.store.fileFor(TENANT,STUDENT),JSON.stringify({...body,checksum:createHash('sha256').update(JSON.stringify(body)).digest('hex')}));
  await f.restart();let result=await f.command(buy(hat),'wardrobe-legacy-buy',7);
  result=await f.command(equip(hat,'headwear'),'wardrobe-legacy-equip',result.home.revision);
  assert.equal(result.home.schemaVersion,2);assert.equal(result.home.createdAt,home.createdAt);assert.deepEqual(result.home.avatar,home.avatar);
  assert.equal(result.home.commerce.avatar.equipped.headwear,hat);assert.equal(result.home.commerce.owned.length,1);
  assert.equal(f.bank.balances.get(STUDENT),50_000-price(hat));assert.equal(validateStudentHome(result.home,STUDENT),true);
});
