import {areKitchenModulesCompatible} from './home-kitchen-fit.js';
/** Local-only furnishing rules. No student identity, network or browser storage. */
import {
  ROOM_KINDS, getRoomKind, roomRect, isLayoutValid, getRoomSlots, findContainingRoom, clampToRoom,
  createRoom, nextRoomId, getLayoutPreset, LAYOUT_PRESETS, resolveRooms, cloneRooms, describeLayout, layoutBounds,
  findRoomAt, MAX_ROOMS, getFloorRects, getFloorBounds, getFloorBoundarySegments, getFloorArea, floorContainsRect, floorContainsFootprint, hasStarterRoom, isSlabValid, isRoomSizeValid,
} from './home-layout.js';
import { EXTRA_SHOP_ITEMS } from './home-shop-catalog.js';
import { getFurniturePose, getFurnitureMountBounds, getWallMountTargets, getFurniturePlacement, isFurnitureMountValid } from './home-item-placement.js';
export { getFurniturePose, getFurnitureMountBounds, getWallMountTargets, getFurniturePlacement };
export { getFurniturePlacementType } from './home-item-placement.js';
import { getHomeBuildingVolumes, getLuxuryCollisionBounds, getStaticUpgradeCollisionBounds, overlapBuildingVolume } from './home-building-collision.js';
import { getStaircaseVolume, isStaircaseValid, getHomeStairs, areHomeStairsValid } from './home-staircase.js';
export { getStaircaseVolume, isStaircaseValid, getHomeStairs, areHomeStairsValid } from './home-staircase.js';

export { ROOM_KINDS, getRoomKind, roomRect, getRoomSlots, findRoomAt, describeLayout, layoutBounds, MAX_ROOMS, LAYOUT_PRESETS, getFloorRects, getFloorBounds, getFloorBoundarySegments, getFloorArea, floorContainsRect, hasStarterRoom };
const freezeRows = rows => Object.freeze(rows.map(row => Object.freeze(row)));

export const PALETTE = freezeRows([
  { id: 'cream', label: "DisplayText0753", color: '#f7ead7' },
  { id: 'oak', label: "DisplayText0754", color: '#c99362' },
  { id: 'coral', label: "DisplayText0755", color: '#eeaaa4' },
  { id: 'mint', label: "DisplayText0756", color: '#a6cbb6' },
  { id: 'sky', label: "DisplayText0757", color: '#a7c8e5' },
  { id: 'lilac', label: "DisplayText0758", color: '#c6b6d9' },
  { id: 'sun', label: "DisplayText0759", color: '#efcf77' },
  { id: 'cocoa', label: "DisplayText0760", color: '#78533e' },
]);
export const MATERIALS = freezeRows([
  { id: 'oak', label: "DisplayText0761" }, { id: 'stone', label: "DisplayText0762" }, { id: 'ceramic', label: "DisplayText0763" },
  { id: 'walnut', label: "DisplayText0764" }, { id: 'marble', label: "DisplayText0765" }, { id: 'gold', label: "DisplayText0766" },
  { id: 'wool', label: "DisplayText0767" }, { id: 'linen', label: "DisplayText0768" }, { id: 'velvet', label: "DisplayText0769" },
]);
export const UPGRADE_PLAN_DIMENSIONS = Object.freeze(['structure', 'material', 'decor', 'detail']);
export const SURFACES = freezeRows([
  { id: 'wall.inner', label: "DisplayText0483", objectId: 'wall', paintCost: 4, kind: 'wall' },
  { id: 'wall.outer', label: "DisplayText0770", objectId: 'wall', paintCost: 4, kind: 'wall' },
  { id: 'table.top', label: "DisplayText0771", objectId: 'table', paintCost: 2, kind: 'table' },
  { id: 'table.edge', label: "DisplayText0772", objectId: 'table', paintCost: 1, kind: 'table' },
  { id: 'table.legs', label: "DisplayText0773", objectId: 'table', paintCost: 4, kind: 'table' },
  { id: 'floor.main', label: "DisplayText0774", objectId: 'floor', paintCost: 6, kind: 'floor' },
  { id: 'wall.side', label: "DisplayText0484", objectId: 'sidewall', paintCost: 4, kind: 'wall' },
  { id: 'window.frame', label: "DisplayText0485", objectId: 'window', paintCost: 2, kind: 'object' },
  { id: 'shelf.main', label: "DisplayText0775", objectId: 'shelf', paintCost: 2, kind: 'object' },
  { id: 'stool.main', label: "DisplayText0247", objectId: 'stool', paintCost: 2, kind: 'object' },
  { id: 'plant.pot', label: "DisplayText0776", objectId: 'plant', paintCost: 1, kind: 'object' },
  { id: 'toy.body', label: "DisplayText0777", objectId: 'toy', paintCost: 1, kind: 'object' },
  { id: 'rug.main', label: "DisplayText0778", objectId: 'rug', paintCost: 2, kind: 'object' },
]);
export const DECAL_KINDS = Object.freeze(['star', 'flower', 'heart', 'diamond', 'crown']);
export const PROP_KINDS = Object.freeze(['vase', 'lamp', 'candelabra', 'gem', 'musicbox']);
export const FURNITURE_ITEMS = freezeRows([
  { id: 'sofa', label: "DisplayText0779", width: 1.93, depth: 1.05, defaultColor: '#eeaaa4' },
  { id: 'bed', label: "DisplayText0780", width: 1.55, depth: 1.50, defaultColor: '#c6b6d9' },
  { id: 'cabinet', label: "DisplayText0781", width: 1.35, depth: 0.55, defaultColor: '#c99362' },
  { id: 'bookcase', label: "DisplayText0782", width: 1.35, depth: 0.55, defaultColor: '#78533e' },
  { id: 'rug', label: "DisplayText0778", width: 1.90, depth: 1.35, defaultColor: '#a6cbb6' },
  { id: 'plant', label: "DisplayText0249", width: 0.75, depth: 0.75, defaultColor: '#91ac77' },
  { id: 'chandelier', label: "DisplayText0783", width: 1.1, depth: 1.1, defaultColor: '#d4b26a' },
  { id: 'statue', label: "DisplayText0784", width: 0.78, depth: 0.72, defaultColor: '#dadbd1' },
  ...EXTRA_SHOP_ITEMS,
]);
export const FURNITURE_KINDS = Object.freeze(FURNITURE_ITEMS.map(item => item.id));
export const HOME_LIMITS = Object.freeze({
  uvMin: 0.05, uvMax: 0.95, decalSizeMin: 0.08, decalSizeMax: 0.30,
  defaultDecalSize: 0.17, propRadius: 0.08, tableMin: -1.1, tableMax: 1.1,
  rotationMin: -360, rotationMax: 360, roomHalfWidth: 2.8, roomHalfDepth: 2.6,
  minLevel: 1, maxLevel: 3, maxRooms: MAX_ROOMS,
  // Rendering guards, not currencies, construction quotas or progression caps.
  maxDecals: 512, maxProps: 128, maxFurniture: 128, maxPaint: 1_000_000,
});
const STATIC_OBJECT_IDS = Object.freeze(['wall', 'sidewall', 'floor', 'table', 'window', 'shelf', 'stool', 'plant', 'toy', 'rug']);
const PLACED_OBJECT_IDS = Object.freeze(['plant', 'toy', 'rug', 'stool']);
const UPPER_ABSENT_OBJECTS = new Set(['table', 'shelf', 'stool', 'plant', 'toy', 'rug']);
const DEFAULT_PLACEMENTS = Object.freeze({
  plant: Object.freeze({ x: -2.43, z: 2.30 }), toy: Object.freeze({ x: 2.02, z: -1.44 }),
  rug: Object.freeze({ x: .28, z: .58 }), stool: Object.freeze({ x: 2.42, z: 2.4 }),
});
/** Legacy single-click expansion presets, now expressed as full floor plans. */
export const ROOM_TIERS = Object.freeze(LAYOUT_PRESETS.map(presetItem => {
  const bounds = layoutBounds(presetItem.rooms);
  return Object.freeze({ id: presetItem.id, label: presetItem.label, shortLabel: presetItem.shortLabel, description: presetItem.description,
    width: Number(bounds.width.toFixed(2)), depth: Number(bounds.depth.toFixed(2)), rooms: presetItem.rooms });
}));
const ROOM_TIER_IDS = new Set(ROOM_TIERS.map(tier => tier.id));
const SURFACE_BY_ID = new Map(SURFACES.map(surface => [surface.id, surface]));
const FURNITURE_BY_ID = new Map(FURNITURE_ITEMS.map(item => [item.id, item]));
const ROOM_SURFACE_LABELS = Object.freeze({ floor: "DisplayText0774", wall: "DisplayText0785" });
const ROOM_SURFACE_COST = 4;
// Collision footprints below reflect the visible models and are deliberately a little conservative.
const PLACEMENT_EXTENTS = Object.freeze({ plant: Object.freeze({ x: .28, z: .28 }), toy: Object.freeze({ x: .34, z: .3 }), rug: Object.freeze({ x: 1.9, z: 1.5 }), stool: Object.freeze({ x: .2, z: .15 }) });
const PLACEMENT_COLLISION_EXTENTS = Object.freeze({ plant: Object.freeze({ x: .39, z: .39 }), toy: Object.freeze({ x: .39, z: .37 }), rug: Object.freeze({ x: 1.98, z: 1.50 }), stool: Object.freeze({ x: .375, z: .31 }) });
const TABLE_FOOTPRINT = Object.freeze({ halfX: 1.125, halfZ: .675 });
const COLLISION_GAP = .06;
export function getTableFootprint(rotation = 0) {
  if (!isRotation(rotation)) return null;
  const radians = rotation * Math.PI / 180;
  return { halfX: (Math.abs(Math.cos(radians)) * 2.25 + Math.abs(Math.sin(radians)) * 1.35) / 2,
    halfZ: (Math.abs(Math.sin(radians)) * 2.25 + Math.abs(Math.cos(radians)) * 1.35) / 2 };
}
const MATERIAL_IDS = new Set(MATERIALS.map(material => material.id));
const PREVIOUS_V2_MATERIALS = new Set(['oak', 'stone', 'ceramic', 'walnut', 'marble', 'gold']);
const V1_SURFACES = SURFACES.slice(0, 5);
const V1_MATERIALS = new Set(['oak', 'stone', 'ceramic']);
const DECAL_SURFACES = new Set(['wall.inner', 'wall.outer', 'wall.side', 'floor.main', 'table.top']);
const V1_DECAL_SURFACES = new Set(['wall.inner', 'wall.outer', 'table.top']);
const PROP_COLORS = Object.freeze({ vase: '#c98972', lamp: '#f1d191', candelabra: '#d4b26a', gem: '#a7c8e5', musicbox: '#b48372' });
const DEFAULT_SURFACES = Object.freeze({
  'wall.inner': { color: '#f7ead7', material: 'ceramic' }, 'wall.outer': { color: '#f7ead7', material: 'ceramic' },
  'table.top': { color: '#c99362', material: 'oak' }, 'table.edge': { color: '#c99362', material: 'oak' },
  'table.legs': { color: '#c99362', material: 'oak' }, 'floor.main': { color: '#e7cfaa', material: 'oak' },
  'wall.side': { color: '#d0dcca', material: 'ceramic' }, 'window.frame': { color: '#faf0d7', material: 'oak' },
  'shelf.main': { color: '#cda67c', material: 'oak' }, 'stool.main': { color: '#daae87', material: 'oak' },
  'plant.pot': { color: '#d79d7c', material: 'ceramic' }, 'toy.body': { color: '#f8e4c9', material: 'ceramic' },
  'rug.main': { color: '#d9e3d3', material: 'ceramic' },
});
const EPSILON = 1e-9;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const isNumberIn = (value, min, max) => typeof value === 'number' && Number.isFinite(value)
  && value >= min - EPSILON && value <= max + EPSILON;
const isHex = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
const isId = value => typeof value === 'string' && /^[a-z\d_.:-]{1,96}$/i.test(value);
const hasOnlyKeys = (value, keys) => Object.keys(value).every(key => keys.includes(key));
const isRotation = value => isNumberIn(value, HOME_LIMITS.rotationMin, HOME_LIMITS.rotationMax);
const normalizeRotation = value => ((value % 360) + 360) % 360;
const isLevel = value => Number.isInteger(value) && value >= HOME_LIMITS.minLevel && value <= HOME_LIMITS.maxLevel;
const createPlan = (level = 1) => ({ structure: level, material: 1, decor: level, detail: level });
const isPlan = value => isRecord(value) && Object.keys(value).length === UPGRADE_PLAN_DIMENSIONS.length
  && hasOnlyKeys(value, UPGRADE_PLAN_DIMENSIONS) && UPGRADE_PLAN_DIMENSIONS.every(key => isLevel(value[key]));
const failure = (error, collision) => ({ ok: false, error, ...(collision ? { collision } : {}) });
const noop = state => ({ ok: true, state, cost: 0, changed: false });
const equalItem = (a, b) => a !== undefined && Object.keys(b).every(key => key === 'plans'
  ? UPGRADE_PLAN_DIMENSIONS.every(dimension => a.plans?.[dimension] === b.plans[dimension]) : key === 'mount' ? JSON.stringify(a.mount) === JSON.stringify(b.mount) : a[key] === b[key]);

/** Bounds include the rotated sticker's entire square footprint. */
export function getDecalBounds(size, rotation = 0) {
  if (!isNumberIn(size, HOME_LIMITS.decalSizeMin, HOME_LIMITS.decalSizeMax) || !isRotation(rotation)) return null;
  const radians = rotation * Math.PI / 180;
  const extent = size * (Math.abs(Math.cos(radians)) + Math.abs(Math.sin(radians))) / 2;
  const min = HOME_LIMITS.uvMin + extent, max = HOME_LIMITS.uvMax - extent;
  return { minU: min, maxU: max, minV: min, maxV: max };
}
export function getPropBounds() {
  const min = HOME_LIMITS.uvMin + HOME_LIMITS.propRadius, max = HOME_LIMITS.uvMax - HOME_LIMITS.propRadius;
  return { minU: min, maxU: max, minV: min, maxV: max };
}
/**
 * `scope` may be a preset id, a rooms array (union of the layout), a single
 * room record or a rectangle. Precise validity is per room: a footprint must
 * sit entirely inside one room, see `findFurnitureRoom`.
 */
const LEGACY_TIER_RECTS = Object.freeze(Object.fromEntries(Object.entries({ starter: [5.6, 5.2], suite: [7.2, 6.2], atrium: [9.6, 7.4], mansion: [13.2, 9.6] })
  .map(([id, [width, depth]]) => [id, Object.freeze({ minX: -width / 2, maxX: width / 2, minZ: -depth / 2, maxZ: depth / 2, width, depth })])));
// v2 used these footprints before the models were widened (catalog 771a6ca).
// A valid old wall-side item must reach migration before today's larger
// footprint is used to relocate it. Keep this separate from live placement.
const LEGACY_FURNITURE_SIZES = Object.freeze({
  sofa: [1.65, .8], bed: [1.25, 1.35], cabinet: [1.1, .55], bookcase: [1.05, .42],
  rug: [1.65, 1.15], plant: [.62, .62], chandelier: [1.1, 1.1], statue: [.68, .62],
});
function legacyFurnitureBounds(kind, rotation, roomTier) {
  const size = LEGACY_FURNITURE_SIZES[kind], rect = LEGACY_TIER_RECTS[roomTier];
  if (!size || !rect || !isRotation(rotation)) return null;
  const a = rotation * Math.PI / 180;
  const halfX = (Math.abs(Math.cos(a)) * size[0] + Math.abs(Math.sin(a)) * size[1]) / 2;
  const halfZ = (Math.abs(Math.sin(a)) * size[0] + Math.abs(Math.cos(a)) * size[1]) / 2;
  return { minX: rect.minX + halfX, maxX: rect.maxX - halfX, minZ: rect.minZ + halfZ, maxZ: rect.maxZ - halfZ };
}
function scopeRect(scope) {
  if (scope && typeof scope === 'object' && !Array.isArray(scope)) return scope.kind ? roomRect(scope) : scope.rooms ? getFloorBounds(scope) : scope;
  // Tier ids describe the old centred rectangles so v2 saves validate against their real envelope.
  if (typeof scope === 'string') return LEGACY_TIER_RECTS[scope] ?? LEGACY_TIER_RECTS.starter;
  return layoutBounds(resolveRooms(scope));
}
export function getFurnitureBounds(kind, rotation = 0, scope = 'starter') {
  const footprint = getFurnitureFootprint(kind, rotation);
  const rect = footprint && scopeRect(scope);
  if (!rect) return null;
  return { minX: rect.minX + footprint.halfX, maxX: rect.maxX - footprint.halfX,
    minZ: rect.minZ + footprint.halfZ, maxZ: rect.maxZ - footprint.halfZ };
}
/** Axis-aligned collision half extents for the visible furniture footprint. */
export function getFurnitureFootprint(kind, rotation = 0) {
  const item = FURNITURE_BY_ID.get(kind);
  if (!item || !isRotation(rotation)) return null;
  const a = rotation * Math.PI / 180;
  return { halfX: (Math.abs(Math.cos(a)) * item.width + Math.abs(Math.sin(a)) * item.depth) / 2,
    halfZ: (Math.abs(Math.sin(a)) * item.width + Math.abs(Math.cos(a)) * item.depth) / 2 };
}
export function getPlacementFootprint(objectId) {
  const extent = PLACEMENT_COLLISION_EXTENTS[objectId];
  return extent ? { halfX: extent.x, halfZ: extent.z } : null;
}
const placementEnvelope = (objectId, placement) => { const extent = PLACEMENT_EXTENTS[objectId] ?? { x: .2, z: .2 }; return { x: placement.x, z: placement.z, halfX: extent.x, halfZ: extent.z }; };
/** Legal centre range for a placed object inside `scope` (room, rect, rooms array or tier id). */
export function getPlacementBounds(objectId, scope = 'starter') {
  const extent = PLACEMENT_EXTENTS[objectId];
  const rect = extent && scopeRect(scope);
  if (!rect) return null;
  return { minX: rect.minX + extent.x, maxX: rect.maxX - extent.x, minZ: rect.minZ + extent.z, maxZ: rect.maxZ - extent.z };
}
/** The room that fully contains a furniture item, or null when it straddles rooms. */
export function findFurnitureRoom(rooms, item) {
  const footprint = getFurnitureFootprint(item.kind, item.rotation ?? 0);
  return footprint ? findContainingRoom(rooms, { x: item.x, z: item.z, ...footprint }) : null;
}
/** Nearest legal centre inside `room` for a footprint, or null if it cannot fit. */
export function clampFootprintToRoom(room, footprint) { return clampToRoom(room, footprint); }
const overlaps = (a, b, gap = (a.kind === 'sofa' || b.kind === 'sofa' || areKitchenModulesCompatible(a,b) ? 0 : COLLISION_GAP)) => Math.abs(a.x - b.x) < a.halfX + b.halfX + gap
  && Math.abs(a.z - b.z) < a.halfZ + b.halfZ + gap;
function homeCollisionBoxes(state) {
  const tableFootprint = getTableFootprint(state.table.rotation) ?? TABLE_FOOTPRINT;
  const boxes = ['upper','account'].includes(state.profile) ? [] : [{ id: 'table', kind: 'table', label: "DisplayText0246", x: state.table.x, z: state.table.z, ...tableFootprint, layer: 'solid' }];
  for (const item of state.furniture) {
    const footprint = getFurnitureFootprint(item.kind, item.rotation), pose = getFurniturePose(state,item);
    if (footprint) boxes.push({ id: `furniture:${item.id}`, kind: item.kind, label: FURNITURE_BY_ID.get(item.kind)?.label ?? "Furniture", item, x: pose.x, z: pose.z, ...footprint,
      layer: item.kind === 'rug' ? 'underlay' : item.kind === 'chandelier' ? 'ceiling' : 'solid' });
  }
  for (const [id, placement] of Object.entries(['upper','account'].includes(state.profile) ? {} : state.placements ?? {})) {
    const footprint = getPlacementFootprint(id);
    if (footprint) boxes.push({ id: `placement:${id}`, label: ({ plant: "DisplayText0776", toy: "DisplayText0777", rug: "DisplayText0778", stool: "DisplayText0247" })[id] ?? id, x: placement.x, z: placement.z, ...footprint, layer: id === 'rug' ? 'underlay' : 'solid' });
  }
  return boxes;
}
/** World-space volume used against architecture. Furniture geometry is measured
 * once per appearance, then translated/rotated without rebuilding it on drag. */
export function getHomeCandidateVolume(state, candidate) {
  if (!candidate) return null;
  const furnitureId = candidate.id?.startsWith('furniture:') ? candidate.id.slice(10) : null;
  const placementId = candidate.id?.startsWith('placement:') ? candidate.id.slice(10) : null;
  const propId = candidate.id?.startsWith('prop:') ? candidate.id.slice(5) : null;
  const item = candidate.item ?? (furnitureId ? state.furniture.find(item => item.id === furnitureId)
    : propId ? state.props.find(item => item.id === propId) : null);
  const kind = item?.kind ?? candidate.kind ?? ({ plant: 'plant', toy: 'statue', rug: 'rug' })[placementId];
  let local, rotation = candidate.rotation ?? item?.rotation ?? 0, baseY = .08, scaleXZ = 1;
  if (kind && kind !== 'table') {
    const appearance = item ?? (placementId ? { kind, level: state.upgrades[placementId], plans: state.plans[placementId],
      material: state.surfaces[({ plant: 'plant.pot', toy: 'toy.body', rug: 'rug.main' })[placementId]]?.material } : { kind });
    local = getLuxuryCollisionBounds(appearance);
    baseY = propId ? 1.192 : kind === 'chandelier' ? 1.65 : kind === 'rug' ? (placementId ? .079 : .096) : .08;
    if (placementId === 'rug') scaleXZ = 2.23;
  } else if (candidate.id === 'table' || placementId === 'stool') {
    const objectId = candidate.id === 'table' ? 'table' : 'stool';
    local = objectId === 'table' ? { minX: -1.125, maxX: 1.125, minY: .04, maxY: 1.1575, minZ: -.675, maxZ: .675 }
      : { minX: -.375, maxX: .375, minY: -.01, maxY: .625, minZ: -.31, maxZ: .31 };
    const upgraded = getStaticUpgradeCollisionBounds(objectId, state);
    if (upgraded) local = Object.fromEntries(Object.keys(local).map(key => [key, (key.startsWith('min') ? Math.min : Math.max)(local[key], upgraded[key])]));
    if (objectId === 'table') { baseY = .03; rotation = candidate.rotation ?? state.table.rotation; }
  } else local = { minX: -candidate.halfX, maxX: candidate.halfX, minY: 0, maxY: 1.5, minZ: -candidate.halfZ, maxZ: candidate.halfZ };
  const pose = furnitureId && item ? getFurniturePose(state, { ...item, ...(!item.mount ? {x:candidate.x ?? item.x,z:candidate.z ?? item.z,rotation:candidate.rotation ?? item.rotation} : {}) }) : null;
  if (pose) { rotation = pose.rotation; baseY = pose.y; }
  const originX = pose?.x ?? candidate.x, originZ = pose?.z ?? candidate.z;
  const angle = rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const corners = [local.minX, local.maxX].flatMap(x => [local.minZ, local.maxZ].map(z => ({ x: (x*c+z*s)*scaleXZ, z: (-x*s+z*c)*scaleXZ })));
  return { ...candidate, ...(item ? {item} : {}), minX: originX + Math.min(...corners.map(p => p.x)), maxX: originX + Math.max(...corners.map(p => p.x)),
    minY: baseY + local.minY, maxY: baseY + local.maxY,
    minZ: originZ + Math.min(...corners.map(p => p.z)), maxZ: originZ + Math.max(...corners.map(p => p.z)) };
}
function buildingCandidates(state) {
  const candidates = homeCollisionBoxes(state).map(candidate => getHomeCandidateVolume(state, candidate));
  const angle = state.table.rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  for (const item of ['upper','account'].includes(state.profile) ? [] : state.props) {
    const x = (item.u - .5) * 2.25, z = (.5 - item.v) * 1.35;
    candidates.push(getHomeCandidateVolume(state, { id: `prop:${item.id}`, item, label: "DisplayText0786",
      rotation: state.table.rotation, x: state.table.x + x*c+z*s, z: state.table.z-x*s+z*c }));
  }
  return candidates;
}
const intersection = (a, b) => {
  if (!overlapBuildingVolume(a, b)) return null;
  return { minX: Math.max(a.minX,b.minX), maxX: Math.min(a.maxX,b.maxX), minY: Math.max(a.minY,b.minY), maxY: Math.min(a.maxY,b.maxY), minZ: Math.max(a.minZ,b.minZ), maxZ: Math.min(a.maxZ,b.maxZ) };
};
// Subtract already occupied space, rather than comparing mesh indexes: an
// upgrade can replace/reorder all wall meshes. Existing saves stay editable,
// but neither a wall nor an object may create any new penetrating volume.
function subtractVolume(volume, covered) {
  const hit = intersection(volume, covered); if (!hit) return [volume];
  const remainder = [], middle = { ...volume };
  for (const axis of ['X', 'Y', 'Z']) {
    const min = `min${axis}`, max = `max${axis}`;
    if (hit[min] > middle[min] + 1e-6) remainder.push({ ...middle, [max]: hit[min] });
    if (hit[max] < middle[max] - 1e-6) remainder.push({ ...middle, [min]: hit[max] });
    middle[min] = hit[min]; middle[max] = hit[max];
  }
  return remainder;
}
/** Only new/worsened architecture collisions block a transaction. Old saves
 * are still readable, and repainting or reducing an existing overlap is safe. */
export function findIntroducedBuildingCollision(before, next) {
  const oldWalls = getHomeBuildingVolumes(before), walls = getHomeBuildingVolumes(next);
  const oldCandidates = new Map(buildingCandidates(before).map(candidate => [candidate.id, candidate]));
  for (const candidate of buildingCandidates(next)) {
    const old = oldCandidates.get(candidate.id);
    if (oldWalls === walls && old && ['minX','maxX','minY','maxY','minZ','maxZ'].every(key => Math.abs(candidate[key]-old[key]) < 1e-6)) continue;
    const prior = old ? oldWalls.map(wall => intersection(old, wall)).filter(Boolean) : [];
    for (const wall of walls) {
      const hit = intersection(candidate, wall); if (!hit) continue;
      let uncovered = [hit];
      for (const covered of prior) { uncovered = uncovered.flatMap(volume => subtractVolume(volume, covered)); if (!uncovered.length) break; }
      if (uncovered.length) return { ...wall, candidateId: candidate.id, candidateLabel: candidate.label ?? "DisplayText0244" };
    }
  }
  return null;
}
function shouldCheckPair(a,b) {
  if (a.id === b.id) return false;
  const supportId = value => value.item?.mount?.type === 'table'
    ? (value.item.mount.parentId ? `furniture:${value.item.mount.parentId}` : 'table')
    : value.id?.startsWith('prop:') ? 'table' : null;
  // A mounted decoration may touch only its own supporting tabletop. Another
  // purchased table, or the original table, remains a normal solid obstacle.
  if (a.id === supportId(b) || b.id === supportId(a)) return false;
  // Legacy floor layering stays unchanged. Mounted goods use their real height
  // and must not intersect shelves, floor furniture or neighbouring ornaments.
  if (a.item?.mount || b.item?.mount) return true;
  return false;
}
/** Mounted furniture may overlap a table's XZ footprint, never its neighbours' volume. */
export function findHomeCollision(state, candidate) {
  if (!candidate) return null;
  const volume = getHomeCandidateVolume(state, candidate);
  const wall = getHomeBuildingVolumes(state).find(box => overlapBuildingVolume(volume, box));
  if (wall) return wall;
  const solids = candidate.item?.mount || state.furniture.some(item=>item.mount) ? buildingCandidates(state) : [];
  for (const other of solids) if (shouldCheckPair(volume,other) && overlapBuildingVolume(volume,other,.012)) return other;
  if (candidate.item?.mount || candidate.layer === 'underlay') return null;
  return homeCollisionBoxes(state).find(box => !box.item?.mount && box.id !== candidate.id && box.layer === candidate.layer && overlaps(candidate, box)) ?? null;
}
/** Architecture placement must clear the same visible furnishings and wall volumes. */
export function getStaircaseCollision(state, stairs) {
  const volume = getStaircaseVolume(stairs);
  if (!volume) return { label: "DisplayText0787", objectId: 'stairs' };
  const footprint = { x: stairs.x, z: stairs.z, halfX: (volume.maxX-volume.minX)/2, halfZ: (volume.maxZ-volume.minZ)/2 };
  if (!(state.slab ? floorContainsFootprint(state,footprint) : findContainingRoom(state.rooms,footprint))) return { ...volume, label: state.slab ? "DisplayText0788" : "DisplayText0789" };
  const withoutStairs = { ...state,staircases:getHomeStairs(state).filter(row=>row.id!==stairs.id) }; delete withoutStairs.stairs;
  const wall = getHomeBuildingVolumes(withoutStairs).find(box => overlapBuildingVolume(volume,box));
  if (wall) return wall;
  return buildingCandidates(withoutStairs).find(box => overlapBuildingVolume(volume,box,.025)) ?? null;
}
function staircaseFitsFloor(stairs, home) {
  if (stairs === undefined) return true;
  const volume=getStaircaseVolume(stairs);
  if(!volume)return false;
  const footprint={x:stairs.x,z:stairs.z,halfX:(volume.maxX-volume.minX)/2,halfZ:(volume.maxZ-volume.minZ)/2};
  return home?.slab ? floorContainsFootprint(home,footprint) : !!findContainingRoom(Array.isArray(home?.rooms)?home.rooms:[],footprint);
}
/** A moved table carries its goods; upgrades that move a wall fixture outwards
 * must also validate the resulting furniture-to-furniture volumes atomically. */
export function findIntroducedFurnitureCollision(before,next) {
  if (!next.furniture.some(item=>item.mount)) return null;
  const old = new Map(buildingCandidates(before).map(v=>[v.id,v])), volumes=buildingCandidates(next);
  for(let i=0;i<volumes.length;i++) for(let j=i+1;j<volumes.length;j++) {
    const a=volumes[i],b=volumes[j]; if(!shouldCheckPair(a,b)) continue;
    const hit=intersection(a,b); if(!hit) continue;
    const prior=old.has(a.id)&&old.has(b.id)?intersection(old.get(a.id),old.get(b.id)):null;
    if(prior && !subtractVolume(hit,prior).length) continue;
    return {...b,candidateId:a.id,candidateLabel:a.label??"DisplayText0790"};
  }
  return null;
}
function findTabletopCollision(state, item) {
  if (!item || item.kind === undefined) return null;
  const half = HOME_LIMITS.propRadius;
  const old = state.props.find(other => other.id !== item.id
    && Math.abs(item.u - other.u) < half * 2 + .005
    && Math.abs(item.v - other.v) < half * 2 + .005);
  if (old) return old;
  const simulated = { ...state, props: [...state.props.filter(p=>p.id!==item.id),item] };
  const volume = buildingCandidates(simulated).find(v=>v.id===`prop:${item.id}`);
  return buildingCandidates(simulated).find(v=>v.item?.mount?.type==='table' && overlapBuildingVolume(volume,v,.012)) ?? null;
}
function isDecal(value, legacy = false) {
  if (!isRecord(value) || !hasOnlyKeys(value, ['id', 'surfaceId', 'kind', 'u', 'v', 'size', 'rotation'])
    || !isId(value.id) || !(legacy ? V1_DECAL_SURFACES : DECAL_SURFACES).has(value.surfaceId)
    || !(legacy ? ['star', 'flower', 'heart'] : DECAL_KINDS).includes(value.kind)) return false;
  const b = getDecalBounds(value.size, value.rotation);
  return b !== null && isNumberIn(value.u, b.minU, b.maxU) && isNumberIn(value.v, b.minV, b.maxV);
}
function isProp(value, legacy = false, previousV2 = false) {
  const b = getPropBounds();
  return isRecord(value) && hasOnlyKeys(value, legacy ? ['id', 'kind', 'u', 'v'] : ['id', 'kind', 'u', 'v', 'color', 'material', 'level', ...previousV2 ? [] : ['plans']])
    && isId(value.id) && (legacy ? ['vase', 'lamp'] : PROP_KINDS).includes(value.kind)
    && isNumberIn(value.u, b.minU, b.maxU) && isNumberIn(value.v, b.minV, b.maxV)
    && (legacy || (isHex(value.color) && (previousV2 ? PREVIOUS_V2_MATERIALS : MATERIAL_IDS).has(value.material)
      && isLevel(value.level) && (previousV2 || isPlan(value.plans))));
}
function isMountShape(mount, kind) {
  const type = getFurniturePlacement(kind);
  return isRecord(mount) && mount.type === type && ['table','wall'].includes(type)
    && hasOnlyKeys(mount, type === 'wall' ? ['type','wallId','u','v'] : ['type','parentId','u','v'])
    && (type !== 'wall' || isId(mount.wallId))
    && (type !== 'table' || !Object.hasOwn(mount,'parentId') || isId(mount.parentId))
    && isNumberIn(mount.u,0,1) && isNumberIn(mount.v,0,1);
}
export function validateFurnitureItem(value) { return isFurnitureShape(value); }
function isFurnitureShape(value, previousV2 = false) {
  return isRecord(value) && hasOnlyKeys(value, ['id', 'kind', 'x', 'z', 'rotation', 'color', 'material', 'level', ...previousV2 ? [] : ['plans', 'mount']])
    && isId(value.id) && isHex(value.color) && (previousV2 ? PREVIOUS_V2_MATERIALS : MATERIAL_IDS).has(value.material)
    && isLevel(value.level) && (previousV2 || isPlan(value.plans)) && FURNITURE_BY_ID.has(value.kind) && isRotation(value.rotation)
    && Number.isFinite(value.x) && Number.isFinite(value.z) && (value.mount === undefined || isMountShape(value.mount, value.kind));
}
/** Create an inventory item without pretending to place it in a showroom.
 * Shape/appearance are validated here; room and collision checks belong to placement. */
export function createFurnitureItem(input = {}) {
  const level = input.level ?? 1;
  const item = { id: input.id, kind: input.kind, x: input.x ?? 0, z: input.z ?? 0, rotation: input.rotation ?? 0,
    color: input.color ?? FURNITURE_BY_ID.get(input.kind)?.defaultColor, material: input.material ?? 'oak', level,
    plans: { ...(input.plans ?? createPlan(level)) }, ...(input.mount ? { mount: { ...input.mount } } : {}) };
  return isFurnitureShape(item) ? item : null;
}
/** v2 saves used one rectangle; v3 saves require the item to sit inside one room. */
function isFurniture(value, scope, previousV2 = false, state = null) {
  if (!isFurnitureShape(value, previousV2)) return false;
  if (!previousV2 && getFurniturePlacement(value) !== 'floor') return !!state && isFurnitureMountValid(state,value);
  if (Array.isArray(scope)) return state?.slab ? floorContainsFootprint(state,{x:value.x,z:value.z,...getFurnitureFootprint(value.kind,value.rotation)}) : findFurnitureRoom(scope, value) !== null;
  const b = legacyFurnitureBounds(value.kind, value.rotation, scope);
  return b !== null && isNumberIn(value.x, b.minX, b.maxX) && isNumberIn(value.z, b.minZ, b.maxZ);
}
function isTable(value) {
  return isRecord(value) && hasOnlyKeys(value, ['x', 'z', 'rotation'])
    && isNumberIn(value.x, HOME_LIMITS.tableMin, HOME_LIMITS.tableMax)
    && isNumberIn(value.z, HOME_LIMITS.tableMin, HOME_LIMITS.tableMax) && isRotation(value.rotation);
}
function isPlacement(value, scope, objectId) {
  if (!isRecord(value) || !hasOnlyKeys(value, ['x', 'z']) || !Number.isFinite(value.x) || !Number.isFinite(value.z)) return false;
  const envelope = placementEnvelope(objectId, value);
  if (Array.isArray(scope)) return findContainingRoom(scope, envelope) !== null;
  const rect = scopeRect(scope);
  return isNumberIn(value.x, rect.minX + envelope.halfX, rect.maxX - envelope.halfX) && isNumberIn(value.z, rect.minZ + envelope.halfZ, rect.maxZ - envelope.halfZ);
}
function isRoomSkin(value) {
  return isRecord(value) && hasOnlyKeys(value, ['color', 'material']) && isHex(value.color) && MATERIAL_IDS.has(value.material);
}
function isRoomList(value, home = {}) {
  if (!Array.isArray(value) || !isLayoutValid(value,home)) return false;
  return value.every(room => room.id==='living'
    ? hasOnlyKeys(room, ['id', 'kind', 'cx', 'cz'])
    : hasOnlyKeys(room, ['id', 'kind', 'cx', 'cz', 'bounds', 'floor', 'wall']) && isRoomSkin(room.floor) && isRoomSkin(room.wall));
}
/** Schema v1 and v2 validators are kept verbatim so old saves migrate through their real rules. */
function validateCommon(value, legacy, previousV2 = false) {
  const keys = legacy ? ['version', 'paint', 'surfaces', 'decals', 'props', 'table', 'revision']
    : ['version', 'sandbox', 'paint', 'surfaces', 'decals', 'props', 'furniture', 'upgrades', 'roomTier', 'table', 'revision', ...previousV2 ? ['placements'] : ['plans', 'placements']];
  const surfaces = legacy ? V1_SURFACES : SURFACES;
  if (!isRecord(value) || !hasOnlyKeys(value, keys) || value.version !== (legacy ? 1 : 2)
    || !Number.isInteger(value.paint) || value.paint < 0 || value.paint > HOME_LIMITS.maxPaint
    || !Number.isSafeInteger(value.revision) || value.revision < 0
    || !isRecord(value.surfaces) || Object.keys(value.surfaces).length !== surfaces.length
    || !Array.isArray(value.decals) || value.decals.length > (legacy ? 64 : HOME_LIMITS.maxDecals)
    || !Array.isArray(value.props) || value.props.length > (legacy ? 24 : HOME_LIMITS.maxProps)
    || !isTable(value.table)) return false;
  const roomTier = previousV2 && !Object.hasOwn(value, 'roomTier') ? 'starter' : value.roomTier;
  if (!legacy && !ROOM_TIER_IDS.has(roomTier)) return false;
  for (const { id } of surfaces) {
    const surface = value.surfaces[id];
    if (!isRecord(surface) || !hasOnlyKeys(surface, ['color', 'material'])
      || !isHex(surface.color) || !(legacy ? V1_MATERIALS : previousV2 ? PREVIOUS_V2_MATERIALS : MATERIAL_IDS).has(surface.material)) return false;
  }
  if (!legacy && (typeof value.sandbox !== 'boolean' || !isRecord(value.upgrades)
    || Object.keys(value.upgrades).length !== STATIC_OBJECT_IDS.length
    || !STATIC_OBJECT_IDS.every(id => isLevel(value.upgrades[id]))
    || !Array.isArray(value.furniture) || value.furniture.length > HOME_LIMITS.maxFurniture)) return false;
  if (!legacy && !previousV2 && (!isRecord(value.placements) || !hasOnlyKeys(value.placements, PLACED_OBJECT_IDS)
    || !PLACED_OBJECT_IDS.every(id => isPlacement(value.placements[id], roomTier, id)))) return false;
  if (!legacy && !previousV2 && (!isRecord(value.plans) || Object.keys(value.plans).length !== STATIC_OBJECT_IDS.length
    || !hasOnlyKeys(value.plans, STATIC_OBJECT_IDS) || !STATIC_OBJECT_IDS.every(id => isPlan(value.plans[id])))) return false;
  const ids = new Set();
  for (const item of value.decals) { if (!isDecal(item, legacy) || ids.has(item.id)) return false; ids.add(item.id); }
  for (const item of value.props) { if (!isProp(item, legacy, previousV2) || ids.has(item.id)) return false; ids.add(item.id); }
  if (!legacy) for (const item of value.furniture) { if (!isFurniture(item, roomTier, previousV2) || ids.has(item.id)) return false; ids.add(item.id); }
  return true;
}
const V3_KEYS = Object.freeze(['version', 'sandbox', 'paint', 'surfaces', 'decals', 'props', 'furniture', 'upgrades', 'rooms', 'plans', 'placements', 'table', 'revision']);
function validateV3(value) {
  if (!isRecord(value) || !hasOnlyKeys(value, [...V3_KEYS, 'profile', 'stairs', 'staircases', 'slab']) || !V3_KEYS.every(key => Object.hasOwn(value,key)) || value.version !== 3
    || value.profile !== undefined && !['upper','account'].includes(value.profile)
    || value.slab !== undefined && !isSlabValid(value.slab)
    || !areHomeStairsValid(value) || !getHomeStairs(value).every(stair=>staircaseFitsFloor(stair,value))
    || typeof value.sandbox !== 'boolean'
    || !Number.isInteger(value.paint) || value.paint < 0 || value.paint > HOME_LIMITS.maxPaint
    || !Number.isSafeInteger(value.revision) || value.revision < 0
    || !isRecord(value.surfaces) || Object.keys(value.surfaces).length !== SURFACES.length
    || !Array.isArray(value.decals) || value.decals.length > HOME_LIMITS.maxDecals
    || !Array.isArray(value.props) || value.props.length > HOME_LIMITS.maxProps
    || !Array.isArray(value.furniture) || value.furniture.length > HOME_LIMITS.maxFurniture
    || !isTable(value.table) || !isRoomList(value.rooms,value)) return false;
  for (const { id } of SURFACES) if (!isRoomSkin(value.surfaces[id])) return false;
  if (!isRecord(value.upgrades) || Object.keys(value.upgrades).length !== STATIC_OBJECT_IDS.length || !STATIC_OBJECT_IDS.every(id => isLevel(value.upgrades[id]))) return false;
  if (!isRecord(value.plans) || Object.keys(value.plans).length !== STATIC_OBJECT_IDS.length || !hasOnlyKeys(value.plans, STATIC_OBJECT_IDS) || !STATIC_OBJECT_IDS.every(id => isPlan(value.plans[id]))) return false;
  if (!isRecord(value.placements) || !hasOnlyKeys(value.placements, PLACED_OBJECT_IDS) || !PLACED_OBJECT_IDS.every(id => isPlacement(value.placements[id], ['upper','account'].includes(value.profile) ? getLayoutPreset('starter').rooms : value.rooms, id))) return false;
  const ids = new Set();
  for (const item of value.decals) { if (!isDecal(item) || ids.has(item.id) || ['upper','account'].includes(value.profile) && (!hasStarterRoom(value) || item.surfaceId==='table.top')) return false; ids.add(item.id); }
  if (['upper','account'].includes(value.profile) && value.props.length) return false;
  for (const item of value.props) { if (!isProp(item) || ids.has(item.id)) return false; ids.add(item.id); }
  for (const item of value.furniture) { if (!isFurniture(item, value.rooms, false, value) || ids.has(item.id)) return false; ids.add(item.id); }
  return true;
}
export function createHomeState({ sandbox = true, profile, slab, rooms } = {}) {
  if (typeof sandbox !== 'boolean') throw new TypeError('sandbox must be a boolean');
  if (profile !== undefined && !['upper','account'].includes(profile)) throw new TypeError('Unknown home profile');
  if(slab!==undefined&&!isSlabValid(slab))throw new TypeError('Invalid floor slab');
  const home = { version: 3, sandbox, paint: 30, ...(profile ? { profile } : {}),
    ...(slab ? {slab:{rects:slab.rects.map(r=>({...r}))}} : {}),
    rooms: cloneRooms(rooms ?? (slab&&profile==='upper' ? [] : getLayoutPreset('starter').rooms)),
    surfaces: Object.fromEntries(SURFACES.map(({ id }) => [id, { ...DEFAULT_SURFACES[id] }])),
    decals: [], props: [], furniture: [], upgrades: Object.fromEntries(STATIC_OBJECT_IDS.map(id => [id, 1])),
    plans: Object.fromEntries(STATIC_OBJECT_IDS.map(id => [id, createPlan()])),
    placements: { ...Object.fromEntries(PLACED_OBJECT_IDS.map(id => [id, { ...DEFAULT_PLACEMENTS[id] }])), plant: { x: -2.15, z: 2.10 }, stool: { x: 2.20, z: 2.10 } },
    table: { x: 0, z: 0, rotation: 0 }, revision: 0 };
  if(profile==='account'&&!home.slab)home.slab={rects:getFloorRects(home).map(({minX,minZ,width,depth})=>({minX,minZ,width,depth}))};
  if(!validateV3(home))throw new TypeError('Invalid initial home layout');
  return home;
}
export function validateHomeState(value) { return validateV3(value); }
function cloneState(state) {
  return { ...state, surfaces: Object.fromEntries(Object.entries(state.surfaces).map(([id, surface]) => [id, { ...surface }])),
    ...(state.stairs ? { stairs: { ...state.stairs } } : {}),
    ...(state.staircases ? {staircases:state.staircases.map(stair=>({...stair}))} : {}),
    ...(state.slab ? {slab:{rects:state.slab.rects.map(r=>({...r}))}} : {}),
    decals: state.decals.map(item => ({ ...item })), props: state.props.map(item => ({ ...item, plans: { ...item.plans } })),
    furniture: state.furniture.map(item => ({ ...item, plans: { ...item.plans }, ...(item.mount ? {mount:{...item.mount}} : {}) })), upgrades: { ...state.upgrades },
    rooms: cloneRooms(state.rooms),
    plans: Object.fromEntries(Object.entries(state.plans).map(([id, plan]) => [id, { ...plan }])),
    placements: Object.fromEntries(Object.entries(state.placements).map(([id, placement]) => [id, { ...placement }])), table: { ...state.table } };
}
/** Returns a normalized v2 state (plans and placements present) or null. */
function migrateToV2(saved) {
  if (validateCommon(saved, false)) return saved;
  if (isRecord(saved) && saved.version === 2 && !Object.hasOwn(saved, 'placements')) {
    const upgraded = { ...saved, placements: Object.fromEntries(PLACED_OBJECT_IDS.map(id => [id, { ...DEFAULT_PLACEMENTS[id] }])) };
    if (validateCommon(upgraded, false)) return upgraded;
  }
  if (isRecord(saved) && saved.version === 2 && !Object.hasOwn(saved, 'roomTier')) {
    const upgraded = { ...saved, roomTier: 'starter' };
    if (validateCommon(upgraded, false)) return upgraded;
  }
  if (validateCommon(saved, false, true)) {
    const next = { ...saved, roomTier: Object.hasOwn(saved, 'roomTier') ? saved.roomTier : 'starter',
      plans: Object.fromEntries(STATIC_OBJECT_IDS.map(id => [id, createPlan(saved.upgrades[id])])),
      placements: Object.fromEntries(PLACED_OBJECT_IDS.map(id => [id, { ...DEFAULT_PLACEMENTS[id] }])),
      props: saved.props.map(item => ({ ...item, plans: createPlan(item.level) })),
      furniture: saved.furniture.map(item => ({ ...item, plans: createPlan(item.level) })) };
    return validateCommon(next, false) ? next : null;
  }
  if (!validateCommon(saved, true)) return null;
  const next = { version: 2, sandbox: true, paint: saved.paint, roomTier: 'starter',
    surfaces: Object.fromEntries(SURFACES.map(({ id }) => [id, { ...DEFAULT_SURFACES[id] }])),
    decals: saved.decals.map(item => ({ ...item })),
    props: saved.props.map(item => ({ ...item, color: PROP_COLORS[item.kind], material: 'ceramic', level: 1, plans: createPlan() })),
    furniture: [], upgrades: Object.fromEntries(STATIC_OBJECT_IDS.map(id => [id, 1])),
    plans: Object.fromEntries(STATIC_OBJECT_IDS.map(id => [id, createPlan()])),
    placements: Object.fromEntries(PLACED_OBJECT_IDS.map(id => [id, { ...DEFAULT_PLACEMENTS[id] }])),
    table: { ...saved.table }, revision: saved.revision };
  for (const { id } of V1_SURFACES) next.surfaces[id] = { ...saved.surfaces[id] };
  return validateCommon(next, false) ? next : null;
}
/** Place an item inside the nearest room that can hold it, avoiding collisions; null when impossible. */
function settleIntoRooms(state, rooms, footprint, candidate) {
  const collisionAt = pose => findHomeCollision(state, { ...footprint, ...candidate, ...pose });
  if (findContainingRoom(rooms, footprint) && !collisionAt({ x: footprint.x, z: footprint.z })) return { x: footprint.x, z: footprint.z };
  const ordered = rooms.map(room => ({ room, rect: roomRect(room) })).sort((a, b) => Math.hypot(a.rect.x - footprint.x, a.rect.z - footprint.z) - Math.hypot(b.rect.x - footprint.x, b.rect.z - footprint.z));
  for (const { room } of ordered) {
    const clamped = clampToRoom(room, footprint);
    if (!clamped) continue;
    if (!collisionAt(clamped)) return clamped;
    // Wall padding and mounted fixtures can occupy the old clamped edge.
    // Search nearby legal centres before retaining a legacy item in inventory.
    const rect = roomRect(room), poses = [];
    const minX = rect.minX + footprint.halfX, maxX = rect.maxX - footprint.halfX;
    const minZ = rect.minZ + footprint.halfZ, maxZ = rect.maxZ - footprint.halfZ;
    for (let x = minX; x <= maxX + 1e-6; x += .2) for (let z = minZ; z <= maxZ + 1e-6; z += .2) poses.push({ x, z });
    poses.sort((a,b) => Math.hypot(a.x-footprint.x,a.z-footprint.z)-Math.hypot(b.x-footprint.x,b.z-footprint.z));
    const free = poses.find(pose => !collisionAt(pose));
    if (free) return free;
  }
  return null;
}
function upgradeV2ToV3(v2, unplacedFurniture) {
  const rooms = cloneRooms((getLayoutPreset(v2.roomTier) ?? getLayoutPreset('starter')).rooms);
  const next = { version: 3, sandbox: v2.sandbox, paint: v2.paint, surfaces: v2.surfaces, decals: v2.decals, props: v2.props,
    furniture: [], upgrades: v2.upgrades, rooms, plans: v2.plans, placements: {}, table: v2.table, revision: v2.revision };
  // The old presets were single rectangles centred on the origin; the new
  // plans are rooms growing right and forward from the living room. Items
  // outside any room slide to the nearest room that can hold them.
  // Fixed decor cannot be stored, so resolve it first. Furniture must avoid
  // those final positions, rather than a flowerpot that will move afterward.
  for (const id of PLACED_OBJECT_IDS) {
    const placement = v2.placements[id];
    const settled = settleIntoRooms(next, rooms, placementEnvelope(id, placement), { id: `placement:${id}`,
      ...getPlacementFootprint(id), layer: id === 'rug' ? 'underlay' : 'solid' });
    next.placements[id] = settled ?? { ...DEFAULT_PLACEMENTS[id] };
  }
  for (const item of v2.furniture) {
    const footprint = { x: item.x, z: item.z, ...getFurnitureFootprint(item.kind, item.rotation) };
    const layer = item.kind === 'rug' ? 'underlay' : item.kind === 'chandelier' ? 'ceiling' : 'solid';
    const settled = settleIntoRooms(next, rooms, footprint, { id: `furniture:${item.id}`, kind: item.kind, item, layer });
    if (settled) next.furniture.push({ ...item, x: settled.x, z: settled.z });
    else unplacedFurniture.push({ ...item, plans: { ...item.plans } });
  }
  return next;
}
/** Migration for inventory owners: stranded furniture is retained outside the scene. */
export function migrateHomeStateWithInventory(saved) {
  if (validateV3(saved)) return { home: cloneState(saved), unplacedFurniture: [] };
  // Each supported historical schema is validated before defaults are added.
  // Missing fields are not an opportunity to repair malformed appearance,
  // unknown metadata or furniture outside that save's actual room envelope.
  const v2 = migrateToV2(saved);
  if (!v2) return null;
  const unplacedFurniture = [];
  const next = upgradeV2ToV3(v2, unplacedFurniture);
  return validateV3(next) ? { home: cloneState(next), unplacedFurniture } : null;
}
/** Invalid saves return null; callers retain the original bytes until an explicit reset. */
export function migrateHomeState(saved) {
  return migrateHomeStateWithInventory(saved)?.home ?? null;
}
function newId(state, prefix) {
  const ids = new Set([...state.decals, ...state.props, ...state.furniture].map(item => item.id));
  let suffix = state.revision + 1;
  while (ids.has(`${prefix}-${suffix}`)) suffix += 1;
  return `${prefix}-${suffix}`;
}
/** `room:<id>.floor` and `room:<id>.wall` are the paintable skins of an added room. */
export function parseRoomSurfaceId(surfaceId) {
  const match = typeof surfaceId === 'string' && /^room:([a-z\d_.:-]+)\.(floor|wall)$/i.exec(surfaceId);
  return match ? { roomId: match[1], part: match[2] } : null;
}
export function getRoomSurfaces(state) {
  return state.rooms.filter(room=>room.id!=='living').flatMap(room => ['floor', 'wall'].map(part => ({ id: `room:${room.id}.${part}`, roomId: room.id, part,
    label: `${getRoomKind(room.kind)?.label ?? room.kind}${ROOM_SURFACE_LABELS[part]}`, paintCost: ROOM_SURFACE_COST })));
}
function entityTarget(state, objectId) {
  if (typeof objectId !== 'string') return null;
  for (const [prefix, key] of [['prop:', 'props'], ['furniture:', 'furniture']]) {
    if (!objectId.startsWith(prefix)) continue;
    const id = objectId.slice(prefix.length), index = state[key].findIndex(item => item.id === id);
    return index < 0 ? null : { key, index, item: state[key][index], paintCost: 1 };
  }
  const roomSurface = parseRoomSurfaceId(objectId);
  if (roomSurface) {
    const index = state.rooms.findIndex(room => room.id === roomSurface.roomId);
    return index < 0 || state.rooms[index].id==='living' ? null : { key: 'rooms', index, part: roomSurface.part, item: state.rooms[index][roomSurface.part], paintCost: ROOM_SURFACE_COST };
  }
  return null;
}
const furnitureFits = (state, rooms, item) => getFurniturePlacement(item) === 'floor' ? (state.slab ? floorContainsFootprint(state,{x:item.x,z:item.z,...getFurnitureFootprint(item.kind,item.rotation)}) : findFurnitureRoom(rooms,item)!==null) : isFurnitureMountValid({...state,rooms},item);
function layoutHoldsEverything(state, rooms) {
  return state.furniture.every(item => furnitureFits(state, rooms, item))
    && (['upper','account'].includes(state.profile) || PLACED_OBJECT_IDS.every(id => isPlacement(state.placements[id], rooms, id)))
    && getHomeStairs(state).every(stair=>staircaseFitsFloor(stair,{...state,rooms}));
}
/** Keep owned wall goods when buying adjacent slab changes an outer wall's segment id.
 * Positions along the wall and hanging height stay fixed; only its normal may move with the wall. */
function remapSlabWallMounts(before,next) {
  const oldTargets=getWallMountTargets(before),targets=getWallMountTargets(next);
  for(const item of next.furniture.filter(item=>item.mount?.type==='wall')) {
    const old=oldTargets.find(t=>t.wallId===item.mount.wallId);if(!old)continue;
    const same=targets.find(t=>t.wallId===old.wallId);
    if(same&&same.from===old.from&&same.to===old.to&&same.face===old.face)continue;
    const along=old.from+item.mount.u*(old.to-old.from),bottom=old.minY+item.mount.v*(old.maxY-old.minY);
    for(const target of targets.filter(t=>t.axis===old.axis&&along>=t.from&&along<=t.to).sort((a,b)=>Math.abs(a.face-old.face)-Math.abs(b.face-old.face))) {
      const mount={type:'wall',wallId:target.wallId,u:(along-target.from)/(target.to-target.from),v:(bottom-target.minY)/(target.maxY-target.minY)};
      if(isFurnitureMountValid(next,{...item,mount})){item.mount=mount;break;}
    }
  }
}
/** Immutable changes. Sandbox paint is free; placed solids must keep clear collision boxes. */
export function applyChange(state, change) {
  if (!validateHomeState(state)) return failure("DisplayText0517, DisplayText0791.");
  if (!isRecord(change) || typeof change.type !== 'string') return failure("DisplayText0792.");
  if(state.slab&&!hasStarterRoom(state)&&change.type==='decal')return failure("DisplayText0793.");
  if (['upper','account'].includes(state.profile) && (change.type === 'table' || change.type === 'placement' || change.type === 'prop'
    || change.type === 'decal' && (change.surfaceId ?? state.decals.find(item=>item.id===change.id)?.surfaceId) === 'table.top'
    || ['upgrade','strategy'].includes(change.type) && UPPER_ABSENT_OBJECTS.has(change.objectId)
    || ['paint','material'].includes(change.type) && UPPER_ABSENT_OBJECTS.has(SURFACE_BY_ID.get(change.surfaceId)?.objectId))) {
    return failure("DisplayText0794, DisplayText0795.");
  }
  if (state.revision === Number.MAX_SAFE_INTEGER) return failure("DisplayText0796.");
  let cost = 0, apply;
  if (change.type === 'stairs') {
    if (!isStaircaseValid(change.stairs)) return failure("DisplayText0797.");
    const rows=getHomeStairs(state),old=rows.find(stair=>stair.id===change.stairs.id);
    if (JSON.stringify(old) === JSON.stringify(change.stairs)) return noop(state);
    const updated=[...rows.filter(stair=>stair.id!==change.stairs.id),{...change.stairs}];
    if(!areHomeStairsValid({staircases:updated}))return failure("DisplayText0798.");
    const blocker = getStaircaseCollision(state,change.stairs);
    if (blocker) return failure(`DisplayText0799${blocker.label}DisplayText0595, DisplayText0800.`,blocker);
    apply = next => {
      if(updated.length===1&&state.staircases===undefined)next.stairs={...updated[0]};
      else {delete next.stairs;next.staircases=updated.map(stair=>({...stair}));}
    };
  } else if(change.type==='slab') {
    if(!isSlabValid(change.slab))return failure("DisplayText0801, DisplayText0802.");
    const slab={rects:change.slab.rects.map(r=>({...r}))},candidate={...state,slab};
    if(JSON.stringify(state.slab)===JSON.stringify(slab))return noop(state);
    if(!getFloorRects(state).every(rect=>floorContainsRect(candidate,rect)))return failure("DisplayText0803.");
    if(!isLayoutValid(state.rooms,candidate)||!getHomeStairs(state).every(stair=>staircaseFitsFloor(stair,candidate)))return failure("DisplayText0804.");
    apply=next=>{next.slab=slab;remapSlabWallMounts(state,next);};
  } else if (change.type === 'paint' || change.type === 'material') {
    const surface = SURFACE_BY_ID.get(change.surfaceId), entity = entityTarget(state, change.surfaceId);
    if (!surface && !entity) return failure("DisplayText0805.");
    const field = change.type === 'paint' ? 'color' : 'material', value = change[field];
    if (field === 'color' ? !isHex(value) : !MATERIAL_IDS.has(value)) return failure("DisplayText0806.");
    const normalized = field === 'color' ? value.toLowerCase() : value;
    const target = surface ? state.surfaces[surface.id] : entity.item;
    const current = field === 'color' ? target.color.toLowerCase() : target.material;
    if (current === normalized) return noop(state);
    cost = field === 'color' && !state.sandbox ? (surface?.paintCost ?? entity.paintCost) : 0;
    if (state.paint < cost) return failure(`DisplayText0807, DisplayText0808 ${cost} DisplayText0809.`);
    apply = next => {
      const record = surface ? next.surfaces[surface.id] : entity.part ? next.rooms[entity.index][entity.part] : next[entity.key][entity.index];
      record[field] = normalized;
    };
  } else if (change.type === 'decal' || change.type === 'prop' || change.type === 'furniture') {
    const key = { decal: 'decals', prop: 'props', furniture: 'furniture' }[change.type];
    const id = change.id === undefined ? newId(state, change.type) : change.id;
    const index = state[key].findIndex(item => item.id === id), old = state[key][index];
    const kind = change.kind ?? old?.kind;
    const read = (field, fallback) => change[field] === undefined ? (old?.[field] ?? fallback) : change[field];
    let item;
    if (change.type === 'decal') item = { id, kind, surfaceId: read('surfaceId'), u: read('u'), v: read('v'),
      size: read('size', HOME_LIMITS.defaultDecalSize), rotation: read('rotation', 0) };
    else if (change.type === 'prop') {
      const itemLevel = read('level', 1);
      item = { id, kind, u: read('u'), v: read('v'), color: read('color', PROP_COLORS[kind]),
        material: read('material', 'ceramic'), level: itemLevel, plans: read('plans', createPlan(itemLevel)) };
    } else {
      const itemLevel = read('level', 1);
      item = { id, kind, x: read('x', 0), z: read('z', 0), rotation: read('rotation', 0),
        color: read('color', FURNITURE_BY_ID.get(kind)?.defaultColor), material: read('material', 'oak'),
        level: itemLevel, plans: read('plans', createPlan(itemLevel)), ...(read('mount') ? {mount:{...read('mount')}} : {}) };
    }
    const valid = change.type === 'decal' ? isDecal(item) : change.type === 'prop' ? isProp(item) : isFurniture(item, state.rooms, false, state);
    if (!valid) return failure(change.type === 'furniture' && isFurnitureShape(item) ? "DisplayText0810, DisplayText0615." : "DisplayText0811, DisplayText0812, DisplayText0813, DisplayText0814.");
    if (item.rotation !== undefined) item.rotation = normalizeRotation(item.rotation);
    if (item.color !== undefined) item.color = item.color.toLowerCase();
    if (item.plans !== undefined) item.plans = { ...item.plans };
    for (const otherKey of ['decals', 'props', 'furniture']) {
      if (otherKey !== key && state[otherKey].some(existing => existing.id === id)) return failure("DisplayText0815.");
    }
    if (change.type === 'prop') {
      const blocker = findTabletopCollision(state, item);
      if (blocker) return failure("DisplayText0816, DisplayText0615.");
    }
    if (change.type === 'furniture') {
      const footprint = getFurnitureFootprint(item.kind, item.rotation);
      const blocker = findHomeCollision(state, { id: `furniture:${item.id}`, item, kind: item.kind, x: item.x, z: item.z, ...footprint, layer: item.kind === 'rug' ? 'underlay' : item.kind === 'chandelier' ? 'ceiling' : 'solid' });
      if (blocker) return failure(`DisplayText0614${blocker.label}DisplayText0595, DisplayText0615.`, blocker);
    }
    if (index >= 0 && equalItem(old, item)) return noop(state);
    const max = { decals: HOME_LIMITS.maxDecals, props: HOME_LIMITS.maxProps, furniture: HOME_LIMITS.maxFurniture }[key];
    if (index < 0 && state[key].length >= max) return failure("DisplayText0817, DisplayText0818.");
    apply = next => { if (index < 0) next[key].push(item); else next[key][index] = item; };
  } else if (['removeDecal', 'removeProp', 'removeFurniture'].includes(change.type)) {
    if (!isId(change.id)) return failure("DisplayText0819.");
    const key = { removeDecal: 'decals', removeProp: 'props', removeFurniture: 'furniture' }[change.type];
    if (!state[key].some(item => item.id === change.id)) return noop(state);
    if (change.type === 'removeFurniture' && state.furniture.some(item => item.mount?.type === 'table' && item.mount.parentId === change.id)) {
      return failure("DisplayText0543, DisplayText0544.");
    }
    apply = next => { next[key] = next[key].filter(item => item.id !== change.id); };
  } else if (change.type === 'roomTier') {
    if(state.slab)return failure("DisplayText0820.");
    const presetItem = ROOM_TIER_IDS.has(change.roomTier) ? getLayoutPreset(change.roomTier) : null;
    if (!presetItem) return failure("DisplayText0821.");
    const rooms = cloneRooms(presetItem.rooms);
    // Keep the paint of rooms that survive the preset switch.
    for (const room of rooms) { const existing = state.rooms.find(item => item.id === room.id && item.kind === room.kind); if (existing?.floor) { room.floor = { ...existing.floor }; room.wall = { ...existing.wall }; } }
    if (JSON.stringify(rooms) === JSON.stringify(state.rooms)) return noop(state);
    if (!getHomeStairs(state).every(stair=>staircaseFitsFloor(stair,{...state,rooms}))) return failure("DisplayText0822, DisplayText0823.");
    if (!layoutHoldsEverything(state, rooms)) return failure("DisplayText0824, DisplayText0825.");
    apply = next => { next.rooms = rooms; };
  } else if (change.type === 'addRoom') {
    const kind = getRoomKind(change.kind);
    if (!kind || kind.core) return failure("DisplayText0826.");
    if (state.rooms.length >= MAX_ROOMS) return failure("DisplayText0827, DisplayText0828.");
    const id = change.id === undefined ? nextRoomId(state.rooms) : change.id;
    if (!isId(id) || state.rooms.some(room => room.id === id)) return failure("DisplayText0829.");
    const room = createRoom(kind.id, change.cx, change.cz, id,change.bounds);
    if(!isLayoutValid([...state.rooms,room],state))return failure(state.slab?"DisplayText0830, DisplayText0831.":"DisplayText0832, DisplayText0833.");
    apply = next => { next.rooms.push(room); };
  } else if (change.type === 'resizeRoom') {
    const id=change.roomId??change.id,index=state.rooms.findIndex(room=>room.id===id);
    if(index<0)return failure("DisplayText0834.");
    const old=state.rooms[index];if(old.id==='living')return failure("DisplayText0835, DisplayText0836.");
    if(!isRoomSizeValid(change.width,change.depth))return failure("DisplayText0647 0.2 DisplayText0837, DisplayText0649 1.2–8.4, DisplayText0651 1.2–7.8.");
    const r=roomRect(old),bounds={minX:r.minX,minZ:r.minZ,width:change.width,depth:change.depth};
    if(Math.abs(r.width-change.width)<1e-8&&Math.abs(r.depth-change.depth)<1e-8)return noop(state);
    const rooms=cloneRooms(state.rooms);rooms[index].bounds=bounds;
    if(!isLayoutValid(rooms,state))return failure(state.slab?"DisplayText0838.":"DisplayText0839, DisplayText0840.");
    if(!layoutHoldsEverything(state,rooms))return failure("DisplayText0841, DisplayText0842.");
    apply=next=>{next.rooms=rooms;};
  } else if (change.type === 'removeRoom') {
    const index = state.rooms.findIndex(room => room.id === change.id);
    if (index < 0) return noop(state);
    if (state.rooms[index].id==='living') return failure("DisplayText0843, DisplayText0844.");
    const rooms = state.rooms.filter((_, i) => i !== index);
    if (!isLayoutValid(rooms,state)) return failure("DisplayText0845, DisplayText0846.");
    if (!getHomeStairs(state).every(stair=>staircaseFitsFloor(stair,{...state,rooms}))) return failure("DisplayText0847, DisplayText0848, DisplayText0849.");
    if (!layoutHoldsEverything(state, rooms)) return failure("DisplayText0850, DisplayText0851.");
    apply = next => { next.rooms = cloneRooms(rooms); };
  } else if (change.type === 'upgrade') {
    if (!isLevel(change.level)) return failure("DisplayText0852 1 DisplayText0561 3 DisplayText0853.");
    const fixed = STATIC_OBJECT_IDS.includes(change.objectId), entity = entityTarget(state, change.objectId);
    if (!fixed && (!entity || entity.key === 'rooms')) return failure("DisplayText0854.");
    const level = fixed ? state.upgrades[change.objectId] : entity.item.level;
    const plan = fixed ? state.plans[change.objectId] : entity.item.plans;
    if (entity?.key === 'furniture' && EXTRA_SHOP_ITEMS.some(row=>row.id===entity.item.kind)) return failure("DisplayText0855, DisplayText0856.");
    if (level === change.level && ['structure', 'decor', 'detail'].every(dimension => plan[dimension] === change.level)) return noop(state);
    apply = next => {
      if (fixed) {
        next.upgrades[change.objectId] = change.level;
        for (const dimension of ['structure', 'decor', 'detail']) next.plans[change.objectId][dimension] = change.level;
      } else {
        next[entity.key][entity.index].level = change.level;
        for (const dimension of ['structure', 'decor', 'detail']) next[entity.key][entity.index].plans[dimension] = change.level;
      }
    };
  } else if (change.type === 'strategy') {
    if (!UPGRADE_PLAN_DIMENSIONS.includes(change.dimension) || !isLevel(change.level)) return failure("DisplayText0857.");
    const fixed = STATIC_OBJECT_IDS.includes(change.objectId), entity = entityTarget(state, change.objectId);
    if (!fixed && (!entity || entity.key === 'rooms')) return failure("DisplayText0854.");
    const target = fixed ? state.plans[change.objectId] : entity.item.plans;
    const materialSurface = change.material === undefined ? null
      : change.surfaceId ? SURFACE_BY_ID.get(change.surfaceId)
      : SURFACES.find(surface => surface.objectId === change.objectId) ?? null;
    if (change.material !== undefined && (change.dimension !== 'material' || !MATERIAL_IDS.has(change.material)
      || (!materialSurface && !entity) || (fixed && materialSurface?.objectId !== change.objectId))) {
      return failure("DisplayText0858.");
    }
    if (entity?.key === 'furniture' && EXTRA_SHOP_ITEMS.some(row=>row.id===entity.item.kind) ) return failure("DisplayText0855, DisplayText0856.");
    const currentMaterial = entity ? entity.item.material : materialSurface ? state.surfaces[materialSurface.id].material : undefined;
    if (target[change.dimension] === change.level && (change.material === undefined || currentMaterial === change.material)) return noop(state);
    apply = next => {
      const plan = fixed ? next.plans[change.objectId] : next[entity.key][entity.index].plans;
      plan[change.dimension] = change.level;
      if (change.material !== undefined) {
        if (entity) next[entity.key][entity.index].material = change.material;
        else next.surfaces[materialSurface.id].material = change.material;
      }
    };
  } else if (change.type === 'table') {
    const table = { x: change.x === undefined ? state.table.x : change.x,
      z: change.z === undefined ? state.table.z : change.z,
      rotation: change.rotation === undefined ? state.table.rotation : change.rotation };
    if (!isTable(table)) return failure("DisplayText0859.");
    table.rotation = normalizeRotation(table.rotation);
    const footprint = getTableFootprint(table.rotation);
    const blocker = findHomeCollision({ ...state, table }, { id: 'table', x: table.x, z: table.z, ...footprint, layer: 'solid' });
    if (blocker) return failure(`DisplayText0860${blocker.label}DisplayText0595, DisplayText0861.`, blocker);
    if (equalItem(state.table, table)) return noop(state);
    apply = next => { next.table = table; };
  } else if (change.type === 'placement') {
    if (!PLACED_OBJECT_IDS.includes(change.objectId)) return failure("DisplayText0862.");
    const placement = { x: change.x, z: change.z };
    if (!isPlacement(placement, state.rooms, change.objectId)) return failure("DisplayText0863.");
    const footprint = getPlacementFootprint(change.objectId);
    const blocker = findHomeCollision(state, { id: `placement:${change.objectId}`, x: placement.x, z: placement.z, ...footprint,
      layer: change.objectId === 'rug' ? 'underlay' : 'solid' });
    if (blocker) return failure(`DisplayText0864${blocker.label}DisplayText0595, DisplayText0615.`, blocker);
    if (equalItem(state.placements[change.objectId], placement)) return noop(state);
    apply = next => { next.placements[change.objectId] = placement; };
  } else return failure("DisplayText0865.");
  const next = cloneState(state); apply(next); next.paint -= cost; next.revision += 1;
  if(['addRoom','resizeRoom','removeRoom','slab'].includes(change.type)){
    for(const stair of getHomeStairs(next)){const blocked=getStaircaseCollision(next,stair);
      if(blocked)return failure(`DisplayText0866: ${blocked.label}, DisplayText0867.`,blocked);}
  }
  if (!next.furniture.every(item=>isFurnitureMountValid(next,item))) return failure("DisplayText0868, DisplayText0869.");
  const wallConflict = findIntroducedBuildingCollision(state, next);
  if (wallConflict) return failure(`${wallConflict.label}DisplayText0594${wallConflict.candidateLabel}DisplayText0595, DisplayText0596.`, wallConflict);
  const itemConflict = findIntroducedFurnitureCollision(state,next);
  if (itemConflict) return failure(`${itemConflict.candidateLabel}DisplayText0597${itemConflict.label}DisplayText0595, DisplayText0598.`,itemConflict);
  return { ok: true, state: next, cost, changed: true };
}
/** null means invalid or unaffordable; valid sandbox changes always return 0. */
export function getChangeCost(state, change) { const result = applyChange(state, change); return result.ok ? result.cost : null; }
/** Which legacy preset the current plan resembles; drives outdoor unlocks and copy. */
export function getLayoutStage(state) { return describeLayout(state.rooms); }
