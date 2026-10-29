import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const FACILITIES = new Set(['football', 'table-tennis', 'running-track', 'skatepark']);
const ACCESSORIES = new Set(['ball-cart', 'scoreboard', 'spectator-bench', 'umpire-chair', 'sports-floodlight', 'equipment-rack']);

/** Small, authored sports models. Dimensions are game footprints, not real-world metres. */
export function createSportsRecreationModel(product, item = {}) {
  if (!FACILITIES.has(product?.feature) && !ACCESSORIES.has(product?.model))
    throw new RangeError('Unknown recreation model.');
  const root = new THREE.Group(); root.name = `${product.skuId}-recreation`;
  const body = new THREE.Group(); root.add(body);
  const geometries = new Map(), materials = new Map();
  const w = product.width, d = product.depth, h = product.height, level = product.level;
  const color = /^#[\da-f]{6}$/i.test(item.color ?? '') ? item.color : product.defaultColor ?? product.color;
  const ivory = '#fff6df', graphite = '#344d51', silver = '#acbdb5', amber = '#d9ac58';
  let disposed = false;
  const geo = (key, create) => { if (!geometries.has(key)) geometries.set(key, create()); return geometries.get(key); };
  const mat = (hex, options = {}) => {
    const key = `${hex}:${JSON.stringify(options)}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color: hex, roughness: .72, ...options }));
    return materials.get(key);
  };
  function mesh(geometry, hex, position, name = '', options = {}) {
    const part = new THREE.Mesh(geometry, mat(hex, options));
    part.name = name; part.position.set(...position); part.castShadow = true; part.receiveShadow = true; body.add(part); return part;
  }
  function box(size, hex, position, name = '', radius = .025) {
    return mesh(geo(`box:${size}:${radius}`, () => radius > 0
      ? new RoundedBoxGeometry(...size, 1, Math.min(radius, ...size.map(n => n * .4)))
      : new THREE.BoxGeometry(...size)), hex, position, name);
  }
  function cylinder(radius, height, hex, position, name = '', top = radius) {
    return mesh(geo(`cylinder:${radius}:${height}:${top}`, () => new THREE.CylinderGeometry(top, radius, height, 16)), hex, position, name);
  }
  function sphere(radius, hex, position, name = '') {
    const ball = mesh(geo('sphere', () => new THREE.SphereGeometry(1, 16, 10)), hex, position, name);
    ball.scale.setScalar(radius); return ball;
  }
  function beam(a, b, radius, hex, name = '') {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const length = start.distanceTo(end);
    const bar = cylinder(radius, length, hex, start.clone().add(end).multiplyScalar(.5).toArray(), name);
    bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize()); return bar;
  }
  function torus(radius, tube, hex, position, name = '') {
    return mesh(geo(`torus:${radius}:${tube}`, () => new THREE.TorusGeometry(radius, tube, 6, 24)), hex, position, name);
  }
  function groundLine(points, y, width, name, hex = ivory) {
    const positions = [];
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1], [bx, bz] = points[i];
      const length = Math.hypot(bx - ax, bz - az); if (!length) continue;
      const nx = -(bz - az) / length * width / 2, nz = (bx - ax) / length * width / 2;
      positions.push(ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz,
        ax + nx, y, az + nz, bx - nx, y, bz - nz, ax - nx, y, az - nz);
    }
    const shape = new THREE.BufferGeometry(); shape.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); shape.computeVertexNormals();
    geometries.set(`line:${geometries.size}`, shape);
    const line = mesh(shape, hex, [0, 0, 0], name, { side: THREE.DoubleSide }); line.castShadow = false; line.userData.courtLine = true; return line;
  }
  function arc(cx, cz, radius, from = 0, to = Math.PI * 2, steps = 48) {
    return Array.from({ length: steps + 1 }, (_, i) => {
      const a = from + (to - from) * i / steps; return [cx + Math.cos(a) * radius, cz + Math.sin(a) * radius];
    });
  }
  // A complete net is one opaque strip mesh; there are no hundreds of line draw calls.
  function net(a, b, c, e, columns, rows, thickness, name, hex = graphite) {
    const corners = [a, b, c, e].map(v => new THREE.Vector3(...v)), positions = [];
    function strip(start, end, tangent) {
      const offset = tangent.clone().normalize().multiplyScalar(thickness / 2);
      const p = [start.clone().sub(offset), start.clone().add(offset), end.clone().add(offset), end.clone().sub(offset)];
      for (const index of [0, 1, 2, 0, 2, 3]) positions.push(...p[index].toArray());
    }
    const horizontal = corners[1].clone().sub(corners[0]), vertical = corners[3].clone().sub(corners[0]);
    for (let i = 0; i <= columns; i++) strip(corners[0].clone().lerp(corners[1], i / columns), corners[3].clone().lerp(corners[2], i / columns), horizontal);
    for (let i = 0; i <= rows; i++) strip(corners[0].clone().lerp(corners[3], i / rows), corners[1].clone().lerp(corners[2], i / rows), vertical);
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals();
    geometries.set(`net:${geometries.size}`, geometry);
    const part = mesh(geometry, hex, [0, 0, 0], name, { side: THREE.DoubleSide }); part.castShadow = false; return part;
  }
  function football() {
    const pitchL = Math.min(w * .81, d * 1.52), pitchD = pitchL / 2, s = pitchL / 40;
    // Keep the actual playing field dark enough for the white markings at shop-thumbnail scale.
    // Markings sit clearly above the striped turf instead of sharing its near-coplanar surface.
    const y = .205, lw = Math.max(.055, s * .16), grass = level === 3 ? '#185a4b' : level === 2 ? '#20764e' : '#246e43';
    box([w, .14, d], color, [0, .07, 0], 'football-foundation', .10);
    box([pitchL + .48, .04, pitchD + .48], '#36764e', [0, .16, 0], 'football-runoff', .045);
    box([pitchL, .026, pitchD], grass, [0, .17, 0], 'football-playing-surface', .001);
    for (let i = 0; i < 8; i += 2) box([pitchL / 8, .004, pitchD], level === 3 ? '#27715d' : level === 2 ? '#32875b' : '#327e4f',
      [-pitchL / 2 + pitchL / 8 * (i + .5), .185, 0], 'football-mown-stripe', 0).castShadow = false;
    groundLine([[-pitchL / 2, -pitchD / 2], [pitchL / 2, -pitchD / 2], [pitchL / 2, pitchD / 2], [-pitchL / 2, pitchD / 2], [-pitchL / 2, -pitchD / 2]], y, lw, 'football-touchlines');
    groundLine([[0, -pitchD / 2], [0, pitchD / 2]], y, lw, 'football-halfway-line');
    groundLine(arc(0, 0, 3 * s), y, lw, 'football-centre-circle');
    cylinder(lw * .8, .012, ivory, [0, y, 0], 'football-centre-spot');
    for (const side of [-1, 1]) {
      const goalX = side * pitchL / 2, goalHalf = 1.5 * s, penaltyRadius = 6 * s;
      // FIFA futsal penalty area: quarter circles about the posts, joined across the front.
      const penalty = [];
      for (let i = 0; i <= 18; i++) { const angle = i / 18 * Math.PI / 2; penalty.push([goalX - side * Math.sin(angle) * penaltyRadius, -goalHalf - Math.cos(angle) * penaltyRadius]); }
      penalty.push([goalX - side * penaltyRadius, goalHalf]);
      for (let i = 0; i <= 18; i++) { const angle = i / 18 * Math.PI / 2; penalty.push([goalX - side * Math.cos(angle) * penaltyRadius, goalHalf + Math.sin(angle) * penaltyRadius]); }
      groundLine(penalty, y, lw, 'football-curved-penalty-area');
      for (const distance of [6, 10]) cylinder(lw * .75, .012, ivory, [goalX - side * distance * s, y, 0], `football-${distance}m-spot`);
      const height = 2 * s, backX = goalX + side * .55, ground = .20;
      for (const z of [-goalHalf, goalHalf]) {
        beam([goalX, ground, z], [goalX, ground + height, z], .050, ivory, 'football-goal-upright');
        beam([goalX, ground + height, z], [backX, ground + height * .7, z], .032, ivory, 'football-goal-depth');
        beam([backX, ground, z], [backX, ground + height * .7, z], .033, ivory, 'football-goal-rear-post');
        beam([goalX, ground, z], [backX, ground, z], .032, ivory, 'football-goal-foot');
        net([goalX, ground, z], [backX, ground, z], [backX, ground + height * .7, z], [goalX, ground + height, z], 5, 5, .017, 'football-goal-side-net');
      }
      beam([goalX, ground + height, -goalHalf], [goalX, ground + height, goalHalf], .050, ivory, 'football-goal-crossbar');
      net([backX, ground, -goalHalf], [backX, ground, goalHalf], [backX, ground + height * .7, goalHalf], [backX, ground + height * .7, -goalHalf], 8, 5, .017, 'football-goal-back-net');
      net([goalX, ground + height, -goalHalf], [goalX, ground + height, goalHalf], [backX, ground + height * .7, goalHalf], [backX, ground + height * .7, -goalHalf], 8, 4, .017, 'football-goal-roof-net');
      if (level > 1) {
        const endX = side * (w / 2 - .15), fenceH = level === 3 ? 1.55 : 1.05;
        for (const z of [-d * .39, 0, d * .39]) beam([endX, .15, z], [endX, fenceH, z], .04, graphite, 'football-backstop-post');
        net([endX, .25, -d * .39], [endX, .25, d * .39], [endX, fenceH, d * .39], [endX, fenceH, -d * .39], 24, 7, .013, 'football-backstop-net', '#668c78');
        beam([endX, fenceH, -d * .39], [endX, fenceH, d * .39], .035, ivory, 'football-backstop-top');
      }
    }
    if (level === 3) {
      for (const side of [-1, 1]) {
        box([pitchL * .78, .24, .16], '#edf1d9', [0, .30, side * (d / 2 - .25)], 'football-perimeter-board');
        for (const x of [-w * .42, w * .42]) {
          beam([x, .15, side * (d / 2 - .30)], [x, h - .19, side * (d / 2 - .30)], .045, graphite, 'football-light-column');
          box([.52, .18, .15], ivory, [x, h - .14, side * (d / 2 - .30)], 'football-light-bar');
        }
      }
    }
    root.userData.courtDimensions = { length: 40, width: 20, centreRadius: 3, goalWidth: 3, goalHeight: 2, scale: s, unit: 'reference-metres' };
  }
  function tableTennis() {
    const length = w * .84, depth = length * 1.525 / 2.74, topY = h * .73, thickness = level === 3 ? .075 : .055;
    const playingColor = level === 1 ? '#367c68' : level === 2 ? '#347eaf' : '#245375';
    box([w, .06, d], color, [0, .03, 0], 'table-tennis-pad', .065);
    for (const side of [-1, 1]) {
      box([length / 2 - .014, thickness, depth], playingColor, [side * length / 4, topY, 0], 'table-tennis-half', .018);
      box([length / 2 - .02, .11, depth - .10], color, [side * length / 4, topY - .075, 0], 'table-tennis-apron', .018);
    }
    const ly = topY + thickness / 2 + .007, lineW = Math.max(.023, length * .008);
    groundLine([[-length / 2 + .035, -depth / 2 + .035], [length / 2 - .035, -depth / 2 + .035], [length / 2 - .035, depth / 2 - .035], [-length / 2 + .035, depth / 2 - .035], [-length / 2 + .035, -depth / 2 + .035]], ly, lineW, 'table-tennis-white-boundary');
    groundLine([[-length / 2 + .035, 0], [length / 2 - .035, 0]], ly, lineW * .48, 'table-tennis-doubles-centre-line');
    const netH = Math.min(h - ly - .025, length * .1525 / 2.74), netW = depth + .13;
    net([0, ly, -netW / 2], [0, ly, netW / 2], [0, ly + netH, netW / 2], [0, ly + netH, -netW / 2], 20, 4, .012, 'table-tennis-mesh-net');
    beam([0, ly + netH, -netW / 2], [0, ly + netH, netW / 2], .017, ivory, 'table-tennis-white-net-binding');
    for (const z of [-netW / 2, netW / 2]) {
      beam([0, topY - .08, z], [0, ly + netH + .02, z], .025, silver, 'table-tennis-net-post');
      box([.14, .065, .12], graphite, [0, topY - .055, z], 'table-tennis-net-clamp');
    }
    if (level === 1) {
      for (const x of [-length * .32, length * .32]) for (const z of [-depth * .34, depth * .34])
        box([.08, topY - .13, .08], '#ba9661', [x, (topY - .13) / 2 + .06, z], 'table-tennis-wood-leg');
      for (const z of [-depth * .34, depth * .34]) box([length * .69, .06, .06], '#c6a570', [0, topY * .35, z], 'table-tennis-wood-brace');
    } else if (level === 2) {
      for (const x of [-length * .30, length * .30]) {
        for (const z of [-depth * .32, depth * .32]) {
          beam([x, topY - .12, z], [x * .72, .17, z], .037, silver, 'table-tennis-folding-leg');
          const wheel = cylinder(.075, .06, graphite, [x * .72, .14, z], 'table-tennis-wheel'); wheel.rotation.x = Math.PI / 2;
        }
        beam([x * .72, .2, -depth * .32], [x * .72, .2, depth * .32], .037, silver, 'table-tennis-wheel-axle');
      }
      beam([-length * .26, .31, 0], [length * .26, .31, 0], .043, graphite, 'table-tennis-central-brace');
    } else {
      for (const x of [-length * .27, length * .27]) {
        box([.44, .12, depth * .74], graphite, [x, .12, 0], 'table-tennis-pedestal-foot', .055);
        for (const side of [-1, 1]) beam([x, .17, side * depth * .26], [x, topY - .12, side * depth * .10], .09, ivory, 'table-tennis-sculpted-pedestal');
        box([.46, .07, depth * .66], amber, [x, topY - .12, 0], 'table-tennis-gold-support');
      }
      for (const z of [-depth / 2, depth / 2]) box([length - .07, .045, .034], color, [0, topY - .035, z], 'table-tennis-colour-trim', .007);
    }
    root.userData.courtDimensions = { length: 2.74, width: 1.525, height: .76, netHeight: .1525, unit: 'reference-metres' };
  }
  function capsule(radius, straight, segments = 32) {
    const points = [];
    for (let i = 0; i <= segments; i++) { const a = -Math.PI / 2 + i / segments * Math.PI; points.push([straight / 2 + Math.cos(a) * radius, Math.sin(a) * radius]); }
    for (let i = 0; i <= segments; i++) { const a = Math.PI / 2 + i / segments * Math.PI; points.push([-straight / 2 + Math.cos(a) * radius, Math.sin(a) * radius]); }
    points.push(points[0]); return points;
  }
  function capsuleSlab(radius, straight, height, y, hex, name) {
    const points = capsule(radius, straight), shape = new THREE.Shape(); shape.moveTo(...points[0]);
    points.slice(1).forEach(p => shape.lineTo(...p)); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 24, steps: 1 }); geometry.rotateX(-Math.PI / 2);
    geometries.set(`capsule:${geometries.size}`, geometry); return mesh(geometry, hex, [0, y, 0], name);
  }
  function runningTrack() {
    const radius = d / 2 - .12, straight = w - d, laneCount = level + 2, laneWidth = level === 3 ? .34 : .37;
    const baseY = level === 1 ? .10 : level === 2 ? .17 : .27, trackY = baseY + .025;
    capsuleSlab(d / 2, straight, baseY, 0, color, 'track-rounded-foundation');
    if (level === 3) capsuleSlab(d / 2 - .05, straight, .07, baseY, '#f2d5ae', 'track-raised-cream-edge');
    const surfaceY = level === 3 ? trackY + .07 : trackY;
    capsuleSlab(radius, straight, .035, surfaceY - .035, level === 1 ? '#bd7157' : level === 2 ? '#d28b64' : '#ad574f', 'track-running-surface');
    const inner = radius - laneCount * laneWidth;
    capsuleSlab(inner, straight, .04, surfaceY - .035, '#84ad68', 'track-grass-infield');
    for (let i = 0; i <= laneCount; i++) groundLine(capsule(radius - i * laneWidth, straight), surfaceY + .008, .025, `track-lane-${i}`);
    for (let lane = 0; lane < laneCount; lane++) {
      const z = radius - (lane + .5) * laneWidth;
      groundLine([[straight / 2 - .4, z - laneWidth / 2], [straight / 2 - .4, z + laneWidth / 2]], surfaceY + .012, .06, 'track-finish-line');
      groundLine([[-straight / 2 + lane * .22, z - laneWidth / 2], [-straight / 2 + lane * .22, z + laneWidth / 2]], surfaceY + .012, .05, 'track-staggered-start');
      // Solid lane-number bars are legible in small shop thumbnails.
      for (let n = 0; n <= lane; n++) box([.026, .009, .12], ivory, [straight / 2 - .68 - n * .07, surfaceY + .014, z], 'track-lane-number', 0).castShadow = false;
    }
    if (level > 1) {
      for (const side of [-1, 1]) {
        box([straight * .85, .025, .16], '#aac380', [0, surfaceY + .023, side * inner * .64], 'track-infield-mowing-band', .02);
        if (level === 3) for (const x of [-straight * .32, 0, straight * .32])
          box([.46, .028, .12], '#d9bd80', [x, surfaceY + .025, side * (inner + .07)], 'track-inner-drain', .015);
      }
    }
    root.userData.trackLanes = laneCount; root.userData.courtDimensions = { miniature: true, regulatedDistance: null };
  }
  function curvedRamp(x, z, run, rise, depth, direction, name) {
    const shape = new THREE.Shape(); shape.moveTo(0, 0);
    const points = [];
    for (let i = 0; i <= 24; i++) {
      const a = i / 24 * Math.PI / 2, px = Math.sin(a) * run, py = (1 - Math.cos(a)) * rise;
      points.push([px, py]); shape.lineTo(px, py);
    }
    shape.lineTo(run + .28, rise); shape.lineTo(run + .28, 0); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
    geometries.set(`ramp:${geometries.size}`, geometry);
    const ramp = mesh(geometry, level === 1 ? '#c1b69d' : '#d4d7c7', [x, .18, z - depth / 2], name);
    ramp.scale.x = direction;
    const positions = [];
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = points[i - 1], [bx, by] = points[i];
      positions.push(ax, ay + .012, 0, bx, by + .012, 0, bx, by + .012, depth,
        ax, ay + .012, 0, bx, by + .012, depth, ax, ay + .012, depth);
    }
    const skin = new THREE.BufferGeometry(); skin.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); skin.computeVertexNormals();
    geometries.set(`ramp-skin:${geometries.size}`, skin);
    const surface = mesh(skin, level === 1 ? '#8ba5a6' : level === 2 ? '#63a5a6' : '#597f98', [x, .18, z - depth / 2], `${name}-curved-surface`, { side: THREE.DoubleSide }); surface.scale.x = direction;
    beam([x + direction * run, rise + .21, z - depth / 2], [x + direction * run, rise + .21, z + depth / 2], .04, graphite, `${name}-coping`);
    box([.27, .045, depth], color, [x + direction * (run + .14), rise + .205, z], `${name}-deck`, .015);
    return ramp;
  }
  function skatepark() {
    box([w, .18, d], color, [0, .09, 0], 'skatepark-foundation', .12);
    box([w - .22, .022, d - .22], '#d4d2b9', [0, .19, 0], 'skatepark-paving', .065);
    const rise = h - .27;
    if (level === 1) {
      curvedRamp(-w * .13, -d * .10, w * .27, rise, d * .68, -1, 'skatepark-quarterpipe');
      box([w * .26, .24, d * .22], graphite, [w * .24, .32, d * .20], 'skatepark-manual-box');
      box([w * .27, .035, d * .23], '#c1c8b3', [w * .24, .455, d * .20], 'skatepark-grind-ledge');
    } else if (level === 2) {
      for (const side of [-1, 1]) curvedRamp(side * w * .18, -d * .17, w * .25, rise, d * .48, side, 'skatepark-halfpipe');
      box([w * .37, .025, d * .48], '#63a5a6', [0, .205, -d * .17], 'skatepark-halfpipe-flat', .005);
      const z = d * .31;
      beam([-w * .24, .60, z], [w * .24, .60, z], .055, graphite, 'skatepark-flat-rail');
      for (const x of [-w * .17, w * .17]) beam([x, .20, z], [x, .60, z], .045, graphite, 'skatepark-rail-support');
    } else {
      for (const side of [-1, 1]) curvedRamp(side * w * .18, -d * .18, w * .25, rise, d * .43, side, 'skatepark-pro-halfpipe');
      box([w * .37, .025, d * .43], '#597f98', [0, .205, -d * .18], 'skatepark-halfpipe-flat', .005);
      for (let i = 0; i < 4; i++) box([w * .19, .16 * (4 - i), .24], '#b9bca9', [-w * .25, .2 + .08 * (4 - i), d * .17 + i * .24], 'skatepark-stair-set', .015);
      beam([-w * .25, 1.05, d * .12], [-w * .25, .55, d * .43], .045, graphite, 'skatepark-stair-handrail');
      for (const p of [[-w * .25, .8, d * .12], [-w * .25, .35, d * .43]]) beam([p[0], .2, p[2]], [p[0], p[1] + .2, p[2]], .035, graphite, 'skatepark-stair-post');
      curvedRamp(w * .19, d * .27, w * .12, .58, d * .24, 1, 'skatepark-secondary-ramp');
      box([w * .20, .29, .42], '#d4d7c7', [w * .01, .35, d * .29], 'skatepark-long-grind-box');
      box([w * .21, .04, .46], '#3e6679', [w * .01, .515, d * .29], 'skatepark-long-grind-top');
    }
    root.userData.curvedRamps = level === 1 ? 1 : level === 2 ? 2 : 3;
  }
  function accessory() {
    const kind = product.model;
    if (kind === 'ball-cart') {
      box([w * .88, .08, d * .82], color, [0, h * .25, 0], 'ball-cart-bottom');
      for (const x of [-w * .39, w * .39]) for (const z of [-d * .35, d * .35]) {
        const wheel = cylinder(.09, .07, graphite, [x, .10, z], 'ball-cart-wheel'); wheel.rotation.x = Math.PI / 2;
        beam([x, .15, z], [x, h * .88, z], .025, silver, 'ball-cart-upright');
      }
      for (const z of [-d * .37, d * .37]) {
        net([-w * .42, h * .28, z], [w * .42, h * .28, z], [w * .42, h * .82, z], [-w * .42, h * .82, z], 9, 5, .012, 'ball-cart-wire-side', silver);
        beam([-w * .44, h * .85, z], [w * .44, h * .85, z], .029, color, 'ball-cart-rim');
      }
      for (const x of [-w * .43, w * .43]) net([x, h * .28, -d * .36], [x, h * .28, d * .36], [x, h * .82, d * .36], [x, h * .82, -d * .36], 6, 5, .012, 'ball-cart-wire-end', silver);
      for (const [x, z, shade] of [[-.27, -.12, '#dc9253'], [.05, .14, '#e9e8d8'], [.28, -.13, '#d9bb63']]) {
        const ballY = h * .58; sphere(.20, shade, [x, ballY, z], 'ball-cart-ball');
        const band = torus(.20, .007, graphite, [x, ballY, z], 'ball-cart-ball-seam'); band.rotation.y = Math.PI / 2;
      }
      beam([-w * .42, h * .85, d * .38], [-w * .42, h - .045, d * .42], .03, silver, 'ball-cart-handle');
      beam([-w * .42, h - .045, d * .42], [w * .42, h - .045, d * .42], .035, graphite, 'ball-cart-handle-grip');
    } else if (kind === 'scoreboard') {
      for (const x of [-w * .32, w * .32]) {
        box([.30, .10, d], graphite, [x, .05, 0], 'scoreboard-foot');
        beam([x, .08, 0], [x, h * .57, 0], .045, silver, 'scoreboard-post');
      }
      box([w, h * .47, .16], color, [0, h * .72, 0], 'scoreboard-casing', .06);
      box([w * .91, h * .37, .025], '#233e45', [0, h * .72, .094], 'scoreboard-screen');
      const digits = [[-.38, [1,1,1,1,1,1,0]], [.38, [1,1,1,0,1,1,1]]];
      for (const [x, enabled] of digits) {
        const positions = [[0,.16,true],[.11,.08,false],[.11,-.08,false],[0,-.16,true],[-.11,-.08,false],[-.11,.08,false],[0,0,true]];
        positions.forEach(([dx, dy, horizontal], index) => { if (enabled[index]) box(horizontal ? [.18,.032,.012] : [.032,.13,.012], '#f4d577', [x + dx, h * .72 + dy, .115], 'scoreboard-digit', .006); });
      }
      for (const y of [-.055, .055]) sphere(.018, ivory, [0, h * .72 + y, .119], 'scoreboard-colon');
      box([w * .98, .065, d * .66], graphite, [0, h - .065, .02], 'scoreboard-visor');
    } else if (kind === 'spectator-bench') {
      for (let row = 0; row < 3; row++) {
        const z = -d * .32 + row * d * .32, y = h * (.26 + row * .23);
        box([w, .11, d * .27], color, [0, y, z], 'bleacher-seat', .04);
        box([w * .98, .06, .17], silver, [0, y - .18, z - .10], 'bleacher-footrest');
        for (const x of [-w * .39, w * .39]) beam([x, .04, z], [x, y - .06, z], .045, graphite, 'bleacher-leg');
      }
      for (const x of [-w * .42, w * .42]) {
        beam([x, .06, -d * .44], [x, .06, d * .44], .065, graphite, 'bleacher-base-runner');
        beam([x, .06, d * .40], [x, h - .07, d * .40], .045, silver, 'bleacher-back-post');
      }
      beam([-w * .43, h - .07, d * .40], [w * .43, h - .07, d * .40], .035, silver, 'bleacher-back-rail');
    } else if (kind === 'umpire-chair') {
      const seatY = h * .70;
      box([w * .65, .11, d * .58], color, [0, seatY, 0], 'umpire-seat');
      box([w * .66, h * .22, .09], color, [0, h * .84, d * .23], 'umpire-seat-back');
      for (const x of [-w * .29, w * .29]) {
        beam([x * 1.45, .04, -d * .40], [x, seatY, -d * .20], .04, silver, 'umpire-front-leg');
        beam([x * 1.45, .04, d * .40], [x, seatY, d * .20], .04, silver, 'umpire-rear-leg');
        beam([x, seatY + .27, -d * .18], [x, seatY + .27, d * .26], .035, graphite, 'umpire-arm');
      }
      for (let step = 0; step < 5; step++) {
        const t = (step + .5) / 5;
        box([w * .69, .055, .13], color, [0, .14 + t * seatY * .81, -d * (.40 - .20 * t)], 'umpire-ladder-rung');
      }
      for (const z of [-d * .4, d * .4]) beam([-w * .43, .06, z], [w * .43, .06, z], .045, graphite, 'umpire-base-bar');
    } else if (kind === 'sports-floodlight') {
      box([w * .86, .15, d], color, [0, .075, 0], 'sports-light-weighted-base', .06);
      cylinder(.10, h * .84, graphite, [0, h * .42 + .10, 0], 'sports-light-mast', .065);
      beam([-w * .41, h * .84, 0], [w * .41, h * .84, 0], .045, silver, 'sports-light-crossbar');
      for (const x of [-w * .25, w * .25]) {
        const lamp = box([w * .42, h * .12, .22], color, [x, h * .90, 0], 'sports-light-projector', .04); lamp.rotation.x = -.18;
        const front = mesh(geo('lamp-face', () => new RoundedBoxGeometry(w * .34, h * .085, .025, 1, .015)), '#fff3c6', [x, h * .90, .125], 'sports-light-lens', { emissive: '#e8bd6c', emissiveIntensity: .25 }); front.rotation.x = -.18;
        for (const dx of [-w * .075, w * .075]) box([.017, h * .085, .025], silver, [x + dx, h * .90, .145], 'sports-light-lens-divider', .002);
      }
    } else if (kind === 'equipment-rack') {
      for (const x of [-w * .43, w * .43]) {
        box([.12, h * .95, .12], graphite, [x, h * .48, 0], 'equipment-rack-column');
        box([.29, .10, d], color, [x, .05, 0], 'equipment-rack-foot');
      }
      for (const y of [h * .20, h * .60]) box([w * .93, .07, d * .72], color, [0, y, 0], 'equipment-rack-shelf');
      for (const x of [-w * .28, w * .25]) {
        beam([x, h * .60, 0], [x, h * .82, 0], .023, silver, 'equipment-racket-handle');
        const rim = torus(h * .12, .024, ivory, [x, h * .90, 0], 'equipment-racket-head'); rim.scale.y = 1.13;
        net([x - h * .085, h * .81, 0], [x + h * .085, h * .81, 0], [x + h * .085, h * .99, 0], [x - h * .085, h * .99, 0], 5, 5, .007, 'equipment-racket-strings', silver);
      }
      for (const [x, shade] of [[-w * .26, '#e4a057'], [.02, '#a9c96b'], [w * .26, '#e9d290']]) {
        sphere(h * .105, shade, [x, h * .33, .03], 'equipment-rack-ball');
        const band = torus(h * .105, .006, graphite, [x, h * .33, .03], 'equipment-ball-seam'); band.rotation.y = Math.PI / 2;
      }
    }
  }
  if (product.feature === 'football') football();
  else if (product.feature === 'table-tennis') tableTennis();
  else if (product.feature === 'running-track') runningTrack();
  else if (product.feature === 'skatepark') skatepark();
  else accessory();

  // All decorative parts, including lights, ramps and net poles, remain inside one owned collision volume.
  body.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(body), size = bounds.getSize(new THREE.Vector3());
  const scale = Math.min(1, w / size.x, d / size.z, h / size.y); body.scale.setScalar(scale);
  body.updateMatrixWorld(true); bounds.setFromObject(body);
  const center = bounds.getCenter(new THREE.Vector3()); body.position.set(-center.x, -bounds.min.y, -center.z);
  root.userData.sportModel = product.feature ?? product.model;
  root.userData.footprint = { width: w, depth: d, height: h };
  root.userData.dispose = root.dispose = () => {
    if (disposed) return; disposed = true;
    for (const geometry of geometries.values()) geometry.dispose();
    for (const material of materials.values()) material.dispose();
    geometries.clear(); materials.clear(); root.clear();
  };
  root.updateMatrixWorld(true); return root;
}
