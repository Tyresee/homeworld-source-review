import test from 'node:test';
import assert from 'node:assert/strict';
import {accountCatalog} from '../server/student-homes/commerce.mjs';
import {getShopDepartment,getShopPage,isNewShopProduct,shopFamilyLabel} from '../public/js/home-shop-browse.js';

const products=getShopDepartment(accountCatalog(),'shop');
const tvKinds=['ipRetroTelevision','ipWideTelevision','ipCinemaTelevision'];
test('interactive televisions lead newest arrivals and stay discoverable inside the living room',()=>{
  for(const options of[{}, {room:'living'}, {room:'living',newOnly:true}]){
    const result=getShopPage(products,options);assert.deepEqual(result.items.slice(0,3).map(p=>p.kind),tvKinds);
    assert.ok(result.items.slice(0,3).every(isNewShopProduct));
  }
  const result=getShopPage(products,{room:'living',family:'televisions',query:"DisplayText1156",newOnly:true});
  assert.equal(result.total,3);assert.equal(result.pages,1);assert.deepEqual(result.items.map(p=>p.kind),tvKinds);
  assert.ok(result.items.every(p=>shopFamilyLabel(p)==="DisplayText1154"));
});
test('explicit television tier and price filters retain all three original product prices',()=>{
  for(const [tier,kind,price] of[['essential',tvKinds[0],2400],['comfort',tvKinds[1],6200],['signature',tvKinds[2],12800]]){
    const result=getShopPage(products,{room:'living',family:'televisions',tier});assert.equal(result.total,1);assert.equal(result.items[0].kind,kind);assert.equal(result.items[0].price,price);
  }
  assert.deepEqual(getShopPage(products,{family:'televisions',sort:'price-desc'}).items.map(p=>p.kind),[...tvKinds].reverse());
});
