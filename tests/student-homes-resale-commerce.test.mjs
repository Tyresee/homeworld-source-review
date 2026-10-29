import test from 'node:test';
import assert from 'node:assert/strict';
import {createHomeState,createFurnitureItem,applyChange,getWallMountTargets} from '../public/js/home-engine.js';
import {
  SHOP_CATALOG,ROOM_PRODUCTS,STOREY_PRODUCTS,AVATAR_CLOTHING_PRODUCTS,
  createCommerceState,validateCommerceState,migrateCommerceState,setCartQuantity,checkoutCart,
  placeOwnedItem,storeOwnedItem,reconcileHome,placeOwnedOutdoor,storeOwnedOutdoor,updateOwnedOutdoor,
  quoteOwnedResale,listOwnedResaleQuotes,sellOwnedItem,purchaseFloorConstruction,resizeOwnedRoom,upgradeStaircase,
} from '../public/js/home-commerce.js';

const copy=value=>structuredClone(value);
const accepted=result=>{assert.equal(result.ok,true,result.error);assert.equal(validateCommerceState(result.state),true);return result.state;};
const fresh=()=>accepted(createCommerceState(createHomeState()));
const buy=(state,skuId='bed-classic',quantity=1,transactionId=`buy-${state.orders.length+1}`)=>
  accepted(checkoutCart(accepted(setCartQuantity(state,skuId,quantity)),transactionId));
const rejected=(result,state,pattern)=>{assert.equal(result.ok,false);assert.strictEqual(result.state,state);if(pattern)assert.match(result.error,pattern);};
const freeze=value=>{if(value&&typeof value==='object')Object.values(value).forEach(freeze);return Object.freeze(value);};

test('v6 saves remain unchanged without a resale ledger until the first sale',()=>{
  const state=buy(fresh()),before=copy(state);
  assert.equal(Object.hasOwn(state,'resaleLedger'),false);
  assert.equal(validateCommerceState(state),true);
  assert.strictEqual(migrateCommerceState(state).state,state);
  assert.equal(quoteOwnedResale(state,state.owned[0].id).ok,true);
  assert.deepEqual(state,before);
  const edit=applyChange(state.home,{type:'paint',surfaceId:'table.legs',color:'#bbaa99'});
  const next=accepted(reconcileHome(state,edit.state));
  assert.equal(Object.hasOwn(next,'resaleLedger'),false);
  assert.equal(validateCommerceState({...state,resaleLedger:[]}),true);
  for(const resaleLedger of [null,{},undefined])assert.equal(validateCommerceState({...state,resaleLedger}),false);
});

test('buyback quotes and credits half the original paid unit price, rounded down',()=>{
  let state=buy(fresh());
  state.orders[0].lines[0].unitPrice=333;
  state.orders[0].total=333;state.wallet.balance=state.wallet.initialBalance-333;
  state.owned[0].item.color='#112233';
  assert.equal(validateCommerceState(state),true);
  const before=copy(state),id=state.owned[0].id,quoted=quoteOwnedResale(freeze(state),id);
  assert.equal(quoted.ok,true,quoted.error);
  assert.deepEqual(quoted.quote,{ownedId:id,skuId:'bed-classic',orderId:'order-1',paidUnitPrice:333,rateNumerator:1,rateDenominator:2,amount:166});
  assert.notEqual(SHOP_CATALOG.find(row=>row.skuId==='bed-classic').price,333);
  const sold=sellOwnedItem(state,id,'sell-bed-1'),next=accepted(sold);
  assert.equal(next.wallet.balance,before.wallet.balance+166);
  assert.equal(next.revision,before.revision+1);
  assert.equal(next.owned[0].status,'sold');assert.equal(next.owned[0].storey,null);
  assert.deepEqual(next.owned[0].item,before.owned[0].item);
  assert.deepEqual(next.orders,before.orders);
  assert.equal(sold.resale.transactionId,'sell-bed-1');
  assert.deepEqual(state,before);
  assert.equal(validateCommerceState(copy(next)),true);
});

test('same transaction replays once, another sale cannot credit a sold item',()=>{
  let state=buy(fresh(),'bed-classic',2),[a,b]=state.owned;
  rejected(sellOwnedItem(state,a.id,'buy-1'),state,/DisplayText4644/);
  state=accepted(sellOwnedItem(state,a.id,'sell-first'));
  const before=copy(state),again=sellOwnedItem(state,a.id,'sell-first');
  assert.equal(again.ok,true);assert.equal(again.repeated,true);assert.strictEqual(again.state,state);
  rejected(sellOwnedItem(state,b.id,'sell-first'),state,/DisplayText4645/);
  rejected(sellOwnedItem(state,a.id,'sell-again'),state,/DisplayText4646/);
  rejected(quoteOwnedResale(state,a.id),state,/DisplayText4646/);
  rejected(sellOwnedItem(state,'unknown','sell-missing'),state,/DisplayText4647/);
  assert.deepEqual(state,before);
  state=accepted(sellOwnedItem(state,b.id,'sell-second'));
  assert.equal(state.resaleLedger.length,2);assert.equal(state.owned.length,2);
  assert.equal(state.wallet.balance,state.wallet.initialBalance-1800);
  state=buy(state,'bed-classic',1,'buy-after-sales');
  assert.equal(new Set(state.owned.map(row=>row.id)).size,3);
  assert.deepEqual(state.owned.slice(0,2).map(row=>row.id),[a.id,b.id]);
});

test('multi-quantity receipts round each individual historical unit and never refund from order totals',()=>{
  let state=buy(fresh(),'plant-classic',3),credited=0;
  state.orders[0].lines[0].unitPrice=999;state.orders[0].total=2997;
  state.wallet.balance=state.wallet.initialBalance-2997;
  for(const [index,owned] of state.owned.entries()) {
    const result=sellOwnedItem(state,owned.id,`sell-unit-${index}`);
    assert.equal(result.quote.amount,499);credited+=result.quote.amount;
    state=accepted(result);
  }
  assert.equal(credited,1497);assert.notEqual(credited,Math.floor(state.orders[0].total/2));
  assert.equal(state.wallet.balance,state.wallet.initialBalance-1500);
});

test('placed furniture is removed atomically and sold tombstones survive unrelated edits',()=>{
  let state=buy(fresh()),id=state.owned[0].id;
  state=accepted(placeOwnedItem(state,id,{x:0,z:-1.65,rotation:90}));
  const item=copy(state.owned[0].item),homeBefore=copy(state.home);
  state=accepted(sellOwnedItem(state,id,'sell-placed'));
  assert.equal(state.home.furniture.length,0);assert.deepEqual(state.owned[0].item,item);
  rejected(placeOwnedItem(state,id,{x:0,z:-1.65}),state,/DisplayText4648/);
  rejected(storeOwnedItem(state,id),state,/DisplayText4648/);
  rejected(reconcileHome(state,homeBefore),state,/DisplayText4648/);
  const edit=applyChange(state.home,{type:'paint',surfaceId:'table.legs',color:'#bbaa99'});
  state=accepted(reconcileHome(state,edit.state));
  assert.equal(state.owned[0].status,'sold');assert.equal(state.resaleLedger.length,1);
  assert.equal(validateCommerceState(copy(state)),true);
});

test('wall, tabletop and ceiling purchases can be sold directly from the scene',()=>{
  const cases=[
    ['wallClock-classic',state=>({mount:{type:'wall',wallId:getWallMountTargets(state.home)[0].wallId,u:.75,v:.5}})],
    ['pencilCup-classic',()=>({mount:{type:'table',u:.5,v:.5}})],
    ['chandelier-classic',()=>({x:0,z:0})],
  ];
  for(const [skuId,pose] of cases) {
    let state=buy(fresh(),skuId),id=state.owned[0].id;
    state=accepted(placeOwnedItem(state,id,pose(state)));
    const item=copy(state.owned[0].item);
    state=accepted(sellOwnedItem(state,id,`sell-${skuId}`));
    assert.equal(state.home.furniture.length,0);assert.deepEqual(state.owned[0].item,item);
  }
});

test('a supporting desk cannot be sold while its mounted goods remain placed',()=>{
  let state=buy(buy(fresh(),'writingDesk-classic'),'pencilCup-classic');
  const parent=state.owned.find(row=>row.item.kind==='writingDesk'),child=state.owned.find(row=>row.item.kind==='pencilCup');
  state=accepted(placeOwnedItem(state,parent.id,{x:0,z:1.7}));
  state=accepted(placeOwnedItem(state,child.id,{mount:{type:'table',parentId:parent.id,u:.5,v:.5}}));
  const before=copy(state);
  rejected(quoteOwnedResale(state,parent.id),state,/DisplayText4596.*DisplayText4649/);
  rejected(sellOwnedItem(state,parent.id,'sell-desk-too-soon'),state,/DisplayText4596/);
  assert.deepEqual(state,before);
  state=accepted(storeOwnedItem(state,child.id));
  state=accepted(sellOwnedItem(state,parent.id,'sell-desk'));
  assert.equal(state.owned.find(row=>row.id===child.id).status,'stored');
  assert.deepEqual(state.owned.find(row=>row.id===child.id).item.mount,{type:'table',parentId:parent.id,u:.5,v:.5});
  rejected(placeOwnedItem(state,child.id,{}),state);
  state=accepted(sellOwnedItem(state,child.id,'sell-stored-cup'));
  assert.equal(state.resaleLedger.length,2);
});

test('stored and placed outdoor purchases sell without creating indoor furniture',()=>{
  let state=buy(fresh(),'outdoor-lounger',2),[a,b]=state.owned;
  state=accepted(placeOwnedOutdoor(state,a.id,{x:7,z:0,rotation:90}));
  state=accepted(sellOwnedItem(state,a.id,'sell-outdoor-placed'));
  state=accepted(sellOwnedItem(state,b.id,'sell-outdoor-stored'));
  assert.equal(state.home.furniture.length,0);
  assert.ok(state.owned.every(row=>row.status==='sold'));
  rejected(placeOwnedOutdoor(state,a.id,{x:7,z:0}),state,/DisplayText4648/);
  rejected(updateOwnedOutdoor(state,a.id,{color:'#112233'}),state,/DisplayText4648/);
  rejected(storeOwnedOutdoor(state,a.id),state,/DisplayText4648/);
});

test('gifts and structural or clothing ownership cannot be exchanged for points',()=>{
  const home=createHomeState();home.furniture=[createFurnitureItem({id:'gift-bed',kind:'bed',x:0,z:-1.65})];
  const gifted=accepted(createCommerceState(home));
  rejected(quoteOwnedResale(gifted,'gift-bed'),gifted,/DisplayText4650/);
  rejected(sellOwnedItem(gifted,'gift-bed','sell-gift'),gifted,/DisplayText4650/);
  for(const product of [ROOM_PRODUCTS[0],AVATAR_CLOTHING_PRODUCTS[0]]) {
    const state=buy(fresh(),product.skuId);
    rejected(sellOwnedItem(state,state.owned[0].id,`sell-${product.skuId}`),state,/Room, DisplayText0540, DisplayText4651/);
  }
  // Readable legacy purchased kits remain structural, even in current v6 saves.
  const state=fresh(),product=STOREY_PRODUCTS[0],id='legacy-kit';
  state.owned.push({id,skuId:product.skuId,source:'purchase',orderId:'legacy-order',status:'stored',storey:null,item:{id,kind:product.kind}});
  state.orders.push({id:'legacy-order',transactionId:'legacy-buy',lines:[{skuId:product.skuId,quantity:1,unitPrice:product.price}],total:product.price,ownedIds:[id]});
  state.wallet.balance-=product.price;assert.equal(validateCommerceState(state),true);
  rejected(sellOwnedItem(state,id,'sell-kit'),state,/Room, DisplayText0540, DisplayText4651/);
});

test('ledger validation rejects forged credit, duplicate sales and missing tombstones',()=>{
  let state=buy(fresh());state=accepted(sellOwnedItem(state,state.owned[0].id,'sell-valid'));
  const mutations=[
    next=>{next.resaleLedger[0].amount++;next.wallet.balance++;},
    next=>{next.resaleLedger[0].paidUnitPrice+=2;next.resaleLedger[0].amount++;next.wallet.balance++;},
    next=>{next.resaleLedger[0].rateNumerator=2;},
    next=>{next.resaleLedger[0].rateDenominator=3;},
    next=>{next.resaleLedger[0].transactionId=next.orders[0].transactionId;},
    next=>{next.resaleLedger[0].skuId='plant-classic';},
    next=>{next.resaleLedger[0].orderId='other-order';},
    next=>{next.resaleLedger[0].ownedId='unknown-owned';},
    next=>{next.resaleLedger.push({...next.resaleLedger[0],id:'resale-2',transactionId:'sell-other'});next.wallet.balance+=900;},
    next=>{next.owned[0].status='stored';},
    next=>{next.owned[0].storey=0;},
    next=>{next.owned=[];},
    next=>{delete next.resaleLedger;next.wallet.balance-=900;},
    next=>{next.home.furniture.push(copy(next.owned[0].item));},
    next=>{next.wallet.balance++;},
    next=>{next.resaleLedger[0].unexpected=true;},
  ];
  for(const mutation of mutations){const next=copy(state);mutation(next);assert.equal(validateCommerceState(next),false,mutation.toString());}
});

test('resale transaction IDs are reserved across purchases, area and construction actions',()=>{
  let state=buy(fresh());state=accepted(sellOwnedItem(state,state.owned[0].id,'sale-settlement'));
  const cart=accepted(setCartQuantity(state,'plant-classic',1));
  rejected(checkoutCart(cart,'sale-settlement'),cart,/DisplayText4644/);
  rejected(purchaseFloorConstruction(state,{storey:0,rects:[{minX:-2.8,minZ:-2.6,width:8,depth:5.2}]},'sale-settlement'),state,/DisplayText4644/);
  rejected(resizeOwnedRoom(state,'unknown',{width:3,depth:3},'sale-settlement'),state,/DisplayText4644/);
  rejected(upgradeStaircase(state,'unknown','sale-settlement'),state,/DisplayText4644/);
  state=buy(state,'plant-classic',1,'another-buy');
  state=accepted(purchaseFloorConstruction(state,{storey:0,rects:[{minX:-2.8,minZ:-2.6,width:8,depth:5.2}]},'construction-settlement'));
  rejected(sellOwnedItem(state,state.owned[1].id,'construction-settlement'),state,/DisplayText4644/);
});

test('batched inventory quotes validate once and preserve the same eligible amounts and reasons',()=>{
  let state=buy(buy(buy(fresh(),'plant-classic',2),ROOM_PRODUCTS[0].skuId),AVATAR_CLOTHING_PRODUCTS[0].skuId);
  state=accepted(sellOwnedItem(state,state.owned[0].id,'sell-one-plant'));
  const result=listOwnedResaleQuotes(state);
  assert.equal(result.ok,true);assert.equal(result.quotes.length,1);assert.equal(result.unavailable.length,2);
  for(const quote of result.quotes)assert.deepEqual(quoteOwnedResale(state,quote.ownedId).quote,quote);
  for(const unavailable of result.unavailable)assert.equal(quoteOwnedResale(state,unavailable.ownedId).error,unavailable.error);
  assert.equal(listOwnedResaleQuotes({...state,wallet:{...state.wallet,balance:1}}).ok,false);
});
