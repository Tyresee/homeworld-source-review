import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createLuxuryItem} from '../public/js/home-luxury-models.js';
import {accountCatalog, createAccountCommerce, prepareCommerceCommand} from '../server/student-homes/commerce.mjs';

const expected = [
  {kind:'bdSplitToilet', price:800, tier:'essential'},
  {kind:'compactToilet', price:1000, tier:'essential'},
  {kind:'bdMonoblocToilet', price:1500, tier:'comfort'},
  {kind:'bdSmartToilet', price:2800, tier:'signature'},
];
const products = expected.map(row => accountCatalog().find(product => product.kind === row.kind));
const modelFor = product => createLuxuryItem({kind:product.kind, color:product.color, material:product.material});
function release(model) {
  model.traverse(child => {
    child.geometry?.dispose();
    for (const material of [].concat(child.material ?? [])) material.dispose();
  });
}

test('all four existing toilets retain their SKU and tier with the classroom price schedule in the real account catalog', () => {
  for (const [index, product] of products.entries()) {
    assert.ok(product, expected[index].kind);
    assert.equal(product.productType, 'furniture');
    assert.equal(product.price, expected[index].price);
    assert.equal(product.tier, expected[index].tier);
    assert.equal(product.placement, 'floor');
  }
  assert.equal(new Set(products.map(product => product.skuId)).size, 4);
  const checkout = prepareCommerceCommand(createAccountCommerce(), {
    type:'checkout', lines:products.map(product => ({skuId:product.skuId, quantity:1})),
  }, 'qa-toilet-checkout');
  assert.equal(checkout.amount, 6100);
  assert.equal(checkout.commerce.owned.length, 4);
  let state = checkout.commerce;
  for (const [index, owned] of state.owned.entries()) {
    const result = prepareCommerceCommand(state, {
      type:'placeItem', id:owned.id, pose:{x:index % 2 ? 1 : -1, z:index < 2 ? -1.1 : 1.1, rotation:0}, storey:0,
    }, `qa-toilet-place-${index}`);
    assert.equal(result.amount, 0);
    state = result.commerce;
  }
  assert.equal(state.owned.filter(owned => owned.status === 'placed').length, 4);
  assert.equal(state.home.furniture.length, 4);
});

test('toilet meshes fit their collision volumes in every rotation and have recessed bowl openings', () => {
  for (const product of products) {
    const model = modelFor(product);
    try {
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model);
      assert.ok(Math.abs(bounds.min.y) < 1e-7, `${product.kind}: grounded`);
      let seat;
      model.traverse(child => {
        if (child.geometry?.type === 'TorusGeometry') seat ??= child;
        if (child.userData.part === 'toilet-seat-ring') seat = child;
      });
      assert.ok(seat, `${product.kind}: seat ring exists`);
      const center = seat.getWorldPosition(new THREE.Vector3());
      for (const [dx, dz] of [[0, 0], [.04, 0], [-.04, 0], [0, .06]]) {
        const ray = new THREE.Raycaster(center.clone().add(new THREE.Vector3(dx, 1, dz)), new THREE.Vector3(0, -1, 0));
        assert.equal(ray.intersectObject(seat, false).length, 0, `${product.kind}: open seat aperture`);
        const hit = ray.intersectObject(model, true)[0];
        assert.ok(hit && hit.point.y < center.y - .075, `${product.kind}: visible interior below seat`);
      }
      for (let angle = 0; angle < 360; angle += 45) {
        const radians = THREE.MathUtils.degToRad(angle);
        model.rotation.y = radians;
        model.updateMatrixWorld(true);
        const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
        assert.ok(size.x <= Math.abs(Math.cos(radians)) * product.width + Math.abs(Math.sin(radians)) * product.depth + 1e-7, `${product.kind}: rotated width ${angle}`);
        assert.ok(size.z <= Math.abs(Math.sin(radians)) * product.width + Math.abs(Math.cos(radians)) * product.depth + 1e-7, `${product.kind}: rotated depth ${angle}`);
        assert.ok(size.y <= product.height + 1e-7, `${product.kind}: height ${angle}`);
      }
    } finally { release(model); }
  }
});

function silhouette(model) {
  // A fixed isometric camera and a monochrome hit mask check structural changes,
  // rather than accepting different paint colors as distinct toilet tiers.
  const camera = new THREE.OrthographicCamera(-.8, .8, .8, -.8, .01, 20);
  camera.position.set(3, 2.8, 4);
  camera.lookAt(0, .48, 0);
  camera.updateMatrixWorld(true);
  model.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(), mask = [];
  for (let row = 0; row < 36; row++) for (let column = 0; column < 36; column++) {
    ray.setFromCamera(new THREE.Vector2((column + .5) / 18 - 1, 1 - (row + .5) / 18), camera);
    mask.push(ray.intersectObject(model, true).length > 0);
  }
  return mask;
}

test('essential, comfort and smart toilets remain visibly different without their colors', () => {
  const tierProducts = ['bdSplitToilet', 'bdMonoblocToilet', 'bdSmartToilet'].map(kind => products.find(product => product.kind === kind));
  const masks = tierProducts.map(product => {
    const model = modelFor(product);
    try { return silhouette(model); } finally { release(model); }
  });
  for (let first = 0; first < masks.length; first++) for (let second = first + 1; second < masks.length; second++) {
    let union = 0, different = 0;
    masks[first].forEach((filled, index) => {
      if (filled || masks[second][index]) union++;
      if (filled !== masks[second][index]) different++;
    });
    assert.ok(different / union >= .09, `${tierProducts[first].kind} vs ${tierProducts[second].kind}: silhouette difference ${different / union}`);
  }
});
