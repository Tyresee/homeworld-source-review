import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createEstateManor } from '../public/js/home-estate-manor.js';
import { getManorFacadeLayout, getManorEntranceStepBounds } from '../public/js/home-manor-layout.js';
import { createRoom, getFloorBounds, getFloorBoundarySegments, resolveRooms } from '../public/js/home-layout.js';
import { validateOutdoorPlacement } from '../public/js/home-outdoor-placement.js';
import { createCommerceState, setCartQuantity, checkoutCart, placeOwnedOutdoor, updateOwnedOutdoor,
  validateCommerceState, migrateCommerceState, quoteFloorConstruction, purchaseFloorConstruction } from '../public/js/home-commerce.js';

const starter = () => ({ rooms: [], slab: { rects: [{ minX: -2.8, minZ: -2.6, width: 5.6, depth: 5.2 }] } });
const lamp = (x, z) => ({ kind: 'outdoor-lamp', x, z, rotation: 0 });
const accepted = result => { assert.equal(result.ok, true, result.error); return result.state; };
const paidLamp = () => accepted(checkoutCart(accepted(setCartQuantity(accepted(createCommerceState()), 'outdoor-lamp', 1)), 'entrance-test-lamp'));
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-5, `${label}: ${actual} != ${expected}`);

test('shared facade bays partition actual slab edges without crossing the L-shaped courtyard', () => {
  const home = { rooms: [], slab: { rects: [
    { minX: -2.8, minZ: -2.6, width: 11.2, depth: 5.2 },
    { minX: -2.8, minZ: 2.6, width: 5.6, depth: 5.2 },
  ] } };
  const actual = getManorFacadeLayout(home), boundary = getFloorBoundarySegments(home);
  for (const { face } of actual.faces) {
    assert.ok(boundary.some(edge => edge.side === face.side && edge.at === face.at && edge.from <= face.from + 1e-7 && edge.to >= face.to - 1e-7));
  }
  close(actual.faces.reduce((sum, { face }) => sum + face.to - face.from, 0), boundary.reduce((sum, edge) => sum + edge.to - edge.from, 0), 'perimeter length');
  assert.equal(validateOutdoorPlacement({ home, owned: [] }, lamp(5.6, 5.2)).ok, true, 'the missing L quadrant is usable garden space');
});

test('entrance collision footprints exactly cover all three rendered steps in raw floor coordinates', () => {
  const living = resolveRooms('starter')[0];
  // Cover both face orientations, translated slabs, and legacy hallway priority.
  const rightHallway = [living, createRoom('hallway', 1, -1, 'hall'), createRoom('bedroom', 1, 1, 'bed')];
  const homes = [starter(), { rooms: [], slab: { rects: [{ minX: 11, minZ: -8, width: 5.6, depth: 5.2 }] } },
    { rooms: [living] }, { rooms: [living, createRoom('hallway', -1, 1, 'hall')] }, { rooms: rightHallway }];
  assert.equal(getManorFacadeLayout(homes.at(-1)).entrance.face.side, 'right');
  assert.equal(getManorFacadeLayout(homes.at(-1)).entrance.room.id, 'hall');
  for (const home of homes) for (const structure of [1, 2, 3]) {
    const manor = createEstateManor({ floors: [home], plans: { structure } });
    try {
      manor.position.y = .30; manor.updateMatrixWorld(true);
      const steps = []; manor.traverse(node => { if (node.isMesh && node.userData.buildingPart === 'entrance-step') steps.push(node); });
      const expected = getManorEntranceStepBounds(home, { structure }), origin = getFloorBounds(home);
      assert.equal(steps.length, 3); assert.equal(expected.length, 3);
      for (const [index, mesh] of steps.entries()) {
        const bounds = new THREE.Box3().setFromObject(mesh), footprint = expected[index];
        for (const [actual, wanted] of [[bounds.min.x + origin.x, footprint.minX], [bounds.max.x + origin.x, footprint.maxX],
          [bounds.min.z + origin.z, footprint.minZ], [bounds.max.z + origin.z, footprint.maxZ]]) close(actual, wanted, 'step extent');
        assert.ok(bounds.max.y > 0, 'the formerly buried step now occupies visible outdoor volume');
      }
    } finally { manor.dispose(); }
  }
});

test('the reproduced lamp overlap is rejected while the side and outer edge stay usable', () => {
  const state = { home: starter(), owned: [] };
  const blocked = validateOutdoorPlacement(state, lamp(-1.4, 3.5));
  assert.equal(blocked.ok, false); assert.equal(blocked.code, 'entrance');
  assert.match(blocked.error, /DisplayText4582/);
  assert.equal(validateOutdoorPlacement(state, lamp(.1, 3.5)).ok, true, 'nearby space beside the steps is not reserved');
  assert.equal(validateOutdoorPlacement(state, lamp(-1.4, 4.06)).ok, true, 'touching the outer step edge is allowed');
  assert.equal(validateOutdoorPlacement(state, lamp(-1.4, 4.05)).ok, false, 'even a small overlap is rejected');
});

test('old overlapping saves remain readable without mutation and can move their object out', () => {
  let state = paidLamp(); const id = state.owned.at(-1).id;
  state = accepted(placeOwnedOutdoor(state, id, { x: -1.4, z: 4.5, rotation: 0 }));
  // Isolated fixture recreates a placement accepted before the steps were raised.
  state.owned.find(row => row.id === id).item.z = 3.5;
  const before = structuredClone(state);
  assert.equal(validateCommerceState(state), true);
  const loaded = accepted(migrateCommerceState(state));
  assert.deepEqual(state, before); assert.deepEqual(loaded, before);
  const rejected = updateOwnedOutdoor(state, id, { x: -1.3, z: 3.5 });
  assert.equal(rejected.ok, false); assert.match(rejected.error, /DisplayText4582/); assert.deepEqual(state, before);
  const moved = accepted(updateOwnedOutdoor(state, id, { x: .1, z: 3.5 }));
  assert.equal(validateCommerceState(moved), true);
  assert.deepEqual(moved.wallet, before.wallet); assert.deepEqual(moved.orders, before.orders);
  const throughWall = structuredClone(before); throughWall.owned.find(row => row.id === id).item.z = 0;
  assert.equal(validateCommerceState(throughWall), false, 'compatibility does not disable existing house collision checks');
});

test('new placements and moves keep the strict entrance rule and failed attempts preserve ownership and money', () => {
  const state = paidLamp(), id = state.owned.at(-1).id, before = structuredClone(state);
  const rejected = placeOwnedOutdoor(state, id, { x: -1.4, z: 3.5, rotation: 0 });
  assert.equal(rejected.ok, false); assert.match(rejected.error, /DisplayText4582/); assert.deepEqual(state, before);
  const placed = accepted(placeOwnedOutdoor(state, id, { x: .1, z: 3.5, rotation: 0 }));
  const moved = updateOwnedOutdoor(placed, id, { x: -1.4 });
  assert.equal(moved.ok, false); assert.match(moved.error, /DisplayText4582/);
  assert.deepEqual(moved.state, placed);
});

test('floor expansion refuses to move its new entrance steps through a placed object', () => {
  let state = paidLamp(); const id = state.owned.at(-1).id;
  state = accepted(placeOwnedOutdoor(state, id, { x: -1.4, z: 4.4, rotation: 0 }));
  const before = structuredClone(state), selection = { storey: 0, rects: [{ minX: -2.8, minZ: -2.6, width: 5.6, depth: 5.8 }] };
  for (const result of [quoteFloorConstruction(state, selection), purchaseFloorConstruction(state, selection, 'entrance-blocked-expansion')]) {
    assert.equal(result.ok, false); assert.match(result.error, /DisplayText4583/); assert.deepEqual(result.state, before);
  }
  assert.deepEqual(state, before);
});
