/** Collision geometry comes from the same CPU models as the visible home.
 * No renderer, DOM, textures or GPU resources are created here. Motion and
 * paint color are deliberately excluded from the bounded model caches.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createStaticUpgrade, STATIC_UPGRADE_SURFACES, BASE_MATERIALS } from './home-static-upgrades.js';
import { createLuxuryItem } from './home-luxury-models.js';
import { createRoomExpansion } from './home-room-expansion.js';
import { resolveRooms, hasStarterRoom } from './home-layout.js';
import { getStaircaseVolume, getHomeStairs } from './home-staircase.js';

const freezeBlocks = blocks => Object.freeze(blocks.map(block => Object.freeze({ ...block, size: Object.freeze(block.size), position: Object.freeze(block.position) })));
/** Shared with the living-room renderer; floor slabs are not obstructions. */
export const STARTER_WALL_BLOCKS = freezeBlocks([
  { id: 'back-body', objectId: 'wall', surfaceId: null, color: '#ccbca4', size: [5.78, 2.95, .23], position: [0, 1.44, -2.63], radius: .07 },
  { id: 'back-cornice', objectId: 'wall', surfaceId: null, color: '#e0cfad', size: [5.82, .11, .29], position: [0, 2.91, -2.63], radius: .025 },
  { id: 'back-skirting', objectId: 'wall', surfaceId: null, color: '#fbf0d8', size: [5.63, .14, .06], position: [0, .15, -2.46], radius: .02 },
  { id: 'side-body', objectId: 'sidewall', surfaceId: 'wall.side', color: '#d0dcca', size: [.22, 2.95, 5.36], position: [-2.81, 1.44, -.08], radius: .065 },
  { id: 'side-skirting', objectId: 'sidewall', surfaceId: null, color: '#f8edd7', size: [.06, .14, 5.25], position: [-2.67, .15, -.08], radius: .018 },
  { id: 'side-cornice', objectId: 'sidewall', surfaceId: null, color: '#dce4d2', size: [.28, .11, 5.45], position: [-2.81, 2.91, -.08], radius: .025 },
]);
const LABELS = { wall: "DisplayText0483", sidewall: "DisplayText0484", window: "DisplayText0485", shelf: "DisplayText0486" };
const cache = new Map(), homeCache = new Map(), MAX_CACHE = 128;
function cached(map, key, build, max = MAX_CACHE) {
  if (map.has(key)) { const value = map.get(key); map.delete(key); map.set(key, value); return value; }
  const value = build(); map.set(key, value);
  if (map.size > max) map.delete(map.keys().next().value);
  return value;
}
function disposeModel(model) {
  if (typeof model.dispose === 'function') { model.dispose(); return; }
  const geometries = new Set(), materials = new Set();
  model.traverse(mesh => { if (mesh.geometry) geometries.add(mesh.geometry); for (const m of [].concat(mesh.material ?? [])) materials.add(m); });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
const ranges = bounds => Object.freeze({ minX: bounds.min.x, maxX: bounds.max.x, minY: bounds.min.y, maxY: bounds.max.y, minZ: bounds.min.z, maxZ: bounds.max.z });
function meshVolumes(model, prefix, metadata = {}, include = () => true) {
  model.updateWorldMatrix(true, true);
  const volumes = [];
  model.traverse(mesh => {
    if (!mesh.isMesh || !include(mesh)) return;
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
    if (box.isEmpty()) return;
    const bounds = ranges(box), surfaceId = mesh.userData.surfaceId ?? metadata.surfaceId;
    const identity = Object.values(bounds).map(n => n.toFixed(5)).join(':');
    volumes.push(Object.freeze({ ...metadata, surfaceId,
      ...(mesh.userData.roomPart ? { roomPart: mesh.userData.roomPart } : {}),
      ...(mesh.name ? { meshName: mesh.name } : {}),
      id: `${prefix}:${identity}`, ...bounds }));
  });
  return Object.freeze(volumes);
}
function aggregate(volumes) {
  if (!volumes.length) return null;
  return Object.freeze({ minX: Math.min(...volumes.map(v => v.minX)), maxX: Math.max(...volumes.map(v => v.maxX)),
    minY: Math.min(...volumes.map(v => v.minY)), maxY: Math.max(...volumes.map(v => v.maxY)),
    minZ: Math.min(...volumes.map(v => v.minZ)), maxZ: Math.max(...volumes.map(v => v.maxZ)) });
}
function staticConfig(objectId, state) {
  const level = state.upgrades?.[objectId] ?? 1;
  const plans = Object.fromEntries(['structure', 'material', 'decor', 'detail'].map(d => [d, state.plans?.[objectId]?.[d] ?? level]));
  const surfaces = Object.fromEntries((STATIC_UPGRADE_SURFACES[objectId] ?? []).map(id => [id, { material: state.surfaces?.[id]?.material ?? BASE_MATERIALS[objectId] }]));
  return { objectId, level, plans, surfaces };
}
function staticVolumes(objectId, state) {
  const config = staticConfig(objectId, state), key = `static:${JSON.stringify(config)}`;
  return cached(cache, key, () => {
    const model = createStaticUpgrade(config);
    try { return meshVolumes(model, `building:${objectId}:upgrade`, { objectId, label: LABELS[objectId] ?? objectId, surfaceId: STATIC_UPGRADE_SURFACES[objectId]?.[0] }); }
    finally { disposeModel(model); }
  });
}
/** Local-space upgrade envelope, before any parent transform. */
export function getStaticUpgradeCollisionBounds(objectId, state) { return aggregate(staticVolumes(objectId, state)); }

/** A box enclosing the actual local model, including every chosen upgrade. */
export function getLuxuryCollisionBounds(item) {
  const config = { kind: item.kind, material: item.material ?? 'ceramic', level: item.level ?? 1, plans: item.plans };
  return cached(cache, `luxury:${JSON.stringify(config)}`, () => {
    const model = createLuxuryItem(config);
    try { return ranges(new THREE.Box3().setFromObject(model)); }
    finally { disposeModel(model); }
  });
}

/** Positive-volume overlap. Touching faces are allowed; no 2D height shortcut. */
export function overlapBuildingVolume(a, b, gap = 0) {
  const eps = 1e-7;
  return a.minX < b.maxX + gap - eps && a.maxX > b.minX - gap + eps
    && a.minY < b.maxY + gap - eps && a.maxY > b.minY - gap + eps
    && a.minZ < b.maxZ + gap - eps && a.maxZ > b.minZ - gap + eps;
}

const BASE_VOLUMES = Object.freeze(STARTER_WALL_BLOCKS.map(block => {
  const [x, y, z] = block.position, [w, h, d] = block.size;
  return Object.freeze({ id: `building:${block.id}`, objectId: block.objectId, label: LABELS[block.objectId], surfaceId: block.surfaceId ?? (block.objectId === 'wall' ? 'wall.inner' : 'wall.side'),
    minX: x - w / 2, maxX: x + w / 2, minY: y - h / 2, maxY: y + h / 2, minZ: z - d / 2, maxZ: z + d / 2 });
}));

/** Attached fixtures move out with the skin they are mounted on. The wall
 * height band matters: a low skirting must not push a high wall shelf out. */
export function getWallAttachmentOffset(state, objectId) {
  if (objectId === 'window') {
    const panels = staticVolumes('sidewall', state).filter(v => v.minY < 3 && v.maxY > .90 && v.minZ < .40 && v.maxZ > -2.20);
    return { x: Math.max(0, ...panels.map(v => v.maxX + 2.70)), y: 0, z: 0 };
  }
  if (objectId === 'shelf') {
    const panels = staticVolumes('wall', state).filter(v => v.minY < 2.52 && v.maxY > 1.34 && v.minX < -.55 && v.maxX > -2.15);
    return { x: 0, y: 0, z: Math.max(0, ...panels.map(v => v.maxZ + 2.504)) };
  }
  return { x: 0, y: 0, z: 0 };
}

// Exact primitive envelopes of the original mounted window and shelf. The
// curved plant uses the same primitive transforms as the visible scene.
function fixtureBase(objectId) {
  return cached(cache, `base-fixture:${objectId}`, () => {
    const group = new THREE.Group(), material = new THREE.MeshBasicMaterial();
    const add = (geometry, position, scale, rotation) => { const m = new THREE.Mesh(geometry, material); m.position.set(...position); if (scale) m.scale.set(...scale); if (rotation) m.rotation.set(...rotation); group.add(m); return m; };
    const box = (size, pos, radius = .06) => add(new RoundedBoxGeometry(...size, 3, Math.min(radius, ...size.map(n => n / 2))), pos);
    const ball = (pos, scale, rotation) => add(new THREE.SphereGeometry(1, 20, 14), pos, scale, rotation);
    const cylinder = (rt, rb, h, pos, rotation) => add(new THREE.CylinderGeometry(rt, rb, h, 28), pos, null, rotation);
    if (objectId === 'window') {
      box([1.44, 1.46, .06], [0, 0, .015], .12); box([1.24, 1.26, .025], [0, 0, .055], .1);
      ball([.28, .34, .077], [.19, .19, .014]);
      for (const [x, y, w] of [[-.3, -.25, .32], [.2, -.42, .43]]) ball([x, y, .087], [w, .29, .02]);
      for (const x of [-.7, .7]) box([.1, 1.5, .13], [x, 0, .14], .025);
      for (const y of [-.72, .72]) box([1.5, .1, .13], [0, y, .14], .025);
      box([.065, 1.36, .12], [0, 0, .16], .015); box([1.38, .065, .12], [0, 0, .16], .015);
      box([1.72, .13, .35], [0, -.78, .18], .04);
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) box([.105, 1.55 - i * .05, .16], [side * (.83 + i * .1), -.05, .14], .04);
      cylinder(.025, .025, 2.4, [0, .87, .16], [0, 0, Math.PI / 2]);
    } else {
      box([1.44, .12, .40], [-1.35, 1.78, -2.29], .04);
      for (let i = 0; i < 4; i++) box([.14, .40 + i * .035, .24], [-1.78 + i * .18, 2.02, -2.31], .018);
      const p = (x, y, z) => [-.84 + x * .56, 1.85 + y * .56, -2.3 + z * .56];
      cylinder(.20 * .56, .15 * .56, .32 * .56, p(0, .16, 0)); cylinder(.22 * .56, .22 * .56, .065 * .56, p(0, .31, 0)); cylinder(.018 * .56, .023 * .56, .62 * .56, p(0, .64, 0));
      for (let i = 0; i < 7; i++) { const a = i * 2.4; ball(p(Math.cos(a) * .14, .44 + i * .065, Math.sin(a) * .14), [.11 * .56, .23 * .56, .05 * .56], [.5 * Math.sin(a), a, .7 * Math.cos(a)]); }
    }
    try { return meshVolumes(group, `building:${objectId}:base`, { objectId, label: LABELS[objectId], surfaceId: objectId === 'window' ? 'window.frame' : 'shelf.main' }); }
    finally { disposeModel(group); }
  });
}
function transformVolume(v, matrix) {
  const box = new THREE.Box3(new THREE.Vector3(v.minX, v.minY, v.minZ), new THREE.Vector3(v.maxX, v.maxY, v.maxZ)).applyMatrix4(matrix);
  return Object.freeze({ ...v, ...ranges(box) });
}
function fixtureVolumes(state, objectId) {
  const offset = getWallAttachmentOffset(state, objectId), matrix = new THREE.Matrix4();
  if (objectId === 'window') matrix.makeRotationY(Math.PI / 2).setPosition(-2.675 + offset.x, 1.76, -.9);
  else matrix.makeTranslation(0, 0, offset.z);
  return [...fixtureBase(objectId), ...staticVolumes(objectId, state)].map(v => transformVolume(v, matrix));
}

function expansionVolumes(state,rooms) {
  const key = `expansion:${JSON.stringify([state.profile,state.slab,getHomeStairs(state),rooms.map(r => [r.id,r.kind,r.cx,r.cz,r.bounds])])}`;
  return cached(cache, key, () => {
    if (rooms.length <= 1 && !state.slab) return Object.freeze([]);
    const model = createRoomExpansion({ rooms, slab:state.slab, profile:state.profile, stairs:getHomeStairs(state), includeWalls: true, includeGrid: false });
    try {
      return Object.freeze(meshVolumes(model, 'building:room', { objectId: 'room', label: "DisplayText0487" }, mesh => ['walls', 'windows', 'columns', 'border'].includes(mesh.userData.roomPart))
        // The plinth below the floor is support, not an obstructing wall.
        .filter(volume => volume.maxY > .11 + 1e-6));
    } finally { disposeModel(model); }
  });
}

/** Immutable world AABBs per wall component, preserving openings and heights.
 * Never one maximum-inset rectangle for an entire room: a cornice, window
 * sill and waist-high panel occupy their own actual height ranges.
 */
export function getHomeBuildingVolumes(state) {
  const rooms = state.rooms ?? resolveRooms(state.roomTier ?? 'starter');
  const key = JSON.stringify([state.profile,getHomeStairs(state),state.slab,['wall', 'sidewall', 'window', 'shelf'].map(id => staticConfig(id, state)), rooms.map(r => [r.id, r.kind, r.cx, r.cz,r.bounds])]);
  return cached(homeCache, key, () => {
    const stairVolumes = getHomeStairs(state).map(getStaircaseVolume).filter(Boolean);
    const core=hasStarterRoom({...state,rooms});
    const volumes = [...(core?[...BASE_VOLUMES, ...staticVolumes('wall', state), ...staticVolumes('sidewall', state), ...fixtureVolumes(state, 'window'),
      ...(state.profile==='upper'?[]:fixtureVolumes(state, 'shelf'))]:[]), ...expansionVolumes(state,rooms), ...stairVolumes];
    return Object.freeze(volumes);
  }, 32);
}
