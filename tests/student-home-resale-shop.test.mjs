import test from 'node:test';
import assert from 'node:assert/strict';
import {documentForShop} from './fixtures/home-shop-dom.mjs';
import {createHomeShop} from '../public/js/home-shop-ui.js';
import {createHomeState} from '../public/js/home-engine.js';
import {
  SHOP_CATALOG,ROOM_PRODUCTS,AVATAR_CLOTHING_PRODUCTS,createCommerceState,validateCommerceState,
  setCartQuantity,checkoutCart,placeOwnedItem,placeOwnedOutdoor,quoteOwnedResale,sellOwnedItem,
} from '../public/js/home-commerce.js';
import {getStoredPlacementGroups} from '../public/js/home-inventory-menu.js';

const copy=value=>structuredClone(value);
const accepted=result=>{assert.equal(result.ok,true,result.error);assert.equal(validateCommerceState(result.state),true);return result.state;};
const fresh=()=>accepted(createCommerceState(createHomeState()));
const buy=(state,skuId,quantity=1)=>accepted(checkoutCart(accepted(setCartQuantity(state,skuId,quantity)),`ui-buy-${state.orders.length+1}`));
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const ownedCard=(dialog,id)=>dialog.querySelector(`[data-shop-owned="${id}"]`);
const sellButton=(dialog,id)=>dialog.querySelector(`[data-shop-sell="${id}"]`);
const ownedIds=dialog=>dialog.querySelectorAll('[data-shop-owned]').map(node=>node.dataset.shopOwned).sort();

function fixture(t,options={}){
  const descriptors=new Map(['document','requestAnimationFrame','confirm'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const document=documentForShop();let commerce=options.state??fresh(),confirmCalls=0;
  Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:document});
  Object.defineProperty(globalThis,'requestAnimationFrame',{configurable:true,writable:true,value:callback=>{callback(0);return 0;}});
  Object.defineProperty(globalThis,'confirm',{configurable:true,writable:true,value:()=>{confirmCalls++;return false;}});
  const onSell=Object.hasOwn(options,'onSell')?options.onSell:async id=>{
    const result=sellOwnedItem(commerce,id,`ui-sale-${commerce.resaleLedger?.length??0}`);
    if(result.ok)commerce=result.state;
    return {...result,...result.ok?{receipt:{creditAmount:result.quote.amount}}:{}};
  };
  const shop=createHomeShop({catalog:SHOP_CATALOG,accountMode:true,getState:()=>commerce,
    getResaleQuote:id=>quoteOwnedResale(commerce,id),onSell,
    onCartChange:(skuId,quantity)=>{const result=setCartQuantity(commerce,skuId,quantity);if(result.ok)commerce=result.state;return result;},
    onCheckout:()=>{const result=checkoutCart(commerce,`ui-checkout-${commerce.orders.length+1}`);if(result.ok)commerce=result.state;return result;},
    onPlace:options.onPlace??(()=>({ok:true})),getThumbnail:()=>null,
  });
  const dialog=document.body.querySelector('dialog');
  t.after(()=>{
    shop.dispose();
    for(const [key,descriptor] of descriptors)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
  });
  return {shop,dialog,document,get state(){return commerce;},set state(value){assert.equal(validateCommerceState(value),true);commerce=value;},get confirmCalls(){return confirmCalls;}};
}

test('real resale department shows stored and placed furniture and outdoor goods without structural or clothing cards',t=>{
  let state=fresh();
  for(const skuId of ['bed-classic','plant-classic','outdoor-lounger',ROOM_PRODUCTS[0].skuId,AVATAR_CLOTHING_PRODUCTS[0].skuId])state=buy(state,skuId,skuId==='outdoor-lounger'?2:1);
  const bed=state.owned.find(row=>row.skuId==='bed-classic'),outdoor=state.owned.filter(row=>row.skuId==='outdoor-lounger');
  state=accepted(placeOwnedItem(state,bed.id,{x:0,z:-1.65,rotation:90}));
  state=accepted(placeOwnedOutdoor(state,outdoor[0].id,{x:7,z:0,rotation:90}));
  const f=fixture(t,{state});f.shop.open('resale');
  assert.equal(f.dialog.querySelector('.home-shop-body').dataset.tab,'resale');
  assert.equal(f.dialog.querySelector('[data-shop-tab="resale"]').getAttribute('aria-pressed'),'true');
  const expected=state.owned.filter(row=>['bed-classic','plant-classic','outdoor-lounger'].includes(row.skuId));
  assert.deepEqual(ownedIds(f.dialog),expected.map(row=>row.id).sort());
  for(const item of expected)assert.equal(sellButton(f.dialog,item.id).disabled,false);
  assert.match(ownedCard(f.dialog,bed.id).textContent,/1 DisplayText3436.*DisplayText3472/);
  assert.match(ownedCard(f.dialog,outdoor[0].id).textContent,/DisplayText3435.*DisplayText3472/);
  assert.match(ownedCard(f.dialog,outdoor[1].id).textContent,/DisplayText3398/);
  assert.equal(f.dialog.querySelector('[data-shop-place]'),null,'resale does not add an unrelated placement action');
  f.dialog.querySelector('[data-shop-inventory-filter="stored"]').click();
  assert.deepEqual(ownedIds(f.dialog),expected.filter(row=>row.status==='stored').map(row=>row.id).sort());
  f.dialog.querySelector('[data-shop-inventory-filter="placed"]').click();
  assert.deepEqual(ownedIds(f.dialog),[bed.id,outdoor[0].id].sort());
});

test('real resale card displays the original historical paid price and its rounded buyback amount',t=>{
  const state=buy(fresh(),'bed-classic'),id=state.owned[0].id;
  state.orders[0].lines[0].unitPrice=333;state.orders[0].total=333;state.wallet.balance=state.wallet.initialBalance-333;
  const f=fixture(t,{state});f.shop.open('resale');
  const card=ownedCard(f.dialog,id);
  assert.match(card.textContent,/DisplayText3471 333 DisplayText0920 · DisplayText3403 50%/);
  assert.equal(sellButton(f.dialog,id).textContent,"DisplayText3469 · +166 DisplayText0920");
  assert.doesNotMatch(card.textContent,/1,800|900 DisplayText0920/);
  f.dialog.querySelector('[data-shop-tab="inventory"]').click();
  assert.equal(sellButton(f.dialog,id).textContent,"DisplayText3469 · +166 DisplayText0920",'warehouse exposes the same concrete quote');
});

test('one click sends a sale without another confirmation and waits for acknowledgement before changing goods or points',async t=>{
  let state=buy(fresh(),'bed-classic'),id=state.owned[0].id;
  state=accepted(placeOwnedItem(state,id,{x:0,z:-1.65,rotation:90}));
  const gate=deferred(),calls=[];let f;
  f=fixture(t,{state,onSell:async ownedId=>{
    calls.push(ownedId);await gate.promise;
    const result=sellOwnedItem(f.state,ownedId,'ui-acknowledged-sale');f.state=accepted(result);
    return {ok:true,receipt:{creditAmount:result.quote.amount}};
  }});f.shop.open('resale');
  const before=copy(f.state),walletBefore=f.dialog.querySelector('.home-shop-wallet').textContent,original=sellButton(f.dialog,id);
  original.click();
  assert.deepEqual(calls,[id]);assert.equal(f.confirmCalls,0);
  assert.deepEqual(f.state,before);assert.equal(f.state.home.furniture.length,1);
  assert.equal(f.dialog.querySelector('.home-shop-wallet').textContent,walletBefore);
  assert.ok(ownedCard(f.dialog,id),'the item stays visible while the platform result is pending');
  assert.equal(sellButton(f.dialog,id).disabled,true);
  assert.ok(f.dialog.querySelectorAll('[data-shop-tab]').every(tab=>tab.disabled));
  assert.equal(f.dialog.querySelector('.home-shop-close').disabled,true);
  assert.match(f.dialog.querySelector('.home-shop-status').textContent,/DisplayText3367/);
  original.click();original.dispatch('click');sellButton(f.dialog,id).click();
  assert.equal(calls.length,1,'busy guard also handles a stale original button event');
  f.shop.close();assert.equal(f.dialog.open,true,'pending sale cannot be dismissed as complete');
  gate.resolve();await nextTurn();
  assert.equal(f.state.owned[0].status,'sold');assert.equal(f.state.home.furniture.length,0);
  assert.equal(f.state.wallet.balance,before.wallet.balance+900);
  assert.equal(ownedCard(f.dialog,id),null);
  assert.match(f.dialog.querySelector('.home-shop-status').textContent,/DisplayText3370, DisplayText3371 900 DisplayText0007/);
  assert.equal(f.dialog.querySelector('.home-shop-close').disabled,false);
  f.dialog.querySelector('[data-shop-tab="inventory"]').click();
  assert.equal(ownedCard(f.dialog,id),null);assert.equal(f.dialog.querySelector('[data-shop-place]'),null);
  assert.equal(f.dialog.querySelector('[data-shop-tab="inventory"]').textContent,"Inventory");
  assert.equal(getStoredPlacementGroups(f.state.owned,SHOP_CATALOG).length,0);
});

for(const failure of ['rejected','unconfirmed'])test(`a ${failure} sale keeps its real card, ownership and wallet balance`,async t=>{
  const state=buy(fresh(),'plant-classic'),id=state.owned[0].id,gate=deferred();let calls=0;
  const f=fixture(t,{state,onSell:async()=>{calls++;return gate.promise;}});f.shop.open('inventory');
  const before=copy(state),walletBefore=f.dialog.querySelector('.home-shop-wallet').textContent;
  sellButton(f.dialog,id).click();
  if(failure==='rejected')gate.resolve({ok:false,error:"DisplayText4593, DisplayText3369."});else gate.reject(new Error('lost acknowledgement'));
  await nextTurn();
  assert.equal(calls,1);assert.deepEqual(f.state,before);
  assert.equal(f.dialog.querySelector('.home-shop-wallet').textContent,walletBefore);
  assert.ok(ownedCard(f.dialog,id));assert.equal(sellButton(f.dialog,id).disabled,false);
  assert.equal(f.dialog.querySelector(`[data-shop-place="${id}"]`).disabled,false);
  const status=f.dialog.querySelector('.home-shop-status');assert.equal(status.classList.contains('is-error'),true);
  assert.match(status.textContent,failure==='rejected'?/DisplayText4593/:/DisplayText4594.*DisplayText4595/);
});

test('acknowledged sale removes the checkout quick-placement card and preserves both purchase and resale history',async t=>{
  const state=accepted(setCartQuantity(fresh(),'plant-classic',1)),f=fixture(t,{state});f.shop.open('shop');
  f.dialog.querySelector('[data-shop-checkout]').click();await nextTurn();
  const id=f.state.owned[0].id,originalOrder=copy(f.state.orders[0]);
  assert.equal(f.dialog.querySelector('.home-shop-body').dataset.tab,'inventory');
  assert.ok(f.dialog.querySelector('[data-shop-start-placement]'));
  assert.ok(ownedCard(f.dialog,id));
  sellButton(f.dialog,id).click();await nextTurn();
  assert.equal(f.dialog.querySelector('[data-shop-start-placement]'),null);
  assert.equal(f.dialog.querySelector('.home-shop-receipt'),null);
  assert.equal(ownedCard(f.dialog,id),null);
  assert.deepEqual(getStoredPlacementGroups(f.state.owned,SHOP_CATALOG),[]);
  assert.deepEqual(f.state.orders[0],originalOrder);
  f.dialog.querySelector('[data-shop-tab="orders"]').click();
  const records=f.dialog.querySelectorAll('.home-shop-order');assert.equal(records.length,2);
  assert.match(records[0].textContent,/DisplayText3171.*DisplayText3471 300 DisplayText0920 · DisplayText3403 50%.*DisplayText3371 \+150 DisplayText0920/);
  assert.match(records[1].textContent,/1 DisplayText3490.*DisplayText3484 300 DisplayText0920/);
  assert.equal(f.state.resaleLedger.length,1);
});

test('a demo without a sale callback has no dead resale navigation or sell controls',t=>{
  const state=buy(fresh(),'plant-classic'),f=fixture(t,{state,onSell:undefined});
  f.shop.open('resale');
  assert.equal(f.dialog.querySelector('[data-shop-tab="resale"]'),null);
  assert.equal(f.dialog.querySelector('.home-shop-body').dataset.tab,'shop');
  f.shop.open('inventory');
  assert.ok(ownedCard(f.dialog,state.owned[0].id));
  assert.ok(f.dialog.querySelector('[data-shop-place]'));
  assert.equal(f.dialog.querySelector('[data-shop-sell]'),null);
});

test('a desk carrying a placed ornament shows the actual disabled reason before any sale request',t=>{
  let state=buy(buy(fresh(),'writingDesk-classic'),'pencilCup-classic');
  const parent=state.owned.find(row=>row.item.kind==='writingDesk'),child=state.owned.find(row=>row.item.kind==='pencilCup');
  state=accepted(placeOwnedItem(state,parent.id,{x:0,z:1.7}));
  state=accepted(placeOwnedItem(state,child.id,{mount:{type:'table',parentId:parent.id,u:.5,v:.5}}));
  let calls=0;const f=fixture(t,{state,onSell:()=>{calls++;return {ok:true};}});f.shop.open('resale');
  const button=sellButton(f.dialog,parent.id);assert.equal(button.disabled,true);assert.equal(button.textContent,"DisplayText3470");
  assert.match(ownedCard(f.dialog,parent.id).textContent,/DisplayText4596.*DisplayText4597/);
  assert.equal(sellButton(f.dialog,child.id).disabled,false);
  button.click();assert.equal(calls,0);assert.deepEqual(f.state,state);
});
