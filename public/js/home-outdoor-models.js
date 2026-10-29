import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createEstateOutdoor } from './home-estate-outdoor.js';
import { createEstateLandmark } from './home-estate-landmarks.js';
import { getOutdoorProduct } from './home-outdoor-catalog.js';
import { createSportsCourtModel } from './home-sports-court-models.js';
import { createSportsRecreationModel } from './home-sports-recreation-models.js';

/** One owned item per model. Furniture never appears as a free pool upgrade. */
export function createOutdoorProductModel(value, item = {}) {
  const product = typeof value === 'string' ? getOutdoorProduct(value) : value;
  if (!product || product.productType !== 'outdoor') throw new RangeError('Unknown outdoor product.');
  const root = new THREE.Group(); root.name = product.skuId;
  const body = new THREE.Group(); root.add(body);
  const geometries = new Map(), materials = new Map(), disposers = [];
  let disposed = false;
  const color = /^#[\da-f]{6}$/i.test(item.color ?? '') ? item.color : product.defaultColor;
  const level = product.level, w = product.width, d = product.depth;
  const cream = '#fff3d7', wood = '#bb8a52', dark = '#725139', gold = '#d4ad62', metal = '#829b97';
  const geometry = (key, make) => { if (!geometries.has(key)) geometries.set(key, make()); return geometries.get(key); };
  const material = (hex, options = {}) => {
    const key = `${hex}:${JSON.stringify(options)}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color: hex, roughness: .7, ...options }));
    return materials.get(key);
  };
  function mesh(geo, hex, p, name = '', options = {}) {
    const result = new THREE.Mesh(geo, material(hex, options)); result.position.set(...p);
    result.name = name; result.castShadow = true; result.receiveShadow = true; body.add(result); return result;
  }
  function box(size, hex, p, name = '', radius = .04, options = {}) {
    return mesh(geometry(`box:${size}:${radius}`, () => new RoundedBoxGeometry(...size, 2,
      Math.min(radius, ...size.map(x => x * .45)))), hex, p, name, options);
  }
  function cylinder(radius, height, hex, p, name = '', top = radius, options = {}) {
    return mesh(geometry(`cyl:${radius}:${height}:${top}`, () => new THREE.CylinderGeometry(top, radius, height, 20)), hex, p, name, options);
  }
  function sphere(scale, hex, p, name = '') {
    const result = mesh(geometry('sphere', () => new THREE.SphereGeometry(1, 16, 10)), hex, p, name); result.scale.set(...scale); return result;
  }
  function beam(a, b, width, hex, name = '', depth = width) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), length = start.distanceTo(end);
    const result = box([width, length, depth], hex, start.clone().add(end).multiplyScalar(.5).toArray(), name, width * .2);
    result.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize()); return result;
  }
  function torus(radius, tube, hex, p, name = '') {
    return mesh(geometry(`torus:${radius}:${tube}`, () => new THREE.TorusGeometry(radius, tube, 8, 24)), hex, p, name);
  }
  function flower(x, z, y, scale = 1, shade = '#f0b1ab') {
    beam([x, y, z], [x, y + .34 * scale, z], .025 * scale, '#6c9a4d');
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * 2 * i / 5;
      sphere([.075 * scale, .06 * scale, .075 * scale], shade,
        [x + Math.cos(a) * .075 * scale, y + .35 * scale, z + Math.sin(a) * .075 * scale]);
    }
    sphere([.05 * scale, .06 * scale, .05 * scale], '#f2cd60', [x, y + .38 * scale, z]);
  }
  function leaf(x, z, y, scale = 1) {
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3;
      const sprig = sphere([.18 * scale, .10 * scale, .36 * scale], i % 2 ? '#719951' : '#98b66c',
        [x + Math.sin(a) * .13 * scale, y + .18 * scale, z + Math.cos(a) * .13 * scale]);
      sprig.rotation.y = a;
    }
  }
  function pool() {
    const waterFinish = { roughness: .2, metalness: .12 };
    function oval(radiusX, radiusZ, height, hex, p, name) {
      const result = cylinder(1, height, hex, p, name, 1, name.includes('water') ? waterFinish : {});
      result.scale.x = radiusX; result.scale.z = radiusZ; return result;
    }
    function ring(radiusX, radiusZ, thickness, height, y, z, name, hex = cream) {
      const key = `pool-ring:${radiusX}:${radiusZ}:${thickness}:${height}`;
      const geo = geometry(key, () => {
        const outline = new THREE.Shape(); outline.absellipse(0, 0, radiusX, radiusZ, 0, Math.PI * 2, false);
        const hole = new THREE.Path(); hole.absellipse(0, 0, radiusX - thickness, radiusZ - thickness, 0, Math.PI * 2, true);
        outline.holes.push(hole);
        const result = new THREE.ExtrudeGeometry(outline, { depth: height, bevelEnabled: false, curveSegments: 36, steps: 1 });
        result.rotateX(-Math.PI / 2); return result;
      });
      return mesh(geo, hex, [0, y, z], name);
    }
    function entrySteps(z, y, width = 1.2) {
      for (let i = 0; i < 3; i++) box([width - i * .16, .045, .28], '#cae5dc', [0, y - i * .018, z + i * .27], 'pool-entry-step');
    }
    function handrails(z, y, xOffset = 0) {
      for (const side of [-1, 1]) {
        const x = xOffset + side * .32;
        beam([x, y, z - .10], [x, y + .42, z - .10], .045, metal, 'pool-handrail');
        beam([x, y + .42, z - .10], [x, y + .42, z + .38], .045, metal, 'pool-handrail');
        beam([x, y + .42, z + .38], [x, y, z + .38], .045, metal, 'pool-handrail');
      }
    }
    if (level === 1) {
      // A genuine oval basin, including the deck silhouette and curved high wall.
      // It remains recognisable as the small starter pool at thumbnail scale.
      oval(w / 2, d / 2, .16, color, [0, .08, 0], 'pool-deck');
      oval(1.88, 2.48, .20, '#b7cec9', [0, .25, -.15], 'pool-oval-basin');
      ring(1.98, 2.58, .24, .20, .18, -.15, 'pool-oval-wall', color);
      ring(2.02, 2.62, .30, .09, .37, -.15, 'pool-coping');
      oval(1.73, 2.33, .045, '#43bfd5', [0, .34, -.15], 'pool-water');
      entrySteps(-2.12, .365, 1.12);
      handrails(2.19, .35);
      for (const z of [-.48, .48]) {
        const ripple = torus(.36, .018, '#b4ebed', [.4, .37, z], 'pool-water-ripple');
        ripple.rotation.x = Math.PI / 2; ripple.scale.x = 1.25; ripple.castShadow = false;
      }
      return;
    }
    const waterW = level === 3 ? 4.65 : w - 1.25;
    const waterD = level === 3 ? 4.6 : d - 1.5;
    const basinZ = level === 3 ? -1.05 : 0;
    const rimY = level === 3 ? .46 : .33;
    if (level === 2) {
      box([w, .24, d], color, [0, .12, 0], 'pool-deck', .12);
      for (let z = -d / 2 + .2; z < d / 2; z += .30) {
        for (const side of [-1, 1]) box([.46, .018, .025], '#8d613b', [side * (w / 2 - .3), .25, z], 'pool-deck-plank', .002);
      }
      // A broad wood threshold separates this long exercise pool from the oval starter.
      for (let x = -w / 2 + .2; x < w / 2 - .1; x += .32)
        box([.024, .018, .48], '#8d613b', [x, .25, -d / 2 + .29], 'pool-deck-plank', .002);
    } else {
      // Main rectangle plus a curved front bay: the platform and water have two
      // separate silhouettes, rather than decorating the same rectangular pool.
      const outline = new THREE.Shape();
      outline.moveTo(-3.10, -4.3); outline.lineTo(3.10, -4.3);
      outline.quadraticCurveTo(3.3, -4.3, 3.3, -4.10); outline.lineTo(3.3, 1.73);
      outline.quadraticCurveTo(3.3, 2.05, 2.05, 2.05);
      outline.absarc(0, 2.05, 2.05, 0, Math.PI, false);
      outline.quadraticCurveTo(-3.3, 2.05, -3.3, 1.73); outline.lineTo(-3.3, -4.10);
      outline.quadraticCurveTo(-3.3, -4.3, -3.10, -4.3); outline.closePath();
      const slab = geometry('pool-composite-deck', () => new THREE.ExtrudeGeometry(outline,
        { depth: .28, bevelEnabled: false, curveSegments: 36, steps: 1 }));
      const deck = mesh(slab, color, [0, .28, 0], 'pool-deck'); deck.rotation.x = Math.PI / 2;
      const foundation = mesh(slab, '#c8b48e', [0, .10, 0], 'pool-composite-foundation'); foundation.rotation.x = Math.PI / 2;
      foundation.scale.set(.985, .985, .35);
    }
    for (const side of [-1, 1]) {
      box([waterW + .46, .18, .23], cream, [0, rimY, basinZ + side * (waterD / 2 + .115)], 'pool-coping');
      box([.23, .18, waterD], cream, [side * (waterW / 2 + .115), rimY, basinZ], 'pool-coping');
    }
    box([waterW, .075, waterD], '#43bfd5', [0, rimY - .07, basinZ], 'pool-water', .035, waterFinish);
    entrySteps(basinZ - waterD / 2 + .14, rimY - .035);
    // Place the main-pool ladder on the wide side aisle, clear of the spa connector.
    handrails(basinZ + waterD / 2, rimY, level === 3 ? -1.25 : 0);
    for (const x of [-waterW * .28, 0, waterW * .28])
      box([.025, .008, waterD - .8], '#b4ebed', [x, rimY - .028, basinZ + .15], 'pool-water-highlight', .001).castShadow = false;
    if (level === 3) {
      const spaZ = 2.68;
      oval(1.36, 1.36, .44, '#d1bd96', [0, .5, spaZ], 'pool-spa-raised-basin');
      ring(1.39, 1.39, .25, .13, .71, spaZ, 'pool-spa-coping');
      oval(1.15, 1.15, .045, '#62d4dc', [0, .75, spaZ], 'pool-spa-water');
      ring(1.40, 1.40, .055, .035, .845, spaZ, 'pool-spa-gold-band', gold);
      // A wide stone spillway visibly joins the elevated round spa to the main pool.
      box([.75, .12, .36], '#f0e5cb', [0, .66, 1.40], 'pool-spa-spillway', .035);
      box([.62, .31, .045], '#8adddf', [0, .52, 1.20], 'pool-waterfall', .008, waterFinish);
      for (let i = 0; i < 3; i++) box([.76 + i * .10, .13, .26], '#e5d6b9', [1.38 + i * .20, .61 - i * .13, 2.25], 'pool-spa-entry-step', .025);
      for (const side of [-1, 1]) {
        for (let z = basinZ - waterD / 2; z <= basinZ + waterD / 2; z += .42)
          box([.16, .025, .27], '#287597', [side * (waterW / 2 + .12), rimY + .103, z], 'pool-mosaic-tile', .008);
        box([waterW, .028, .055], gold, [0, rimY + .11, basinZ + side * (waterD / 2 + .12)], 'pool-gold-trim', .008);
      }
    }
  }
  function garden() {
    box([w, .16, d], '#8cad63', [0, .08, 0], 'garden-ground', .13);
    box([1.12, .08, d - .2], '#e8d5ae', [0, .20, 0], 'garden-path', .03);
    box([w - .2, .08, .95], '#e8d5ae', [0, .20, 0], 'garden-path', .03);
    for (const x of [-w * .32, w * .32]) for (const z of [-d * .27, d * .27]) {
      box([w * .25, .28, d * .29], color, [x, .3, z], 'garden-raised-bed', .09);
      box([w * .25 - .13, .04, d * .29 - .13], '#677b47', [x, .46, z], 'garden-soil', .02);
      for (const dz of [-.35, .1, .48]) { leaf(x, z + dz, .5, .75); flower(x, z + dz, .65, .8); }
    }
    if (level > 1) {
      for (const x of [-.86, .86]) box([.16, 2.1, .16], cream, [x, 1.24, d / 2 - .5], 'garden-arch-post');
      const arc = mesh(geometry('garden-arch', () => new THREE.TorusGeometry(.87, .09, 8, 24, Math.PI)), cream, [0, 2.25, d / 2 - .5], 'garden-arch');
      for (let i = 0; i <= 6; i++) { const a = i * Math.PI / 6; sphere([.15, .15, .14], i % 2 ? '#eeb3a6' : '#759c51', [Math.cos(a) * .88, 2.25 + Math.sin(a) * .88, d / 2 - .5], 'garden-arch-flower'); }
      arc.rotation.z = 0;
    }
    if (level === 3) {
      const greenhouse = createEstateLandmark('greenhouse', { level: 2 }); greenhouse.position.set(0, .24, -d * .25); body.add(greenhouse); disposers.push(() => greenhouse.dispose());
    }
  }
  function courtyard() {
    box([w, .2, d], color, [0, .1, 0], 'courtyard-platform', .1);
    if (level > 1) box([w - .2, .10, d - .18], cream, [0, .25, 0], 'courtyard-upper-platform', .08);
    for (let x = -w / 2 + .5; x < w / 2; x += .7) box([.02, .012, d - .18], '#c2aa7c', [x, level > 1 ? .307 : .207, 0], 'courtyard-tile-joint', .001);
    for (const x of [-w / 2 + .22, w / 2 - .22]) box([.24, .42, d - .2], '#c3c298', [x, .28, 0], 'courtyard-side-wall');
    if (level === 2) {
      cylinder(.58, .18, '#c8b18c', [0, .4, 0], 'courtyard-fountain-base');
      cylinder(.47, .035, '#7acdd6', [0, .505, 0], 'courtyard-fountain-water');
      cylinder(.13, .55, cream, [0, .73, 0], 'courtyard-fountain-column');
      cylinder(.31, .12, '#d5bd8f', [0, 1.04, 0], 'courtyard-fountain-bowl');
      sphere([.12, .28, .12], '#9ddde0', [0, 1.32, 0], 'courtyard-fountain-jet');
    }
    if (level === 3) {
      for (const x of [-1.55, 1.55]) {
        box([.55, .38, .55], '#cbb17f', [x, .48, d / 2 - .4], 'courtyard-column-base');
        box([.34, 1.7, .34], cream, [x, 1.45, d / 2 - .4], 'courtyard-column');
        box([.59, .17, .59], gold, [x, 2.29, d / 2 - .4], 'courtyard-column-cap');
      }
      box([3.7, .24, .48], color, [0, 2.42, d / 2 - .4], 'courtyard-portico');
      box([3.8, .10, .55], gold, [0, 2.59, d / 2 - .4], 'courtyard-portico-trim');
    }
  }
  function gazebo() {
    const span = w - .6, columnY = level === 3 ? 2.9 : level === 2 ? 2.45 : 1.95;
    box([w - .14, .2, d - .14], '#c9b187', [0, .1, 0], 'gazebo-base', .12);
    box([span, .10, span], cream, [0, .25, 0], 'gazebo-floor', .08);
    box([1.35 + level * .18, .12, .34], '#c9b187', [0, .06, d / 2 - .17], 'gazebo-step', .04);
    for (const x of [-span / 2 + .23, span / 2 - .23]) for (const z of [-span / 2 + .23, span / 2 - .23]) {
      box([.38, .23, .38], color, [x, .415, z], 'gazebo-column-base');
      cylinder(level === 3 ? .14 : .095, columnY - .5, cream, [x, (columnY + .5) / 2, z], 'gazebo-column');
      box([.38, .17, .38], gold, [x, columnY - .06, z], 'gazebo-column-cap');
    }
    for (const z of [-span / 2 + .2, span / 2 - .2]) box([span, .17, .16], wood, [0, columnY, z], 'gazebo-roof-beam');
    for (const x of [-span / 2 + .2, span / 2 - .2]) box([.16, .17, span], wood, [x, columnY, 0], 'gazebo-roof-beam');
    const roof = mesh(geometry(`gazebo-roof:${w}`, () => new THREE.ConeGeometry((w - .08) / Math.SQRT2, .65 + level * .08, 4)), color, [0, columnY + .42, 0], 'gazebo-hip-roof'); roof.rotation.y = Math.PI / 4;
    box([w - .04, .09, d - .04], '#548a8c', [0, columnY + .03, 0], 'gazebo-eave', .04);
    if (level === 3) {
      cylinder(.24, .22, gold, [0, columnY + .92, 0], 'gazebo-upper-drum');
      const cap = mesh(geometry('gazebo-upper-roof', () => new THREE.ConeGeometry(.63, .43, 4)), '#6ba0a3', [0, columnY + 1.2, 0], 'gazebo-upper-roof'); cap.rotation.y = Math.PI / 4;
    }
  }
  function treehouse() {
    const platformY = level === 1 ? 1.10 : level === 2 ? 1.55 : 1.85;
    cylinder(.38, platformY + 1.5, dark, [w * .2, (platformY + 1.5) / 2, -d * .17], 'treehouse-trunk', .24);
    for (const side of [-1, 1]) beam([w * .2, .6, -d * .17], [side * (w * .32), platformY - .12, .3], .22, wood, 'treehouse-support');
    box([w - .3, .19, d * .65], wood, [0, platformY, 0], 'treehouse-platform', .06);
    for (let x = -w / 2 + .3; x < w / 2 - .25; x += .25) box([.025, .02, d * .62], dark, [x, platformY + .11, 0], 'treehouse-deck-plank', .001);
    function cabin(x, z, cw, ch) {
      box([cw, ch, 1.52], color, [x, platformY + ch / 2 + .18, z], 'treehouse-cabin', .055);
      for (const dx of [-cw / 2 + .05, cw / 2 - .05]) box([.12, ch + .05, 1.58], wood, [x + dx, platformY + ch / 2 + .18, z], 'treehouse-cabin-corner');
      box([.46, .76, .05], dark, [x + cw * .17, platformY + .57, z + .79], 'treehouse-door', .045);
      box([.40, .39, .055], '#a6d7d1', [x - cw * .25, platformY + .91, z + .79], 'treehouse-window', .035);
      box([.045, .41, .065], cream, [x - cw * .25, platformY + .91, z + .81], 'treehouse-window-mullion', .008);
      const roofRise = .50, slope = Math.atan2(roofRise, (cw + .30) / 2), length = Math.hypot(roofRise, (cw + .30) / 2);
      for (const sign of [-1, 1]) {
        const wing = box([length, .15, 1.85], '#3b8c94', [x + sign * (cw + .30) / 4, platformY + ch + .42, z], 'treehouse-roof'); wing.rotation.z = -sign * slope;
      }
      box([.13, .14, 1.89], gold, [x, platformY + ch + .68, z], 'treehouse-roof-ridge');
    }
    if (level === 3) { cabin(-1.08, -.42, 1.70, 1.12); cabin(1.08, -.42, 1.70, 1.55); }
    else cabin(-.22, -.35, level === 2 ? 2.08 : 1.7, level === 2 ? 1.28 : 1.0);
    for (const x of [-w / 2 + .32, w / 2 - .32]) {
      for (const z of [-d * .24, 0, d * .28]) box([.10, .57, .10], cream, [x, platformY + .40, z], 'treehouse-railing-post');
      box([.11, .10, d * .58], gold, [x, platformY + .68, 0], 'treehouse-railing');
    }
    const stairZ = d * .43, stepCount = level + 5;
    for (let i = 0; i < stepCount; i++) box([.72, .09, .25], wood, [0, .11 + platformY * i / stepCount, stairZ - i * .16], 'treehouse-stair');
    for (const sign of [-1, 1]) beam([sign * .30, .07, stairZ + .1], [sign * .30, platformY, stairZ - stepCount * .16], .08, dark, 'treehouse-stair-stringer');
    sphere([w * .22, .66 + .12 * level, .76], '#80ab56', [w * .22, platformY + 2.05, -d * .23], 'treehouse-canopy');
    sphere([w * .17, .6, .6], '#a3bf6e', [w * .1, platformY + 2.55, -d * .25], 'treehouse-canopy');
  }
  function seat(double = false) {
    const sw = double ? 1.72 : .84, sd = double ? 2.18 : 1.95;
    for (const x of [-sw / 2 + .1, sw / 2 - .1]) for (const z of [-sd / 2 + .14, sd / 2 - .14]) box([.10, .30, .12], dark, [x, .15, z], 'seat-leg');
    box([sw, .14, sd], wood, [0, .35, 0], 'seat-frame');
    for (let x = -sw / 2 + .1; x < sw / 2; x += .18) box([.13, .035, sd - .1], '#e4b678', [x, .44, 0], 'seat-slat');
    box([sw - .09, .14, sd * .66], color, [0, .54, sd * .13], 'seat-cushion', .08);
    const back = box([sw - .09, .16, sd * .36], color, [0, .72, -sd * .34], 'seat-reclined-back', .08); back.rotation.x = -.45;
    if (double) for (const x of [-.4, .4]) box([.56, .17, .30], cream, [x, .93, -.63], 'daybed-pillow', .08);
  }
  function accessory() {
    switch (product.model) {
      case 'lounger': seat(); break;
      case 'daybed': seat(true); break;
      case 'parasol': {
        cylinder(.37, .14, '#b6b0a2', [0, .07, 0], 'parasol-weight');
        cylinder(.045, 2.2, wood, [0, 1.2, 0], 'parasol-pole');
        const cap = mesh(geometry('parasol-canopy', () => new THREE.ConeGeometry(1.23, .45, 12, 1, true)), color, [0, 2.35, 0], 'parasol-canopy', { side: THREE.DoubleSide });
        for (let i = 0; i < 12; i++) { const a = Math.PI * 2 * i / 12; beam([0, 2.57, 0], [Math.sin(a) * 1.23, 2.12, Math.cos(a) * 1.23], .025, cream, 'parasol-rib'); }
        cap.castShadow = true; sphere([.06, .065, .06], wood, [0, 2.57, 0], 'parasol-finial'); break;
      }
      case 'side-table':
        box([.7, .12, .7], color, [0, .58, 0], 'table-top', .07);
        for (const x of [-.24, .24]) for (const z of [-.24, .24]) box([.09, .54, .09], dark, [x, .27, z], 'table-leg');
        box([.51, .05, .51], wood, [0, .19, 0], 'table-shelf'); break;
      case 'towel-rack':
        for (const x of [-.4, .4]) { box([.13, .08, .51], dark, [x, .04, 0], 'towel-rack-foot'); cylinder(.04, 1.18, wood, [x, .64, 0], 'towel-rack-post'); }
        beam([-.42, 1.2, 0], [.42, 1.2, 0], .06, wood, 'towel-rack-bar');
        box([.34, .67, .07], color, [-.21, .87, .025], 'towel-large', .035); box([.27, .49, .07], cream, [.20, .96, .025], 'towel-small', .035);
        for (const x of [-.21, .2]) box([.24, .035, .015], '#89a6a2', [x, x < 0 ? .57 : .75, .07], 'towel-border'); break;
      case 'shower':
        cylinder(.48, .12, wood, [0, .06, 0], 'shower-platform');
        for (const x of [-.3, -.15, 0, .15, .3]) box([.035, .01, .68], '#795c43', [x, .125, 0], 'shower-drain');
        cylinder(.065, 2.30, color, [0, 1.22, -.24], 'shower-column');
        beam([0, 2.37, -.24], [0, 2.37, .24], .07, metal, 'shower-arm');
        cylinder(.20, .07, color, [0, 2.34, .24], 'shower-head');
        cylinder(.055, .13, gold, [0, 1.15, -.17], 'shower-handle').rotation.x = Math.PI / 2; break;
      case 'lifebuoy': {
        box([.8, .10, .5], wood, [0, .05, 0], 'lifebuoy-stand-base');
        cylinder(.045, 1.35, metal, [0, .76, -.12], 'lifebuoy-stand-post');
        beam([-.37, 1.38, -.12], [.37, 1.38, -.12], .05, metal, 'lifebuoy-stand-crossbar');
        torus(.32, .105, color, [0, .93, .02], 'lifebuoy-ring');
        for (const sign of [-1, 1]) box([.14, .19, .23], cream, [sign * .31, .93, .02], 'lifebuoy-band', .025); break;
      }
      case 'lamp':
        cylinder(.20, .12, dark, [0, .06, 0], 'lamp-base'); cylinder(.055, 1.02, metal, [0, .62, 0], 'lamp-column');
        box([.32, .33, .32], color, [0, 1.2, 0], 'lamp-glow', .04, { emissive: '#ffd48b', emissiveIntensity: .38 });
        box([.42, .09, .42], dark, [0, 1.4, 0], 'lamp-cap');
        for (const x of [-.14, .14]) for (const z of [-.14, .14]) beam([x, 1.04, z], [x, 1.4, z], .028, metal, 'lamp-frame'); break;
      case 'planter':
        box([1.62, .45, .62], color, [0, .25, 0], 'planter-box', .07); box([1.46, .045, .46], '#796145', [0, .48, 0], 'planter-soil', .02);
        for (const x of [-.52, 0, .52]) { leaf(x, 0, .50); flower(x, 0, .6, .8); }
        for (const x of [-.55, .55]) box([.15, .13, .49], dark, [x, .07, 0], 'planter-foot'); break;
      case 'storage':
        box([1.5, .72, .70], color, [0, .43, 0], 'storage-body', .06); box([1.55, .12, .75], wood, [0, .84, 0], 'storage-lid', .04);
        for (const z of [-.35, .35]) for (const y of [.28, .45, .62]) box([1.4, .018, .016], '#957045', [0, y, z], 'storage-slat-gap', .001);
        for (const x of [-.5, .5]) box([.12, .16, .04], metal, [x, .78, -.38], 'storage-hinge');
        box([.26, .09, .05], gold, [0, .63, .38], 'storage-handle', .025); break;
      case 'bench':
        for (const x of [-.72, .72]) for (const z of [-.24, .24]) box([.13, .46, .13], dark, [x, .23, z], 'bench-leg');
        for (let z = -.25; z <= .3; z += .18) box([1.83, .08, .13], color, [0, .52, z], 'bench-seat-slat');
        for (const x of [-.73, .73]) beam([x, .45, -.27], [x, 1.1, -.35], .10, dark, 'bench-back-post');
        for (const y of [.77, .98]) box([1.82, .16, .09], color, [0, y, -.34], 'bench-back-slat');
        for (const x of [-.86, .86]) { beam([x, .5, .25], [x, .82, .25], .065, dark, 'bench-arm-post'); box([.12, .08, .67], wood, [x, .82, -.03], 'bench-armrest'); } break;
      case 'drinks-cart':
        for (const x of [-.4, .4]) for (const z of [-.24, .24]) { cylinder(.09, .06, '#596663', [x, .1, z], 'cart-wheel').rotation.z = Math.PI / 2; box([.065, .83, .065], wood, [x, .55, z], 'cart-upright'); }
        for (const y of [.3, .92]) box([.98, .08, .61], color, [0, y, 0], 'cart-tray', .035);
        beam([-.52, 1.15, -.24], [-.52, 1.15, .24], .055, dark, 'cart-handle');
        for (const z of [-.24, .24]) beam([-.4, .8, z], [-.52, 1.15, z], .045, dark, 'cart-handle-support');
        cylinder(.12, .27, '#93bdba', [.18, 1.1, 0], 'cart-jug'); cylinder(.07, .13, cream, [-.16, 1.02, .08], 'cart-cup'); break;
      default: throw new RangeError(`No outdoor model for ${product.kind}`);
    }
  }
  if (product.sport || product.feature === 'tennis') {
    // Upgrade the visual model of old gifted tennis courts as well. Preserve their
    // original ownership and collision footprint, without stretching court markings.
    const modelProduct = item.legacyFootprint ? { ...product, ...item.legacyFootprint } : product;
    const sports = ['tennis', 'badminton', 'basketball', 'volleyball'].includes(product.feature)
      ? createSportsCourtModel(modelProduct, item) : createSportsRecreationModel(modelProduct, item);
    body.add(sports); disposers.push(() => sports.dispose());
  } else if (item.legacyIncludedExtras && product.feature) {
    const legacy = createEstateOutdoor({ tier: 'estate', onlyFeature: product.feature,
      house: item.legacyFootprint && product.feature === 'courtyard' ? { width: Math.max(1, item.legacyFootprint.width - .6), depth: 7.8 } : undefined,
      levels: { [product.feature]: level }, plans: { [product.feature]: item.legacyPlans ?? {} }, colors: { [product.feature]: color } });
    body.add(legacy); disposers.push(() => legacy.dispose());
  } else if (product.role === 'facility') {
    if (product.feature === 'pool') pool();
    else if (product.feature === 'garden') garden();
    else if (product.feature === 'courtyard') courtyard();
    else if (product.feature === 'treehouse') treehouse();
    else if (product.feature === 'gazebo') gazebo();
  } else accessory();
  // The catalog footprint encloses every eave, cushion and parasol edge. Fit once
  // in local space so placement and a 90-degree rotation use the same real bounds.
  body.updateMatrixWorld(true);
  let bounds = new THREE.Box3().setFromObject(body), size = bounds.getSize(new THREE.Vector3());
  const targetW = item.legacyFootprint?.width ?? w, targetD = item.legacyFootprint?.depth ?? d;
  const legacy = Boolean(item.legacyIncludedExtras) && product.feature !== 'tennis';
  const scale = Math.min(1, targetW / Math.max(size.x, .001), targetD / Math.max(size.z, .001), product.height / Math.max(size.y, .001));
  if (legacy) body.scale.set(targetW / Math.max(size.x, .001), Math.min(1, product.height / Math.max(size.y, .001)), targetD / Math.max(size.z, .001));
  else body.scale.setScalar(scale);
  body.updateMatrixWorld(true); bounds = new THREE.Box3().setFromObject(body);
  const center = bounds.getCenter(new THREE.Vector3()); body.position.set(-center.x, -bounds.min.y, -center.z);
  root.userData.outdoorProduct = product.skuId; root.userData.outdoorRole = product.role;
  root.userData.outdoorFeature = product.feature;
  root.userData.footprint = { width: targetW, depth: targetD, height: product.height };
  root.userData.dispose = () => {
    if (disposed) return; disposed = true;
    disposers.forEach(dispose => dispose()); geometries.forEach(geo => geo.dispose()); materials.forEach(mat => mat.dispose());
    geometries.clear(); materials.clear(); root.clear();
  };
  root.dispose = root.userData.dispose;
  return root;
}
