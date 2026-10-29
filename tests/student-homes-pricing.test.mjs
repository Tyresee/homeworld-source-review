import test from 'node:test';
import assert from 'node:assert/strict';
import {accountCatalog,createAccountCommerce,prepareCommerceCommand,validateAccountCommerce} from '../server/student-homes/commerce.mjs';
import {createCommerceState,setCartQuantity,getCartTotal,checkoutCart} from '../public/js/home-commerce.js';

const catalog=accountCatalog(),bySku=new Map(catalog.map(product=>[product.skuId,product]));
const price=kind=>bySku.get(`${kind}-classic`)?.price;

test('a 500-point lesson can buy a real table, desk, bookshelf or storage unit',()=>{
  for(const kind of ['bistroTable','lcTrestleDesk','lcLadderShelf','toyCubby']){
    const product=bySku.get(`${kind}-classic`);
    assert.equal(product.productType,'furniture');
    assert.equal(product.placement,'floor');
    assert.ok(product.width>=.7&&product.height>=.7,`${kind} remains a full furniture item`);
    assert.equal(product.price,500);
    const purchase=prepareCommerceCommand(createAccountCommerce(),{type:'checkout',lines:[{skuId:product.skuId,quantity:1}]},`pricing-starter-${kind}`);
    assert.equal(purchase.amount,500);
    assert.equal(purchase.commerce.owned[0].item.kind,kind);
  }
  assert.equal(price('writingDesk'),800);
  assert.equal(price('bedTimber'),1000);
  assert.equal(price('lcSpindleSofa'),1200);
  assert.equal(price('diningChair'),480,'the already cheaper chair is not raised to a pricing band');
});

test('beds and sofas have distinct basic, practical, premium and long-term price steps',()=>{
  for(const series of [
    [['bedTimber',1000],['bed',1800],['bedUpholstered',2400],['bedCanopy',4800],['lcRoyalBed',6800]],
    [['lcSpindleSofa',1200],['sofa',1800],['daybedSofa',2600],['lcCloudSofa',3000],['lcCurvedSofa',4200]],
  ]){
    let previous=0;
    for(const [kind,expected] of series){assert.equal(price(kind),expected);assert.ok(expected>previous);previous=expected;}
  }
  for(const kind of ['studyDesk','diningTable','archedWardrobe','retroFridge','ovalBathtub','bdSmartToilet']){
    assert.ok(price(kind)>=1800&&price(kind)<=3000,`${kind} provides a premium main furniture choice`);
  }
});

test('daily small decorations span 100–300 points without increasing existing 80-point supplies',()=>{
  const expected={bdSoapDish:80,udLintRoller:80,kdPeeler:100,kdMug:140,openBook:180,happyCloud:180,bookends:200,flowerVase:240,toyCatNap:240,teddyBear:260,wallClock:300,landscapeArt:300,kdStockpot:300};
  for(const [kind,value] of Object.entries(expected))assert.equal(price(kind),value,kind);
  assert.equal(price('hhAirFryer'),700);
  assert.equal(price('hhEspresso'),1200,'a coffee machine is not flattened into a tiny decoration price');
});

test('displayed catalog, restored SKU-only cart, quote and authoritative checkout agree on a mixed basket',()=>{
  const lines=[
    {skuId:'bistroTable-classic',quantity:2,expectedUnitPrice:500},
    {skuId:'writingDesk-classic',quantity:1,expectedUnitPrice:800},
    {skuId:'bedTimber-classic',quantity:1,expectedUnitPrice:1000},
    {skuId:'lcSpindleSofa-classic',quantity:1,expectedUnitPrice:1200},
    {skuId:'bdSoapDish-classic',quantity:2,expectedUnitPrice:80},
    {skuId:'wallClock-classic',quantity:1,expectedUnitPrice:300},
    {skuId:'wear-cloud-hoodie',quantity:1,expectedUnitPrice:520},
    {skuId:'outdoor-pool-1',quantity:1,expectedUnitPrice:6200},
  ];
  let cart=createCommerceState().state;
  for(const line of lines){
    assert.equal(bySku.get(line.skuId).price,line.expectedUnitPrice);
    const changed=setCartQuantity(cart,line.skuId,line.quantity);assert.equal(changed.ok,true,changed.error);cart=changed.state;
  }
  // A saved cart contains SKUs and quantities, never a stale client price.
  assert.deepEqual(cart.cart,lines.map(({skuId,quantity})=>({skuId,quantity})));
  assert.equal(getCartTotal(structuredClone(cart)),11180);
  const demo=checkoutCart(cart,'pricing-mixed-local');assert.equal(demo.ok,true,demo.error);
  assert.equal(demo.order.total,11180);assert.equal(cart.wallet.balance-demo.state.wallet.balance,11180);
  const current=createAccountCommerce(),before=structuredClone(current);
  const server=prepareCommerceCommand(current,{type:'checkout',lines:cart.cart},'pricing-mixed-server');
  assert.deepEqual(current,before,'quoting does not mutate the stored input');
  assert.equal(server.amount,11180);assert.equal(server.detail.order.total,11180);
  assert.equal(server.commerce.owned.length,10);
  for(const line of lines){
    for(const receipt of [demo.order,server.detail.order]){
      assert.deepEqual(receipt.lines.find(row=>row.skuId===line.skuId),{skuId:line.skuId,quantity:line.quantity,unitPrice:line.expectedUnitPrice});
    }
  }
  assert.deepEqual(server.commerce.wallet,{balance:0,initialBalance:11180});
  assert.equal(validateAccountCommerce(server.commerce),true);
});

test('new prices do not refund or rewrite a historical order and its paid balance',()=>{
  const first=prepareCommerceCommand(createAccountCommerce(),{type:'checkout',lines:[{skuId:'bedTimber-classic',quantity:1}]},'pricing-historical-bed');
  // Isolated historical fixture: this bed was paid for at the previous 1,600-point price.
  const saved=first.commerce;
  saved.orders[0].lines[0].unitPrice=1600;saved.orders[0].total=1600;saved.wallet.initialBalance=1600;
  assert.equal(validateAccountCommerce(saved),true);
  const before=structuredClone(saved),oldReceipt=structuredClone(saved.orders[0]);
  const next=prepareCommerceCommand(saved,{type:'checkout',lines:[{skuId:'bedTimber-classic',quantity:1}]},'pricing-current-bed');
  assert.equal(next.amount,1000);
  assert.deepEqual(next.commerce.orders[0],oldReceipt);
  assert.deepEqual(next.commerce.wallet,{balance:0,initialBalance:2600});
  assert.equal(next.commerce.owned.length,2);
  assert.deepEqual(saved,before);
});

test('room, outdoor and clothing prices and construction rates remain outside furniture repricing',()=>{
  const expected={'room-bathroom-compact':3600,'outdoor-pool-1':6200,'outdoor-tennis-1':8800,'wear-ocean-overalls':360,'wear-cloud-hoodie':520};
  for(const [skuId,value] of Object.entries(expected))assert.equal(bySku.get(skuId).price,value,skuId);
  const result=prepareCommerceCommand(createAccountCommerce(),{type:'constructFloor',selection:{storey:0,rects:[{minX:2.8,minZ:-2.6,width:2.8,depth:5.2}]}},'pricing-construction-unchanged');
  assert.equal(result.amount,4368,'14.56 square metres are still charged at 300 points per square metre');
});
