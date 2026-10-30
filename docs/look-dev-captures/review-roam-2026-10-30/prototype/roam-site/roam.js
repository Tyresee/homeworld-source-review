import * as THREE from 'three';
import { OrbitControls } from './OrbitControls.js';

const $ = id => document.getElementById(id);
const CUT_H = 0.5, SECTION = '#4a3f37', BG = '#efe9df';
const status = t => { $('loading').textContent = t; };

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.03;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
$('stage').append(renderer.domElement);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
const controls = new OrbitControls(camera, renderer.domElement);
Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, zoomToCursor: true, screenSpacePanning: false, minDistance: 1.6, maxDistance: 45, maxPolarAngle: THREE.MathUtils.degToRad(86), rotateSpeed: 0.7, autoRotateSpeed: 0.6 });
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

let manorBody = null, bodyBox = null;
let dirty = true, scene, interior = [], exterior = [], walls = [], attachments = [], center = new THREE.Vector3(), radius = 8, mode = 'auto', shownMode = null;

async function load() {
  status('正在载入房子…');
  const res = await fetch('./house.b64.txt');
  if (!res.ok) throw new Error('载入失败 ' + res.status);
  const bin = Uint8Array.from(atob((await res.text()).trim()), c => c.charCodeAt(0));
  const json = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
  scene = await new THREE.ObjectLoader().parseAsync(json.scene);
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 38, 90);
  const find = name => scene.getObjectByName(name);
  const rooms = find('room-expansion'), manor = find('estate-manor'), outdoor = find('estate-outdoor'), robot = find('student-home-robot');
  const furniture = find('furniture-bedTimber')?.parent;
  if (outdoor) outdoor.visible = false;
  scene.traverse(o => { if (o.type === 'BoxHelper' || o.type === 'LineSegments') o.visible = false; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } if (o.isLight && o.shadow) { o.shadow.mapSize.set(2048, 2048); o.shadow.radius = 3; o.shadow.bias = -0.0006; o.shadow.normalBias = 0.035; } });
  interior = [rooms, furniture, robot].filter(Boolean);
  exterior = [manor].filter(Boolean);
  for (const g of interior) g.visible = true;

  // House bounds from the interior floor plan.
  const box = new THREE.Box3().setFromObject(rooms); box.getCenter(center); center.y = 0.6;
  // Turn the floor plan around so the front door opens into the living room (the test layout had the bathroom there).
  for (const g of interior) { g.rotation.y += Math.PI; g.position.x = 2 * center.x - g.position.x; g.position.z = 2 * center.z - g.position.z; }
  scene.updateMatrixWorld(true); box.setFromObject(rooms);
  const lamp = furniture?.children.find(c => c.name === 'household-hhTripodLamp');
  if (lamp) { // keep the doorway clear: floor lamp goes to the far corner of the living room
    const c = new THREE.Box3().setFromObject(lamp).getCenter(new THREE.Vector3()), to = new THREE.Vector3(4.95, c.y, 3.05), par = lamp.parent;
    lamp.position.add(par.worldToLocal(to.clone()).sub(par.worldToLocal(c.clone()))); scene.updateMatrixWorld(true);
  }
  if (manor) { // line the exterior wall body up with the interior floor slab
    let slab = null, body = null, area = b => { const s = b.getSize(new THREE.Vector3()); return s.x * s.z; };
    rooms.traverse(o => { if (o.isMesh && o.name === 'part:floor') { const b = new THREE.Box3().setFromObject(o); if (!slab || area(b) > area(slab)) slab = b; } });
    manor.traverse(o => { if (o.isMesh && o.material?.color?.getHexString() === 'f1ebe0') { const b = new THREE.Box3().setFromObject(o); if (!body || area(b) > area(body.box)) body = { mesh: o, box: b }; } });
    const mb = body ? body.box : new THREE.Box3().setFromObject(manor), mc = mb.getCenter(new THREE.Vector3()), sc = (slab ?? box).getCenter(new THREE.Vector3());
    manor.position.x += sc.x - mc.x; manor.position.z += sc.z - mc.z; manor.updateMatrixWorld(true);
    if (body) { manorBody = body.mesh; bodyBox = new THREE.Box3().setFromObject(body.mesh); }  }
  radius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);

  // Ground: a soft round display base instead of a hard-edged lawn.
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  const grad = g.createRadialGradient(256, 256, 40, 256, 256, 256); grad.addColorStop(0, '#e3dacb'); grad.addColorStop(.62, '#e8e0d3'); grad.addColorStop(1, BG);
  g.fillStyle = grad; g.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(radius * 2.6, 96), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(center.x, -0.02, center.z); ground.receiveShadow = true; scene.add(ground);

  // Walls that can be cut, with a dark section cap for the cut state.
  scene.updateMatrixWorld(true);
  rooms.traverse(o => {
    if (!o.isMesh) return;
    const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3());
    if (o.name === 'part:walls' && s.y > 1.2) {
      const axis = s.x < s.z ? 'x' : 'z', plane = (b.min[axis] + b.max[axis]) / 2;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? s.x + .01 : s.x, .045, axis === 'z' ? s.z + .01 : s.z), new THREE.MeshStandardMaterial({ color: SECTION, roughness: .8 }));
      cap.position.set((b.min.x + b.max.x) / 2, b.min.y + CUT_H + .022, (b.min.z + b.max.z) / 2); cap.visible = false; scene.add(cap);
      walls.push({ mesh: o, axis, plane, box: b, bottom: b.min.y, baseY: o.position.y, baseS: o.scale.y, cap, cut: false });
    } else if (o.name !== 'part:floor' && o.name !== 'part:zones' && b.min.y > CUT_H + .1) attachments.push({ mesh: o, box: b });
  });
  for (const w of walls) w.attached = attachments.filter(a => {
    const other = w.axis === 'x' ? 'z' : 'x';
    return Math.abs((a.box.min[w.axis] + a.box.max[w.axis]) / 2 - w.plane) < .62 && a.box.max[other] > w.box.min[other] - .05 && a.box.min[other] < w.box.max[other] + .05;
  });
  setupWalk(rooms, manor, furniture, robot, box);
  home(false);
  $('loading').hidden = true;
  renderer.setAnimationLoop(tick);
}

function setCut(w, cut) {
  if (w.cut === cut) return; w.cut = cut;
  const m = w.mesh, s = cut ? CUT_H / (w.box.max.y - w.box.min.y) : 1;
  m.scale.y = w.baseS * s; m.position.y = w.bottom + (w.baseY - w.bottom) * s;
  w.cap.visible = cut; for (const a of w.attached) a.mesh.visible = !cut;
}
function updateWalls() {
  const cam = camera.position, t = controls.target, inside = shownMode === 'interior';
  for (const w of walls) {
    if (!inside) { setCut(w, false); continue; }
    const between = (cam[w.axis] - w.plane) * (t[w.axis] - w.plane) < 0;
    // Outer walls facing the camera are always opened when looking from outside the house.
    setCut(w, between);
  }
}
function updateMode() {
  const dist = camera.position.distanceTo(controls.target);
  const want = mode === 'auto' ? (dist > radius * 1.55 ? 'exterior' : 'interior') : mode;
  if (want === shownMode) return; shownMode = want;
  show(want === 'exterior' ? 'ext' : 'orbit-in');
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  $('mode-label').textContent = want === 'exterior' ? '正在看：外观' : '正在看：室内';
}

const keys = new Set();
// Physical keys (e.code), so W/A/S/D also work while a Chinese input method is active.
const KEYMAP = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyQ: 'q', KeyE: 'e', KeyR: 'r', ArrowUp: 'arrowup', ArrowDown: 'arrowdown', ArrowLeft: 'arrowleft', ArrowRight: 'arrowright', Space: ' ', ShiftLeft: 'shift', ShiftRight: 'shift', Escape: 'escape' };
const keyName = e => KEYMAP[e.code] ?? (e.key || '').toLowerCase();
addEventListener('keydown', e => {
  if (e.target.closest?.('input,textarea')) return;
  const k = keyName(e);
  if (['w', 'a', 's', 'd', 'q', 'e', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) { keys.add(k); e.preventDefault(); }
  if (state === 'walk') { if (k === 'escape') exitHouse(); dirty = true; return; }
  keys.delete(' ');
  if (state !== 'orbit') return;
  if (k === 'r') home(true);
  if (k === ' ') toggleSpin();
});
addEventListener('keyup', e => keys.delete(keyName(e)));
addEventListener('blur', () => keys.clear());
let last = performance.now();
function walk(dt) {
  if (![...keys].some(k => k !== 'shift' && k !== ' ')) return false;
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize(), move = new THREE.Vector3();
  const speed = Math.max(2, camera.position.distanceTo(controls.target) * .9) * dt;
  if (keys.has('w') || keys.has('arrowup')) move.add(fwd); if (keys.has('s') || keys.has('arrowdown')) move.sub(fwd);
  if (keys.has('d') || keys.has('arrowright')) move.add(right); if (keys.has('a') || keys.has('arrowleft')) move.sub(right);
  if (move.lengthSq()) { move.normalize().multiplyScalar(speed); camera.position.add(move); controls.target.add(move); }
  if (keys.has('q') || keys.has('e')) {
    const a = (keys.has('q') ? 1 : -1) * dt * 1.2, off = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    camera.position.copy(controls.target).add(off);
  }
  return true;
}
function tick() {
  const now = performance.now(), dt = Math.min((now - last) / 1000, state === 'walk' ? .1 : .05); last = now;
  if (state === 'walk') { const m = walkFP(dt), a = stepInteract(dt); if (!(m || a || dirty)) return; dirty = false; renderer.render(scene, camera); return; }
  if (state === 'transition') { if (!dirty) return; dirty = false; renderer.render(scene, camera); return; }
  const moved = walk(dt), changed = controls.update();
  if (!(moved || changed || dirty || controls.autoRotate || flight)) return;
  dirty = false; updateMode(); updateWalls(); renderer.render(scene, camera);
}
let flight = null;
function home(animate) {
  const to = center.clone().add(new THREE.Vector3(radius * .95, radius * 1.05, radius * 1.25)), target = center.clone();
  if (!animate) { camera.position.copy(to); controls.target.copy(target); return; }
  const from = camera.position.clone(), fromT = controls.target.clone(), t0 = performance.now();
  cancelAnimationFrame(flight);
  const step = () => { const u = Math.min(1, (performance.now() - t0) / 700), e = u * u * (3 - 2 * u);
    camera.position.lerpVectors(from, to, e); controls.target.lerpVectors(fromT, target, e); dirty = true; if (u < 1) flight = requestAnimationFrame(step); else flight = null; };
  step();
}
function toggleSpin() { controls.autoRotate = !controls.autoRotate; $('spin').setAttribute('aria-pressed', String(controls.autoRotate)); }
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { mode = b.dataset.mode; shownMode = null; dirty = true; }));
$('spin').addEventListener('click', toggleSpin);
$('home').addEventListener('click', () => home(true));
$('help-toggle').addEventListener('click', () => { const h = $('help'); h.hidden = !h.hidden; });
function resize() { dirty = true; const r = $('stage').getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe($('stage')); resize();
renderer.domElement.addEventListener('pointerdown', () => { $('help').hidden = true; }, { once: true });

// ---------- Door + free first-person camera (prototype) ----------
// Views: 'ext' = orbit exterior; 'orbit-in' = orbit cutaway; 'ext+in' = exterior shell with the rooms visible
// through the open front door; 'in' = standing inside (finished interior walls, ceiling, room lights).
let state = 'orbit', leaf = null, pivot = null, doorParts = [], doorInfo = null, frontWall = null, frontPieces = [], ceiling = null, hover = false;
let manorMeshes = [], shell = [], outerWalls = [], lamps = [], daylight = [], keyLight = null, keyRoom = null, view = null, glide = null, floorMeshes = [];
let yaw = 0, pitch = 0, dragging = false, lastX = 0, lastY = 0, downX = 0, downY = 0;
const EYE = 1.45, ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), groups = {};
function setupWalk(rooms, manor, furniture, robot, plan) {
  Object.assign(groups, { rooms, manor, furniture, robot });
  if (!manor || !manorBody) return;
  let ent = null; manor.traverse(o => { if (o.userData?.entrance) ent = o; });
  if (!ent) return;
  const meshes = []; ent.traverse(o => { if (o.isMesh) meshes.push(o); });
  const old = meshes.filter(m => m.material?.color?.getHexString() === '9a6a45').sort((a, b) => new THREE.Box3().setFromObject(b).getSize(new THREE.Vector3()).y - new THREE.Box3().setFromObject(a).getSize(new THREE.Vector3()).y)[0];
  if (!old) return;
  const lb = new THREE.Box3().setFromObject(old);
  const knobs = meshes.filter(m => { if (m === old) return false; const b = new THREE.Box3().setFromObject(m); return m.material?.color?.getHexString() === 'ffc93a' && b.min.x >= lb.min.x - .05 && b.max.x <= lb.max.x + .05 && Math.abs(b.min.z - lb.max.z) < .25; });
  // The game's door is a flat card on a solid wall block: hinge it, draw both sides, and hollow the block (below).
  leaf = old; leaf.material = old.material.clone(); leaf.material.side = THREE.DoubleSide;
  pivot = new THREE.Object3D(); pivot.position.set(lb.min.x, 0, lb.max.z); scene.add(pivot); scene.updateMatrixWorld(true);
  pivot.attach(leaf); for (const k of knobs) pivot.attach(k);
  doorParts = [leaf, ...knobs];
  doorInfo = { x: (lb.min.x + lb.max.x) / 2, z: lb.max.z, min: lb.min.x, max: lb.max.x, top: lb.max.y };
  // The arched surround is a solid block too: rebuild it as an arch ring with a real opening.
  const surround = meshes.filter(m => m !== old && !knobs.includes(m) && (() => { const b = new THREE.Box3().setFromObject(m); return b.max.y - b.min.y > 1.5 && b.min.x < lb.min.x && b.max.x > lb.max.x; })());
  const archRing = (x0, x1, y0, y1, h0, h1, ht) => { // one U-shaped outline: outer arch, then back down through the opening
    const r = (x1 - x0) / 2, cx = (x0 + x1) / 2, ri = (h1 - h0) / 2, ci = (h0 + h1) / 2, sh = new THREE.Shape();
    sh.moveTo(h0, y0); sh.lineTo(x0, y0); sh.lineTo(x0, y1 - r); sh.absarc(cx, y1 - r, r, Math.PI, 0, true); sh.lineTo(x1, y0); sh.lineTo(h1, y0);
    sh.lineTo(h1, ht - ri); sh.absarc(ci, ht - ri, ri, 0, Math.PI, false); sh.lineTo(h0, y0); return sh; };
  for (const m of surround) {
    const b = new THREE.Box3().setFromObject(m); m.visible = false;
    const shape = archRing(b.min.x, b.max.x, b.min.y, b.max.y, lb.min.x - .01, lb.max.x + .01, lb.max.y + .01);
    const ring = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: b.max.z - b.min.z, bevelEnabled: false, curveSegments: 24 }), m.material);
    ring.position.z = b.min.z; ring.castShadow = ring.receiveShadow = true; scene.add(ring); shell.push(ring);
  }
  // Hollow wall body: four walls instead of the solid block, with a doorway in the front wall.
  const bb = bodyBox, t = .2, mat = manorBody.material, H = bb.max.y, y0 = bb.min.y;
  const box = (x0, x1, ya, yb, z0, z1) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, yb - ya, z1 - z0), mat); m.position.set((x0 + x1) / 2, (ya + yb) / 2, (z0 + z1) / 2); m.castShadow = m.receiveShadow = true; scene.add(m); shell.push(m); return m; };
  const g0 = lb.min.x - .02, g1 = lb.max.x + .02;
  box(bb.min.x, bb.max.x, y0, H, bb.min.z, bb.min.z + t); box(bb.min.x, bb.min.x + t, y0, H, bb.min.z, bb.max.z); box(bb.max.x - t, bb.max.x, y0, H, bb.min.z, bb.max.z);
  box(bb.min.x, g0, y0, H, bb.max.z - t, bb.max.z); box(g1, bb.max.x, y0, H, bb.max.z - t, bb.max.z); box(g0, g1, lb.max.y + .02, H, bb.max.z - t, bb.max.z);
  manorBody.visible = false;
  manor.traverse(o => { if (o.isMesh && o !== manorBody && o !== old && !surround.includes(o)) manorMeshes.push(o); });
  // Interior: outer walls, plus a doorway in the interior front wall.
  const p = plan;
  outerWalls = walls.filter(w => Math.abs(w.plane - p.min[w.axis]) < .3 || Math.abs(w.plane - p.max[w.axis]) < .3);
  frontWall = outerWalls.filter(w => w.axis === 'z' && w.box.min.x < doorInfo.min && w.box.max.x > doorInfo.max).sort((a, b) => b.plane - a.plane)[0] ?? null;
  if (frontWall) {
    const b = frontWall.box, wm = frontWall.mesh.material, gap = [doorInfo.min - .03, doorInfo.max + .03], d = b.max.z - b.min.z;
    const piece = (x0, x1, ya, yb) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, yb - ya, d), wm); m.position.set((x0 + x1) / 2, (ya + yb) / 2, (b.min.z + b.max.z) / 2); m.castShadow = m.receiveShadow = true; m.visible = false; scene.add(m); return m; };
    frontPieces = [piece(b.min.x, gap[0], b.min.y, b.max.y), piece(gap[1], b.max.x, b.min.y, b.max.y), piece(gap[0], gap[1], doorInfo.top + .02, b.max.y)];
  }
  rooms.traverse(o => { if (o.isMesh && o.name === 'part:floor') floorMeshes.push(o); });
  // Ceiling + one warm ceiling lamp per room (four quadrants split by the inner partitions).
  ceiling = new THREE.Mesh(new THREE.PlaneGeometry(p.max.x - p.min.x, p.max.z - p.min.z), new THREE.MeshStandardMaterial({ color: '#f7f2ea', emissive: '#efe6d8', emissiveIntensity: 0, roughness: .95 }));
  ceiling.rotation.x = Math.PI / 2; ceiling.position.set((p.min.x + p.max.x) / 2, Math.min(H, p.max.y) - .015, (p.min.z + p.max.z) / 2); ceiling.visible = false; scene.add(ceiling);
  const inner = a => walls.filter(w => w.axis === a && !outerWalls.includes(w)).map(w => w.plane);
  const sx = inner('x')[0] ?? (p.min.x + p.max.x) / 2, sz = inner('z')[0] ?? (p.min.z + p.max.z) / 2;
  // Indoor lighting rig: the room you stand in gets a shadow-casting key lamp; the other rooms keep a softer
  // lamp of their own so doorways glow. Light count never changes, so switching rooms never recompiles shaders.
  for (const [x0, x1] of [[p.min.x, sx], [sx, p.max.x]]) for (const [z0, z1] of [[p.min.z, sz], [sz, p.max.z]]) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, y = ceiling.position.y;
    const light = new THREE.PointLight('#ffe1b8', 0, 11, 2); light.position.set(cx, y - .3, cz); scene.add(light);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(.24, .28, .06, 32), new THREE.MeshStandardMaterial({ color: '#fff4dd', emissive: '#ffe2b3', emissiveIntensity: 0 })); disc.position.set(cx, y - .03, cz); disc.visible = false; scene.add(disc);
    lamps.push({ light, disc, x0, x1, z0, z1 });
  }
  keyLight = new THREE.PointLight('#ffe1b8', 0, 12, 2); keyLight.castShadow = true;
  Object.assign(keyLight.shadow, { bias: -.002, normalBias: .025, radius: 4 }); keyLight.shadow.mapSize.set(1024, 1024); keyLight.shadow.camera.near = .05; keyLight.shadow.camera.far = 12; keyLight.shadow.autoUpdate = false;
  scene.add(keyLight);
  scene.traverse(o => { if (o.isDirectionalLight || o.isHemisphereLight) daylight.push({ light: o, base: o.intensity }); });
  setupInteract();
  show('ext');
}
function show(v) {
  if (v === view) return; view = v; dirty = true;
  const m = groups.manor; if (!m) { for (const g of interior) g.visible = v !== 'ext'; for (const g of exterior) g.visible = v === 'ext'; return; }
  m.visible = v !== 'orbit-in';
  const shellOn = v === 'ext' || v === 'ext+in';
  for (const o of manorMeshes) o.visible = shellOn; for (const o of shell) o.visible = shellOn;
  if (pivot) pivot.visible = v !== 'orbit-in';
  for (const g of interior) g.visible = v !== 'ext';
  if (v !== 'orbit-in') for (const w of walls) setCut(w, false);
  for (const w of outerWalls) { const on = v === 'in' ? w !== frontWall : v === 'orbit-in'; w.mesh.visible = on; for (const a of w.attached) a.mesh.visible = on; }
  for (const f of frontPieces) f.visible = v === 'in';
  if (ceiling) ceiling.visible = v === 'in' || v === 'ext+in';
  lighting(v);
  if (v === 'orbit-in') shownMode = 'interior'; else if (v === 'ext') shownMode = 'exterior';
}
const LAMP = 24;
function lighting(v) {
  const inside = v === 'in', lit = inside || v === 'ext+in';
  // Inside, the sun is gone (there is a ceiling now); a dim neutral fill stands in for daylight bouncing in through windows.
  for (const d of daylight) d.light.intensity = inside ? (d.light.isHemisphereLight ? 1.05 : 0) : d.base;
  renderer.toneMappingExposure = inside ? 1.22 : 1.03;
  if (ceiling) ceiling.material.emissiveIntensity = inside ? .32 : 0;
  for (const l of lamps) l.disc.visible = lit;
  if (keyLight) keyLight.shadow.autoUpdate = inside;
  keyRoom = null; updateLamps(inside ? 1 : lit ? .7 : 0);
}
function updateLamps(level) {
  if (!keyLight) return;
  const c = camera.position, room = lamps.find(l => c.x >= l.x0 && c.x < l.x1 && c.z >= l.z0 && c.z < l.z1) ?? null;
  if (level === undefined) { if (room === keyRoom && keyRoom !== undefined) return; level = view === 'in' ? 1 : view === 'ext+in' ? .7 : 0; }
  keyRoom = room;
  for (const l of lamps) { const on = l.on !== false; l.light.intensity = l === room || !on ? 0 : LAMP * .75 * level; l.disc.material.emissiveIntensity = on && level > 0 ? 1.6 : 0; }
  if (room && room.on !== false) { keyLight.position.copy(room.light.position); keyLight.intensity = LAMP * level; } else keyLight.intensity = 0;
  keyLight.shadow.needsUpdate = true; dirty = true;
}
function isInside(p) { const b = bodyBox; return b && p.x > b.min.x + .05 && p.x < b.max.x - .05 && p.z > b.min.z + .05 && p.z < b.max.z - .05 && p.y < b.max.y + .05 && p.y > -.2; }
function pointer(e) { const r = renderer.domElement.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); }
function pickDoor(e) { pointer(e); return doorParts.length > 0 && ray.intersectObjects(doorParts, false).length > 0; }
function setHover(h, e) {
  if (h !== hover) { hover = h; renderer.domElement.style.cursor = h ? 'pointer' : ''; if (leaf) { leaf.material.emissive.set(h ? '#6b3a17' : '#000000'); dirty = true; } }
  const tip = $('door-tip'); tip.hidden = !h; if (h && e) { tip.style.left = e.clientX + 14 + 'px'; tip.style.top = e.clientY + 14 + 'px'; }
}
renderer.domElement.addEventListener('pointermove', e => {
  if (state === 'walk' && dragging) { yaw -= (e.clientX - lastX) * .0045; pitch = THREE.MathUtils.clamp(pitch - (e.clientY - lastY) * .0035, -1.45, 1.45); lastX = e.clientX; lastY = e.clientY; dirty = true; if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) glide = null; return; }
  if (state === 'walk') { setHoverItem(pickItem(e), e); return; }
  if (state !== 'orbit') return;
  setHover(shownMode === 'exterior' && pickDoor(e), e);
});
renderer.domElement.addEventListener('pointerdown', e => { downX = lastX = e.clientX; downY = lastY = e.clientY; if (state === 'walk' && e.button === 0) { dragging = true; renderer.domElement.setPointerCapture(e.pointerId); } });
renderer.domElement.addEventListener('pointerup', e => {
  const click = Math.hypot(e.clientX - downX, e.clientY - downY) < 6; dragging = false;
  if (state === 'orbit' && hover && click) enterHouse();
  else if (state === 'walk' && click && e.button === 0) { const it = pickItem(e); if (it) { it.toggle(); setHoverItem(null); setHoverItem(it, e); } else goTo(e); }
});
renderer.domElement.addEventListener('wheel', e => { if (state !== 'walk') return; e.preventDefault(); glide = null; const d = camera.getWorldDirection(new THREE.Vector3()); camera.position.addScaledVector(d, -Math.sign(e.deltaY) * .45); dirty = true; }, { passive: false });
// Click anything while walking: glide to it (on the floor: stand there; on a wall or object: stop just in front of it).
function goTo(e) {
  pointer(e);
  const targets = []; for (const g of [...interior, ...(view === 'ext' || view === 'ext+in' ? [groups.manor, ...shell] : [])]) if (g?.visible) targets.push(g);
  const hit = ray.intersectObjects(targets, true).find(h => h.object.visible && isVisible(h.object));
  if (!hit) return;
  const to = hit.point.clone(), dir = ray.ray.direction.clone();
  if (hit.point.y < .2) to.y = camera.position.y; else to.addScaledVector(dir, -.9).setY(camera.position.y);
  const dist = to.distanceTo(camera.position); if (dist < .15) return;
  const flat = to.clone().sub(camera.position); const yawTo = Math.atan2(-flat.x, -flat.z);
  let dy = yawTo - yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  glide = { from: camera.position.clone(), to, t0: performance.now(), ms: THREE.MathUtils.clamp(dist / 3 * 1000, 350, 2600), yaw0: yaw, yaw1: yaw + (hit.point.y < .2 ? dy : dy * .6), pitch0: pitch };
}
function isVisible(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }
function tween(ms, fn) { ms *= globalThis.__ROAM_SLOW ?? 1; return new Promise(res => { const t0 = performance.now(); const step = () => { const u = Math.min(1, (performance.now() - t0) / ms), e = u * u * (3 - 2 * u); fn(e); dirty = true; if (u < 1) requestAnimationFrame(step); else res(); }; step(); }); }
function setFov(f) { camera.fov = f; camera.updateProjectionMatrix(); }
async function enterHouse() {
  if (!doorInfo || state !== 'orbit') return;
  state = 'transition'; controls.enabled = false; controls.autoRotate = false; setHover(false); $('help').hidden = true;
  document.body.classList.add('moving');
  const look0 = controls.target.clone(), p0 = camera.position.clone(), step1 = new THREE.Vector3(doorInfo.x, EYE, doorInfo.z + 2.8), doorLook = new THREE.Vector3(doorInfo.x, 1.2, doorInfo.z), tmp = new THREE.Vector3(), f0 = camera.fov;
  show('ext');
  await tween(1500, e => { camera.position.lerpVectors(p0, step1, e); camera.lookAt(tmp.lerpVectors(look0, doorLook, e)); setFov(f0 + (50 - f0) * e); });
  show('ext+in'); // rooms become visible behind the door as it swings open
  await tween(250, () => {});
  await tween(1200, e => { pivot.rotation.y = 1.8 * e; });
  const in1 = new THREE.Vector3(doorInfo.x, EYE, doorInfo.z - 2.0), farLook = new THREE.Vector3(doorInfo.x, EYE - .1, doorInfo.z - 8);
  await tween(1800, e => { camera.position.lerpVectors(step1, in1, e); camera.lookAt(tmp.lerpVectors(doorLook, farLook, e)); setFov(50 + 18 * e); show(isInside(camera.position) ? 'in' : 'ext+in'); updateLamps(); });
  yaw = 0; pitch = -.05; state = 'walk'; document.body.classList.remove('moving'); document.body.classList.add('walking'); dirty = true;
}
async function exitHouse() {
  if (state !== 'walk') return;
  state = 'transition'; glide = null; keys.clear(); document.body.classList.remove('walking'); document.body.classList.add('moving');
  const p0 = camera.position.clone(), out = new THREE.Vector3(doorInfo.x, EYE, doorInfo.z + 2.8), look0 = camera.getWorldDirection(new THREE.Vector3()).add(p0), doorLook = new THREE.Vector3(doorInfo.x, 1.2, doorInfo.z), tmp = new THREE.Vector3(), f0 = camera.fov;
  show('ext+in'); pivot.rotation.y = 1.8;
  await tween(1200, e => { camera.position.lerpVectors(p0, out, e); camera.lookAt(tmp.lerpVectors(look0, doorLook, e)); setFov(f0 + (38 - f0) * e); });
  await tween(800, e => { pivot.rotation.y = 1.8 * (1 - e); });
  show('ext'); controls.target.copy(doorLook); controls.enabled = true; state = 'orbit'; document.body.classList.remove('moving'); home(true);
}
// Free camera: no collision. W/S along the view direction, A/D sideways, E/Space up, Q down, Shift = faster.
function walkFP(dt) {
  let moved = false; const has = k => keys.has(k) ? 1 : 0;
  const f = (has('w') || has('arrowup')) - (has('s') || has('arrowdown')), side = has('d') - has('a'), up = (has('e') || has(' ')) - has('q');
  const turn = has('arrowleft') - has('arrowright');
  if (turn) { yaw += turn * dt * 1.8; moved = true; }
  if (f || side || up) {
    glide = null;
    const sp = (keys.has('shift') ? 6 : 2.6) * dt, dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    camera.position.addScaledVector(dir, f * sp).addScaledVector(right, side * sp); camera.position.y += up * sp;
    moved = true;
  }
  if (glide) {
    const u = Math.min(1, (performance.now() - glide.t0) / glide.ms), e = u * u * (3 - 2 * u);
    camera.position.lerpVectors(glide.from, glide.to, e); yaw = glide.yaw0 + (glide.yaw1 - glide.yaw0) * Math.min(1, e * 1.6); pitch = glide.pitch0 * (1 - e) - .05 * e; moved = true; if (u >= 1) glide = null;
  }
  camera.position.y = THREE.MathUtils.clamp(camera.position.y, .25, 30);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  if (moved) { show(isInside(camera.position) ? 'in' : 'ext+in'); updateLamps(); }
  return moved || dirty;
}
// ---------- Things you can use inside (prototype) ----------
// Taps run, the toilet flushes, ceiling lamps and the floor lamp switch, drawers slide, cabinet doors swing, the hob lights.
// Everything is found from the game's own furniture parts (handles, drawer fronts, faucet), so new furniture of the same
// families works without per-item setup.
const items = [], byMesh = new Map(), anims = new Set(), V = () => new THREE.Vector3();
let audio = null, hoverItem = null, clock = 0;
function ac() { if (audio === null) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { audio = false; } } if (audio && audio.state === 'suspended') audio.resume(); return audio || null; }
function noiseBuf(a) { if (a._nb) return a._nb; const b = a.createBuffer(1, a.sampleRate * 2, a.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return (a._nb = b); }
function sfx(kind, on = true, owner = null) {
  const a = ac(); if (!a) return; const t = a.currentTime;
  const src = () => { const s = a.createBufferSource(); s.buffer = noiseBuf(a); s.loop = true; return s; };
  if (kind === 'water' || kind === 'gas') {
    if (!on) { if (owner?._snd) { const { s, g } = owner._snd; g.gain.setTargetAtTime(0, t, .07); setTimeout(() => s.stop(), 500); owner._snd = null; } return; }
    const s = src(), f = a.createBiquadFilter(), g = a.createGain(); f.type = 'bandpass'; f.frequency.value = kind === 'water' ? 1300 : 3200; f.Q.value = kind === 'water' ? .5 : 1.4;
    g.gain.value = 0; g.gain.setTargetAtTime(kind === 'water' ? .15 : .04, t, .12); s.connect(f).connect(g).connect(a.destination); s.start(); if (owner) owner._snd = { s, g }; return;
  }
  if (kind === 'flush') {
    const s = src(), f = a.createBiquadFilter(), g = a.createGain(); f.type = 'lowpass'; f.frequency.setValueAtTime(2800, t); f.frequency.exponentialRampToValueAtTime(320, t + 2.8);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.32, t + .12); g.gain.setTargetAtTime(0, t + 1.7, .5); s.connect(f).connect(g).connect(a.destination); s.start(); s.stop(t + 4.5); return;
  }
  const slide = kind === 'slide', s = src(), f = a.createBiquadFilter(), g = a.createGain(), dur = slide ? .3 : .045;
  f.type = slide ? 'lowpass' : 'highpass'; f.frequency.value = slide ? 650 : 2600; g.gain.setValueAtTime(slide ? .16 : .28, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  s.connect(f).connect(g).connect(a.destination); s.start(); s.stop(t + dur + .02);
}
function own(m) { if (m.material && !m.userData._own) { m.material = m.material.clone(); m.userData._own = true; } }
function reg(item, meshes) { item.meshes = meshes; for (const m of meshes) { own(m); byMesh.set(m, item); } items.push(item); return item; }
function addTo(fp, obj) { scene.add(obj); scene.updateMatrixWorld(true); fp.attach(obj); return obj; }
function tweenItem(item, to, ms) { item.from = item.t ?? 0; item.to = to; item.t0 = performance.now(); item.ms = ms; anims.add(item); }
function setupInteract() {
  const fp = groups.furniture; if (!fp) return;
  scene.updateMatrixWorld(true);
  const invQ = fp.getWorldQuaternion(new THREE.Quaternion()).invert(), toLocalDir = v => v.clone().applyQuaternion(invQ);
  for (const g of [...fp.children]) {
    const kind = g.userData?.kind ?? '', meshes = []; g.traverse(o => { if (o.isMesh) meshes.push(o); });
    if (!meshes.length) continue;
    const boxes = new Map(meshes.map(m => [m, new THREE.Box3().setFromObject(m)])), part = m => m.userData?.part ?? '', hex = m => m.material?.color?.getHexString?.() ?? '';
    const F = new THREE.Vector3(0, 0, 1).transformDirection(g.matrixWorld); if (Math.abs(F.x) > Math.abs(F.z)) F.set(Math.sign(F.x), 0, 0); else F.set(0, 0, Math.sign(F.z));
    const ax = F.x ? 'x' : 'z', lat = F.x ? 'z' : 'x', sgn = F.x || F.z;
    const fc = b => sgn > 0 ? b.max[ax] : -b.min[ax], cen = b => sgn * (b.min[ax] + b.max[ax]) / 2;
    const gb = new THREE.Box3().setFromObject(g), ext = fc(gb), used = new Set();
    // Toilet: press anywhere on it to flush.
    if (kind === 'compactToilet') {
      const bowl = meshes.find(m => part(m) === 'toilet-bowl'); if (!bowl) continue; const bb = boxes.get(bowl), c = bb.getCenter(V()), s = bb.getSize(V());
      const tex = spiralTex(), water = new THREE.Mesh(new THREE.CircleGeometry(Math.min(s.x, s.z) * .3, 40), new THREE.MeshStandardMaterial({ color: '#d7eef4', map: tex, roughness: .05, metalness: 0, transparent: true, opacity: .9 }));
      water.rotation.x = -Math.PI / 2; water.position.set(c.x, bb.max.y - .085, c.z); addTo(fp, water);
      const btn = meshes.filter(m => hex(m) === 'c7d7d5').sort((a, b) => boxes.get(b).max.y - boxes.get(a).max.y)[0];
      const it = reg({ label: () => '冲水', water, y0: water.position.y, btn, b0: btn?.position.y, toggle() { if (anims.has(this)) return; sfx('click'); sfx('flush'); this.t = 0; tweenItem(this, 1, 2800); },
        apply(u) { this.water.rotation.z -= .25 * Math.sin(Math.PI * u); this.water.position.y = this.y0 - .045 * Math.sin(Math.PI * Math.min(1, u * 1.6)); this.water.scale.setScalar(1 - .35 * Math.sin(Math.PI * Math.min(1, u * 1.6)));
          if (this.btn) this.btn.position.y = this.b0 - (u < .15 ? .012 : 0); } }, [...meshes, water]);
      it.t = 0; continue;
    }
    // Floor lamp: click to switch its own bulb.
    if (kind === 'hhTripodLamp') {
      const shade = meshes.slice().sort((a, b) => boxes.get(b).getCenter(V()).y - boxes.get(a).getCenter(V()).y)[0], sc = boxes.get(shade).getCenter(V());
      const light = new THREE.PointLight('#ffd49a', 0, 6, 2); light.position.copy(sc).y -= .06; scene.add(light);
      reg({ label() { return this.on ? '关落地灯' : '开落地灯'; }, on: false, toggle() { this.on = !this.on; sfx('click'); light.intensity = this.on ? 7 : 0; own(shade); shade.material.emissive.set(this.on ? '#ffc477' : '#000000'); shade.material.emissiveIntensity = this.on ? .8 : 1; this.lit = this.on; dirty = true; } }, meshes);
      continue;
    }
    // Faucets: kitchen sink faucet, or the chrome tap of the bathroom vanity.
    const taps = meshes.filter(m => part(m) === 'sink-faucet' || (kind === 'mkSingleSink' && part(m) === 'body' && boxes.get(m).min.y > 1.05) || (kind === 'bathroomVanity' && hex(m) === 'c7d7d5' && boxes.get(m).max.y > 1.0));
    if (taps.length) {
      const main = taps.slice().sort((a, b) => boxes.get(b).getSize(V()).y - boxes.get(a).getSize(V()).y)[0], tb = boxes.get(main);
      const basin = meshes.find(m => part(m) === 'sink-basin-bottom') ?? meshes.filter(m => hex(m) === 'fff2dc' && boxes.get(m).getSize(V()).y > .1).sort((a, b) => boxes.get(b).max.y - boxes.get(a).max.y)[0];
      const bb = basin ? boxes.get(basin) : tb, bc = bb.getCenter(V()), bottom = part(basin ?? main) === 'sink-basin-bottom' ? bb.max.y : bb.min.y + .035;
      const tip = new THREE.Vector3(THREE.MathUtils.clamp(bc.x, tb.min.x, tb.max.x), tb.max.y - .07, THREE.MathUtils.clamp(bc.z, tb.min.z, tb.max.z));
      tip.x += Math.sign(bc.x - tip.x) * .015; tip.z += Math.sign(bc.z - tip.z) * .015;
      const h = tip.y - bottom, waterMat = new THREE.MeshStandardMaterial({ color: '#cdeaf6', emissive: '#8fcde6', emissiveIntensity: .25, roughness: .05, transparent: true, opacity: .72 });
      const stream = new THREE.Mesh(new THREE.CylinderGeometry(.009, .013, h, 12, 1, true), waterMat); stream.position.set(tip.x, bottom + h / 2, tip.z); stream.visible = false; addTo(fp, stream);
      const ripple = new THREE.Mesh(new THREE.RingGeometry(.02, .05, 24), new THREE.MeshStandardMaterial({ color: '#e6f6fb', transparent: true, opacity: .6, roughness: .1 })); ripple.rotation.x = -Math.PI / 2; ripple.position.set(tip.x, bottom + .004, tip.z); ripple.visible = false; addTo(fp, ripple);
      reg({ label() { return this.on ? '关水龙头' : '开水龙头'; }, on: false, stream, ripple,
        toggle() { this.on = !this.on; sfx('click'); sfx('water', this.on, this); stream.visible = ripple.visible = this.on; if (this.on) anims.add(this); else anims.delete(this); dirty = true; },
        loop() { stream.scale.x = stream.scale.z = 1 + .12 * Math.sin(clock * 47); const k = (clock * 1.6) % 1; ripple.scale.setScalar(.6 + k * 1.4); ripple.material.opacity = .6 * (1 - k); } }, taps);
      for (const t of taps) used.add(t);
    }
    // Hob: each control knob lights the burner nearest to it.
    const knobs = meshes.filter(m => part(m) === 'control-knob'), rings = meshes.filter(m => part(m) === 'burner-ring');
    for (const k of knobs) {
      const kc = boxes.get(k).getCenter(V()), ring = rings.slice().sort((a, b) => Math.abs(boxes.get(a).getCenter(V())[lat] - kc[lat]) - Math.abs(boxes.get(b).getCenter(V())[lat] - kc[lat]))[0]; if (!ring) continue;
      rings.splice(rings.indexOf(ring), 1); const rb = boxes.get(ring), rc = rb.getCenter(V());
      const flame = new THREE.Group(), fm = new THREE.MeshStandardMaterial({ color: '#7fb6ff', emissive: '#3d7dff', emissiveIntensity: 2.2, transparent: true, opacity: .85 });
      for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, c = new THREE.Mesh(new THREE.ConeGeometry(.009, .045, 6), fm); c.position.set(Math.cos(a) * .085, .02, Math.sin(a) * .085); flame.add(c); }
      flame.position.set(rc.x, rb.max.y, rc.z); flame.visible = false; addTo(fp, flame);
      const glow = new THREE.PointLight('#6f9dff', 0, 1.2, 2); glow.position.set(rc.x, rb.max.y + .08, rc.z); scene.add(glow);
      reg({ label() { return this.on ? '关火' : '点火'; }, on: false, toggle() { this.on = !this.on; sfx('click'); sfx('gas', this.on, this); flame.visible = this.on; glow.intensity = this.on ? .2 : 0; k.rotation[ax] += this.on ? .9 : -.9; if (this.on) anims.add(this); else anims.delete(this); dirty = true; },
        loop() { flame.children.forEach((c, i) => { c.scale.y = .8 + .35 * Math.abs(Math.sin(clock * 13 + i * 1.7)); }); } }, [k, ring]);
      used.add(k);
    }
    // Drawers and cabinet doors: start from each handle on the front face, find the panel it sits on.
    const handles = meshes.filter(m => { if (used.has(m)) return false; const b = boxes.get(m), s = b.getSize(V()); return m.userData?.paintable === false && part(m) !== 'control-knob' && Math.max(s.x, s.y, s.z) < .4 && fc(b) > ext - .09; });
    for (const hm of handles) {
      const hb = boxes.get(hm), hc = hb.getCenter(V());
      const inRect = (b, p, tol = .01) => p[lat] > b.min[lat] - tol && p[lat] < b.max[lat] + tol && p.y > b.min.y - tol && p.y < b.max.y + tol;
      const cands = meshes.filter(m => m !== hm && !used.has(m) && m.userData?.paintable !== false && !m.userData?.supportTop && inRect(boxes.get(m), hc) && fc(boxes.get(m)) <= fc(hb) + .01 && fc(boxes.get(m)) >= fc(hb) - .12 && boxes.get(m).getSize(V())[lat] > .2);
      const vol = b => { const s = b.getSize(V()); return s.x * s.y * s.z; }, named = m => /drawer-front|cabinet-door/.test(part(m)) ? 0 : 1;
      const panel = cands.sort((a, b) => named(a) - named(b) || vol(boxes.get(a)) - vol(boxes.get(b)))[0]; if (!panel) continue;
      const pb = boxes.get(panel), ps = pb.getSize(V()), door = part(panel) === 'cabinet-door' || ps.y > .45;
      const parts = [panel, ...meshes.filter(m => m !== panel && !used.has(m) && (m === hm || (inRect(pb, boxes.get(m).getCenter(V()), .005) && cen(boxes.get(m)) >= cen(pb) - .005 && boxes.get(m).getSize(V())[lat] < ps[lat] + .01 && !m.userData?.supportTop && m.userData?.part !== 'control-knob' && fc(boxes.get(m)) <= fc(pb) + .05)))];
      for (const p of parts) used.add(p);
      if (door) {
        const outer = (pb.min[lat] + pb.max[lat]) / 2 < (gb.min[lat] + gb.max[lat]) / 2 ? pb.min[lat] : pb.max[lat], other = outer === pb.min[lat] ? pb.max[lat] : pb.min[lat];
        const hinge = V(); hinge[lat] = outer; hinge[ax] = sgn > 0 ? pb.max[ax] : pb.min[ax]; hinge.y = 0;
        const pivotD = new THREE.Object3D(); pivotD.position.copy(hinge); scene.add(pivotD); scene.updateMatrixWorld(true); for (const p of parts) pivotD.attach(p); fp.attach(pivotD);
        const L = V(); L[lat] = other - outer; const rot = L.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 1), s = rot.dot(F) > 0 ? 1 : -1, r0 = pivotD.rotation.y;
        reg({ label() { return (this.t ?? 0) > .5 ? '关上柜门' : '打开柜门'; }, t: 0, toggle() { sfx('slide'); tweenItem(this, (this.t ?? 0) > .5 ? 0 : 1, 650); }, apply(u) { pivotD.rotation.y = r0 + s * 1.75 * u; } }, parts);
      } else {
        const mover = new THREE.Group(); scene.add(mover); scene.updateMatrixWorld(true); for (const p of parts) mover.attach(p);
        const depthG = gb.getSize(V())[ax], thin = ps[ax] < .1, dist = Math.min(.32, depthG * .6);
        if (thin) { // the game draws only the drawer front; give it a box so pulling it reveals a real drawer
          const mat = new THREE.MeshStandardMaterial({ color: '#e7d2ae', roughness: .8 }), w = ps[lat] - .05, hh = ps.y - .05, d = Math.min(.34, depthG - .12), back = sgn > 0 ? pb.min[ax] : pb.max[ax], y0 = pb.min.y + .025;
          const slab = (sl, sh, sd, ol, oy, od) => { const size = V(); size[lat] = sl; size.y = sh; size[ax] = sd; const m = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat); const pos = V(); pos[lat] = (pb.min[lat] + pb.max[lat]) / 2 + ol; pos.y = oy; pos[ax] = back - sgn * od; m.position.copy(pos); m.castShadow = m.receiveShadow = true; scene.add(m); mover.attach(m); return m; };
          slab(w, .012, d, 0, y0 + .006, d / 2); slab(.012, hh, d, -w / 2, y0 + hh / 2, d / 2); slab(.012, hh, d, w / 2, y0 + hh / 2, d / 2); slab(w, hh, .012, 0, y0 + hh / 2, d - .006);
        }
        fp.attach(mover); const p0 = mover.position.clone(), dl = toLocalDir(F).multiplyScalar(dist);
        reg({ label() { return (this.t ?? 0) > .5 ? '关上抽屉' : '拉开抽屉'; }, t: 0, toggle() { sfx('slide'); tweenItem(this, (this.t ?? 0) > .5 ? 0 : 1, 450); }, apply(u) { mover.position.copy(p0).addScaledVector(dl, u); } }, parts);
      }
    }
  }
  // Ceiling lamps: click the lamp itself to switch that room's light.
  for (const l of lamps) { l.on = true; reg({ label() { return l.on ? '关灯' : '开灯'; }, toggle() { l.on = !l.on; sfx('click'); keyRoom = undefined; updateLamps(); } }, [l.disc]); }
}
function spiralTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128); g.strokeStyle = 'rgba(120,170,190,.45)'; g.lineWidth = 3;
  for (let k = 0; k < 3; k++) { g.beginPath(); for (let i = 0; i < 80; i++) { const a = i / 80 * Math.PI * 3 + k * 2.1, r = i / 80 * 60; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function stepInteract(dt) {
  clock += dt; if (!anims.size) return false;
  for (const it of [...anims]) {
    if (it.loop) { it.loop(); continue; }
    const u = Math.min(1, (performance.now() - it.t0) / it.ms), e = u * u * (3 - 2 * u);
    if (it.to === 1 && it.from === 0 && it.label() === '冲水') { it.apply(u); if (u >= 1) { it.apply(0); anims.delete(it); } continue; }
    it.t = it.from + (it.to - it.from) * e; it.apply(it.t); if (u >= 1) anims.delete(it);
  }
  return true;
}
function pickItem(e) {
  pointer(e); const targets = [...interior.filter(g => g?.visible), ...lamps.map(l => l.disc).filter(d => d.visible)];
  const hit = ray.intersectObjects(targets, true).find(h => isVisible(h.object) && h.object.material?.visible !== false);
  if (!hit || hit.distance > 6) return null;
  for (let o = hit.object; o; o = o.parent) if (byMesh.has(o)) return byMesh.get(o);
  return null;
}
function setHoverItem(it, e) {
  if (it !== hoverItem) {
    for (const m of hoverItem?.meshes ?? []) if (m.material?.emissive && !(hoverItem.lit && m.material.emissiveIntensity > .5)) { m.material.emissive.copy(m.userData._em ?? new THREE.Color(0)); }
    hoverItem = it;
    for (const m of it?.meshes ?? []) if (m.material?.emissive && !(it.lit && m.material.emissiveIntensity > .5) && !lamps.some(l => l.disc === m)) { m.userData._em = m.material.emissive.clone(); m.material.emissive.set('#3b2a14'); }
    renderer.domElement.style.cursor = it ? 'pointer' : ''; dirty = true;
  }
  const tip = $('door-tip'); tip.hidden = !it; if (it && e) { tip.textContent = it.label(); tip.style.left = e.clientX + 14 + 'px'; tip.style.top = e.clientY + 14 + 'px'; }
}
$('exit').addEventListener('click', () => exitHouse());
window.__roam = { camera, controls, mark: () => { dirty = true; }, get scene() { return scene; }, walls, enterHouse, exitHouse, get state() { return state; }, get door() { return doorInfo; }, get pivot() { return pivot; }, get view() { return view; }, setLook(y, p) { yaw = y; pitch = p; dirty = true; }, debugShow: v => show(v), items, refresh: () => { show(isInside(camera.position) ? 'in' : 'ext+in'); updateLamps(); dirty = true; } };
load().catch(err => { status('载入失败：' + err.message); console.error(err); });
