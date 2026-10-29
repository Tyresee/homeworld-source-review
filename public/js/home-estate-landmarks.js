import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const PALETTE = Object.freeze({
  stone: '#d8a763', cream: '#fff1cf', wood: '#a46a35', darkWood: '#71452d',
  roof: '#268c9c', roofEdge: '#176372', gold: '#eeb747', soil: '#674830',
  leaf: '#4f863b', lightLeaf: '#8fc35c', flower: '#ee8eaa', pot: '#d18452',
  glass: '#a1e3d3', shadow: '#b58448', white: '#fff9e7',
});

/** Original, self-contained estate models. Coordinates use Y up, front at +Z. */
export function createEstateLandmark(kind, { level = 3 } = {}) {
  if (!['greenhouse', 'treehouse', 'gazebo'].includes(kind)) throw new RangeError(`Unknown estate landmark: ${kind}`);
  level = Math.max(1, Math.min(3, Math.floor(Number(level) || 1)));
  const root = new THREE.Group(); root.name = `estate-landmark-${kind}`;
  const geometry = new Set(), materials = new Map(), geometryCache = new Map();
  let disposed = false;
  const mat = (name, options = {}) => {
    const key = `${name}:${JSON.stringify(options)}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({
      color: PALETTE[name] || name, roughness: .72, ...options,
    }));
    return materials.get(key);
  };
  function cached(key, make) {
    if (!geometryCache.has(key)) { const value = make(); geometryCache.set(key, value); geometry.add(value); }
    return geometryCache.get(key);
  }
  function mesh(parent, geo, color, p, options = {}) {
    geometry.add(geo);
    const value = new THREE.Mesh(geo, mat(color, options)); value.position.set(...p);
    value.castShadow = true; value.receiveShadow = true; parent.add(value); return value;
  }
  function box(parent, size, color, p, radius = .035, options = {}) {
    const key = `box:${size}:${radius}`;
    return mesh(parent, cached(key, () => new RoundedBoxGeometry(...size, 2,
      Math.min(radius, ...size.map(n => n * .49)))), color, p, options);
  }
  function cylinder(parent, bottom, top, height, color, p, sides = 12, options = {}) {
    return mesh(parent, cached(`cyl:${bottom}:${top}:${height}:${sides}`,
      () => new THREE.CylinderGeometry(top, bottom, height, sides)), color, p, options);
  }
  function torus(parent, radius, tube, color, p, options = {}) {
    return mesh(parent, cached(`torus:${radius}:${tube}`, () => new THREE.TorusGeometry(radius, tube, 6, 16)), color, p, options);
  }
  function beam(parent, start, end, width, color, depth = width) {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end), length = a.distanceTo(b);
    const value = box(parent, [width, length, depth], color, a.clone().add(b).multiplyScalar(.5).toArray(), width * .18);
    value.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize()); return value;
  }
  function leaf(parent, p, scale, color = 'leaf', turn = 0) {
    const geo = cached('leaf', () => new THREE.IcosahedronGeometry(1, 1));
    const value = mesh(parent, geo, color, p); value.scale.set(...scale); value.rotation.z = turn; return value;
  }
  function pot(parent, x, y, z, scale = 1, blossom = false) {
    const group = new THREE.Group(); parent.add(group); group.position.set(x, y, z); group.scale.setScalar(scale);
    cylinder(group, .17, .22, .28, 'pot', [0, .14, 0]);
    const rim = torus(group, .22, .035, 'cream', [0, .28, 0]); rim.rotation.x = Math.PI / 2;
    cylinder(group, .19, .19, .018, 'soil', [0, .283, 0]);
    beam(group, [0, .29, 0], [0, .72, 0], .035, 'leaf');
    leaf(group, [-.12, .49, 0], [.15, .07, .08], 'lightLeaf', .5);
    leaf(group, [.12, .59, 0], [.15, .07, .08], 'leaf', -.5);
    if (blossom) {
      const bloom = torus(group, .09, .052, 'flower', [0, .75, 0]); bloom.rotation.x = -.45;
      leaf(group, [0, .75, .02], [.055, .055, .055], 'gold');
    }
  }
  function gable(parent, width, depth, eave, peak, colors = ['roof', 'roofEdge']) {
    const slope = Math.atan2(peak - eave, width / 2), length = Math.hypot(width / 2, peak - eave);
    for (const sign of [-1, 1]) {
      const wing = box(parent, [length + .10, .13, depth], colors[0], [sign * width / 4, (eave + peak) / 2, 0], .05);
      wing.rotation.z = -sign * slope;
      for (const z of [-depth / 2 + .04, depth / 2 - .04])
        beam(parent, [0, peak + .025, z], [sign * width / 2, eave + .025, z], .11, colors[1]);
    }
    box(parent, [.16, .16, depth + .07], 'gold', [0, peak + .07, 0], .05);
    for (const x of [-width / 2, width / 2]) box(parent, [.12, .14, depth + .06], colors[1], [x, eave, 0], .035);
  }
  function flowerVine(parent, start, end, count = 4) {
    beam(parent, start, end, .045, 'leaf');
    for (let i = 0; i < count; i++) {
      const t = (i + .5) / count, p = start.map((v, axis) => v + (end[axis] - v) * t);
      leaf(parent, [p[0] + (i % 2 ? -.08 : .08), p[1], p[2]], [.14, .08, .07], i % 2 ? 'lightLeaf' : 'leaf', i % 2 ? -.6 : .6);
      if (i % 2 === 0) leaf(parent, [p[0], p[1] + .055, p[2] + .055], [.09, .075, .08], 'flower');
    }
  }
  function plaque(parent, p, width = .6) {
    box(parent, [width, .22, .07], 'darkWood', p, .06);
    box(parent, [width - .10, .04, .014], 'gold', [p[0], p[1], p[2] + .045], .008);
  }

  function greenhouse() {
    const width = level === 1 ? 2.12 : 2.8, depth = level === 1 ? 1.9 : 2.35;
    const wall = level === 1 ? 1.14 : 1.34, peak = level === 1 ? 1.73 : 2.08;
    box(root, [width + .18, .18, depth + .20], 'stone', [0, .09, 0], .10);
    box(root, [width - .14, .06, depth - .14], 'shadow', [0, .205, 0], .02);
    const glass = { transparent: true, opacity: .78, roughness: .18, metalness: .04, depthWrite: true, side: THREE.DoubleSide };
    for (const x of [-width / 2, width / 2]) {
      box(root, [.028, wall - .20, depth - .12], 'glass', [x, wall / 2 + .20, 0], .006, glass).castShadow = false;
      for (const z of [-depth / 2, 0, depth / 2]) box(root, [.12, wall, .12], 'cream', [x, wall / 2 + .18, z], .03);
      for (const y of [.40, wall + .18]) box(root, [.14, .11, depth + .10], 'roofEdge', [x, y, 0], .03);
      box(root, [.06, .06, depth - .05], 'cream', [x, .94, 0], .014);
    }
    box(root, [width - .12, wall - .20, .028], 'glass', [0, wall / 2 + .20, -depth / 2], .006, glass).castShadow = false;
    box(root, [width + .08, .11, .13], 'roofEdge', [0, wall + .18, -depth / 2], .03);
    for (const x of [-.38, .38]) box(root, [.11, wall, .12], 'cream', [x, wall / 2 + .18, depth / 2], .024);
    for (const x of [-(width / 2 + .38) / 2, (width / 2 + .38) / 2]) {
      box(root, [width / 2 - .43, wall - .22, .028], 'glass', [x, wall / 2 + .20, depth / 2], .006, glass).castShadow = false;
      box(root, [width / 2 - .38, .06, .06], 'cream', [x, .94, depth / 2], .015);
    }
    box(root, [.66, 1.04, .055], 'glass', [0, .76, depth / 2 + .025], .015, glass).castShadow = false;
    box(root, [.08, .95, .08], 'roofEdge', [0, .75, depth / 2 + .075], .02);
    box(root, [.83, .12, .14], 'cream', [0, 1.31, depth / 2 + .05], .04);
    cylinder(root, .043, .043, .05, 'gold', [.12, .78, depth / 2 + .105]).rotation.x = Math.PI / 2;
    box(root, [.95, .11, .37], 'stone', [0, .095, depth / 2 + .18], .05);
    const roof = new THREE.Group(); root.add(roof); roof.position.y = .18;
    gable(roof, width + .26, depth + .30, wall, peak);
    // Roof glazing forms two broad highlights instead of thin, unreadable ribs.
    const slope = Math.atan2(peak - wall, (width + .26) / 2);
    for (const sign of [-1, 1]) {
      const pane = box(roof, [.64, .024, depth * .75], 'glass', [sign * width * .27, (wall + peak) / 2 + .077, 0], .01, { ...glass, opacity: .9 });
      pane.rotation.z = -sign * slope; pane.castShadow = false;
    }
    for (const x of [-width * .31, width * .31]) {
      box(root, [.38, .16, depth * .7], 'wood', [x, .34, -.10], .03);
      for (const z of [-.56, .07]) pot(root, x, .42, z, .77, level > 1);
    }
    if (level > 1) {
      plaque(root, [0, 1.56, depth / 2 + .16], .55);
      for (const x of [-width / 2 + .13, width / 2 - .13]) flowerVine(root, [x, .42, depth / 2 + .12], [x, 1.36, depth / 2 + .12], 3);
    }
    if (level > 2) {
      const lantern = new THREE.Group(); root.add(lantern); lantern.position.set(.85, 1.29, depth / 2 + .17);
      box(lantern, [.15, .23, .15], 'gold', [0, 0, 0], .035, { emissive: '#ca8c22', emissiveIntensity: .15 });
      box(lantern, [.24, .08, .24], 'roofEdge', [0, .16, 0], .02);
      pot(root, -width / 2 - .12, .16, .7, 1.1, true);
      box(root, [.55, .36, .57], 'cream', [.83, peak + .32, -.55], .035);
      box(root, [.69, .11, .68], 'roofEdge', [.83, peak + .52, -.55], .03);
      box(root, [.27, .20, .01], 'glass', [.83, peak + .33, -.255], .004, glass);
    }
    root.userData.footprint = { width: width + .52, depth: depth + .60 };
  }

  function treehouse() {
    const platformY = level === 1 ? 1.12 : 1.63, cabinW = level === 1 ? 1.45 : 1.84;
    cylinder(root, .44, .29, platformY + 1.8, 'darkWood', [.36, (platformY + 1.8) / 2, -.48], 9);
    for (const x of [-.30, .70]) beam(root, [x, .2, -.50], [x * 1.3, .07, .05], .25, 'wood');
    beam(root, [.3, .75, -.45], [-.96, platformY - .12, -.30], .24, 'wood');
    beam(root, [.35, .75, -.45], [1.1, platformY - .12, .48], .25, 'wood');
    box(root, [2.63, .19, 2.1], 'wood', [0, platformY, 0], .08);
    for (const z of [-.83, -.4, .03, .46, .86]) box(root, [2.55, .025, .025], 'darkWood', [0, platformY + .109, z], .005);
    const cabin = new THREE.Group(); root.add(cabin); cabin.position.set(-.25, platformY + .10, -.36);
    const wallHeight = level === 1 ? .82 : 1.01;
    box(cabin, [cabinW, wallHeight, 1.3], 'cream', [0, wallHeight / 2, 0], .065);
    for (const x of [-cabinW / 2 + .05, cabinW / 2 - .05]) box(cabin, [.11, wallHeight + .04, 1.43], 'wood', [x, wallHeight / 2, 0], .035);
    for (const y of [.08, wallHeight - .06]) box(cabin, [cabinW + .08, .09, 1.4], 'wood', [0, y, 0], .025);
    box(cabin, [.45, .67, .035], 'darkWood', [.34, .37, .675], .07);
    for (const x of [.19, .34, .49]) box(cabin, [.014, .58, .014], 'wood', [x, .37, .70], .004);
    cylinder(cabin, .029, .029, .035, 'gold', [.45, .35, .71]).rotation.x = Math.PI / 2;
    box(cabin, [.45, .43, .04], 'roofEdge', [-.4, .60, .683], .055);
    box(cabin, [.35, .33, .045], 'glass', [-.4, .60, .709], .035, { roughness: .3 });
    for (const size of [[.39, .055, .06], [.055, .37, .06]]) box(cabin, size, 'cream', [-.4, .60, .746], .012);
    gable(cabin, cabinW + .35, 1.73, wallHeight, wallHeight + .53);
    const stair = new THREE.Group(); root.add(stair); stair.position.x = .70;
    const count = level === 1 ? 5 : 7, start = [0, .10, 1.75], end = [0, platformY + .04, .69];
    for (const x of [-.28, .28]) beam(stair, [x, start[1], start[2]], [x, end[1], end[2]], .105, 'darkWood');
    for (let i = 0; i < count; i++) {
      const t = (i + .5) / count;
      box(stair, [.65, .08, .23], 'wood', [0, start[1] + (end[1] - start[1]) * t, start[2] + (end[2] - start[2]) * t], .025);
    }
    for (const x of [-1.18, -.48, .16]) box(root, [.09, .53, .09], 'cream', [x, platformY + .37, .91], .025);
    box(root, [1.53, .09, .10], 'gold', [-.52, platformY + .63, .91], .025);
    for (const x of [-1.17, 1.17]) {
      box(root, [.10, .52, .1], 'cream', [x, platformY + .37, .18], .025);
      box(root, [.10, .10, 1.48], 'gold', [x, platformY + .62, .18], .025);
    }
    const crownY = platformY + 1.38;
    leaf(root, [.75, crownY, -.55], [.82, .65, .77], 'leaf');
    leaf(root, [.45, crownY + .34, -.88], [.63, .63, .63], 'lightLeaf');
    leaf(root, [1.04, crownY + .25, -.3], [.52, .50, .6], 'leaf');
    if (level > 1) {
      pot(root, -1.04, platformY + .1, .64, .82, true);
      plaque(cabin, [0, .95, .91], .66);
      box(root, [.39, .30, .32], 'gold', [-.81, platformY + .29, .26], .06);
      box(root, [.42, .08, .34], 'wood', [-.81, platformY + .46, .26], .04);
    }
    if (level > 2) {
      box(cabin, [.34, .48, .34], 'stone', [-.55, wallHeight + .53, -.46], .03);
      box(cabin, [.47, .10, .45], 'roofEdge', [-.55, wallHeight + .82, -.46], .035);
      beam(root, [-1.03, platformY + .12, .90], [-1.03, platformY + 1.22, .90], .065, 'wood');
      const flag = box(root, [.42, .23, .025], 'flower', [-.82, platformY + 1.08, .90], .025); flag.rotation.z = -.1;
      flowerVine(root, [-1.25, .1, -.4], [-1.25, platformY + .3, -.4], 5);
      leaf(root, [1.02, crownY + .70, -.8], [.44, .42, .44], 'lightLeaf');
    }
    root.userData.footprint = { width: 3.3, depth: 3.3 };
  }

  function gazebo() {
    const width = level === 1 ? 2.12 : level === 2 ? 2.64 : 3.25, height = level === 1 ? 1.54 : level === 2 ? 1.88 : 2.5;
    box(root, [width + .28, .17, width + .28], 'stone', [0, .085, 0], .16);
    box(root, [width + .06, .08, width + .06], 'cream', [0, .20, 0], .10);
    box(root, [1.12, .09, .35], 'stone', [0, .045, width / 2 + .18], .05);
    for (const x of [-width / 2 + .17, width / 2 - .17]) for (const z of [-width / 2 + .17, width / 2 - .17]) {
      box(root, [.32, .22, .32], 'stone', [x, .33, z], .06);
      cylinder(root, .097, .08, height - .33, 'cream', [x, (height + .33) / 2, z]);
      box(root, [.26, .13, .26], 'gold', [x, height - .05, z], .04);
      for (const direction of [-1, 1]) beam(root, [x, height - .04, z], [x + direction * .30, height - .35, z], .10, 'wood');
    }
    for (const z of [-width / 2 + .15, width / 2 - .15]) box(root, [width, .17, .17], 'wood', [0, height, z], .04);
    for (const x of [-width / 2 + .15, width / 2 - .15]) box(root, [.17, .17, width], 'wood', [x, height, 0], .04);
    // A four-sided hip roof has broad sloping faces and a deep eave silhouette.
    const roofRadius = (width + .6) / Math.SQRT2, roofHeight = level > 2 ? 1.05 : .66;
    const roof = cylinder(root, roofRadius, .075, roofHeight, 'roof', [0, height + roofHeight / 2 + .10, 0], 4); roof.rotation.y = Math.PI / 4;
    const eave = cylinder(root, roofRadius + .035, roofRadius + .035, .13, 'roofEdge', [0, height + .09, 0], 4); eave.rotation.y = Math.PI / 4;
    const top = height + roofHeight + .13, half = (width + .60) / 2;
    for (const x of [-half, half]) for (const z of [-half, half]) beam(root, [x, height + .15, z], [0, top, 0], .065, 'gold');
    cylinder(root, .07, .025, .23, 'gold', [0, top + .13, 0]);
    if (level > 2) {
      cylinder(root, .42, .42, .36, 'gold', [0, top + .45, 0]);
      cylinder(root, .55, .06, .4, 'roof', [0, top + .8, 0], 6);
    }
    leaf(root, [0, top + .27, 0], [.12, .13, .12], 'gold');
    // The open front and shaded back benches make this clearly a place to sit.
    const bench = (x, z, rotate) => {
      const value = new THREE.Group(); value.position.set(x, .25, z); value.rotation.y = rotate; root.add(value);
      for (const sx of [-.42, .42]) box(value, [.12, .28, .33], 'wood', [sx, .14, 0], .025);
      box(value, [1.13, .10, .43], 'wood', [0, .32, 0], .055);
      box(value, [1.13, .33, .065], 'cream', [0, .54, -.17], .04);
    };
    bench(0, -width / 2 + .40, 0);
    if (level > 1) {
      bench(-width / 2 + .4, -.16, Math.PI / 2);
      const table = cylinder(root, .40, .40, .08, 'cream', [.19, .83, .17]); table.name = 'gazebo-tea-table';
      cylinder(root, .07, .07, .52, 'wood', [.19, .53, .17]);
      cylinder(root, .23, .23, .07, 'gold', [.19, .28, .17]);
      pot(root, .19, .87, .17, .43, true);
      flowerVine(root, [-width / 2 + .12, .45, width / 2 - .08], [-width / 2 + .12, height, width / 2 - .08], 4);
    }
    if (level > 2) {
      flowerVine(root, [-width / 2 + .1, height - .01, width / 2 - .05], [width / 2 - .1, height - .01, width / 2 - .05], 7);
      for (const x of [-width / 2 + .15, width / 2 - .15]) pot(root, x, .25, width / 2 - .14, .84, true);
      const lamp = box(root, [.18, .24, .18], 'gold', [0, height - .24, 0], .05, { emissive: '#dd9a32', emissiveIntensity: .15 });
      beam(root, [0, height - .11, 0], [0, height + .04, 0], .03, 'darkWood');
      lamp.name = 'gazebo-lantern';
    }
    root.userData.footprint = { width: width + .60, depth: width + .60 };
  }

  ({ greenhouse, treehouse, gazebo })[kind]();
  root.userData.landmarkKind = kind; root.userData.level = level;
  root.userData.resourceBudget = { meshes: 0, materials: materials.size, geometries: geometry.size };
  root.traverse(value => { if (value.isMesh) root.userData.resourceBudget.meshes++; });
  root.dispose = () => {
    if (disposed) return; disposed = true;
    geometry.forEach(value => value.dispose()); materials.forEach(value => value.dispose());
    root.clear(); geometry.clear(); geometryCache.clear(); materials.clear();
  };
  return root;
}
