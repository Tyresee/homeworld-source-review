import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const OBJECT_IDS = new Set(['wall', 'sidewall', 'floor', 'table', 'window', 'shelf', 'stool', 'plant', 'toy', 'rug']);
/** The finish each fixed object starts with; any other finish gets a visible pattern overlay. */
export const BASE_MATERIALS = Object.freeze({ wall: 'ceramic', sidewall: 'ceramic', floor: 'oak', table: 'oak', window: 'oak', shelf: 'oak', stool: 'oak', plant: 'ceramic', toy: 'ceramic', rug: 'ceramic' });
export const STATIC_UPGRADE_SURFACES = Object.freeze({
  wall: ['wall.inner'], sidewall: ['wall.side'], floor: ['floor.main'],
  table: ['table.top', 'table.edge', 'table.legs'], window: ['window.frame'],
  shelf: ['shelf.main'], stool: ['stool.main'], plant: ['plant.pot'], toy: ['toy.body'], rug: ['rug.main'],
});
const DEFAULT_COLORS = Object.freeze({ wall: '#f7ead7', sidewall: '#d0dcca', floor: '#e7cfaa', table: '#c99362', window: '#faf0d7', shelf: '#cda67c', stool: '#daae87' });
const MATERIAL_FAMILY = Object.freeze({ oak: 'oak', walnut: 'walnut', linen: 'linen', wool: 'wool', velvet: 'velvet', stone: 'stone', marble: 'marble', gold: 'gold', ceramic: 'ceramic' });
/**
 * Surfaces of each object the material overlay is drawn on. `plane` is the
 * surface orientation; `u`/`v` are the two in-plane half extents and the
 * overlay sits `lift` in front of the surface along its normal.
 */
const MATERIAL_PANELS = Object.freeze({
  wall: [{ plane: 'xy', center: [0, 1.46, -2.47], u: 2.72, v: 1.38, lift: .012, sign: 1 }],
  sidewall: [{ plane: 'yz', center: [-2.66, 1.46, -.08], u: 2.58, v: 1.38, lift: .012, sign: 1 }],
  floor: [{ plane: 'xz', center: [0, .066, 0], u: 2.72, v: 2.52, lift: .004, sign: 1 }],
  table: [{ plane: 'xz', center: [0, 1.158, 0], u: 1.08, v: .63, lift: .004, sign: 1 }, { plane: 'xy', center: [0, .99, .676], u: 1.08, v: .08, lift: .006, sign: 1 }, { plane: 'xy', center: [0, .99, -.676], u: 1.08, v: .08, lift: .006, sign: -1 }],
  window: [{ plane: 'xy', center: [0, -.78, .36], u: .84, v: .05, lift: .006, sign: 1 }, { plane: 'xy', center: [-.7, 0, .21], u: .045, v: .72, lift: .006, sign: 1 }, { plane: 'xy', center: [.7, 0, .21], u: .045, v: .72, lift: .006, sign: 1 }],
  shelf: [{ plane: 'xz', center: [-1.35, 1.842, -2.29], u: .70, v: .19, lift: .004, sign: 1 }, { plane: 'xy', center: [-1.35, 1.78, -2.09], u: .70, v: .05, lift: .006, sign: 1 }],
  stool: [{ plane: 'xz', center: [0, .626, 0], u: .32, v: .26, lift: .004, sign: 1 }, { plane: 'xy', center: [0, .50, .31], u: .36, v: .06, lift: .006, sign: 1 }, { plane: 'yz', center: [.375, .50, 0], u: .30, v: .06, lift: .006, sign: 1 }],
});

/** Geometry-only accents. World or parent-local coordinates match the existing room. */
export function createStaticUpgrade({ objectId, level = 1, plans = {}, material: finishId, color, surfaces = {}, maps = {} } = {}) {
  if (!OBJECT_IDS.has(objectId) || !Number.isInteger(level) || level < 1 || level > 3) {
    throw new RangeError('A static upgrade requires a known object and level 1, 2 or 3.');
  }
  const rank = dimension => {
    const value = plans?.[dimension] ?? level;
    if (!Number.isInteger(value) || value < 1 || value > 3) throw new RangeError('Static upgrade plans require integer ranks 1, 2 or 3.');
    return value;
  };
  const ranks = Object.fromEntries(['structure', 'material', 'decor', 'detail'].map(dimension => [dimension, rank(dimension)]));
  const structure = ranks.structure, decor = ranks.decor, detail = ranks.detail;
  const primarySurface = STATIC_UPGRADE_SURFACES[objectId][0];
  const appearance = surfaceId => ({
    color: surfaces[surfaceId]?.color ?? color ?? DEFAULT_COLORS[objectId] ?? '#f6e8cc',
    material: surfaces[surfaceId]?.material ?? finishId ?? BASE_MATERIALS[objectId],
  });
  const finish = appearance(primarySurface).material;
  const materialOverlay = MATERIAL_PANELS[objectId] && STATIC_UPGRADE_SURFACES[objectId].some(id => appearance(id).material !== BASE_MATERIALS[objectId]) ? finish : null;
  let dimension = 'structure';
  let hitSurface = primarySurface;
  const group = new THREE.Group();
  group.name = `upgrade:${objectId}:${structure}:${decor}:${detail}:${materialOverlay ?? 'base'}`;
  group.userData = { objectId, level, plans: { ...ranks }, material: finish, materialOverlay, isStaticUpgrade: true };
  if (structure === 1 && decor === 1 && detail === 1 && !materialOverlay) return group;

  // Geometry/materials are local to this model; supplied maps remain scene-owned.
  const materials = new Map();
  const colors = { gold: '#c9a65c', paleGold: '#e0c987', cream: '#f6e8cc', pearl: '#fff2d9', walnut: '#7b563a',
    mint: '#a9c8b0', coral: '#d79991', blue: '#9ebed0', lilac: '#b6a6cf', leaf: '#83a374',
    // Material overlays: seams, veins, weaves and joints that read from the isometric camera.
    oakLine: '#c48f5e', walnutLine: '#5a3b2a', walnutBand: '#6f4a35', linenLine: '#d8cfba', linenDark: '#b9ac94',
    woolLine: '#b0937a', velvetLine: '#6b4760', velvetLight: '#9a7090', stoneLine: '#8c877c', stoneLight: '#c6bfb1',
    marbleVein: '#c7bdb0', marbleVein2: '#a79b8c', tile: '#d3cbbd', goldLeaf: '#d9b562' };
  function material(kind) {
    if (kind.startsWith('surface:')) {
      if (!materials.has(kind)) {
        const a = appearance(kind.slice('surface:'.length));
        materials.set(kind, new THREE.MeshStandardMaterial({
          color: a.color, map: maps[a.material] ?? null, side: THREE.DoubleSide,
          roughness: a.material === 'gold' ? .35 : a.material === 'ceramic' ? .45 : ['stone', 'marble'].includes(a.material) ? .4 : .72,
          metalness: a.material === 'gold' ? .6 : 0,
        }));
      }
      return materials.get(kind);
    }
    if (!materials.has(kind)) materials.set(kind, new THREE.MeshStandardMaterial({
      color: colors[kind], roughness: kind === 'gold' || kind === 'paleGold' ? .53 : .76,
      metalness: kind === 'gold' || kind === 'paleGold' ? .24 : .02,
      side: THREE.DoubleSide,
    }));
    return materials.get(kind);
  }
  function add(geometry, kind, position, rotation = [0, 0, 0]) {
    const mesh = new THREE.Mesh(geometry, material(kind));
    mesh.position.set(...position); mesh.rotation.set(...rotation);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const surfaceId = kind.startsWith('surface:') ? kind.slice('surface:'.length) : hitSurface;
    mesh.userData = { objectId, level, upgradeDimension: dimension, isStaticUpgrade: true, surfaceId, paintable: kind.startsWith('surface:') };
    group.add(mesh); return mesh;
  }
  function box(size, position, kind = 'gold', radius = .012) {
    return add(new RoundedBoxGeometry(...size, 2, Math.min(radius, Math.min(...size) / 2)), kind, position);
  }
  function ball(position, scale, kind = 'pearl') {
    const mesh = add(new THREE.SphereGeometry(1, 12, 8), kind, position); mesh.scale.set(...scale); return mesh;
  }
  function ring(radius, position, kind = 'gold', thickness = .01, rotation = [-Math.PI / 2, 0, 0], arc = Math.PI * 2) {
    return add(new THREE.TorusGeometry(radius, thickness, 6, 32, arc), kind, position, rotation);
  }
  function tube(points, position, kind = 'gold', radius = .01) {
    const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
    return add(new THREE.TubeGeometry(curve, 24, radius, 6, false), kind, position);
  }
  function diamond(radius, position, kind = 'gold', rotation = [0, 0, 0]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, radius); shape.lineTo(-radius, 0); shape.lineTo(0, -radius); shape.lineTo(radius, 0); shape.closePath();
    const mesh = add(new THREE.ShapeGeometry(shape), kind, position, rotation);
    mesh.castShadow = false; return mesh;
  }
  function crown(position, scale = 1) {
    const shape = new THREE.Shape();
    shape.moveTo(-.23, 0); shape.lineTo(-.25, .19); shape.lineTo(-.13, .12);
    shape.lineTo(0, .29); shape.lineTo(.13, .12); shape.lineTo(.25, .19); shape.lineTo(.23, 0); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: .023, bevelEnabled: true,
      bevelSegments: 1, steps: 1, bevelSize: .006, bevelThickness: .004, curveSegments: 8 });
    const mesh = add(geometry, 'gold', position); mesh.scale.setScalar(scale);
    for (const x of [-.15, 0, .15]) ball([position[0] + x * scale, position[1] + .065 * scale, position[2] + .032 * scale],
      [.023 * scale, .027 * scale, .011 * scale], x ? 'coral' : 'blue');
  }
  function rectFrame(center, width, height, plane, kind = 'gold', weight = .023) {
    const [x, y, z] = center;
    if (plane === 'xy') {
      for (const dx of [-width / 2, width / 2]) box([weight, height, .018], [x + dx, y, z], kind);
      for (const dy of [-height / 2, height / 2]) box([width, weight, .018], [x, y + dy, z], kind);
    } else if (plane === 'xz') {
      for (const dx of [-width / 2, width / 2]) box([weight, .012, height], [x + dx, y, z], kind, .004).castShadow = false;
      for (const dz of [-height / 2, height / 2]) box([width, .012, weight], [x, y, z + dz], kind, .004).castShadow = false;
    } else {
      for (const dz of [-width / 2, width / 2]) box([.018, height, weight], [x, y, z + dz], kind);
      for (const dy of [-height / 2, height / 2]) box([.018, weight, width], [x, y + dy, z], kind);
    }
  }
  function flower(center, radius = .065, petalKind = 'coral', plane = 'xy') {
    const [x, y, z] = center;
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      const p = plane === 'xz' ? [x + Math.cos(a) * radius, y, z + Math.sin(a) * radius]
        : plane === 'yz' ? [x, y + Math.sin(a) * radius, z + Math.cos(a) * radius]
        : [x + Math.cos(a) * radius, y + Math.sin(a) * radius, z];
      ball(p, plane === 'xz' ? [radius * .66, .008, radius * .66] : plane === 'yz' ? [.012, radius * .65, radius * .65] : [radius * .65, radius * .65, .012], petalKind).castShadow = false;
    }
    ball(plane === 'xz' ? [x, y + .004, z] : plane === 'yz' ? [x + .009, y, z] : [x, y, z + .009],
      plane === 'xz' ? [radius * .52, .011, radius * .52] : plane === 'yz' ? [.018, radius * .52, radius * .52] : [radius * .52, radius * .52, .018], 'paleGold').castShadow = false;
  }

  /**
   * Material overlays. Each finish draws a different large-scale pattern on
   * the object's visible panels, so switching ceramic → linen → marble reads
   * from the room camera and in the 256px choice thumbnails.
   */
  function panelPainter(panel) {
    const [cx, cy, cz] = panel.center, lift = panel.lift * (panel.sign ?? 1);
    const place = (u, v) => panel.plane === 'xy' ? [cx + u, cy + v, cz + lift] : panel.plane === 'xz' ? [cx + u, cy + lift, cz + v] : [cx + lift, cy + v, cz + u];
    const sizeU = (len, t) => panel.plane === 'xy' ? [len, t, .012] : panel.plane === 'xz' ? [len, .008, t] : [.012, t, len];
    const sizeV = (len, t) => panel.plane === 'xy' ? [t, len, .012] : panel.plane === 'xz' ? [t, .008, len] : [.012, len, t];
    const lineU = (v, from, to, t, kind) => { const m = box(sizeU(to - from, t), place((from + to) / 2, v), kind, .004); m.castShadow = false; return m; };
    const lineV = (u, from, to, t, kind) => { const m = box(sizeV(to - from, t), place(u, (from + to) / 2), kind, .004); m.castShadow = false; return m; };
    const dot = (u, v, r, kind) => { const m = ball(place(u, v), panel.plane === 'xz' ? [r, .006, r] : panel.plane === 'xy' ? [r, r, .008] : [.008, r, r], kind); m.castShadow = false; return m; };
    const vein = (points, r, kind) => { const m = tube(points.map(([u, v]) => { const p = place(u, v); return [p[0] - cx, p[1] - cy, p[2] - cz]; }), [cx, cy, cz], kind, r); m.castShadow = false; return m; };
    const frame = (inset, t, kind) => { lineU(-panel.v + inset, -panel.u + inset, panel.u - inset, t, kind); lineU(panel.v - inset, -panel.u + inset, panel.u - inset, t, kind); lineV(-panel.u + inset, -panel.v + inset, panel.v - inset, t, kind); lineV(panel.u - inset, -panel.v + inset, panel.v - inset, t, kind); };
    return { lineU, lineV, dot, vein, frame, u: panel.u, v: panel.v };
  }
  function buildMaterial() {
    if (!materialOverlay) return;
    dimension = 'material';
    const scale = objectId === 'wall' || objectId === 'sidewall' || objectId === 'floor' ? 1 : objectId === 'table' ? .55 : .36;
    const t = .055 * scale, thin = .03 * scale;
    const panels = MATERIAL_PANELS[objectId].map((panel, index) => ({ ...panel, surfaceId: objectId === 'table' && index > 0 ? 'table.edge' : primarySurface }));
    // Raised upgrade faces must receive their own finish. Drawing only at the
    // starter face leaves the pattern buried under the level 2/3 geometry.
    const raisedPanel = (plane, center, u, v) => panels.push({ plane, center, u, v, lift: .006, sign: 1, surfaceId: primarySurface });
    if (objectId === 'wall' && structure >= 2) {
      panels.length = 0;
      raisedPanel('xy', [0, .7, -2.21], 2.52, .56);
      if (structure === 3) raisedPanel('xy', [0, 2.15, -2.19], 2.52, .48);
    } else if (objectId === 'sidewall') {
      if (structure >= 2 || decor >= 2) panels.length = 0;
      if (structure >= 2) raisedPanel('yz', [-2.33, .7, 0], 2.4, .56);
      if (structure === 3) raisedPanel('yz', [-2.29, 2.15, 0], 2.4, .48);
      if (decor >= 2) { raisedPanel('yz', [-2.43, .4, 0], 2.48, .31); raisedPanel('yz', [-2.43, 2.45, 0], 2.48, .26); }
    } else if (objectId === 'floor') {
      if (structure >= 2 || decor >= 2) panels.length = 0;
      if (structure >= 2) raisedPanel('xz', [0, .13, 0], 2.26, 1.96);
      else if (decor >= 2) raisedPanel('xz', [0, .1175, 0], 2.16, 1.86);
    } else if (objectId === 'stool') {
      if (decor >= 2 || structure === 3) panels.shift();
      if (decor >= 2) raisedPanel('xz', [0, .71, 0], .32, .26);
      else if (structure === 3) raisedPanel('xz', [0, .685, 0], .38, .32);
    } else if (objectId === 'window' && structure >= 2) {
      panels.splice(1, 2);
      for (const x of [-.73, .73]) raisedPanel('xy', [x, 0, .256], .035, .73);
    } else if (objectId === 'shelf' && structure === 3) {
      raisedPanel('xz', [-1.35, 2.455, -2.28], .74, .17);
      raisedPanel('xz', [-1.35, 1.5, -2.29], .71, .15);
    }
    for (const panel of panels) {
      hitSurface = panel.surfaceId;
      const family = MATERIAL_FAMILY[appearance(hitSurface).material];
      if (!family || family === BASE_MATERIALS[objectId]) continue;
      const p = panelPainter(panel), U = p.u, V = p.v, span = U >= V ? 'u' : 'v';
      const step = (count, extent) => Array.from({ length: count }, (_, i) => -extent + (i + .5) * (2 * extent / count));
      if (family === 'oak' || family === 'walnut') {
        // Plank seams run along the long axis; walnut adds dark end bands.
        const kind = family === 'oak' ? 'oakLine' : 'walnutLine';
        const across = span === 'u' ? V : U, count = Math.max(2, Math.round(across / (.38 * scale)));
        for (const c of step(count - 1, across * (count - 1) / count)) span === 'u' ? p.lineU(c, -U, U, t, kind) : p.lineV(c, -V, V, t, kind);
        for (let i = 0; i < count; i++) {
          const c = -across + (i + .5) * (2 * across / count), offset = (i % 2 ? .35 : -.35) * (span === 'u' ? U : V);
          span === 'u' ? p.lineV(offset, c - across / count + .02, c + across / count - .02, t, kind) : p.lineU(offset, c - across / count + .02, c + across / count - .02, t, kind);
        }
        if (family === 'walnut') p.frame(.03 * scale, t * 1.6, 'walnutBand');
      } else if (family === 'linen' || family === 'wool') {
        const kind = family === 'linen' ? 'linenLine' : 'woolLine', dark = family === 'linen' ? 'linenDark' : 'woolLine';
        const rows = Math.max(3, Math.round(V / (family === 'wool' ? .20 : .16) / (scale || 1) * scale));
        for (const v of step(rows, V - .04 * scale)) p.lineU(v, -U + .02, U - .02, family === 'wool' ? t * 1.3 : thin, kind);
        const cols = Math.max(2, Math.round(U / (.34 * scale)));
        for (const u of step(cols, U - .04 * scale)) p.lineV(u, -V + .02, V - .02, thin, dark);
        p.frame(.015 * scale, t * 1.2, dark);
      } else if (family === 'velvet') {
        // Pleated pile: broad vertical bands with tufting buttons where they meet.
        const cols = Math.max(3, Math.round(U / (.26 * scale)));
        for (const u of step(cols, U - .03 * scale)) p.lineV(u, -V + .02, V - .02, t * 1.4, 'velvetLine');
        const rows = Math.max(2, Math.round(V / (.3 * scale)));
        for (const v of step(rows, V - .08 * scale)) for (const u of step(cols, U - .03 * scale)) p.dot(u, v, .045 * scale, 'velvetLight');
        p.frame(.015 * scale, t * 1.3, 'velvetLight');
      } else if (family === 'stone') {
        // Staggered ashlar joints.
        const rows = Math.max(2, Math.round(V / (.30 * scale)));
        const rowH = 2 * V / rows;
        for (let i = 1; i < rows; i++) p.lineU(-V + i * rowH, -U, U, t, 'stoneLine');
        for (let i = 0; i < rows; i++) {
          const v = -V + (i + .5) * rowH, cols = Math.max(2, Math.round(U / (.42 * scale))), colW = 2 * U / cols, shift = i % 2 ? colW / 2 : 0;
          for (let j = 0; j <= cols; j++) { const u = -U + j * colW + shift; if (u > -U + .05 && u < U - .05) p.lineV(u, v - rowH / 2 + .01, v + rowH / 2 - .01, t, 'stoneLine'); }
        }
        p.frame(.02 * scale, t * 1.4, 'stoneLight');
      } else if (family === 'marble') {
        // Soft diagonal veins plus a gold inlay border.
        const veins = Math.max(2, Math.round(U / (.9 * scale)));
        for (let i = 0; i < veins; i++) {
          const u0 = -U + (i + .35) * (2 * U / veins), dir = i % 2 ? 1 : -1;
          p.vein([[u0 - .25 * U / veins, -V * .95], [u0 + .1 * U / veins, -V * .35 * dir], [u0 + .4 * U / veins, V * .2 * dir], [u0 + .95 * U / veins, V * .95]], thin * .9, i % 2 ? 'marbleVein' : 'marbleVein2');
          p.vein([[u0 + .15 * U / veins, -V * .9], [u0 + .55 * U / veins, -V * .1], [u0 + .7 * U / veins, V * .55]], thin * .55, 'marbleVein');
        }
        p.frame(.025 * scale, t * 1.1, 'goldLeaf');
        for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.dot(su * (U - .12 * scale), sv * (V - .12 * scale), .06 * scale, 'goldLeaf');
      } else if (family === 'gold') {
        const cols = Math.max(2, Math.round(U / (.5 * scale))), rows = Math.max(1, Math.round(V / (.5 * scale)));
        for (let i = 1; i < cols; i++) p.lineV(-U + i * 2 * U / cols, -V, V, t * 1.3, 'goldLeaf');
        for (let i = 1; i < rows; i++) p.lineU(-V + i * 2 * V / rows, -U, U, t * 1.3, 'goldLeaf');
        p.frame(.02 * scale, t * 1.8, 'gold');
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) p.dot(-U + (i + .5) * 2 * U / cols, -V + (j + .5) * 2 * V / rows, .07 * scale, 'paleGold');
      } else if (family === 'ceramic') {
        // Glazed tiles on a wooden object.
        const cols = Math.max(2, Math.round(U / (.36 * scale))), rows = Math.max(2, Math.round(V / (.36 * scale)));
        for (let i = 1; i < cols; i++) p.lineV(-U + i * 2 * U / cols, -V, V, thin, 'tile');
        for (let i = 1; i < rows; i++) p.lineU(-V + i * 2 * V / rows, -U, U, thin, 'tile');
        p.frame(.015 * scale, t, 'tile');
      }
    }
    hitSurface = primarySurface;
  }

  function buildStructure() {
    if (structure < 2) return;
    const neutral = `surface:${primarySurface}`;
    if (objectId === 'wall') {
      box([5.15, 1.2, .18], [0, .7, -2.30], neutral, .04);
      if (structure === 3) box([5.15, 1.05, .18], [0, 2.15, -2.28], neutral, .04);
      for (const x of [-2.55, 2.55]) {
        box([.16, 2.49, .075], [x, 1.44, -2.48], neutral, .028);
        box([.26, .12, .10], [x, .24, -2.44], neutral, .025);
        box([.26, .11, .10], [x, 2.68, -2.44], neutral, .025);
      }
      // A chair rail and plinth band make the second rank read as panelled architecture.
      box([5.0, .085, .07], [0, 1.02, -2.46], neutral, .022);
      box([5.0, .16, .06], [0, .09, -2.465], neutral, .02);
      if (structure === 3) {
        box([4.98, .14, .10], [0, 2.75, -2.45], neutral, .026);
        for (let i = -11; i <= 11; i++) box([.10, .09, .08], [i * .215, 2.63, -2.455], neutral, .012);
        tube([[-2.41, 0, 0], [-1.36, .055, 0], [0, .115, 0], [1.36, .055, 0], [2.41, 0, 0]], [0, 2.50, -2.41], neutral, .025);
        for (const x of [-1.72, 0, 1.72]) { rectFrame([x, .55, -2.437], 1.40, .72, 'xy', neutral, .04); rectFrame([x, .55, -2.432], 1.14, .48, 'xy', neutral, .022); }
        for (const x of [-1.28, 1.28]) box([.14, 1.2, .07], [x, 1.78, -2.455], neutral, .03);
      }
    } else if (objectId === 'sidewall') {
      box([.18, 1.2, 4.9], [-2.42, .7, 0], neutral, .04);
      if (structure === 3) box([.18, 1.05, 4.9], [-2.38, 2.15, 0], neutral, .04);
      for (const z of [-2.42, 2.42]) {
        box([.075, 2.48, .16], [-2.648, 1.44, z], neutral, .027);
        box([.10, .11, .26], [-2.61, 2.68, z], neutral, .024);
        box([.10, .12, .26], [-2.61, .24, z], neutral, .024);
      }
      box([.07, .085, 4.72], [-2.63, 1.02, -.08], neutral, .022);
      box([.06, .16, 4.72], [-2.635, .09, -.08], neutral, .02);
      if (structure === 3) {
        box([.10, .14, 4.82], [-2.62, 2.75, -.08], neutral, .02);
        for (let i = -10; i <= 10; i++) box([.08, .09, .10], [-2.625, 2.63, -.08 + i * .225], neutral, .012);
        // A shallow arched alcove outline framed by pilasters.
        tube([[0, 0, -.62], [0, .26, -.45], [0, .38, 0], [0, .26, .45], [0, 0, .62]], [-2.606, 2.05, 1.38], neutral, .034);
        for (const z of [.76, 2.0]) box([.07, 1.15, .09], [-2.59, 1.55, z], neutral, .018);
        rectFrame([-2.6, 1.55, 1.38], 1.0, .9, 'yz', neutral, .03);
        for (const z of [-2.0, -1.0, 0]) rectFrame([-2.6, .55, z], .76, .72, 'yz', neutral, .034);
      }
    } else if (objectId === 'floor') {
      // A contrasting border band plus corner blocks: the floor visibly gains a frame.
      box([4.6, .04, 4.0], [0, .11, 0], neutral, .02).castShadow = false;
      for (const z of [-2.34, 2.34]) for (let i = -10; i <= 10; i++) box([.218, .008, .095], [i * .23, .075, z], 'paleGold', .009).castShadow = false;
      for (const x of [-2.49, 2.49]) for (let i = -9; i <= 9; i++) box([.095, .008, .21], [x, .075, i * .235], 'paleGold', .009).castShadow = false;
      if (structure === 3) {
        // Herringbone slats inside the border and a central medallion ring.
        for (const z of [-1.95, 1.95]) for (let i = -8; i <= 8; i++) {
          const slat = box([.28, .007, .075], [i * .29, .079, z], neutral, .005); slat.rotation.y = i % 2 ? Math.PI / 4 : -Math.PI / 4; slat.castShadow = false;
        }
        for (const x of [-2.12, 2.12]) for (let i = -6; i <= 6; i++) {
          const slat = box([.075, .007, .28], [x, .079, i * .29], neutral, .005); slat.rotation.y = i % 2 ? Math.PI / 4 : -Math.PI / 4; slat.castShadow = false;
        }
        ring(1.25, [0, .079, 0], neutral, .05); ring(1.05, [0, .079, 0], 'paleGold', .025);
      }
    } else if (objectId === 'table') {
      const legs = 'surface:table.legs', edge = 'surface:table.edge';
      for (const z of [-.48, .48]) box([1.76, .07, .07], [0, .37, z], legs, .018);
      for (const x of [-.88, .88]) box([.07, .07, .96], [x, .37, 0], legs, .018);
      for (const z of [-.59, .59]) box([1.91, .16, .05], [0, .91, z], edge, .021);
      for (const x of [-1.05, 1.05]) box([.05, .16, 1.25], [x, .91, 0], edge, .021);
      if (structure === 3) {
        // Turned leg sleeves, knee brackets and a thick stretcher change the whole base.
        for (const x of [-.88, .88]) for (const z of [-.46, .46]) {
          const sign = Math.sign(x);
          tube([[0, 0, 0], [-sign * .12, -.12, 0], [-sign * .20, -.30, 0]], [x, .93, z], legs, .04);
          add(new THREE.CylinderGeometry(.13, .11, .22, 14), legs, [x, .62, z]);
          box([.26, .07, .26], [x, .20, z], legs, .022);
        }
        box([1.76, .09, .09], [0, .33, 0], legs, .02);
        box([.7, .22, .45], [0, 1.28, 0], neutral, .03);
        for (const z of [-.6, .6]) for (const x of [-.55, 0, .55]) box([.34, .06, .05], [x, .80, z], edge, .02);
      }
    } else if (objectId === 'window') {
      for (const x of [-.73, .73]) box([.095, 1.56, .10], [x, 0, .206], neutral, .027);
      box([1.75, .13, .22], [0, -.81, .20], neutral, .026);
      box([1.75, .10, .16], [0, .82, .20], neutral, .026);
      if (structure === 3) {
        tube([[-.78, .79, 0], [-.46, 1.04, 0], [0, 1.16, 0], [.46, 1.04, 0], [.78, .79, 0]], [0, 0, .198], neutral, .045);
        diamond(.14, [0, 1.0, .21], neutral);
        for (const x of [-.65, .65]) tube([[0, 0, 0], [0, -.14, -.04], [0, -.24, -.13]], [x, -.82, .21], neutral, .03);
        for (const x of [-.9, .9]) box([.08, 1.5, .08], [x, .0, .21], neutral, .02);
      }
    } else if (objectId === 'shelf') {
      for (const x of [-1.86, -.84]) {
        box([.12, .26, .19], [x, 1.61, -2.285], neutral, .029);
        box([.18, .06, .31], [x, 1.72, -2.30], neutral, .019);
      }
      box([1.5, .06, .05], [-1.35, 1.72, -2.11], neutral, .018);
      if (structure === 3) {
        box([1.5, .05, .38], [-1.35, 1.475, -2.29], neutral, .020);
        box([1.56, .07, .42], [-1.35, 2.42, -2.28], neutral, .024);
        for (const x of [-2.05, -.65]) box([.07, .64, .36], [x, 2.1, -2.29], neutral, .02);
        for (const x of [-1.94, -.76]) tube([[0, 0, 0], [0, -.24, -.12], [0, -.32, -.27]], [x, 1.72, -2.12], neutral, .034);
      }
    } else if (objectId === 'stool') {
      // An apron skirt and stretchers make the second rank a proper joiner's stool.
      for (const z of [-.18, .18]) box([.52, .055, .055], [0, .26, z], neutral, .014);
      for (const x of [-.24, .24]) box([.055, .055, .42], [x, .26, 0], neutral, .014);
      box([.80, .12, .68], [0, .455, 0], neutral, .03);
      if (structure === 3) {
        for (const x of [-.3, .3]) box([.07, .5, .07], [x, .80, -.27], neutral, .024);
        box([.66, .2, .07], [0, .98, -.27], neutral, .030);
        tube([[-.33, 0, 0], [-.18, .12, 0], [0, .18, 0], [.18, .12, 0], [.33, 0, 0]], [0, 1.05, -.27], neutral, .03);
        box([.84, .09, .72], [0, .64, 0], neutral, .04);
      }
    }
  }

  function buildDetail() {
    if (detail < 2) return;
    if (objectId === 'wall') {
      for (const x of [-2.33, 2.33]) ball([x, 2.62, -2.426], [.060, .072, .030], 'pearl');
      for (const x of [-1.79, 0, 1.79]) flower([x, .35, -2.426], .075, 'mint');
      if (detail === 3) for (const x of [-2.30, 2.30]) flower([x, 2.61, -2.413], .105, 'cream');
    } else if (objectId === 'sidewall') {
      for (const z of [-2.31, 2.31]) ball([-2.60, 2.62, z], [.032, .072, .055], 'pearl');
      if (detail === 3) for (const z of [1.06, 1.69]) diamond(.085, [-2.578, 2.15, z], 'coral', [0, Math.PI / 2, 0]);
    } else if (objectId === 'floor') {
      for (const x of [-2.26, 2.26]) for (const z of [-2.09, 2.09]) diamond(.085, [x, .087, z], 'mint', [-Math.PI / 2, 0, 0]);
      if (detail === 3) for (const x of [-2.26, 2.26]) for (const z of [-2.09, 2.09]) flower([x, .090, z], .090, 'cream', 'xz');
    } else if (objectId === 'table') {
      for (const x of [-.94, .94]) for (const z of [-.52, .52]) ball([x, 1.178, z], [.035, .025, .035], 'pearl');
      if (detail === 3) for (const x of [-.90, .90]) for (const z of [-.51, .51]) flower([x, 1.179, z], .058, 'cream', 'xz');
    } else if (objectId === 'window') {
      for (const x of [-.74, .74]) ball([x, .60, .265], [.045, .045, .025], 'pearl');
      if (detail === 3) {
        flower([0, .89, .259], .090, 'cream');
        for (const x of [-.78, .78]) for (const y of [-.29, -.18, -.07]) ball([x, y, .259], [.014, .018, .010], 'paleGold');
      }
    } else if (objectId === 'shelf') {
      for (const x of [-1.84, -.86]) ball([x, 1.80, -2.056], [.045, .045, .026], 'pearl');
      if (detail === 3) {
        flower([-1.35, 1.785, -2.045], .080, 'cream');
        for (let i = 0; i < 4; i++) for (const y of [1.94, 2.085]) box([.106, .008, .009], [-1.78 + i * .18, y, -2.169], 'cream', .003);
      }
    } else if (objectId === 'stool') {
      for (const x of [-.17, .17]) for (const z of [-.14, .14]) ball([x, .642, z], [.035, .022, .035], 'pearl');
      if (detail === 3) for (const x of [-.28, .28]) for (const z of [-.20, .20]) flower([x, .576, z], .050, 'cream', 'xz');
    }
  }

  buildStructure();
  dimension = 'decor';
  if (decor >= 2) {
  if (objectId === 'wall') {
    // Keep the central sticker area clear: upgrades occupy the skirting and perimeter.
    box([5.32, .08, .025], [0, .53, -2.477], 'paleGold');
    box([5.32, .05, .025], [0, .18, -2.477]);
    box([5.32, .05, .025], [0, 2.4, -2.477], 'paleGold');
    for (const x of [-1.77, 0, 1.77]) rectFrame([x, .355, -2.467], 1.45, .225, 'xy', 'cream', .028);
    for (const x of [-2.4, 2.4]) { box([.09, .14, .09], [x, 2.05, -2.44], 'gold', .02); ball([x, 2.18, -2.42], [.055, .075, .05], 'pearl'); }
    if (decor === 3) {
      for (const x of [-2.60, 2.60]) box([.031, 2.53, .025], [x, 1.51, -2.474], 'paleGold');
      box([5.23, .035, .025], [0, 2.775, -2.474], 'paleGold');
      crown([0, 2.84, -2.466], .9);
      for (const x of [-2.52, 2.52]) diamond(.065, [x, 2.69, -2.455], 'mint');
      // A restrained exterior accent is visible when the camera turns behind the house.
      hitSurface = 'wall.outer';
      box([5.25, .034, .022], [0, 2.775, -2.780], 'paleGold');
      for (const x of [-2.58, 2.58]) box([.025, 2.54, .022], [x, 1.50, -2.78], 'paleGold');
      hitSurface = primarySurface;
    }
  } else if (objectId === 'sidewall') {
    const trim = `surface:${primarySurface}`;
    box([.1, .7, 5.05], [-2.48, .4, 0], trim, .03);
    box([.1, .6, 5.05], [-2.48, 2.45, 0], trim, .03);
    box([.025, .07, 5.10], [-2.65, .53, -.08], 'paleGold');
    box([.025, .045, 5.10], [-2.65, .18, -.08]);
    // Wainscot frames arrive at the second rank so the long wall changes at a glance.
    for (const z of [-2.0, -1.0, 0, 1.0, 2.0]) rectFrame([-2.631, .35, z], .72, .23, 'yz', 'cream', .024);
    if (decor === 3) {
      for (const z of [-2.48, 2.48]) box([.025, 2.55, .04], [-2.65, 1.5, z], 'paleGold');
      box([.025, .05, 5.1], [-2.65, 2.72, -.08], 'paleGold');
      // Garland swags between the pilasters and a medallion over the alcove.
      for (const z0 of [-2.4, -1.2, 0, 1.2]) tube([[0, 0, 0], [0, -.16, .3], [0, -.22, .6], [0, -.16, .9], [0, 0, 1.2]], [-2.60, 2.6, z0], 'leaf', .028);
      for (const z of [-2.4, -1.2, 0, 1.2, 2.4]) flower([-2.585, 2.6, z], .07, 'coral', 'yz');
      diamond(.16, [-2.622, 1.72, 1.43], 'paleGold', [0, Math.PI / 2, 0]);
      diamond(.08, [-2.614, 1.72, 1.43], 'mint', [0, Math.PI / 2, 0]);
      for (const z of [-1.7, -.5]) { box([.08, .12, .08], [-2.6, 1.9, z], 'gold', .02); ball([-2.56, 2.02, z], [.05, .07, .05], 'pearl'); }
    }
  } else if (objectId === 'floor') {
    box([4.4, .035, 3.8], [0, .1, 0], `surface:${primarySurface}`, .02).castShadow = false;
    rectFrame([0, .068, 0], 5.18, 4.81, 'xz', 'paleGold', .055);
    for (const x of [-2.5, 2.5]) for (const z of [-2.3, 2.3]) box([.3, .007, .3], [x, .072, z], 'gold', .01).castShadow = false;
    if (decor === 3) {
      rectFrame([0, .073, 0], 4.9, 4.5, 'xz', 'gold', .025);
      for (const x of [-2.44, 2.44]) for (const z of [-2.23, 2.23]) {
        diamond(.2, [x, .078, z], 'paleGold', [-Math.PI / 2, 0, 0]);
        diamond(.1, [x, .080, z], 'mint', [-Math.PI / 2, 0, 0]);
      }
      // Central inlaid medallion left shallow enough for free furniture placement.
      box([2.4, .03, 1.7], [0, .095, 0], `surface:${primarySurface}`, .02).castShadow = false;
      diamond(.55, [0, .076, 0], 'paleGold', [-Math.PI / 2, 0, 0]);
      diamond(.36, [0, .078, 0], 'cream', [-Math.PI / 2, 0, 0]);
      diamond(.18, [0, .080, 0], 'mint', [-Math.PI / 2, 0, 0]);
      for (const z of [-2.3, 2.3]) for (let i = -4; i <= 4; i++) diamond(.09, [i * .55, .078, z], 'mint', [-Math.PI / 2, 0, 0]);
    }
  } else if (objectId === 'table') {
    rectFrame([0, 1.163, 0], 2.13, 1.23, 'xz', 'paleGold', .03);
    hitSurface = 'table.legs';
    for (const x of [-.88, .88]) for (const z of [-.46, .46]) {
      box([.2, .11, .2], [x, .13, z], 'gold', .022);
      ring(.1, [x, .80, z], 'paleGold', .012);
    }
    if (decor === 3) {
      hitSurface = 'table.edge';
      for (const z of [-.682, .682]) {
        box([1.95, .05, .03], [0, .95, z], 'paleGold');
        for (const x of [-.58, 0, .58]) diamond(.085, [x, .985, z + (z > 0 ? .016 : -.016)], 'paleGold', z > 0 ? [0, 0, 0] : [0, Math.PI, 0]);
        for (const x of [-.85, -.29, .29, .85]) ball([x, .99, z + (z > 0 ? .02 : -.02)], [.035, .045, .02], 'blue');
      }
      for (const x of [-1.13, 1.13]) { box([.03, .05, 1.2], [x, .95, 0], 'paleGold'); for (const z of [-.3, .3]) diamond(.07, [x + (x > 0 ? .016 : -.016), .985, z], 'paleGold', [0, x > 0 ? Math.PI / 2 : -Math.PI / 2, 0]); }
      hitSurface = 'table.top';
      for (const x of [-.975, .975]) for (const z of [-.54, .54]) diamond(.07, [x, 1.173, z], 'blue', [-Math.PI / 2, 0, 0]);
      rectFrame([0, 1.166, 0], 1.6, .8, 'xz', 'gold', .018);
      hitSurface = 'table.legs';
      for (const z of [-.46, .46]) box([1.76, .04, .04], [0, .42, z], 'gold');
      for (const x of [-.88, .88]) for (const z of [-.46, .46]) { ring(.11, [x, .55, z], 'gold', .014); ring(.11, [x, 1.0, z], 'gold', .012); }
    }
    hitSurface = primarySurface;
  } else if (objectId === 'window') {
    rectFrame([0, 0, .225], 1.40, 1.44, 'xy', 'paleGold', .03);
    // Louvred shutters flank the frame from the second rank on.
    for (const x of [-1.05, 1.05]) {
      box([.3, 1.5, .06], [x, 0, .17], `surface:${primarySurface}`, .03);
      for (let i = -5; i <= 5; i++) box([.24, .035, .03], [x, i * .12, .21], `surface:${primarySurface}`, .008);
    }
    if (decor === 3) {
      tube([[-.72, .80, 0], [-.44, 1.03, 0], [0, 1.17, 0], [.44, 1.03, 0], [.72, .80, 0]], [0, 0, .226], 'gold', .02);
      diamond(.09, [0, 1.055, .237], 'blue');
      // A valance across the top and tied-back drapes over the shutters.
      box([2.6, .22, .12], [0, .92, .22], 'coral', .04);
      for (let i = -5; i <= 5; i++) ball([i * .24, .8, .25], [.05, .06, .03], 'paleGold');
      for (const x of [-1.05, 1.05]) { const drape = box([.26, 1.2, .1], [x, .2, .25], 'coral', .06); drape.rotation.z = x < 0 ? .08 : -.08; ring(.12, [x, -.1, .26], 'gold', .018, [0, 0, 0]); }
      for (const x of [-.84, .84]) {
        box([.012, .34, .012], [x, .15, .23], 'gold', .005);
        ball([x, -.055, .23], [.035, .043, .025], 'paleGold');
        for (const offset of [-.018, 0, .018]) box([.009, .11, .009], [x + offset, -.132, .23], 'paleGold', .004);
      }
    }
  } else if (objectId === 'shelf') {
    box([1.38, .025, .02], [-1.35, 1.795, -2.075], 'paleGold');
    for (const x of [-2.03, -.67]) box([.024, .017, .35], [x, 1.843, -2.29], 'gold');
    if (decor === 3) {
      for (const x of [-1.82, -.88]) {
        tube([[0, 0, 0], [0, -.27, -.15], [0, -.33, -.27]], [x, 1.72, -2.17], 'gold', .019);
        ball([x, 1.695, -2.15], [.038, .038, .019], 'pearl');
      }
      for (let i = 0; i < 4; i++) for (const y of [1.90, 2.12]) box([.105, .012, .01], [-1.78 + i * .18, y, -2.183], 'paleGold', .003);
      diamond(.042, [-1.35, 1.765, -2.061], 'blue');
    }
  } else if (objectId === 'stool') {
    box([.72, .1, .6], [0, .66, 0], `surface:${primarySurface}`, .04);
    rectFrame([0, .565, 0], .70, .57, 'xz', 'paleGold', .023);
    for (const x of [-.24, .24]) for (const z of [-.19, .19]) box([.092, .085, .092], [x, .055, z], 'gold', .012);
    if (decor === 3) {
      for (const x of [-.275, .275]) box([.046, .45, .046], [x, .79, -.268], 'paleGold', .015);
      box([.62, .235, .08], [0, .955, -.278], `surface:${primarySurface}`, .07);
      rectFrame([0, .955, -.226], .54, .17, 'xy', 'gold', .018);
      diamond(.045, [0, .955, -.212], 'coral');
    }
  } else if (objectId === 'plant') {
    ring(.174, [0, .105, 0], 'gold', .013);
    ring(.221, [0, .334, 0], 'paleGold', .01);
    if (decor === 3) {
      for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        ball([Math.cos(a) * .186, .18, Math.sin(a) * .186], [.045, .052, .045], 'pearl');
      }
      const flowers = [[-.13, 1.00, .045, 'coral'], [.10, 1.10, -.035, 'lilac'], [.045, .91, .10, 'cream']];
      for (const [x, y, z, kind] of flowers) {
        const stem = add(new THREE.CylinderGeometry(.009, .010, .27, 8), 'leaf', [x, y - .135, z]); stem.castShadow = false;
        flower([x, y, z], .090, kind);
      }
    }
  } else if (objectId === 'toy') {
    const left = ball([-.064, .46, .222], [.095, .058, .028], 'coral'); left.rotation.z = -.28;
    const right = ball([.064, .46, .222], [.095, .058, .028], 'coral'); right.rotation.z = .28;
    ball([0, .46, .244], [.042, .045, .024], 'paleGold');
    if (decor === 3) {
      crown([0, .79, .20], .69);
      add(new THREE.CylinderGeometry(.17, .29, .41, 24, 1, true, Math.PI / 2, Math.PI), 'lilac', [0, .275, -.015]);
      ring(.29, [0, .070, -.015], 'paleGold', .016, [-Math.PI / 2, 0, 0], Math.PI);
      // Pearl clasps sit beside the bow without replacing the original fur colors.
      for (const x of [-.105, .105]) ball([x, .49, .198], [.032, .038, .022], 'pearl');
    }
  } else if (objectId === 'rug') {
    rectFrame([.28, .096, .58], 3.47, 2.61, 'xz', 'cream', .023);
    if (decor === 3) {
      rectFrame([.28, .100, .58], 3.29, 2.43, 'xz', 'paleGold', .016);
      for (const x of [-1.25, 1.81]) for (const z of [-.52, 1.68]) flower([x, .108, z], .059, 'coral', 'xz');
      diamond(.19, [.28, .105, .58], 'paleGold', [-Math.PI / 2, 0, 0]);
      diamond(.11, [.28, .108, .58], 'mint', [-Math.PI / 2, 0, 0]);
    }
  }
  }
  dimension = 'detail';
  buildDetail();
  buildMaterial();
  return group;
}
