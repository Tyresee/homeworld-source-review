import test from 'node:test';
import assert from 'node:assert/strict';
import { accountCatalog } from '../server/student-homes/commerce.mjs';
import { getShopDepartment, getShopPage, shopFamily, shopTier } from '../public/js/home-shop-browse.js';
import { productMatchesRoom } from '../public/js/home-shop-rooms.js';

const products = getShopDepartment(accountCatalog(), 'shop');
const toiletKinds = ['bdSplitToilet', 'bdMonoblocToilet', 'bdSmartToilet', 'compactToilet'];

test('bathroom functional navigation exposes all four toilets in a single page', () => {
  const result = getShopPage(products, { room:'bathroom', family:'toilets' });
  assert.equal(result.total, 4);
  assert.equal(result.pages, 1);
  assert.deepEqual(result.items.map(product => product.kind), toiletKinds);
  assert.ok(result.items.every(product => productMatchesRoom(product, 'bathroom') && shopFamily(product) === 'toilets'));
  assert.equal(getShopPage(products, { room:'kitchen', family:'toilets' }).total, 0);
});

test('bathroom recommendation starts with the three distinct toilet tiers and retains the older compact model', () => {
  for (const sort of ['newest', 'featured']) {
    const result = getShopPage(products, { room:'bathroom', sort });
    assert.deepEqual(result.items.slice(0, 4).map(product => product.kind), toiletKinds);
    assert.deepEqual(result.items.slice(0, 3).map(shopTier), ['essential', 'comfort', 'signature']);
    assert.deepEqual(result.items.slice(0, 3).map(product => product.price), [800, 1500, 2800]);
  }
});

test('explicit price sorting overrides toilet recommendations without changing any SKU or price', () => {
  const before = JSON.stringify(products);
  const asc = getShopPage(products, { room:'bathroom', family:'toilets', sort:'price-asc' });
  const desc = getShopPage(products, { room:'bathroom', family:'toilets', sort:'price-desc' });
  assert.deepEqual(asc.items.map(product => product.kind), ['bdSplitToilet', 'compactToilet', 'bdMonoblocToilet', 'bdSmartToilet']);
  assert.deepEqual(asc.items.map(product => product.price), [800, 1000, 1500, 2800]);
  assert.deepEqual(desc.items.map(product => product.skuId), asc.items.map(product => product.skuId).reverse());
  assert.equal(JSON.stringify(products), before);
});

test('room, function, price tier and search filters intersect and clamp stale pages', () => {
  const smart = getShopPage(products, { room:'bathroom', family:'toilets', tier:'signature', query:"DisplayText0471", page:99 });
  assert.equal(smart.total, 1);
  assert.equal(smart.page, 1);
  assert.equal(smart.items[0].kind, 'bdSmartToilet');
  const basic = getShopPage(products, { room:'bathroom', family:'toilets', tier:'essential' });
  assert.deepEqual(basic.items.map(product => product.kind), ['bdSplitToilet', 'compactToilet']);
});

test('shared room goods retain one SKU and can still be found by their room labels', () => {
  const lamp = products.find(product => product.kind === 'taskLamp');
  assert.ok(lamp);
  for (const room of ['living', 'bedroom', 'study']) {
    const result = getShopPage(products, { room, family:shopFamily(lamp), query:lamp.name });
    assert.ok(result.items.some(product => product.skuId === lamp.skuId));
  }
  const bathroom = getShopPage(products, { query:"DisplayText3137", family:'toilets' });
  assert.equal(bathroom.total, 4);
});
