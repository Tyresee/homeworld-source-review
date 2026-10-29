import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const WARM_GABLE_COLOR = '#bc6546';
export const WARM_GABLE_STYLE = 'warm-terracotta-gable';

/** The selected A roof, shared by the art study and the real house. Width and
 * depth include the eave overhang. Everything is baked into material batches:
 * hundreds of rounded tiles do not become hundreds of draw calls. */
export function createWarmGableRoof({ width: w, depth: d, height: h, color = WARM_GABLE_COLOR } = {}) {
  if (![w, d, h].every(Number.isFinite) || w <= 0 || d <= 0 || h <= 0) throw new TypeError('A gable roof requires positive finite dimensions');
  const group = new THREE.Group(), buckets = new Map(), templates = new Map();
  group.name = 'warm-terracotta-gable';
  const scale = Math.min(1, w / .5, d / .5);
  const selectedColor = new THREE.Color(color), isTerracotta = selectedColor.getHexString() === 'bc6546';
  const reference = new THREE.Color(WARM_GABLE_COLOR).getHSL({}), selected = selectedColor.getHSL({});
  const tint = hex => {
    if (isTerracotta) return hex;
    const target = new THREE.Color(hex).getHSL({});
    return new THREE.Color().setHSL(selected.h + target.h - reference.h,
      THREE.MathUtils.clamp(selected.s + target.s - reference.s, 0, 1),
      THREE.MathUtils.clamp(selected.l + target.l - reference.l, 0, 1));
  };
  function collect(geometry, shade, position = [0, 0, 0], quaternion, painted = false, doubleSide = false) {
    const hex = new THREE.Color(shade).getHexString(), key = `${hex}:${painted}:${doubleSide}`;
    if (!buckets.has(key)) buckets.set(key, { material: new THREE.MeshStandardMaterial({ color: shade, roughness: .79, side: doubleSide ? THREE.DoubleSide : THREE.FrontSide }), painted, geometries: [] });
    const geo = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    for (const attr of Object.keys(geo.attributes)) if (!['position', 'normal'].includes(attr)) geo.deleteAttribute(attr);
    geo.clearGroups();
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position), quaternion ?? new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
    buckets.get(key).geometries.push(geo);
  }
  function box(size, shade, position, radius = .045, quaternion, painted = false) {
    const r = Math.min(radius, ...size.map(v => v / 2)), key = [...size, r].join(':');
    if (!templates.has(key)) templates.set(key, new RoundedBoxGeometry(...size, 1, r));
    collect(templates.get(key), shade, position, quaternion, painted);
  }
  function surface(points, shade, painted = false) {
    const vertices = []; for (let i = 1; i < points.length - 1; i++) vertices.push(...points[0], ...points[i], ...points[i + 1]);
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.computeVertexNormals();
    collect(geometry, shade, undefined, undefined, painted, true); geometry.dispose();
  }
  function beam(from, to) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), width = .17 * scale;
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    box([width, a.distanceTo(b), width], '#f4e5c6', a.add(b).multiplyScalar(.5).toArray(), width * .36, quaternion);
  }
  box([w + .06 * scale, .18 * scale, d + .06 * scale], '#f4e6c9', [0, -.02 * scale, 0], .065 * scale);
  box([Math.max(w - .07 * scale, .01), .12 * scale, Math.max(d - .07 * scale, .01)], '#b79d7b', [0, -.15 * scale, 0], .03 * scale);
  for (const sign of [-1, 1]) {
    const slopeFace = [[-w / 2, 0, sign * d / 2], [w / 2, 0, sign * d / 2], [w / 2, h, 0], [-w / 2, h, 0]];
    const gableFace = [[sign * w / 2, 0, -d / 2], [sign * w / 2, 0, d / 2], [sign * w / 2, h, 0]];
    surface(sign < 0 ? slopeFace.reverse() : slopeFace, color, true);
    surface(sign > 0 ? gableFace.reverse() : gableFace, '#eee0c4');
    beam([sign * w / 2, 0, -d / 2], [sign * w / 2, h, 0]);
    beam([sign * w / 2, 0, d / 2], [sign * w / 2, h, 0]);
  }
  const angle = Math.atan2(h, d / 2), slope = Math.hypot(h, d / 2), rows = 7;
  const cols = Math.max(w < .5 ? 1 : 4, Math.round(w / .47));
  const tilePalette = ['#bd6446', '#cb7552', '#d3815c'].map(tint);
  for (const sign of [-1, 1]) for (let row = 0; row < rows; row++) {
    const t = (row + .48) / rows, quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), sign * angle);
    for (let col = 0; col < cols; col++) {
      box([w / cols - .025 * scale, .075 * scale, slope / rows + .055 * scale], tilePalette[(col + row * 2) % 3],
        [-w / 2 + (col + .5) * w / cols, h * t + .045 * scale, sign * d / 2 * (1 - t)], .035 * scale, quaternion, true);
    }
  }
  box([w + .15 * scale, .18 * scale, .25 * scale], tint('#ad573e'), [0, h + .06 * scale, 0], .08 * scale, undefined, true);
  templates.forEach(geometry => geometry.dispose());
  for (const { material, painted, geometries } of buckets.values()) {
    const geometry = mergeGeometries(geometries, false); geometries.forEach(geo => geo.dispose());
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData = { buildingPart: 'roof', roofStyle: WARM_GABLE_STYLE, paintSurface: painted ? 'roof' : 'trim' };
    group.add(mesh);
  }
  group.userData = { buildingPart: 'roof', roofStyle: WARM_GABLE_STYLE, roofDimensions: { width: w, depth: d, height: h }, tileCount: cols * rows * 2 };
  let disposed = false;
  group.dispose = () => { if (disposed) return; disposed = true; group.traverse(node => { if (node.isMesh) { node.geometry.dispose(); node.material.dispose(); } }); group.clear(); };
  return group;
}
