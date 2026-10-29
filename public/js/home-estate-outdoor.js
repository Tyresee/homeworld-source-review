import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getRoomTierDefinition } from './home-room-expansion.js';
import { createEstateLandmark } from './home-estate-landmarks.js';

const rectangle = (x, z, width, depth) => Object.freeze({ x, z, width, depth,
  minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 });

// Outdoor positions are derived from the complete room footprint, including
// its foundation/columns. Increasing the room size cannot swallow a facility.
// The house itself is whatever the floor plan says it is: `houseSize` is the
// interior footprint (width/depth) and the regions move outward with it.
const normalizeHouse = (value, fallbackTier) => {
  const width = Number(value?.width), depth = Number(value?.depth);
  if (Number.isFinite(width) && Number.isFinite(depth) && width > 0 && depth > 0) return { width, depth };
  const room = getRoomTierDefinition(fallbackTier);
  return { width: room.width, depth: room.depth };
};
function estateDefinition(id, roomTier, level, label, features, houseSize) {
  const size = normalizeHouse(houseSize, roomTier);
  const house = rectangle(0, 0, size.width + .56, size.depth + .56);
  const garden = rectangle(house.minX - 1 - 3.2, 0, 6.4, 8.4);
  const regions = Object.freeze({
    courtyard: rectangle(0, house.maxZ + .70 + 1.30, size.width + .6, 2.60),
    garden,
    // Roof, cornice and hedge stick out past the floor plan, so the pool
    // needs a lawn path or the water sits under the house.
    pool: rectangle(house.maxX + 2.6 + 3.3, 0, 6.6, 8.6),
    tennis: rectangle(house.minX + .6, house.maxZ + 4.35 + 4, 14, 8),
    treehouse: rectangle(garden.x + 1.1, Math.max(house.maxZ, garden.maxZ) + 1.95, 3.7, 3.7),
    // The landmark's broad hip roof needs a little breathing room around its
    // columns; keeping that margin in the region prevents upgrades escaping
    // into the lawn or the adjacent court.
    gazebo: rectangle(house.maxX + 2.9, house.maxZ + 7.5, 6.8, 6.8),
  });
  const active = [house, ...features.map(key => regions[key])];
  if (id === 'estate') active.push(regions.treehouse, regions.gazebo);
  const minX = Math.min(...active.map(r => r.minX)) - 1.05;
  const maxX = Math.max(...active.map(r => r.maxX)) + 1.05;
  const minZ = Math.min(...active.map(r => r.minZ)) - 1.05;
  const maxZ = Math.max(...active.map(r => r.maxZ)) + 1.05;
  const land = rectangle((minX + maxX) / 2, (minZ + maxZ) / 2, maxX - minX, maxZ - minZ);
  return Object.freeze({ id, roomTier, level, label, width: land.width, depth: land.depth, houseSize: Object.freeze(size),
    house, regions, land, features: Object.freeze(features), description: "DisplayText0870, DisplayText0148, DisplayText0871, DisplayText0872." });
}

const TIER_SPECS = Object.freeze([
  ['courtyard', 'suite', 2, "Courtyard DisplayText0873", ['courtyard', 'garden']],
  ['garden', 'atrium', 3, "Garden DisplayText0874", ['courtyard', 'garden', 'pool']],
  ['estate', 'mansion', 4, "Estate DisplayText0875", ['courtyard', 'garden', 'pool', 'tennis']],
]);
/** Preset definitions sized for the preset floor plans. Live scenes pass the real house size instead. */
export const ESTATE_OUTDOOR_TIERS = Object.freeze(TIER_SPECS.map(spec => estateDefinition(...spec)));
const TIER_BY_ID = new Map(ESTATE_OUTDOOR_TIERS.map(tier => [tier.id, tier]));
/**
 * @param {string} tier courtyard | garden | estate
 * @param {{width:number, depth:number}} [house] interior footprint; when
 *   omitted the preset house size for the tier is used.
 */
export function getEstateOutdoorDefinition(tier = 'courtyard', house) {
  const preset = TIER_BY_ID.get(tier) ?? ESTATE_OUTDOOR_TIERS[0];
  if (!house) return preset;
  const size = normalizeHouse(house, preset.roomTier);
  if (size.width === preset.houseSize.width && size.depth === preset.houseSize.depth) return preset;
  const spec = TIER_SPECS.find(item => item[0] === preset.id);
  return estateDefinition(...spec, size);
}
export function getEstateForRoom(roomTier) {
  return ESTATE_OUTDOOR_TIERS.find(tier => tier.roomTier === roomTier) ?? null;
}
/** Which outdoor tier a floor plan unlocks, by room count (1 room: nothing yet). */
export function getEstateForRoomCount(count) {
  if (count >= 5) return TIER_BY_ID.get('estate');
  if (count >= 3) return TIER_BY_ID.get('garden');
  if (count >= 2) return TIER_BY_ID.get('courtyard');
  return null;
}

// ITF playing-court dimensions, uniformly miniaturized. Long axis is X;
// the net spans Z, service lines sit on either side of the net, not the baselines.
export const TENNIS_COURT = Object.freeze({ scale: .4, length: 23.77, doublesWidth: 10.97,
  singlesWidth: 8.23, serviceDistance: 6.4, netPostHeight: 1.07, netCenterHeight: .914 });
const rounded = (size, radius = .08) => new RoundedBoxGeometry(...size, 3, Math.min(radius, ...size.map(value => value / 2)));

/** Independent exterior visual layer. It never modifies interior save data. */
const ROUTE_KEYS = Object.freeze(['structure', 'material', 'decor', 'detail']);
const REGION_IDS = Object.freeze(['courtyard', 'garden', 'pool', 'tennis', 'treehouse', 'gazebo']);
const clampRank = value => Math.max(1, Math.min(3, Math.floor(Number(value) || 1)));

export function createEstateOutdoor({ tier = 'courtyard', house, levels = {}, plans = {}, colors = {}, onlyFeature = null } = {}) {
  if (onlyFeature !== null && !REGION_IDS.includes(onlyFeature)) throw new RangeError(`Unknown outdoor feature: ${onlyFeature}`);
  const root = new THREE.Group(); root.name = 'estate-outdoor';
  const geometry = new Set(), materials = new Set(), featureGroups = new Map();
  const materialCache = new Map();
  const landmarks = new Set();
  let ranks = { courtyard: 3, garden: 3, pool: 3, tennis: 3, treehouse: 3, gazebo: 3 };
  let customizationPlans = {};
  let customizationColors = {};
  function normalizeCustomization(nextLevels = {}, nextPlans = {}, nextColors = {}) {
    const nextRanks = { ...ranks };
    REGION_IDS.forEach(id => { if (id in nextLevels) nextRanks[id] = clampRank(nextLevels[id]); });
    const nextPlan = {};
    REGION_IDS.forEach(id => {
      const source = nextPlans[id] || {};
      nextPlan[id] = {};
      ROUTE_KEYS.forEach(route => {
        const fallback = route === 'structure' ? nextRanks[id] : 1;
        const inherited = route === 'structure' && id in nextLevels
          ? nextRanks[id]
          : (customizationPlans[id]?.[route] ?? fallback);
        nextPlan[id][route] = clampRank(source[route] ?? inherited);
      });
    });
    return { ranks: nextRanks, plans: nextPlan, colors: { ...customizationColors, ...nextColors } };
  }
  ({ ranks, plans: customizationPlans, colors: customizationColors } = normalizeCustomization(levels, plans, colors));
  let definition = getEstateOutdoorDefinition(tier, house), disposed = false;
  const planRank = (id, route) => customizationPlans[id]?.[route] ?? (route === 'structure' ? ranks[id] : 1);
  const zoneColor = (id, fallback) => customizationColors[id] || fallback;
  // A chosen paint color stays, but each material rank still shifts the large
  // surfaces: rank 2 darkens them, rank 3 warms them toward gilt cream.
  const dressedZone = (id, fallback) => {
    const color = new THREE.Color(zoneColor(id, fallback));
    const rank = planRank(id, 'material');
    if (rank === 2) color.multiplyScalar(.55);
    else if (rank >= 3) color.lerp(new THREE.Color('#f8e7b0'), .62);
    return `#${color.getHexString()}`;
  };
  function material(color, options = {}) {
    const key = `${color}:${JSON.stringify(options)}`;
    if (!materialCache.has(key)) {
      const value = new THREE.MeshStandardMaterial({ color, roughness: .78, ...options });
      materials.add(value); materialCache.set(key, value);
    }
    return materialCache.get(key);
  }
  function add(parent, geo, color, position, options = {}) {
    geometry.add(geo);
    const mesh = new THREE.Mesh(geo, material(color, options));
    mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function box(parent, size, color, position, radius = .08, options = {}) {
    return add(parent, rounded(size, radius), color, position, options);
  }
  function cylinder(parent, radius, height, color, position, options = {}) {
    return add(parent, new THREE.CylinderGeometry(radius, radius * 1.06, height, 18), color, position, options);
  }
  function sphere(parent, color, position, scale) {
    const mesh = add(parent, new THREE.SphereGeometry(1, 16, 12), color, position); mesh.scale.set(...scale); return mesh;
  }
  function lines(parent, points, color, opacity = 1) {
    const geo = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
    const mat = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
    geometry.add(geo); materials.add(mat);
    const mesh = new THREE.LineSegments(geo, mat); parent.add(mesh); return mesh;
  }
  function group(id) {
    const value = new THREE.Group(); value.name = `estate-${id}`; value.userData.estateFeature = id;
    const bounds = definition.regions[id];
    if (bounds) { value.position.set(bounds.x, 0, bounds.z); value.userData.footprint = bounds; }
    if (onlyFeature) value.position.set(0, 0, 0);
    featureGroups.set(id, value); root.add(value); return value;
  }
  function tree(parent, x, z, scale = 1) {
    const g = new THREE.Group(); g.position.set(x, -.12, z); g.scale.setScalar(scale); parent.add(g);
    cylinder(g, .16, .75, '#855038', [0, .34, 0]);
    sphere(g, '#4f7e42', [0, 1.05, 0], [.7, .85, .7]);
    sphere(g, '#78a952', [-.32, 1.22, .03], [.43, .48, .4]);
    sphere(g, '#3f713b', [.34, 1.23, -.02], [.4, .47, .38]);
  }
  function flower(parent, x, z, color, scale = 1) {
    const g = new THREE.Group(); g.position.set(x, -.07, z); g.scale.setScalar(scale); parent.add(g);
    cylinder(g, .018, .24, '#6d9657', [0, .13, 0]);
    for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; sphere(g, color, [Math.cos(a) * .065, .29, Math.sin(a) * .065], [.06, .055, .06]); }
    sphere(g, '#f7d46b', [0, .29, 0], [.045, .045, .045]);
  }
  function hedge(parent, x, z, width, depth) {
    box(parent, [width, .42, depth], '#567f42', [x, .09, z], .10);
    for (let i = -2; i <= 2; i++) sphere(parent, '#87ae68', [x + i * (width - .45) / 5, .34, z], [.23, .20, .18]);
  }
  function lamp(parent, x, z, color = '#f6d786', elevated = false) {
    cylinder(parent, .028, .82, '#725c45', [x, .41, z]);
    sphere(parent, color, [x, .89 + (elevated ? .25 : 0), z], [.10, .12, .10]);
    const bulb = parent.children[parent.children.length - 1];
    bulb.material = material(color, { emissive: color, emissiveIntensity: elevated ? .55 : .20 });
    bulb.userData.isEstateLight = true;
    box(parent, [.18, .06, .18], '#9e7e4d', [x, .78, z], .025);
  }
  function sign(parent, id, x, z, color = '#f4d98d', elevated = false) {
    const plaque = box(parent, [.82, .22, .055], '#76543f', [x, elevated ? 1.02 : .67, z], .04);
    box(parent, [.68, .045, .018], color, [x, elevated ? 1.02 : .67, z + .032], .008);
    plaque.name = `estate-sign-${id}`;
    plaque.userData.estateSign = id;
    return plaque;
  }
  function flag(parent, x, z, color = '#e88d78') {
    cylinder(parent, .025, .86, '#8a6746', [x, .43, z]);
    box(parent, [.38, .24, .035], color, [x + .18, .72, z], .025);
    sphere(parent, '#f5d16a', [x, .91, z], [.06, .06, .06]);
  }
  function fountain(parent, x, z) {
    cylinder(parent, .81, .18, '#d1ad7a', [x, -.03, z]);
    cylinder(parent, .66, .035, '#43b8d5', [x, .075, z], { roughness: .25 });
    cylinder(parent, .31, .30, '#f1d7a4', [x, .22, z]);
    cylinder(parent, .46, .10, '#dfba83', [x, .43, z]);
    sphere(parent, '#8ee1e1', [x, .69, z], [.14, .25, .14]);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; sphere(parent, '#8ee1e1', [x + Math.cos(a) * .40, .27, z + Math.sin(a) * .40], [.035, .16, .035]); }
  }
  const MATERIALS = Object.freeze({
    courtyard: Object.freeze({ 1: ['#e4c999', '#bd9d70'], 2: ['#d8d7ca', '#a9b7ae'], 3: ['#f8efd9', '#d6ae62'] }),
    garden: Object.freeze({ 1: ['#ddc298', '#bd9d70'], 2: ['#d7d8c9', '#a2b89b'], 3: ['#f6ead5', '#d8b36b'] }),
    pool: Object.freeze({ 1: ['#d3aa73', '#fff0cf'], 2: ['#d7d9cf', '#9fc6be'], 3: ['#f7edda', '#d9b766'] }),
    tennis: Object.freeze({ 1: ['#416c67', '#5b9d54'], 2: ['#6b7880', '#66a65c'], 3: ['#e3d8c8', '#74aa63'] }),
    treehouse: Object.freeze({ 1: ['#a46a35', '#d6a765'], 2: ['#d4c7ae', '#a97948'], 3: ['#f3e5cb', '#d6b15f'] }),
    gazebo: Object.freeze({ 1: ['#d8c09a', '#a46a35'], 2: ['#d7d8ce', '#b89a66'], 3: ['#f4e9d5', '#d7b45e'] }),
  });
  function materialPair(id) { return MATERIALS[id]?.[planRank(id, 'material')] || MATERIALS[id]?.[1] || ['#d3aa73', '#fff0cf']; }
  function patternedStrip(parent, id, size, p, axis = 'z') {
    const rank = planRank(id, 'material');
    const [, accent] = materialPair(id);
    if (rank < 2) return;
    const count = axis === 'z' ? Math.max(2, Math.floor(size[2] / .82)) : Math.max(2, Math.floor(size[0] / .82));
    for (let i = 0; i < count; i++) {
      const ratio = count === 1 ? .5 : i / (count - 1);
      const offset = axis === 'z' ? p[2] - size[2] / 2 + ratio * size[2] : p[0] - size[0] / 2 + ratio * size[0];
      const surfaceY = p[1] + .08;
      const stripe = axis === 'z'
        ? box(parent, [size[0] - .18, .012, .022], accent, [p[0], surfaceY, offset], .003)
        : box(parent, [.022, .012, size[2] - .18], accent, [offset, surfaceY, p[2]], .003);
      stripe.castShadow = false;
    }
    if (rank > 2) {
      const border = box(parent, [size[0] - .10, .016, .045], accent, [p[0], p[1] + .085, p[2] - size[2] / 2 + .07], .01);
      border.castShadow = false;
      const border2 = box(parent, [size[0] - .10, .016, .045], accent, [p[0], p[1] + .085, p[2] + size[2] / 2 - .07], .01);
      border2.castShadow = false;
    }
  }
  function bench(parent, x, z, rotation = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotation; parent.add(g);
    for (const px of [-.63, .63]) box(g, [.13, .44, .5], '#7f5b39', [px, .1, 0], .025);
    for (const pz of [-.18, 0, .18]) box(g, [1.62, .08, .15], '#c49455', [0, .37, pz], .025);
    box(g, [1.62, .42, .10], '#d6ad68', [0, .63, -.23], .04);
  }
  function buildGarden() {
    const garden = group('garden');
    const structure = planRank('garden', 'structure');
    const decor = planRank('garden', 'decor');
    const detail = planRank('garden', 'detail');
    const [materialBase, materialAccent] = materialPair('garden');
    const walk = box(garden, [1.30 + (planRank('garden', 'material') > 2 ? .18 : 0), .10, 7.9], dressedZone('garden', materialBase), [0, -.10, 0], .16); walk.castShadow = false;
    patternedStrip(garden, 'garden', [1.28, .1, 7.75], [0, -.10, 0]);
    for (const z of [-3.5, -2.7, -1.9, -.8, .3, 1.4, 2.5, 3.4]) box(garden, [1.05, .012, .025], '#bd9d70', [0, -.043, z], .005).castShadow = false;
    // A small pond and bridge make the garden a destination with a clear focal point.
    box(garden, [2.25, .08, 1.72], materialAccent, [-1.72, -.09, -.55], .22).castShadow = false;
    box(garden, [1.92, .035, 1.42], '#43b8d5', [-1.72, -.005, -.55], .18, { roughness: .25 }).castShadow = false;
    box(garden, [2.18, .10, .34], '#a87546', [-1.72, .16, .75], .08);
    for (const x of [-2.45, -.99]) sphere(garden, '#b7a174', [x, .06, .13], [.19, .12, .16]);
    if (structure > 1) { fountain(garden, .92, .65); bench(garden, .84, 2.72, Math.PI / 2); }
    if (structure > 2) addLandmark(garden, 'greenhouse', 3, [0, -.04, -2.8]);
    for (const [x, z, scale] of [[-2.65, -3.45, .72], [2.65, -3.45, .68], [-2.65, 3.45, .64], [2.65, 3.45, .66]]) tree(garden, x, z, scale);
    if (decor > 1) box(garden, [2.8, decor > 2 ? 2.0 : 1.15, .24], decor > 2 ? '#f6ca57' : '#ef8ca0', [0, .75, 2.4], .1);
    for (const x of [-2.32, 2.32]) {
      box(garden, [.83, .19, 3.15], dressedZone('garden', '#d7b485'), [x, -.12, 0], .13);
      box(garden, [.69, .06, 2.99], dressedZone('garden', '#547837'), [x, .005, 0], .10);
      if (decor > 1) for (let i = 0; i < (decor > 2 ? 12 : 7); i++) flower(garden, x + (i % 2 ? .17 : -.17), -1.25 + i * .30, zoneColor('garden', ['#ef8ca0', '#f6ca57', '#b79bdc'][i % 3]), 1.08);
    }
    if (decor > 2) {
      for (const x of [-2.8, 2.8]) for (const z of [-2.9, 2.9]) flower(garden, x, z, zoneColor('garden', '#f6ca57'), 1.5);
      for (const x of [-2.9, 2.9]) hedge(garden, x, 0, .52, 2.3);
      flag(garden, -2.65, -3.7, zoneColor('garden', '#e88d78'));
      flag(garden, 2.65, 3.7, zoneColor('garden', '#f4c95d'));
    }
    if (detail > 1) {
      box(garden, [2.2, detail > 2 ? 1.7 : 1.15, .16], detail > 2 ? '#f4d27a' : '#e7c38a', [0, .75, -3.55], .08);
      for (const z of [-2.9, 2.9]) lamp(garden, 0, z, detail > 2 ? '#ffd978' : '#f6d786', detail > 2);
    }
    if (detail > 2) sign(garden, 'garden', 0, -3.92, zoneColor('garden', '#f4d98d'), true);
  }
  function buildPool() {
    const pool = group('pool');
    const structure = planRank('pool', 'structure');
    const decor = planRank('pool', 'decor');
    const detail = planRank('pool', 'detail');
    const materialRank = planRank('pool', 'material');
    const paint = customizationColors.pool;
    // Paint may warm the surround, but each rank keeps its own deck, coping and pattern.
    const finish = hex => {
      if (!paint) return hex;
      const color = new THREE.Color(hex);
      color.lerp(new THREE.Color(paint), .2);
      return `#${color.getHexString()}`;
    };
    const deckHex = materialRank >= 3 ? '#f7fbff' : materialRank === 2 ? '#6e4328' : '#f6f3ec';
    const copingHex = materialRank >= 3 ? '#f7fbff' : materialRank === 2 ? '#5c3a22' : '#fffdf8';
    const waterColor = '#3ec4de';
    const basinZ = .45;
    const deckMesh = box(pool, [6.6, .18, 8.6], finish(deckHex), [0, -.05, 0], .16);
    deckMesh.name = 'pool-deck';
    box(pool, [4.2, .08, 5.2], finish(materialRank >= 3 ? '#d5e6f2' : materialRank === 2 ? '#c98448' : '#e7f4f6'), [0, .02, basinZ], .05);
    const coping = (size, position) => {
      const mesh = box(pool, size, finish(copingHex), position, .04);
      mesh.name = 'pool-coping';
      return mesh;
    };
    if (materialRank < 3) {
      coping([4.4, materialRank === 2 ? .22 : .16, .32], [0, .13, basinZ - 2.46]);
      coping([4.4, materialRank === 2 ? .22 : .16, .32], [0, .13, basinZ + 2.46]);
      coping([.32, materialRank === 2 ? .22 : .16, 4.76], [-2.08, .13, basinZ]);
      coping([.32, materialRank === 2 ? .22 : .16, 4.76], [2.08, .13, basinZ]);
    } else {
      const checker = (length, alongX, x, z, breadth, y, name) => {
        const step = .52;
        const count = Math.max(4, Math.round(length / step));
        const span = length / count;
        for (let i = 0; i < count; i++) {
          const offset = -length / 2 + span * (i + .5);
          const color = finish(i % 2 === 0 ? '#1d6f9c' : '#f7fbff');
          const mesh = alongX
            ? box(pool, [span * .9, .08, breadth], color, [x + offset, y, z], .02)
            : box(pool, [breadth, .08, span * .9], color, [x, y, z + offset], .02);
          mesh.castShadow = false;
          if (name) mesh.name = name;
        }
      };
      checker(4.6, true, 0, basinZ - 2.48, .36, .16, 'pool-coping');
      checker(4.6, true, 0, basinZ + 2.48, .36, .16, 'pool-coping');
      checker(5.0, false, -2.12, basinZ, .36, .16, 'pool-coping');
      checker(5.0, false, 2.12, basinZ, .36, .16, 'pool-coping');
      checker(6.3, true, 0, -3.82, .62, .07);
      checker(6.3, true, 0, 3.82, .62, .07);
      checker(6.6, false, -2.92, 0, .62, .07);
      checker(6.6, false, 2.92, 0, .62, .07);
      const metal = { roughness: .28, metalness: .72 };
      for (const [size, position] of [
        [[3.95, .08, .14], [0, .12, basinZ - 2.34]],
        [[3.95, .08, .14], [0, .12, basinZ + 2.34]],
        [[.14, .08, 4.55], [-1.9, .12, basinZ]],
        [[.14, .08, 4.55], [1.9, .12, basinZ]],
      ]) {
        const rim = box(pool, size, '#e7c56a', position, .01, metal);
        rim.castShadow = false;
        rim.name = 'pool-metal-rim';
      }
    }
    if (materialRank === 2) {
      const slabs = [[-1.5, -2.05], [1.5, -2.05], [-1.5, .45], [1.5, .45], [-1.5, 2.95], [1.5, 2.95]];
      slabs.forEach(([x, z], index) => {
        const slab = box(pool, [2.75, .03, 2.2], finish(index % 2 ? '#f0a85a' : '#d06a32'), [x, .048, z], .04);
        slab.castShadow = false;
        slab.name = 'pool-stone-slab';
      });
    } else if (materialRank === 1) {
      for (let z = -3.55; z <= 3.55; z += 1.2) box(pool, [6.25, .02, .09], finish('#c5bfb2'), [0, .055, z], .005).castShadow = false;
      for (let x = -2.7; x <= 2.7; x += 1.2) box(pool, [.09, .02, 8.2], finish('#c5bfb2'), [x, .055, 0], .005).castShadow = false;
    }
    const water = box(pool, [3.52, .07, 4.4], waterColor, [0, .04, basinZ], .03, { roughness: .22, metalness: .08 });
    water.castShadow = false; water.name = 'pool-water';
    for (const x of [-1.05, 0, 1.05]) box(pool, [.018, .006, 3.7], '#d7f6fb', [x, .08, basinZ + .1], .001).castShadow = false;
    const dryStep = finish(materialRank === 2 ? '#f3d7b0' : materialRank >= 3 ? '#f7fbff' : '#f7f4ee');
    const wetStep = finish(materialRank === 2 ? '#e7c49a' : materialRank >= 3 ? '#d5e4ee' : '#d5ece8');
    box(pool, [1.4, .08, .32], dryStep, [0, .16, basinZ - 2.35], .03);
    box(pool, [1.2, .05, .3], wetStep, [0, .03, basinZ - 1.85], .03);
    box(pool, [1.05, .04, .28], finish(materialRank === 2 ? '#d7b48a' : '#b7ddd8'), [0, .015, basinZ - 1.5], .03);
    const ladderZ = basinZ + 2.15;
    for (const x of [-.24, .24]) cylinder(pool, .028, .52, '#f5e5c6', [x, .26, ladderZ]);
    for (const y of [.1, .26]) cylinder(pool, .022, .48, '#f5e5c6', [0, y, ladderZ]).rotation.z = Math.PI / 2;
    if (structure > 2) {
      for (const x of [-1.55, 1.55]) cylinder(pool, .07, 1.25, '#aa783e', [x, .68, -3.55]);
      box(pool, [3.5, .12, 1.15], '#f2ca65', [0, 1.32, -3.55], .08);
    }
    if (structure > 1) {
      for (const x of [-1.05, 1.05]) {
        box(pool, [1.0, .14, 1.45], '#fff1d2', [x, .14, -3.5], .08);
        const back = box(pool, [1.0, .1, .36], '#edaa6e', [x, .28, -4.1], .05); back.rotation.x = -.35;
      }
    }
    if (decor > 1) {
      for (const x of [-2.72, 2.72]) {
        cylinder(pool, .024, 1.2, '#a5794a', [x, .66, .15]);
        add(pool, new THREE.ConeGeometry(.38, .22, 16), x < 0 ? '#f2b86d' : '#eb8f86', [x, 1.28, .15]);
      }
      const float = add(pool, new THREE.TorusGeometry(.26, .065, 8, 18), '#f5d05f', [.65, .09, basinZ + .35]);
      float.rotation.x = Math.PI / 2;
      for (const x of [-2.65, 2.65]) flower(pool, x, 3.7, zoneColor('pool', '#ed9a72'), 1.2);
    }
    if (decor > 2) {
      box(pool, [2.3, .85, .95], '#f4e2c4', [0, .5, 3.7], .07);
      box(pool, [2.5, .1, 1.15], '#e07a62', [0, .98, 3.7], .05);
      const slide = box(pool, [.55, .08, 1.15], '#f08a6a', [2.55, .22, basinZ - .2], .03);
      slide.rotation.x = -.28;
    }
    if (detail > 1) {
      for (const x of [-2.85, 2.85]) lamp(pool, x, -3.7, detail > 2 ? '#ffe08a' : '#f6d786', detail > 2);
      if (detail > 2) sign(pool, 'pool', 2.55, 4.05, zoneColor('pool', '#f4d98d'), true);
    }
  }
  function buildTennis() {
    const tennis = group('tennis'), s = TENNIS_COURT.scale;
    const structure = planRank('tennis', 'structure');
    const decor = planRank('tennis', 'decor');
    const detail = planRank('tennis', 'detail');
    const [apronColor, courtMaterialColor] = materialPair('tennis');
    const length = TENNIS_COURT.length * s, doubles = TENNIS_COURT.doublesWidth * s;
    const singles = TENNIS_COURT.singlesWidth * s, service = TENNIS_COURT.serviceDistance * s;
    const apron = box(tennis, [14, .16, 8], dressedZone('tennis', apronColor), [0, -.075, 0], .15); apron.castShadow = false;
    const court = box(tennis, [length, .024, doubles], dressedZone('tennis', courtMaterialColor), [0, .025, 0], .003); court.castShadow = false; court.name = 'tennis-playing-court';
    patternedStrip(tennis, 'tennis', [14, .16, 8], [0, -.075, 0], 'x');
    const line = (name, x, z, width, depth) => {
      const stripe = box(tennis, [width, .009, depth], '#fff9db', [x, .043, z], .002);
      stripe.castShadow = false; stripe.name = `tennis-line-${name}`;
      stripe.userData.courtLine = name; return stripe;
    };
    const thickness = .028;
    for (const side of [-1, 1]) {
      line(`baseline-${side}`, side * length / 2, 0, thickness, doubles + thickness);
      line(`doubles-sideline-${side}`, 0, side * doubles / 2, length, thickness);
      line(`singles-sideline-${side}`, 0, side * singles / 2, length, thickness);
      line(`service-${side}`, side * service, 0, thickness, singles);
      line(`baseline-center-mark-${side}`, side * (length / 2 - .04), 0, .08, thickness);
    }
    // The centre service mark is two short perpendicular-to-net segments.
    // A single line across the net would read as a third baseline on a projector.
    line('service-center-near', -service / 2, 0, service, thickness);
    line('service-center-far', service / 2, 0, service, thickness);
    const net = new THREE.Group(); net.name = 'tennis-net'; tennis.add(net);
    const netHalfWidth = doubles / 2 + .914 * s;
    const postHeight = TENNIS_COURT.netPostHeight * s, centerHeight = TENNIS_COURT.netCenterHeight * s;
    for (const z of [-netHalfWidth, netHalfWidth]) cylinder(net, .034, postHeight + .025, '#eee1bd', [0, postHeight / 2 + .053, z]);
    const threads = [];
    const topHeight = z => .053 + centerHeight + (postHeight - centerHeight) * (z / netHalfWidth) ** 2;
    for (let z = -netHalfWidth; z < netHalfWidth; z += .09) threads.push([0, .054, z], [0, topHeight(z), z]);
    for (let y = .09; y < centerHeight; y += .085) threads.push([0, y + .053, -netHalfWidth], [0, y + .053, netHalfWidth]);
    lines(net, threads, '#293f3a', .64);
    for (let z = -netHalfWidth; z < netHalfWidth; z += .13) lines(net, [[0, topHeight(z), z], [0, topHeight(Math.min(z + .13, netHalfWidth)), Math.min(z + .13, netHalfWidth)]], '#fff7d9');
    if (structure > 1) {
    // Low perimeter fence, safely outside the court and its running space.
    const fence = [], fenceY = .89, fx = 6.77, fz = 3.7;
    for (const z of [-fz, fz]) {
      for (let x = -fx; x <= fx + .01; x += fx / 3) { cylinder(tennis, .028, .96, '#50766a', [x, .45, z]); fence.push([x, .05, z], [x, fenceY, z]); }
      fence.push([-fx, fenceY, z], [fx, fenceY, z]);
      for (let x = -fx; x < fx; x += .26) fence.push([x, .10, z], [x, .80, z]);
    }
    for (const x of [-fx, fx]) { fence.push([x, fenceY, -fz], [x, fenceY, fz]); for (let z = -fz; z < fz; z += .26) fence.push([x, .10, z], [x, .8, z]); }
    lines(tennis, fence, '#4b7267', .36);
    for (const x of [-6.4, 6.4]) {
      cylinder(tennis, .045, 1.7, '#ac925e', [x, .82, -3.35]);
      box(tennis, [.36, .14, .24], '#f4db96', [x, 1.71, -3.35], .05);
    }
    // A scoreboard and two low spectator benches make the sport area feel inhabited.
    box(tennis, [1.25, 1.15, .18], '#76543f', [-5.7, .63, 3.25], .05);
    box(tennis, [.92, .40, .05], '#f3dc8c', [-5.7, 1.05, 3.12], .025);
    for (const y of [.22, .48]) box(tennis, [3.05, .10, .35], '#bd8d53', [1.2, y, 3.22], .03);
    }
    if (structure > 2) {
      for (const x of [-2.6, 2.6]) for (const z of [-3.65, -2.95]) cylinder(tennis, .075, 1.75, '#c09455', [x, .85, z]);
      const roof = box(tennis, [5.85, .16, 1.08], '#247385', [0, 1.81, -3.3], .07); roof.rotation.x = -.1;
      for (const z of [-3.6, -3.25]) box(tennis, [5.5, .16, .25], '#e7c684', [0, .36, z], .035);
    }
    if (decor > 1) {
      for (const x of [-5.85, 5.85]) {
        flag(tennis, x, -3.35, zoneColor('tennis', x < 0 ? '#e88d78' : '#f4c95d'));
        box(tennis, [.56, .14, .56], '#f2cf84', [x, .08, 2.85], .08);
        flower(tennis, x, 2.85, zoneColor('tennis', '#ed9a72'), 1.4);
      }
      if (decor > 2) {
        box(tennis, [6.2, 1.5, .22], '#247385', [0, .95, 3.35], .08);
        box(tennis, [5.4, .8, .08], '#f4d27a', [0, 1.15, 3.5], .04);
        for (const x of [-3.9, 3.9]) bench(tennis, x, 3.14, 0);
        for (const x of [-5.9, 5.9]) flag(tennis, x, 1.75, zoneColor('tennis', '#f4c95d'));
      }
    }
    if (detail > 1) {
      for (const x of [-6.25, 6.25]) lamp(tennis, x, -2.8, detail > 2 ? '#ffdc70' : '#f6d786', detail > 2);
      if (detail > 2) sign(tennis, 'tennis', 0, -3.9, zoneColor('tennis', '#f4d98d'), true);
    }
  }
  function addLandmark(parent, kind, level, position) {
    const model = createEstateLandmark(kind, { level }); model.position.set(...position); parent.add(model); landmarks.add(model); return model;
  }
  function buildCourtyard(next) {
    const courtyard = group('courtyard');
    const structure = planRank('courtyard', 'structure');
    const decor = planRank('courtyard', 'decor');
    const detail = planRank('courtyard', 'detail');
    const [courtyardBase, courtyardAccent] = materialPair('courtyard');
    const courtyardDepth = next.regions.courtyard.depth;
    box(courtyard, [next.regions.courtyard.width, .10, courtyardDepth], dressedZone('courtyard', courtyardBase), [0, -.07, 0], .12).castShadow = false;
    patternedStrip(courtyard, 'courtyard', [next.regions.courtyard.width - .12, .1, courtyardDepth - .12], [0, -.07, 0], 'x');
    for (let x = -next.regions.courtyard.width / 2 + .4; x < next.regions.courtyard.width / 2; x += .75) box(courtyard, [.025, .012, courtyardDepth - .25], courtyardAccent, [x, -.012, 0], .003).castShadow = false;
    for (const x of [-next.regions.courtyard.width / 2 + .55, next.regions.courtyard.width / 2 - .55]) hedge(courtyard, x, 0, .62, courtyardDepth - .35);
    // The entrance gives the exterior a readable first stop instead of a flat strip.
    const gateZ = courtyardDepth / 2 - .33;
    if (structure > 2) {
    for (const x of [-1.62, 1.62]) {
      box(courtyard, [.42, 1.75, .42], '#c79a57', [x, .80, gateZ], .08);
      box(courtyard, [.56, .12, .56], '#f0ce78', [x, 1.72, gateZ], .08);
    }
    box(courtyard, [3.28, .18, .18], '#c79a57', [0, 1.58, gateZ], .07);
    box(courtyard, [2.55, .08, .10], '#f4d98d', [0, 1.68, gateZ], .04);
    }
    if (decor > 1) {
      for (const x of [-3.3, 3.3]) flower(courtyard, x, -.72, zoneColor('courtyard', '#ef8ca0'), 1.45);
      bench(courtyard, -3.55, .48, Math.PI / 2);
      if (decor > 2) {
        const edgeX = Math.min(4.5, next.regions.courtyard.width / 2 - .80);
        for (const x of [-edgeX, edgeX]) hedge(courtyard, x, 0, .58, 1.35);
        flag(courtyard, -edgeX, .92, zoneColor('courtyard', '#e88d78'));
        flag(courtyard, edgeX, .92, zoneColor('courtyard', '#f4c95d'));
      }
    }
    if (structure > 1) fountain(courtyard, 0, -.45);
    if (detail > 1) {
      for (const x of [-3.3, 3.3]) lamp(courtyard, x, -.72, detail > 2 ? '#ffda71' : '#f6d786', detail > 2);
      if (detail > 2) sign(courtyard, 'courtyard', 0, .97, zoneColor('courtyard', '#f4d98d'), true);
    }
  }
  function buildLandmarks() {
      const showTree = !onlyFeature || onlyFeature === 'treehouse', showGazebo = !onlyFeature || onlyFeature === 'gazebo';
      const treeZone = showTree ? group('treehouse') : null, gazeboZone = showGazebo ? group('gazebo') : null;
      const treeStructure = planRank('treehouse', 'structure');
      const treeMaterial = planRank('treehouse', 'material');
      const treeDecor = planRank('treehouse', 'decor');
      const treeDetail = planRank('treehouse', 'detail');
      const gazeboStructure = planRank('gazebo', 'structure');
      const gazeboMaterial = planRank('gazebo', 'material');
      const gazeboDecor = planRank('gazebo', 'decor');
      const gazeboDetail = planRank('gazebo', 'detail');
      if (showTree) addLandmark(treeZone, 'treehouse', treeStructure, [0,-.16,0]);
      if (showGazebo) addLandmark(gazeboZone, 'gazebo', gazeboStructure, [0,-.16,0]);
      // A broad material cap keeps the two small landmarks readable at overview scale.
      if (showTree) box(treeZone, [3.6, .18, 3.2], dressedZone('treehouse', materialPair('treehouse')[0]), [0, treeStructure > 1 ? 2.85 : 2.35, 0], .12);
      if (showTree) box(treeZone, [1.78, .045, .72], dressedZone('treehouse', materialPair('treehouse')[1]), [0, treeStructure > 1 ? 2.77 : 2.25, -.36], .10);
      if (showGazebo) box(gazeboZone, [3.8 + gazeboMaterial * .35 + (gazeboStructure > 2 ? 1.1 : 0), .14, 3.8 + gazeboMaterial * .35 + (gazeboStructure > 2 ? 1.1 : 0)], dressedZone('gazebo', materialPair('gazebo')[0]), [0, gazeboStructure > 2 ? 2.85 : gazeboStructure > 1 ? 2.12 : 1.82, 0], .18);
      if (showGazebo && gazeboDetail > 1) box(gazeboZone, [3.3, .05, 3.3], gazeboDetail > 2 ? '#f4d27a' : '#e7a3b0', [0, .05, 0], .04);
      for (const [x,z] of [[-1.9,-1.9],[1.9,-1.9],[-1.9,1.9],[1.9,1.9]]) {
        if (showGazebo && gazeboDecor > 1) hedge(gazeboZone,x,z,1.1,.65);
        if (showGazebo && gazeboDecor > 0) flower(gazeboZone,x,z,zoneColor('gazebo','#e78c9e'),1.8 + gazeboDecor * .12);
      }
      if (showTree && treeDecor > 1) {
        if (showTree) box(treeZone, [2.4, .7, .16], '#f1c35b', [0, 1.2, 1.25], .05);
        for (const x of [-1.25, 1.25]) flower(treeZone, x, .90, zoneColor('treehouse', '#f1c35b'), 1.45);
        flag(treeZone, -.92, .90, zoneColor('treehouse', '#e88d78'));
      }
      if (showTree && treeDecor > 2) box(treeZone, [3.4, 1.7, .22], '#e07a62', [0, 2.35, 1.35], .06);
      if (showGazebo && gazeboDecor > 2) {
        if (showGazebo) box(gazeboZone, [3.6, 1.3, .18], '#e07a62', [0, 1.15, 1.7], .06);
        bench(gazeboZone, 0, 1.55, 0);
        flag(gazeboZone, 0, -1.82, zoneColor('gazebo', '#f4c95d'));
      }
      if (showTree && treeDetail > 1) {
        if (showTree) box(treeZone, [1.6, treeDetail > 2 ? 1.9 : 1.05, 1.6], treeDetail > 2 ? '#f4d27a' : '#e7a3b0', [1.4, 1.15, -1.2], .1);
        lamp(treeZone, .96, .92, treeDetail > 2 ? '#ffda71' : '#f6d786', treeDetail > 2);
        if (showTree && treeDetail > 2) sign(treeZone, 'treehouse', 0, 1.18, zoneColor('treehouse', '#f4d98d'), true);
      }
      if (showGazebo && gazeboDetail > 1) {
        cylinder(gazeboZone, .09, gazeboDetail > 2 ? 1.6 : .85, gazeboDetail > 2 ? '#f4d27a' : '#e7a3b0', [0, 2.7, 0]);
        if (showGazebo) box(gazeboZone, [gazeboDetail > 2 ? 1.3 : .7, .45, .1], gazeboDetail > 2 ? '#e07a62' : '#f1c35b', [.45, gazeboDetail > 2 ? 3.7 : 3.15, 0], .04);
        lamp(gazeboZone, 0, 1.8, gazeboDetail > 2 ? '#ffda71' : '#f6d786', gazeboDetail > 2);
        if (showGazebo && gazeboDetail > 2) sign(gazeboZone, 'gazebo', 0, -1.82, zoneColor('gazebo', '#f4d98d'), true);
      }
  }
  function clearBuilt() {
    landmarks.forEach(model => model.dispose()); landmarks.clear();
    geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    geometry.clear(); materials.clear(); materialCache.clear(); featureGroups.clear(); root.clear();
  }
  function build(next) {
    clearBuilt(); definition = next;
    if (onlyFeature) {
      if (onlyFeature === 'pool') buildPool();
      else if (onlyFeature === 'garden') buildGarden();
      else if (onlyFeature === 'tennis') buildTennis();
      else if (onlyFeature === 'courtyard') buildCourtyard(next);
      else buildLandmarks();
      const selected = featureGroups.get(onlyFeature);
      selected.traverse(object => { if (object.isMesh) object.userData.estateFeature = onlyFeature; });
      root.userData.estateTier = next.id; root.userData.estateDefinition = next;
      root.userData.estateFeatures = [onlyFeature];
      return;
    }
    const lawn = group('lawn'), land = next.land;
    box(lawn, [land.width, .28, land.depth], '#77a747', [land.x, -.34, land.z], .25).castShadow = false;
    box(lawn, [land.width - .10, .50, land.depth - .10], '#95683d', [land.x, -.72, land.z], .22).castShadow = false;
    // A continuous property edge and groves give the ground a designed silhouette.
    for (const x of [land.minX + .38, land.maxX - .38]) {
      box(lawn, [.27, .46, land.depth - 1.0], '#c6a471', [x, .03, land.z], .065);
      for (let z = land.minZ + 1; z < land.maxZ - 1; z += 2.8) {
        box(lawn, [.44, .70, .44], '#e4c38d', [x, .17, z], .065);
      }
    }
    for (const z of [land.minZ + .35, land.maxZ - .35]) {
      const gateX = 3.7;
      for (const [a,b] of [[land.minX+.4,gateX-1.3],[gateX+1.3,land.maxX-.4]])
        box(lawn, [b-a,.46,.27], '#c6a471', [(a+b)/2,.03,z], .06);
    }
    for (let x=land.minX+1.6; x<land.maxX-1; x+=3.2) tree(lawn,x,land.minZ+.95,1.45 + .2*Math.sin(x));
    for (const z of [6.2,10.2,15.8]) { if (z < land.maxZ-1) { tree(lawn,land.maxX-1.2,z,1.4); tree(lawn,land.minX+1.2,z,1.25); } }
    // Connecting paths turn the facilities into one playable estate instead of isolated dioramas.
    const pathColor = '#e4c999';
    if (next.features.includes('courtyard')) box(lawn, [2.25, .06, next.regions.courtyard.minZ - next.house.maxZ], pathColor, [0, -.16, (next.regions.courtyard.minZ + next.house.maxZ) / 2], .08).castShadow = false;
    if (next.features.includes('garden')) box(lawn, [next.house.minX - next.regions.garden.maxX, .06, 1.0], pathColor, [(next.house.minX + next.regions.garden.maxX) / 2, -.16, 0], .08).castShadow = false;
    if (next.features.includes('pool')) box(lawn, [next.regions.pool.minX - next.house.maxX, .06, 1.0], pathColor, [(next.regions.pool.minX + next.house.maxX) / 2, -.16, 0], .08).castShadow = false;
    for (const [x, z, color] of [[0, next.regions.courtyard.minZ - .24, '#e88d78'], [next.regions.garden.maxX + .24, 0, '#f4c95d'], [next.regions.pool.minX - .24, 0, '#77c4d4']]) {
      if (x < next.land.minX || x > next.land.maxX || z < next.land.minZ || z > next.land.maxZ) continue;
      flag(lawn, x, z, color);
    }
    buildCourtyard(next);
    buildGarden(); buildPool(); buildTennis();
    for (const [id, featureGroup] of featureGroups) featureGroup.visible = id === 'lawn' || next.features.includes(id);
    if (next.id === 'estate') {
      buildLandmarks();
      const entranceX = 3.7, gateZ = land.maxZ-.38;
      box(lawn,[1.8,.065,gateZ-next.regions.courtyard.maxZ],pathColor,[entranceX,-.145,(gateZ+next.regions.courtyard.maxZ)/2],.09);
      box(lawn,[next.regions.gazebo.x-entranceX,.065,1.25],pathColor,[(next.regions.gazebo.x+entranceX)/2,-.145,next.regions.gazebo.z],.09);
      box(lawn,[2.5,.08,1.3],pathColor,[next.regions.tennis.maxX+1.25,-.145,next.regions.tennis.z],.1);
      box(lawn,[3.6,.065,1.25],pathColor,[next.regions.treehouse.x+.5,-.145,next.regions.treehouse.maxZ+.1],.08);
      for (const x of [entranceX-1.38,entranceX+1.38]) {
        box(lawn,[.62,1.65,.62],'#d9b77d',[x,.64,gateZ],.10);
        add(lawn,new THREE.ConeGeometry(.53,.5,4),'#247385',[x,1.7,gateZ]).rotation.y=Math.PI/4;
        lamp(lawn,x,gateZ-.6);
      }
      for (const z of [next.regions.courtyard.maxZ+1.6,next.regions.courtyard.maxZ+5.6,gateZ-1.4]) if (z < gateZ-1) lamp(lawn,entranceX-1.12,z);
      for (const x of [next.regions.gazebo.x-2.5,next.regions.gazebo.x+2.2]) if (x < land.maxX-1) tree(lawn,x,gateZ-1.6,1.35);
    }
    for (const [id,value] of featureGroups) if (id!=='lawn') value.traverse(object=>{if(object.isMesh)object.userData.estateFeature=id;});
    root.userData.estateTier = next.id; root.userData.estateDefinition = next;
    root.userData.estateDimensions = { width: next.width, depth: next.depth };
    root.userData.estateBounds = next.land; root.userData.estateFeatures = next.features;
    root.userData.estateCustomization = { levels: { ...ranks }, plans: JSON.parse(JSON.stringify(customizationPlans)), colors: { ...customizationColors } };
  }
  build(definition);
  const sameDefinition = (a, b) => a.id === b.id && a.houseSize.width === b.houseSize.width && a.houseSize.depth === b.houseSize.depth;
  root.setTier = (value, nextHouse = definition.houseSize) => { if (disposed) throw new Error('Cannot change a disposed outdoor estate.'); const next = getEstateOutdoorDefinition(value, nextHouse); if (!sameDefinition(next, definition)) build(next); return root; };
  root.setHouse = nextHouse => root.setTier(definition.id, nextHouse);
  root.setCustomization = ({ levels: nextLevels = {}, plans: nextPlans = {}, colors: nextColors = {} } = {}) => {
    if (disposed) throw new Error('Cannot change a disposed outdoor estate.');
    const next = normalizeCustomization(nextLevels, nextPlans, nextColors);
    const changed = JSON.stringify(next.ranks) !== JSON.stringify(ranks)
      || JSON.stringify(next.plans) !== JSON.stringify(customizationPlans)
      || JSON.stringify(next.colors) !== JSON.stringify(customizationColors);
    ranks = next.ranks; customizationPlans = next.plans; customizationColors = next.colors;
    if (changed) build(definition);
    return root;
  };
  root.setLevels = value => root.setCustomization({ levels: value });
  root.getCustomization = () => ({ levels: { ...ranks }, plans: JSON.parse(JSON.stringify(customizationPlans)), colors: { ...customizationColors } });
  root.getDefinition = () => definition;
  root.getFeature = id => featureGroups.get(id) ?? null;
  root.dispose = () => { if (disposed) return; disposed = true; clearBuilt(); };
  return root;
}
export default createEstateOutdoor;
