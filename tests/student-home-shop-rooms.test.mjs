import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOP_CATALOG } from '../public/js/home-commerce.js';
import { SHOP_ROOMS, shopRoomIds, productMatchesRoom } from '../public/js/home-shop-rooms.js';

const product = kind => {
  const found = SHOP_CATALOG.find(row => row.kind === kind);
  assert.ok(found, `Missing catalog fixture ${kind}`);
  return found;
};
const inRoom = (kind, room) => productMatchesRoom(product(kind), room);

test('every existing indoor product has a usable, named room without changing its SKU or price', () => {
  const before = JSON.stringify(SHOP_CATALOG);
  const roomIds = new Set(SHOP_ROOMS.map(room => room.id));
  assert.equal(roomIds.size, SHOP_ROOMS.length);
  for (const row of SHOP_CATALOG.filter(row => row.productType === 'furniture')) {
    const ids = shopRoomIds(row);
    assert.ok(ids.length > 0, `${row.skuId} has no shopping destination`);
    assert.ok(ids.every(id => roomIds.has(id) && id !== 'outdoor'), `${row.skuId}: ${ids}`);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.some(id => productMatchesRoom(row, id)));
  }
  assert.equal(JSON.stringify(SHOP_CATALOG), before);
});

test('toilets across price tiers are findable in the bathroom, including the original seat', () => {
  const toilets = SHOP_CATALOG.filter(row => row.family === 'toilets');
  assert.ok(toilets.length >= 3);
  assert.ok(new Set(toilets.map(row => row.tier)).size >= 3);
  for (const row of [...toilets, product('compactToilet')]) {
    assert.ok(productMatchesRoom(row, 'bathroom'), row.skuId);
    assert.equal(productMatchesRoom(row, 'kitchen'), false);
    assert.equal(productMatchesRoom(row, 'decor'), false);
  }
  assert.deepEqual(shopRoomIds({ productType: 'furniture', tags: ["DisplayText0468"] }), ['bathroom']);
});

test('washing and laundry products can be found from both their old bath context and the utility area', () => {
  for (const kind of ['hhWasher', 'hhHamper', 'udDryer', 'udDetergent', 'udFoldedTowels', 'bdLaundryLiquid']) {
    assert.ok(inRoom(kind, 'bathroom'), kind);
    assert.ok(inRoom(kind, 'utility'), kind);
  }
  for (const kind of ['udIroningBoard', 'udDryingRack', 'udToolbox', 'udSewingMachine', 'udBroomDustpan']) {
    assert.ok(inRoom(kind, 'utility'), kind);
    assert.equal(inRoom(kind, 'decor'), false, kind);
  }
});

test('cooking, dining, sleeping and study goods retain distinct functional destinations', () => {
  for (const kind of ['kitchenSink', 'rangeCooker', 'retroFridge', 'kdWok', 'kdKnifeBlock', 'kdRangeHood']) {
    assert.ok(inRoom(kind, 'kitchen'), kind);
    assert.equal(inRoom(kind, 'bathroom'), false, kind);
  }
  for (const kind of ['bistroTable', 'diningChair', 'hhReededSideboard']) assert.ok(inRoom(kind, 'dining'), kind);
  for (const kind of ['kdDinnerSet', 'kdTeapot']) {
    assert.ok(inRoom(kind, 'kitchen'), kind);
    assert.ok(inRoom(kind, 'dining'), kind);
  }
  assert.ok(inRoom('sofa', 'living'));
  assert.equal(inRoom('sofa', 'bathroom'), false);
  for (const kind of ['bed', 'bedCanopy', 'archedWardrobe']) assert.ok(inRoom(kind, 'bedroom'), kind);
  for (const kind of ['writingDesk', 'lcTrestleDesk', 'deskShelf', 'pencilCup']) assert.ok(inRoom(kind, 'study'), kind);
  for (const kind of ['lcHouseBed', 'toyChest', 'toyRobot']) assert.ok(inRoom(kind, 'playroom'), kind);
  for (const kind of ['consoleTable', 'lcShoeCabinet', 'hhUmbrellaStand']) assert.ok(inRoom(kind, 'entryway'), kind);
});

test('shared lamps, plants and decorations appear in relevant rooms as the same product', () => {
  for (const kind of ['chandelier', 'taskLamp', 'readingLamp', 'hhMushroomLamp']) {
    for (const room of ['decor', 'living', 'bedroom', 'study']) assert.ok(inRoom(kind, room), `${kind}: ${room}`);
  }
  for (const kind of ['plant', 'miniPlant', 'hhMonstera']) {
    for (const room of ['decor', 'living', 'utility']) assert.ok(inRoom(kind, room), `${kind}: ${room}`);
  }
  assert.ok(inRoom('wallClock', 'kitchen'));
  assert.ok(inRoom('photoFrame', 'living'));
  assert.ok(inRoom('cabinet', 'study'));
  assert.equal(inRoom('lcShoeCabinet', 'kitchen'), false);
});

test('construction and clothing stay in their own tabs while outdoor goods have a separate destination', () => {
  for (const row of SHOP_CATALOG.filter(row => ['room', 'storey', 'clothing'].includes(row.productType))) {
    assert.deepEqual(shopRoomIds(row), [], row.skuId);
    assert.ok(productMatchesRoom(row, 'all'), row.skuId);
    for (const room of SHOP_ROOMS) assert.equal(productMatchesRoom(row, room.id), false, row.skuId);
  }
  for (const row of SHOP_CATALOG.filter(row => row.productType === 'outdoor')) {
    assert.deepEqual(shopRoomIds(row), ['outdoor']);
    assert.ok(productMatchesRoom(row, 'all'));
    assert.equal(productMatchesRoom(row, 'living'), false);
  }
  assert.deepEqual(shopRoomIds(null), []);
  assert.equal(productMatchesRoom(product('bed'), 'unknown-room'), false);
});
