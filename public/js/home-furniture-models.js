import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RETAIL_SHOP_ITEMS } from './home-shop-catalog.js';

const SPECS = new Map(RETAIL_SHOP_ITEMS.map(spec => [spec.id, spec]));
const CREAM = '#fff2dc', WOOD = '#b58a5d', GOLD = '#d2ad67', INK = '#465557';
export const isRetailFurniture = kind => SPECS.has(kind);

/** Original toy-scale furniture. All visible parts belong to one movable item.
 * Geometry and materials are owned per instance; borrowed texture maps are not.
 * Width/depth are the same conservative envelopes consumed by placement rules. */
export function createRetailFurniture({ kind, color, material, maps = {} } = {}) {
  const spec = SPECS.get(kind);
  if (!spec) throw new RangeError(`Unknown retail furniture: ${kind}`);
  color ||= spec.defaultColor;
  material ||= spec.material;
  const group = new THREE.Group();
  group.name = `furniture-${kind}`;
  group.userData = { kind, level: 1, noUpgrade: true, origin: 'bottom', placement: 'floor',
    tier: spec.tier, family: spec.family, materialVariant: material,
    dimensions: { width: spec.width, depth: spec.depth, height: spec.height },
    ...(spec.supportSurface ? { supportSurface: { ...spec.supportSurface } } : {}) };
  const body = new THREE.Color(color), pale = body.clone().lerp(new THREE.Color(CREAM), .52);
  const shade = body.clone().multiplyScalar(.72);
  const fixed = (tone, finish = 'ceramic', extra = {}) => ({ color: tone, finish, paintable: false, ...extra });
  const cream = fixed(CREAM), wood = fixed(WOOD, 'oak'), gold = fixed(GOLD, 'gold');
  const dark = fixed(INK), bedding = fixed('#fff7e8', 'linen');
  const steel = fixed('#c7d7d5', 'gold', { roughness: .26 });

  function add(geometry, at, opts = {}) {
    const paintable = opts.paintable !== false;
    const finish = paintable ? material : opts.finish || 'ceramic';
    const cloth = ['linen', 'wool', 'velvet'].includes(finish);
    const mat = new THREE.MeshStandardMaterial({ color: opts.color ?? body,
      map: maps[finish] || null, roughness: opts.roughness ?? (cloth ? .90 : finish === 'gold' ? .28 : finish === 'marble' ? .30 : .56),
      metalness: finish === 'gold' ? .58 : 0, side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide });
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(...at); mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData = { paintable, part: opts.part || (paintable ? 'body' : 'detail'), ...(opts.supportTop ? { supportTop: true } : {}) };
    if (opts.supportTop) mesh.name = 'furniture-support-top';
    group.add(mesh); return mesh;
  }
  function box(size, at, opts = {}) {
    return add(new RoundedBoxGeometry(...size, 2, Math.min(opts.radius ?? .035, Math.min(...size) * .43)), at, opts);
  }
  function ball(at, scale, opts = {}) {
    const mesh = add(new THREE.SphereGeometry(1, 16, 10), at, opts); mesh.scale.set(...scale); return mesh;
  }
  function cylinder(top, bottom, height, at, opts = {}) {
    return add(new THREE.CylinderGeometry(top, bottom, height, 20), at, opts);
  }
  function ring(radius, tube, at, opts = {}) {
    const mesh = add(new THREE.TorusGeometry(radius, tube, 6, 28), at, opts); mesh.rotation.x = Math.PI / 2; return mesh;
  }
  function link(a, b, radius, opts = {}) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), delta = to.clone().sub(from);
    const mesh = cylinder(radius, radius, delta.length(), from.clone().add(to).multiplyScalar(.5).toArray(), opts);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return mesh;
  }
  function curve(points, radius, opts = {}) {
    return add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 16, radius, 6, false), [0, 0, 0], opts);
  }
  function silhouette(points, depth, at, opts = {}) {
    const shape = new THREE.Shape(); shape.moveTo(...points[0]);
    for (const point of points.slice(1)) shape.lineTo(...point);
    shape.closePath();
    return add(new THREE.ExtrudeGeometry(shape, { depth, steps: 1, bevelEnabled: true,
      bevelSize: .012, bevelThickness: .012, bevelSegments: 2, curveSegments: 16 }), at, opts);
  }
  function arch(width, height, depth, at, opts = {}) {
    const shape = new THREE.Shape(), r = width / 2, shoulder = height - r;
    shape.moveTo(-r, 0); shape.lineTo(r, 0); shape.lineTo(r, shoulder);
    shape.absarc(0, shoulder, r, 0, Math.PI, false); shape.lineTo(-r, 0);
    return add(new THREE.ExtrudeGeometry(shape, { depth, steps: 1, bevelEnabled: true,
      bevelSize: .018, bevelThickness: .018, bevelSegments: 2, curveSegments: 16 }), at, opts);
  }
  function feet(width, depth, height = .15, opts = wood, radius = .055) {
    for (const x of [-width / 2, width / 2]) for (const z of [-depth / 2, depth / 2])
      cylinder(radius * .9, radius, height, [x, height / 2, z], opts);
  }
  function handle(x, y, z, width = .18, opts = gold) {
    // The rear ends attach to the panel; a clear inset keeps the grip readable.
    curve([[x - width / 2, y, z], [x - width / 2, y, z + .025], [x, y, z + .035], [x + width / 2, y, z + .025], [x + width / 2, y, z]], .012, opts);
  }
  function tap(at, height = .24, reach = .14, opts = steel) {
    const [x, y, z] = at;
    cylinder(.035, .045, .025, [x, y + .0125, z], opts);
    curve([[x, y, z], [x, y + height * .72, z], [x, y + height, z + reach * .45], [x, y + height * .85, z + reach]], .019, opts);
    link([x + .015, y + height * .42, z], [x + .10, y + height * .55, z], .013, opts);
  }
  function hollowBowl(width, depth, height, at, opts = cream) {
    // Closed lathed profile includes the inner walls and bowl floor: no flat
    // dark decal pretending to be a hole, and no transparent depth surfaces.
    const profile = [[0, .018], [.30, .018], [.40, .10], [.47, .55], [.50, .92], [.49, 1], [.43, 1], [.42, .90], [.36, .24], [.29, .17], [0, .17]];
    const geometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y * height)), 32);
    const mesh = add(geometry, at, opts); mesh.scale.set(width, 1, depth); return mesh;
  }
  function bedSoftGoods(width, depth, y, pillowCount = 2) {
    box([width, .20, depth], [0, y, 0], { ...bedding, radius: .08, part: 'mattress' });
    box([width + .035, .13, depth * .67], [0, y + .12, depth * .15], { color: pale, radius: .055, part: 'duvet' });
    box([width + .045, .07, depth * .14], [0, y + .19, -depth * .11], { color: shade, radius: .026, part: 'folded-blanket' });
    for (let i = 0; i < pillowCount; i++) {
      const pillow = box([width / pillowCount * .84, .13, .35], [(i - (pillowCount - 1) / 2) * width / pillowCount, y + .17, -depth * .34], { ...bedding, radius: .06, part: 'pillow' });
      pillow.rotation.x = -.07;
    }
  }
  function cabinetShell(width, depth, bottom, top, opts = {}, supportTop = false) {
    box([width, .07, depth], [0, bottom + .035, 0], opts);
    box([width + .035, .08, depth + .035], [0, top - .04, 0], { ...opts, supportTop });
    for (const x of [-width / 2 + .035, width / 2 - .035]) box([.07, top - bottom - .12, depth], [x, (top + bottom) / 2, 0], opts);
    box([width - .12, top - bottom - .12, .035], [0, (top + bottom) / 2, -depth / 2 + .018], { color: shade, ...opts });
  }

  const builders = {
    bedTimber() {
      feet(.95, 1.70, .25, {}, .055);
      for (const x of [-.52, .52]) box([.085, .20, 1.88], [x, .30, 0]);
      box([1.06, .14, .09], [0, .30, .90]);
      for (const x of [-.51, .51]) box([.09, .86, .10], [x, .43, -.89]);
      for (const y of [.47, .65, .83]) box([1.03, .09, .075], [0, y, -.90]);
      bedSoftGoods(.98, 1.72, .43, 1);
    },
    bedUpholstered() {
      feet(1.57, 1.72, .16, wood, .075);
      box([1.88, .29, 1.99], [0, .29, 0], { radius: .11, part: 'upholstered-base' });
      box([1.72, .055, 1.82], [0, .15, 0], { color: shade, part: 'recessed-plinth' });
      const head = box([1.91, .80, .19], [0, .70, -.94], { radius: .09, part: 'broad-headboard' }); head.rotation.x = -.035;
      box([1.69, .56, .055], [0, .76, -.82], { color: pale, radius: .025, part: 'headboard-panel' });
      bedSoftGoods(1.70, 1.80, .48, 2);
    },
    bedCanopy() {
      feet(1.99, 1.90, .18, gold, .065);
      box([2.20, .23, 2.12], [0, .30, 0], { radius: .065, part: 'wide-bed-base' });
      box([2.25, .045, 2.15], [0, .21, 0], gold);
      box([2.08, .68, .15], [0, .76, -.99], { color: pale, radius: .065, part: 'wide-headboard' });
      for (const x of [-1.08, 1.08]) for (const z of [-1.02, 1.02]) {
        cylinder(.033, .047, 1.61, [x, .94, z], gold);
        ball([x, 1.78, z], [.054, .065, .054], gold);
      }
      for (const z of [-1.02, 1.02]) box([2.20, .065, .065], [0, 1.72, z], gold);
      for (const x of [-1.08, 1.08]) box([.065, .065, 2.08], [x, 1.72, 0], gold);
      // Side curtains gather near the posts instead of concealing the mattress.
      for (const x of [-1.06, 1.06]) for (const sign of [-1, 1]) {
        const curtain = silhouette([[-.19, 0], [.12, 0], [.035, .53], [.23, 1.23], [-.20, 1.23], [-.09, .53]], .035,
          [x, .46, sign * .92], { color: pale, part: 'gathered-curtain' });
        curtain.rotation.y = Math.PI / 2;
        box([.08, .045, .24], [x, .98, sign * .92], gold);
      }
      bedSoftGoods(1.99, 1.90, .49, 2);
    },
    writingDesk() {
      box([1.30, .09, .68], [0, .84, 0], { radius: .035, part: 'desktop', supportTop: true });
      for (const x of [-.52, .52]) for (const z of [-.23, .23]) link([x * 1.08, .03, z * 1.12], [x, .80, z], .044);
      box([1.05, .15, .52], [0, .73, 0], { color: shade });
      box([.86, .12, .035], [0, .73, .28], { color: pale });
      handle(0, .73, .304, .18);
    },
    studyDesk() {
      box([1.76, .10, .78], [0, .84, 0], { radius: .035, part: 'desktop', supportTop: true });
      for (const z of [-.27, .27]) box([.075, .78, .075], [-.76, .40, z], wood);
      box([.08, .06, .61], [-.76, .16, 0], wood);
      cabinetShell(.50, .64, .06, .80);
      // Move the completed cabinet to the right of the writing surface.
      for (const child of group.children.slice(4)) child.position.x += .58;
      for (let i = 0; i < 3; i++) {
        box([.40, .21, .045], [.58, .20 + i * .23, .335], { color: pale });
        handle(.58, .21 + i * .23, .36, .17);
      }
      for (const x of [-.79, .79]) box([.055, .36, .23], [x, 1.06, -.24]);
      box([1.63, .055, .25], [0, 1.23, -.24]);
      box([1.55, .10, .025], [0, .95, -.35], { color: shade });
    },
    bistroTable() {
      cylinder(.49, .49, .085, [0, .82, 0], { part: 'round-tabletop', supportTop: true });
      cylinder(.25, .31, .10, [0, .74, 0], { color: shade });
      for (let i = 0; i < 3; i++) {
        const a = Math.PI / 2 + i * Math.PI * 2 / 3;
        link([Math.cos(a) * .37, .04, Math.sin(a) * .37], [Math.cos(a) * .14, .76, Math.sin(a) * .14], .052);
      }
    },
    diningTable() {
      box([2.01, .12, 1.0], [0, .85, 0], { radius: .055, part: 'wide-tabletop', supportTop: true });
      for (const x of [-.59, .59]) {
        const leg = cylinder(.19, .26, .70, [x, .39, 0], { color: pale, part: 'sculpted-pedestal' }); leg.scale.z = 1.25;
        box([.53, .055, .68], [x, .03, 0], { color: shade, radius: .025 });
      }
      box([1.65, .055, .72], [0, .76, 0], { color: shade });
    },
    diningChair() {
      feet(.39, .42, .43, {}, .031);
      box([.52, .075, .51], [0, .43, 0], { radius: .027 });
      box([.45, .10, .44], [0, .51, .012], { ...bedding, radius: .04, part: 'seat-cushion' });
      for (const x of [-.22, .22]) link([x, .39, -.21], [x, .89, -.26], .028);
      const back = box([.52, .25, .075], [0, .82, -.25], { radius: .035, part: 'curved-chair-back' }); back.rotation.x = -.11;
      link([-.20, .22, .20], [.20, .22, .20], .022);
    },
    loungeChair() {
      feet(.66, .63, .17, wood, .06);
      box([.91, .25, .83], [0, .31, 0], { radius: .10 });
      const back = box([.95, .67, .23], [0, .65, -.32], { radius: .10, part: 'curved-back' }); back.rotation.x = -.12;
      for (const x of [-.41, .41]) box([.20, .40, .76], [x, .48, .015], { radius: .09, part: 'padded-arm' });
      box([.66, .18, .65], [0, .48, .075], { color: pale, radius: .08, part: 'seat-cushion' });
      box([.64, .36, .14], [0, .76, -.19], { color: pale, radius: .06, part: 'back-cushion' });
    },
    bedsideCabinet() {
      feet(.45, .31, .12, wood, .035);
      cabinetShell(.58, .44, .11, .62, {}, true);
      box([.49, .045, .39], [0, .35, 0]);
      box([.48, .20, .04], [0, .48, .23], { color: pale });
      handle(0, .48, .255, .15);
    },
    wideDresser() {
      feet(1.28, .40, .15, wood, .047);
      cabinetShell(1.50, .54, .14, .99, {}, true);
      for (const x of [-.36, .36]) for (let i = 0; i < 3; i++) {
        box([.68, .225, .04], [x, .30 + i * .235, .284], { color: pale, radius: .013 });
        handle(x, .30 + i * .235, .309, .19);
      }
    },
    archedWardrobe() {
      box([1.34, .16, .63], [0, .10, 0], { color: shade });
      box([1.38, .065, .67], [0, .18, 0]);
      arch(1.28, 1.68, .56, [0, .22, -.28], { radius: .03, part: 'wardrobe-body' });
      for (const x of [-.31, .31]) {
        arch(.58, 1.53, .035, [x, .25, .31], { color: pale, part: 'arched-door' });
        link([x < 0 ? -.09 : .09, .83, .372], [x < 0 ? -.09 : .09, 1.10, .372], .017, gold);
        for (const y of [.54, 1.27]) box([.024, .08, .024], [x * 1.76, y, .35], gold);
      }
    },
    kitchenSink() {
      cabinetShell(1.15, .65, .07, .84);
      for (const x of [-.265, .265]) {
        box([.50, .65, .04], [x, .43, .335], { color: pale }); handle(x, .67, .36, .16);
      }
      // Four countertop rails surround an actual basin opening.
      for (const x of [-.47, .47]) box([.25, .075, .69], [x, .86, 0], cream);
      for (const z of [-.29, .29]) box([.75, .075, .12], [0, .86, z], cream);
      hollowBowl(.71, .48, .20, [0, .70, .02], steel);
      tap([0, .90, -.26], .23, .17);
    },
    rangeCooker() {
      box([.75, .85, .64], [0, .46, 0], { radius: .055 });
      box([.68, .065, .60], [0, .905, 0], dark);
      for (const x of [-.19, .19]) {
        ring(.12, .015, [x, .945, -.015], steel);
        cylinder(.065, .065, .018, [x, .947, -.015], dark);
      }
      box([.64, .13, .03], [0, .77, .335], { color: pale });
      for (const x of [-.20, 0, .20]) { const knob = cylinder(.027, .027, .032, [x, .77, .366], steel); knob.rotation.x = Math.PI / 2; }
      box([.59, .43, .045], [0, .42, .343], steel);
      box([.48, .31, .025], [0, .41, .373], dark);
      box([.36, .016, .009], [0, .48, .390], fixed('#819999'));
      handle(0, .65, .379, .43, steel);
      box([.65, .055, .55], [0, .03, 0], dark);
    },
    retroFridge() {
      box([.77, 1.53, .68], [0, .82, 0], { radius: .07 });
      for (const [height, y] of [[.43, 1.35], [.94, .64]]) {
        box([.74, height, .075], [0, y, .365], { color: pale, radius: .035, part: 'fridge-door' });
        link([-.24, y - height * .22, .432], [-.24, y + height * .22, .432], .017, steel);
      }
      box([.65, .06, .55], [0, .045, 0], dark);
      box([.21, .035, .01], [.15, 1.45, .409], steel);
    },
    kitchenIsland() {
      box([1.80, .105, .91], [0, .88, 0], fixed('#fff0dc', 'marble', { part: 'stone-worktop', supportTop: true }));
      cabinetShell(1.53, .70, .07, .83);
      box([.07, .66, .66], [.28, .46, 0]);
      for (const x of [-.49, -.08]) {
        box([.36, .63, .045], [x, .46, .365], { color: pale }); handle(x, .68, .395, .16);
      }
      box([.40, .05, .62], [.52, .45, 0]);
      box([1.48, .055, .62], [0, .03, 0], { color: shade });
    },
    ovalBathtub() {
      for (const x of [-.55, .55]) for (const z of [-.23, .23]) ball([x, .11, z], [.11, .10, .075], gold);
      hollowBowl(1.68, .84, .57, [0, .15, 0], { part: 'hollow-tub' });
      const lip = ring(.5, .026, [0, .705, 0], cream); lip.scale.set(1.64, .81, 1);
      tap([-.65, .20, -.35], .63, .23, gold);
      const drain = cylinder(.033, .033, .006, [0, .252, 0], steel); drain.userData.part = 'drain';
    },
    bathroomVanity() {
      feet(.79, .40, .14, wood, .047);
      cabinetShell(1.00, .56, .14, .79);
      for (const y of [.32, .59]) { box([.88, .235, .045], [0, y, .295], { color: pale }); handle(0, y, .325, .30); }
      box([1.05, .075, .62], [0, .82, 0], cream);
      hollowBowl(.70, .43, .18, [0, .858, .035], cream);
      tap([0, .86, -.245], .25, .18);
    },
    compactToilet() {
      const foot = box([.34, .37, .47], [0, .205, .08], { radius: .08 }); foot.rotation.x = -.10;
      hollowBowl(.53, .68, .27, [0, .33, .05], { part: 'toilet-bowl' });
      const seat = ring(.235, .033, [0, .602, .09], cream); seat.scale.set(1, 1.32, 1);
      box([.49, .50, .22], [0, .64, -.275], { radius: .045, part: 'cistern' });
      box([.51, .045, .245], [0, .91, -.275], { color: pale });
      cylinder(.038, .038, .012, [.10, .94, -.275], steel);
    },
    toyCubby() {
      cabinetShell(1.28, .45, .04, .91);
      for (const x of [-.205, .205]) box([.045, .74, .42], [x, .48, 0]);
      box([1.20, .05, .42], [0, .48, 0]);
      for (const [x, y, tone] of [[-.413, .25, '#a6cbb6'], [.413, .25, '#a7c8e5'], [0, .67, '#eeaaa4']]) {
        box([.34, .29, .36], [x, y, .025], fixed(tone, 'linen'));
        box([.36, .04, .39], [x, y + .14, .025], fixed(tone));
        box([.09, .025, .012], [x, y + .03, .216], fixed('#758b83'));
      }
    },
    playTent() {
      box([1.24, .07, 1.18], [0, .045, 0], { color: pale, radius: .03, part: 'floor-mat' });
      for (const x of [-.62, .62]) for (const z of [-.55, .55]) link([x, .07, z], [-x * .12, 1.61, z * .53], .026, wood);
      // Two sloping roof panels and a closed rear triangle, with an open front.
      const left = box([.045, 1.46, 1.13], [-.32, .75, 0], { color: pale, radius: .01 }); left.rotation.z = -.38;
      const right = box([.045, 1.46, 1.13], [.32, .75, 0], { radius: .01 }); right.rotation.z = .38;
      silhouette([[-.59, 0], [.59, 0], [0, 1.40]], .018, [0, .08, -.56], { color: pale });
      for (const sign of [-1, 1]) {
        silhouette([[sign * .10, 1.35], [sign * .58, 0], [sign * .36, 0], [sign * .31, .55]], .026, [0, .08, .56], { color: pale, part: 'open-door-curtain' });
        box([.14, .04, .05], [sign * .36, .55, .60], gold);
      }
    },
    rockingHorse() {
      for (const z of [-.19, .19]) curve([[-.48, .16, z], [-.28, .055, z], [0, .025, z], [.28, .055, z], [.48, .16, z]], .035, { part: 'curved-rocker' });
      for (const z of [-.14, .14]) for (const x of [-.27, .24]) link([x, .10, z], [x * .75, .47, z * .70], .033);
      ball([0, .51, 0], [.34, .17, .15]);
      box([.40, .055, .32], [-.04, .65, 0], { color: shade, radius: .024, part: 'saddle' });
      silhouette([[0, 0], [.15, .02], [.18, .33], [.32, .35], [.32, .46], [.18, .52], [.07, .43], [-.04, .12]], .19, [.16, .40, -.095], { part: 'horse-head' });
      for (const z of [-.067, .067]) {
        const ear = box([.055, .13, .045], [.38, .91, z], { radius: .02 }); ear.rotation.z = -.20;
        ball([.42, .80, z > 0 ? .111 : -.111], [.015, .018, .009], dark);
      }
      link([.29, .71, -.22], [.29, .71, .22], .018, gold);
      curve([[-.30, .56, 0], [-.44, .53, 0], [-.46, .37, 0]], .028, { color: shade });
    },
    consoleTable() {
      box([1.48, .08, .40], [0, .84, 0], { radius: .025, part: 'console-top', supportTop: true });
      feet(1.26, .27, .79, {}, .027);
      box([1.35, .05, .34], [0, .19, 0], { color: pale });
      box([1.33, .19, .31], [0, .70, 0], { color: shade });
      for (const x of [-.33, .33]) {
        box([.62, .16, .035], [x, .70, .174], { color: pale }); handle(x, .70, .196, .18);
      }
    },
    daybedSofa() {
      feet(1.96, .66, .16, wood, .055);
      box([2.29, .22, .88], [0, .27, 0], { radius: .075, part: 'wide-sofa-base' });
      box([2.25, .53, .21], [0, .61, -.34], { radius: .08 });
      for (const x of [-1.08, 1.08]) box([.22, .37, .88], [x, .43, 0], { radius: .09, part: 'low-wide-arm' });
      box([1.96, .19, .72], [0, .45, .075], { color: pale, radius: .075, part: 'continuous-seat' });
      for (const x of [-.65, 0, .65]) {
        const back = box([.63, .39, .16], [x, .69, -.19], { color: pale, radius: .06, part: 'back-cushion' }); back.rotation.x = -.10;
      }
    },
  };

  builders[kind]();
  group.updateMatrixWorld(true);
  const initial = new THREE.Box3().setFromObject(group), size = initial.getSize(new THREE.Vector3());
  // Uniform fitting preserves the authored proportions; no axis stretching.
  const scale = Math.min(1, spec.width / size.x, spec.height / size.y, spec.depth / size.z);
  for (const child of group.children) { child.position.multiplyScalar(scale); child.scale.multiplyScalar(scale); }
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group), center = bounds.getCenter(new THREE.Vector3());
  for (const child of group.children) { child.position.x -= center.x; child.position.y -= bounds.min.y; child.position.z -= center.z; }
  group.updateMatrixWorld(true);
  return group;
}
