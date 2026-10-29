import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Coordinates are scaled from metres. The apron is a game footprint, not a
// regulation safety run-off area. Long court axis is X; short axis is Z.
export const SPORTS_COURT_RULES = Object.freeze({
  tennis: Object.freeze({ length: 23.77, width: 10.97, singlesWidth: 8.23, serviceDistance: 6.4, netPostHeight: 1.07, netCentreHeight: .914 }),
  badminton: Object.freeze({ length: 13.4, width: 6.1, singlesWidth: 5.18, shortServiceDistance: 1.98, rearServiceInset: .76, netPostHeight: 1.55, netCentreHeight: 1.524, netDepth: .76 }),
  basketball: Object.freeze({ length: 28, width: 15, keyLength: 5.8, keyWidth: 4.9, circleRadius: 1.8, threePointRadius: 6.75, basketInset: 1.575, rimHeight: 3.05 }),
  volleyball: Object.freeze({ length: 18, width: 9, attackDistance: 3, netPostHeight: 2.55, netCentreHeight: 2.43, netDepth: 1 }),
});

/** Owned geometry: no canvas, external images, realtime lights or free furniture. */
export function createSportsCourtModel(product, item = {}) {
  const rules = SPORTS_COURT_RULES[product?.feature];
  if (!rules) throw new RangeError(`Unsupported sports court: ${product?.feature}`);
  const { feature, width: w, depth: d, height: maxH } = product;
  const level = Math.max(1, Math.min(3, Number(product.level) || 1));
  const root = new THREE.Group(); root.name = `${feature}-court-model`;
  const geometries = new Map(), materials = new Map();
  let disposed = false;
  const white = '#fff8e9', graphite = '#233b40', cream = '#ddd3b8';
  const fieldColors = {
    tennis: ['#467d50', '#ad5940', '#28769a'],
    badminton: ['#276c68', '#287f70', '#30689b'],
    basketball: ['#b77842', '#3d8395', '#3e638c'],
    volleyball: ['#53835b', '#c07b4b', '#317e95'],
  };
  const fieldColor = fieldColors[feature][level - 1];
  const accent = feature === 'basketball' ? (level === 1 ? '#884c42' : '#d18e5b') : '#d0b575';
  const paint = /^#[\da-f]{6}$/i.test(item.color ?? '') ? item.color : product.defaultColor ?? '#769e87';
  const slabHeight = [.14, .18, .24][level - 1];
  const surfaceY = slabHeight + .035, lineY = surfaceY + .019;
  const runoff = feature === 'basketball' ? 1.6 : 1.15;
  const scale = Math.min((w - runoff) / rules.length, (d - .9) / rules.width);
  const length = rules.length * scale, courtWidth = rules.width * scale;
  const lineWidth = Math.max(.035, .08 * scale);
  const geometry = (key, make) => {
    if (!geometries.has(key)) geometries.set(key, make());
    return geometries.get(key);
  };
  const material = (color, options = {}) => {
    const key = `${color}:${JSON.stringify(options)}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: .78, ...options }));
    return materials.get(key);
  };
  function mesh(geo, color, xyz, name, options = {}) {
    const result = new THREE.Mesh(geo, material(color, options));
    result.name = name; result.position.set(...xyz); result.castShadow = true; result.receiveShadow = true;
    root.add(result); return result;
  }
  function box(size, color, xyz, name, radius = .025, options = {}) {
    return mesh(geometry(`box:${size}:${radius}`, () => radius > .001
      ? new RoundedBoxGeometry(...size, 1, Math.min(radius, ...size.map(v => v * .4)))
      : new THREE.BoxGeometry(...size)), color, xyz, name, options);
  }
  function cylinder(radius, height, color, xyz, name) {
    return mesh(geometry(`cylinder:${radius}:${height}`, () => new THREE.CylinderGeometry(radius, radius, height, 12)), color, xyz, name);
  }
  function beam(a, b, thickness, color, name) {
    const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b);
    const result = box([thickness, av.distanceTo(bv), thickness], color,
      av.clone().add(bv).multiplyScalar(.5).toArray(), name, .006);
    result.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bv.sub(av).normalize()); return result;
  }
  function line(name, x, z, sx, sz, color = white) {
    const result = box([sx, .012, sz], color, [x, lineY, z], `${feature}-line-${name}`, .001);
    result.castShadow = false; result.userData.courtLine = name; return result;
  }
  function arc(name, cx, cz, radius, start, end, color = white, thickness = lineWidth) {
    const positions = [], indices = [], steps = Math.max(12, Math.ceil(Math.abs(end - start) * 14));
    for (let i = 0; i <= steps; i++) {
      const a = start + (end - start) * i / steps;
      for (const r of [radius - thickness / 2, radius + thickness / 2]) positions.push(cx + Math.cos(a) * r, lineY + .007, cz + Math.sin(a) * r);
      if (i < steps) { const n = i * 2; indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); }
    }
    const geo = geometry(`arc:${name}`, () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals(); return g; });
    const result = mesh(geo, color, [0, 0, 0], `${feature}-line-${name}`, { side: THREE.DoubleSide });
    result.castShadow = false; result.userData.courtLine = name; return result;
  }
  function boundary() {
    for (const side of [-1, 1]) {
      line(`baseline-${side}`, side * length / 2, 0, lineWidth, courtWidth + lineWidth);
      line(`sideline-${side}`, 0, side * courtWidth / 2, length + lineWidth, lineWidth);
    }
  }
  // A single perforated mesh has real gaps and a thick silhouette at small scale.
  // This avoids both a barely visible LineSegments net and many tiny draw calls.
  function gridPanel(name, x, halfSpan, bottom, topAt, spacing = .13, strand = .018) {
    const positions = [], indices = [];
    const quad = (z0, z1, y0, y1) => {
      const n = positions.length / 3;
      positions.push(x, y0, z0, x, y1, z0, x, y1, z1, x, y0, z1);
      indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
    };
    const steps = Math.max(8, Math.round(halfSpan * 2 / spacing));
    for (let i = 0; i <= steps; i++) {
      const z = -halfSpan + i / steps * halfSpan * 2;
      quad(Math.max(-halfSpan, z - strand / 2), Math.min(halfSpan, z + strand / 2), bottom, topAt(z));
    }
    for (let y = bottom + spacing; y < topAt(0) - .02; y += spacing) quad(-halfSpan, halfSpan, y, y + strand);
    const geo = geometry(`net:${name}`, () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals(); return g; });
    const result = mesh(geo, graphite, [0, 0, 0], name, { side: THREE.DoubleSide });
    result.castShadow = false; result.userData.netGrid = { spacing, strand, halfSpan, bottom, centreTop: topAt(0), edgeTop: topAt(halfSpan) };
    return result;
  }
  function net() {
    // Badminton posts stand on the doubles sidelines; tennis doubles posts
    // sit 0.914 m outside them. Volleyball uses a 10 m net across a 9 m court.
    const extra = feature === 'tennis' ? .914 * scale : feature === 'volleyball' ? .5 * scale : 0;
    const halfSpan = courtWidth / 2 + extra;
    const postH = rules.netPostHeight * scale, centreH = rules.netCentreHeight * scale;
    const edgeH = feature === 'volleyball' ? centreH : postH;
    const topAt = z => surfaceY + centreH + (edgeH - centreH) * (z / halfSpan) ** 2;
    const bottom = feature === 'tennis' ? surfaceY + .045 : surfaceY + centreH - rules.netDepth * scale;
    gridPanel(`${feature}-net`, 0, halfSpan, bottom, topAt, .11, .021);
    for (const side of [-1, 1]) {
      const z = side * halfSpan;
      cylinder(.046, postH + .06, graphite, [0, surfaceY + (postH + .06) / 2, z], `${feature}-net-post`);
      cylinder(.085, .045, cream, [0, surfaceY + .025, z], `${feature}-net-post-foot`);
      box([.085, .065, .085], accent, [0, surfaceY + postH + .035, z], `${feature}-net-post-cap`, .016);
    }
    const tapePoints = Array.from({ length: 9 }, (_, i) => {
      const z = -halfSpan + halfSpan * 2 * i / 8;
      return new THREE.Vector3(0, topAt(z), z);
    });
    const tape = geometry(`${feature}-net-top-tape`, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tapePoints), 24, .023, 4, false));
    mesh(tape, white, [0, 0, 0], `${feature}-net-top-band`).castShadow = false;
    if (feature !== 'tennis') beam([0, bottom, -halfSpan], [0, bottom, halfSpan], .025, white, `${feature}-net-bottom-band`).castShadow = false;
    if (feature === 'volleyball' && level > 1) for (const side of [-1, 1]) {
      const z = side * courtWidth / 2, top = Math.min(maxH - .06, surfaceY + centreH + .8 * scale);
      const start = surfaceY + centreH - .12;
      for (let i = 0; i < 6; i++) cylinder(.018, (top - start) / 6, i % 2 ? white : '#b95646', [0, start + (top - start) * (i + .5) / 6, z], 'volleyball-net-antenna');
    }
  }
  function backstop() {
    if (level < 2) return;
    // End screens only: side views stay open instead of boxing the entire court in.
    const fenceH = Math.min(level === 2 ? .75 : .92, maxH - surfaceY - .12);
    for (const side of [-1, 1]) {
      const x = side * (w / 2 - .13), span = d / 2 - .18;
      gridPanel(`${feature}-backstop-${side}`, x, span, surfaceY + .06, () => surfaceY + fenceH, .24, .015);
      for (const z of [-span, 0, span]) {
        cylinder(.028, fenceH + .05, graphite, [x, surfaceY + (fenceH + .05) / 2, z], `${feature}-backstop-post`);
        box([.095, .065, .095], accent, [x, surfaceY + fenceH + .05, z], `${feature}-backstop-cap`, .018);
      }
      beam([x, surfaceY + fenceH, -span], [x, surfaceY + fenceH, span], .035, graphite, `${feature}-backstop-rail`);
    }
  }
  function lighting() {
    if (level < 3) return;
    const top = maxH - .13;
    for (const side of [-1, 1]) for (const end of [-1, 1]) {
      const x = end * (w / 2 - .31), z = side * (d / 2 - .30);
      box([.22, .10, .22], cream, [x, surfaceY + .05, z], `${feature}-light-foot`, .035);
      cylinder(.045, top - surfaceY - .12, graphite, [x, (top + surfaceY - .12) / 2, z], `${feature}-light-mast`);
      box([.52, .11, .21], graphite, [x, top, z], `${feature}-light-housing`, .025);
      box([.42, .055, .15], '#ffe9a9', [x, top + .06, z], `${feature}-light-panel`, .01, { emissive: '#ffe4a2', emissiveIntensity: .18 });
    }
  }
  function tennis() {
    const singles = rules.singlesWidth * scale, service = rules.serviceDistance * scale;
    for (const side of [-1, 1]) {
      line(`baseline-${side}`, side * length / 2, 0, lineWidth, courtWidth + lineWidth);
      line(`doubles-sideline-${side}`, 0, side * courtWidth / 2, length, lineWidth);
      line(`singles-sideline-${side}`, 0, side * singles / 2, length, lineWidth);
      line(`service-${side}`, side * service, 0, lineWidth, singles);
      line(`baseline-center-mark-${side}`, side * (length / 2 - .065), 0, .13, lineWidth);
    }
    line('service-center-near', -service / 2, 0, service, lineWidth);
    line('service-center-far', service / 2, 0, service, lineWidth);
    net();
  }
  function badminton() {
    boundary();
    const singles = rules.singlesWidth * scale, shortService = rules.shortServiceDistance * scale;
    for (const side of [-1, 1]) {
      line(`singles-sideline-${side}`, 0, side * singles / 2, length, lineWidth);
      line(`short-service-${side}`, side * shortService, 0, lineWidth, courtWidth);
      line(`doubles-long-service-${side}`, side * (length / 2 - rules.rearServiceInset * scale), 0, lineWidth, courtWidth);
      const serviceLength = length / 2 - shortService;
      line(`service-center-${side}`, side * (shortService + serviceLength / 2), 0, serviceLength, lineWidth);
    }
    net();
  }
  function volleyball() {
    boundary(); line('centre', 0, 0, lineWidth, courtWidth);
    for (const side of [-1, 1]) line(`attack-${side}`, side * rules.attackDistance * scale, 0, lineWidth, courtWidth);
    net();
  }
  function basketball() {
    const keyLength = rules.keyLength * scale, keyWidth = rules.keyWidth * scale;
    for (const side of [-1, 1]) {
      box([keyLength, .007, keyWidth], accent, [side * (length / 2 - keyLength / 2), surfaceY + .017, 0], `basketball-painted-key-${side}`, .001).castShadow = false;
      const throwX = side * (length / 2 - keyLength), hoopX = side * (length / 2 - rules.basketInset * scale);
      line(`free-throw-${side}`, throwX, 0, lineWidth, keyWidth);
      for (const edge of [-1, 1]) line(`key-side-${side}-${edge}`, side * (length / 2 - keyLength / 2), edge * keyWidth / 2, keyLength, lineWidth);
      const front = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      arc(`free-throw-arc-${side}`, throwX, 0, rules.circleRadius * scale, front, front + Math.PI);
      for (let i = 0; i < 8; i++) arc(`free-throw-dash-${side}-${i}`, throwX, 0, rules.circleRadius * scale, front + Math.PI + i * Math.PI / 8, front + Math.PI + (i + .5) * Math.PI / 8, white, lineWidth * .8);
      const threeR = rules.threePointRadius * scale, cornerZ = (rules.width / 2 - .9) * scale;
      const alpha = Math.asin(cornerZ / threeR), intersection = hoopX - side * Math.sqrt(threeR ** 2 - cornerZ ** 2);
      arc(`three-point-arc-${side}`, hoopX, 0, threeR, side > 0 ? Math.PI - alpha : -alpha, side > 0 ? Math.PI + alpha : alpha);
      for (const edge of [-1, 1]) {
        const straightLength = Math.abs(side * length / 2 - intersection);
        line(`three-point-corner-${side}-${edge}`, (side * length / 2 + intersection) / 2, edge * cornerZ, straightLength, lineWidth);
      }
      hoop(side, hoopX);
    }
    boundary(); line('centre', 0, 0, lineWidth, courtWidth); arc('centre-circle', 0, 0, rules.circleRadius * scale, 0, Math.PI * 2);
  }
  function hoop(side, hoopX) {
    const rimY = surfaceY + rules.rimHeight * scale, rimR = .225 * scale;
    const boardX = hoopX + side * .375 * scale, postX = side * (length / 2 + .33);
    const boardWidth = 1.8 * scale, boardHeight = 1.05 * scale, boardY = rimY + .37 * scale;
    box([.35, .15, .40], graphite, [postX, surfaceY + .075, 0], 'basketball-hoop-anchor', .04);
    beam([postX, surfaceY + .1, 0], [postX, rimY - .15, 0], .075, graphite, 'basketball-hoop-pole');
    beam([postX, rimY - .15, 0], [boardX, rimY + .18, 0], .075, graphite, 'basketball-hoop-support');
    box([.048, boardHeight, boardWidth], '#f3eddb', [boardX, boardY, 0], 'basketball-backboard', .018);
    const faceX = boardX - side * .028, rectH = .45 * scale, rectW = .59 * scale;
    for (const edge of [-1, 1]) {
      box([.012, .022, rectW], '#b9573d', [faceX, rimY + .22 * scale + edge * rectH / 2, 0], 'basketball-board-target', .001);
      box([.012, rectH, .022], '#b9573d', [faceX, rimY + .22 * scale, edge * rectW / 2], 'basketball-board-target', .001);
    }
    const rim = mesh(geometry('basketball-rim', () => new THREE.TorusGeometry(rimR, .018, 6, 20)), '#e78643', [hoopX, rimY, 0], 'basketball-rim');
    rim.rotation.x = Math.PI / 2;
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI * 2 / 10, b = a + .35;
      beam([hoopX + Math.cos(a) * rimR, rimY - .015, Math.sin(a) * rimR],
        [hoopX + Math.cos(b) * rimR * .62, rimY - .35 * scale, Math.sin(b) * rimR * .62], .011, white, 'basketball-hoop-net').castShadow = false;
    }
  }

  box([w, slabHeight, d], cream, [0, slabHeight / 2, 0], `${feature}-foundation`, .07);
  box([w - .07, .045, d - .07], paint, [0, slabHeight + .014, 0], `${feature}-apron`, .035);
  box([length, .026, courtWidth], fieldColor, [0, surfaceY, 0], `${feature}-playing-court`, .006);
  if (level > 1) for (const side of [-1, 1]) box([w - .12, .025, .045], graphite, [0, slabHeight + .048, side * (d / 2 - .075)], `${feature}-apron-trim`, .005).castShadow = false;
  if (feature === 'tennis') tennis();
  else if (feature === 'badminton') badminton();
  else if (feature === 'basketball') basketball();
  else volleyball();
  backstop(); lighting();

  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root), size = bounds.getSize(new THREE.Vector3());
  const fit = Math.min(1, w / size.x, d / size.z, maxH / size.y);
  if (fit < 1) root.scale.setScalar(fit);
  root.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(root), center = fitted.getCenter(new THREE.Vector3());
  // Shift geometry together, keeping the returned root transform at its origin.
  const offset = new THREE.Group(); offset.name = `${feature}-court-origin`;
  while (root.children.length) offset.add(root.children[0]);
  offset.position.set(-center.x / fit, -fitted.min.y / fit, -center.z / fit); root.add(offset);
  root.userData.courtRules = { feature, ...rules, scale: scale * fit, lineWidth: lineWidth * fit };
  root.userData.courtLevel = level;
  root.userData.dispose = root.dispose = () => {
    if (disposed) return; disposed = true;
    for (const geo of geometries.values()) geo.dispose();
    for (const mat of materials.values()) mat.dispose();
    geometries.clear(); materials.clear(); root.clear();
  };
  return root;
}
