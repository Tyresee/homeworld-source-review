import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createEstateManor, DEFAULT_MANOR_PLANS } from '../public/js/home-estate-manor.js';
import { createRoofCandidate, roofReviewFloors } from '../public/js/home-roof-candidates.js';
import { getFloorRects } from '../public/js/home-layout.js';

const APPROVED_A_PLANS = { structure: 1, material: 3, decor: 1, detail: 1 };
const wallVolumes = model => {
  const values = [];
  model.traverse(mesh => {
    if (mesh.isMesh && ['wall-volume', 'shell-volume'].includes(mesh.userData.buildingPart)) values.push(mesh);
  });
  return values;
};
const wallColors = model => [...new Set(wallVolumes(model).map(mesh => mesh.material.color.getHexString()))];

function geometrySignature(model, include = () => true) {
  model.updateMatrixWorld(true);
  const values = [];
  model.traverse(mesh => {
    if (!mesh.isMesh || !include(mesh)) return;
    const hash = createHash('sha256');
    for (const name of ['position', 'normal']) hash.update(Buffer.from(mesh.geometry.attributes[name].array.buffer));
    hash.update(JSON.stringify(mesh.matrixWorld.elements));
    values.push(`${mesh.material.color.getHexString()}:${hash.digest('hex')}`);
  });
  return values.sort();
}

function colorBounds(model, color) {
  const bounds = new THREE.Box3();
  model.updateMatrixWorld(true);
  model.traverse(mesh => {
    if (mesh.isMesh && mesh.material.color.getHexString() === color) bounds.union(new THREE.Box3().setFromObject(mesh));
  });
  return [...bounds.min.toArray(), ...bounds.max.toArray()];
}

test('the formal exterior defaults to the entire selected A facade, not only its terracotta roof', () => {
  assert.deepEqual(DEFAULT_MANOR_PLANS, APPROVED_A_PLANS);
  for (const shape of ['starter', 'lshape', 'storeys']) {
    const floors = roofReviewFloors(shape);
    const formal = createEstateManor({ floors });
    const approved = createEstateManor({ floors, plans: APPROVED_A_PLANS });
    try {
      assert.deepEqual(wallColors(formal), ['f4f0e6'], `${shape} uses the approved cream exterior, including every added floor`);
      assert.deepEqual(geometrySignature(formal), geometrySignature(approved), `${shape} preserves the selected wall pattern, windows, trim and roof together`);
    } finally { formal.dispose(); approved.dispose(); }
  }
});

test('the public A preview and formal house show the same cream exterior wall volumes', () => {
  for (const shape of ['starter', 'lshape', 'storeys']) {
    const formal = createEstateManor({ floors: roofReviewFloors(shape) });
    const preview = createRoofCandidate({ id: 'A', shape });
    try {
      const actual = colorBounds(formal, 'f4f0e6'), reference = colorBounds(preview, 'f4f0e6');
      for (let index = 0; index < actual.length; index++) {
        assert.ok(Number.isFinite(reference[index]), 'the selected preview really contains the approved cream wall material');
        assert.ok(Math.abs(actual[index] - reference[index]) < 1e-5, 'preview batching does not change the exterior wall silhouette');
      }
      assert.ok(colorBounds(formal, 'b8784d').every(value => !Number.isFinite(value)), 'the former brown wall body is absent from the default house');
    } finally { formal.dispose(); preview.dispose(); }
  }
});

test('floor expansion and appearance rebuilds keep the A facade on both room and slab shells', () => {
  const floors = roofReviewFloors('storeys');
  const slab = { profile: 'upper', rooms: [], slab: { rects: getFloorRects(floors[1]).map(rect => ({ minX: rect.minX, minZ: rect.minZ, width: rect.maxX - rect.minX, depth: rect.maxZ - rect.minZ })) } };
  const manor = createEstateManor({ floors: roofReviewFloors('starter') });
  try {
    manor.setFloors([floors[0], slab]);
    assert.deepEqual(new Set(wallVolumes(manor).map(mesh => mesh.userData.storey)), new Set([0, 1]));
    assert.deepEqual(new Set(wallVolumes(manor).map(mesh => mesh.userData.buildingPart)), new Set(['wall-volume', 'shell-volume']));
    assert.deepEqual(wallColors(manor), ['f4f0e6']);
    manor.setCustomization({ plans: { decor: 2 }, color: '#497ca9' });
    manor.setFloors(floors);
    manor.setRooms(floors[0].rooms);
    assert.deepEqual(wallColors(manor), ['f4f0e6'], 'adding rooms, changing decor and rebuilding cannot fall back to old wood walls');
    assert.equal(manor.getCustomization().color, '#497ca9', 'wall default does not erase a separately chosen roof color');
    assert.equal(manor.getCustomization().plans.decor, 2);
  } finally { manor.dispose(); }
});

test('explicit wood and stone choices remain available and never replace the selected A roof', () => {
  const floors = roofReviewFloors('starter');
  for (const [material, color] of [[1, 'b8784d'], [2, 'd6bc91']]) {
    const manor = createEstateManor({ floors, plans: { material } });
    try {
      assert.deepEqual(wallColors(manor), [color]);
      const roof = geometrySignature(manor, mesh => mesh.userData.buildingPart === 'roof');
      manor.setCustomization({ plans: { material: 3 } });
      assert.deepEqual(wallColors(manor), ['f4f0e6']);
      assert.deepEqual(geometrySignature(manor, mesh => mesh.userData.buildingPart === 'roof'), roof, 'a wall choice cannot silently change roof geometry or paint');
      manor.setCustomization({ plans: { material } });
      manor.setFloors(floors);
      assert.deepEqual(wallColors(manor), [color], 'an explicit saved wall selection survives a floor rebuild');
    } finally { manor.dispose(); }
  }
});

const rectangularSlab = (width, depth = 5.2) => ({
  rooms: [], slab: { rects: [{ minX: -width / 2, minZ: -depth / 2, width, depth }] },
});
const shellFacades = manor => {
  const values = [];
  manor.traverse(node => {
    if (node.isGroup && node.userData.buildingPart === 'facade' && node.userData.shell) values.push(node);
  });
  return values;
};
const facadeWindows = facade => {
  const values = [];
  facade.traverse(node => { if (node.isGroup && node.userData.buildingPart === 'window') values.push(node); });
  return values;
};

test('purchased starter slabs retain the A reference entrance and paired side windows', () => {
  const manor = createEstateManor({ floors: [rectangularSlab(5.6)] });
  try {
    const facades = shellFacades(manor);
    const front = facades.filter(facade => facade.userData.side === 'front');
    const right = facades.filter(facade => facade.userData.side === 'right');
    assert.equal(front.filter(facade => facade.userData.entrance).length, 1, 'the purchased starter retains one real front entrance');
    assert.equal(front.flatMap(facadeWindows).length, 1, 'the adjacent front window cannot disappear when a slab is saved');
    assert.equal(right.flatMap(facadeWindows).length, 2, 'the side matches the two windows in selected A');
  } finally { manor.dispose(); }
});

test('windows including their sills and shutters fit narrow slab facades without overlapping', () => {
  for (const width of [.25, .7, 1.2, 2.7, 4.5, 4.51, 5.2, 5.6]) {
    for (const decor of [1, 2, 3]) {
      const manor = createEstateManor({ floors: [rectangularSlab(width)], plans: { decor } });
      try {
        manor.updateMatrixWorld(true);
        const facades = shellFacades(manor);
        for (const side of ['front', 'back', 'left', 'right']) {
          const alongX = side === 'front' || side === 'back';
          const axis = alongX ? 'x' : 'z', length = alongX ? width : 5.2;
          const windows = facades.filter(facade => facade.userData.side === side).flatMap(facadeWindows);
          const intervals = windows.map(window => {
            const box = new THREE.Box3().setFromObject(window);
            return [box.min[axis], box.max[axis]];
          }).sort((a, b) => a[0] - b[0]);
          const label = `${width}m / decor ${decor} / ${side}`;
          if (length < .7) assert.equal(intervals.length, 0, `${label}: a sliver cannot support a window`);
          for (let index = 0; index < intervals.length; index++) {
            const [min, max] = intervals[index];
            assert.ok(min >= -length / 2 + .04 - 1e-5, `${label}: complete window must clear the left facade edge`);
            assert.ok(max <= length / 2 - .04 + 1e-5, `${label}: complete window must clear the right facade edge`);
            assert.ok(max > min, `${label}: window bounds remain finite and positive`);
            if (index) assert.ok(min - intervals[index - 1][1] >= .08 - 1e-5, `${label}: neighboring frames, sills and shutters cannot overlap`);
          }
        }
      } finally { manor.dispose(); }
    }
  }
});
