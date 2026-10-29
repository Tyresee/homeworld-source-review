import { createModularKitchenProduct, isModularKitchenProduct } from './home-modular-kitchen-models.js';
import { createRoomyFurniture, isRoomyFurniture } from './home-roomy-furniture-models.js';
import { createLivingProduct, isLivingProduct } from './home-living-models.js';
import { createHouseholdProduct, isHouseholdProduct } from './home-household-models.js';
import { createPlayProduct, isPlayProduct } from './home-play-models.js';
import { createBathDailyProduct, isBathDailyProduct } from './home-bath-daily-models.js';
import { createUtilityDailyProduct, isUtilityDailyProduct } from './home-utility-daily-models.js';
import { createKitchenDailyProduct, isKitchenDailyProduct } from './home-kitchen-daily-models.js';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EXTRA_ITEM_DIMENSIONS } from './home-shop-catalog.js';
import { createDecorItem, isDecorItem } from './home-decor-models.js';
import { createRetailFurniture, isRetailFurniture } from './home-furniture-models.js';
import {createInteractiveProduct,isInteractiveProduct} from './home-interactive-models.js';

export const LUXURY_ITEM_DIMENSIONS = Object.freeze({
  ...EXTRA_ITEM_DIMENSIONS,
  // The sofa uses a real, broad two-seat footprint. Every upgrade keeps the
  // same generous envelope; higher tiers change the outline and finish rather
  // than becoming a taller, narrower object.
  sofa: Object.freeze({ width: 1.93, depth: 1.05, height: 1.22 }),
  bed: Object.freeze({ width: 1.55, depth: 1.50, height: 1.15 }),
  cabinet: Object.freeze({ width: 1.35, depth: .55, height: 1.20 }),
  bookcase: Object.freeze({ width: 1.35, depth: .55, height: 1.50 }),
  rug: Object.freeze({ width: 1.90, depth: 1.35, height: .070 }),
  plant: Object.freeze({ width: .75, depth: .75, height: 1.15 }),
  chandelier: Object.freeze({ width: 1.10, depth: 1.10, height: 1.10 }),
  statue: Object.freeze({ width: .78, depth: .72, height: 1.25 }),
  vase: Object.freeze({ width: .34, depth: .34, height: .62, radius: .17 }),
  lamp: Object.freeze({ width: .36, depth: .36, height: .60, radius: .18 }),
  candelabra: Object.freeze({ width: .38, depth: .38, height: .68, radius: .19 }),
  gem: Object.freeze({ width: .40, depth: .40, height: .65, radius: .20 }),
  musicbox: Object.freeze({ width: .46, depth: .46, height: .60, radius: .23 }),
});

const GOLD = '#cba360';
const CREAM = '#f7ecd6';
const WALNUT = '#74523d';
const CRYSTAL = '#c9e2de';
const BOOK_COLORS = ['#809b87', '#cb9280', '#d7b16f', '#a0b6bd', '#a294ad'];

/** Each mesh owns its geometry and material; supplied maps remain immutable. */
export function createLuxuryItem({ kind, color = CREAM, material = 'ceramic', level = 1, plans, maps = {} } = {}) {
  const name = String(kind || '').replace(/^(furniture|props?):/, '');
  if(isInteractiveProduct(name))return createInteractiveProduct({kind:name,color,material,maps});
  if (isModularKitchenProduct(name)) return createModularKitchenProduct({kind:name,color,material,maps});
  if (isRoomyFurniture(name)) return createRoomyFurniture({kind:name,color,material,maps});
  if (isBathDailyProduct(name)) return createBathDailyProduct({ kind: name, color, material, maps });
  if (isUtilityDailyProduct(name)) return createUtilityDailyProduct({ kind: name, color, material, maps });
  if (isKitchenDailyProduct(name)) return createKitchenDailyProduct({ kind: name, color, material, maps });
  if (isHouseholdProduct(name)) return createHouseholdProduct({ kind: name, color, material, maps });
  if (isPlayProduct(name)) return createPlayProduct({ kind: name, color, material, maps });
  if (isLivingProduct(name)) return createLivingProduct({ kind: name, color, material, maps });
  if (isRetailFurniture(name)) return createRetailFurniture({ kind: name, color, material, maps });
  if (isDecorItem(name)) return createDecorItem({ kind: name, color, material, maps });
  if (!LUXURY_ITEM_DIMENSIONS[name]) throw new RangeError(`Unknown luxury item: ${kind}`);
  const normalize = value => Math.max(1, Math.min(3, Math.round(Number(value) || 1)));
  const planRank = (value, fallback) => {
    if (typeof value === 'string') {
      const named = { plain: 1, ceramic: 1, smooth: 1, wool: 2, woven: 2, ornate: 3, 'ornate-wool': 3, luxury: 3 };
      return named[value.toLowerCase()] ?? normalize(value);
    }
    return normalize(value ?? fallback);
  };
  const levels = {
    structure: planRank(plans?.structure, level),
    material: planRank(plans?.material, material === 'wool' ? 2 : 1),
    decor: planRank(plans?.decor, level),
    detail: planRank(plans?.detail, level),
  };
  const tier = levels.structure, materialLevel = levels.material, decor = levels.decor, detail = levels.detail;
  const group = new THREE.Group();
  group.name = `luxury-${name}-level-${tier}`;
  group.userData.kind = name;
  group.userData.level = tier;
  group.userData.plans = { ...levels };
  group.userData.materialLevel = materialLevel;
  group.userData.materialVariant = typeof material === 'string' ? material : 'ceramic';
  group.userData.dimensions = { ...LUXURY_ITEM_DIMENSIONS[name] };
  group.userData.origin = 'bottom';
  const bodyColor = new THREE.Color(color);
  const tint = (amount = .15) => bodyColor.clone().lerp(new THREE.Color(CREAM), amount);

  function add(geometry, position, options = {}) {
    const paintable = options.paintable ?? true;
    const finish = options.finish ?? material;
    const supplied = options.color != null ? new THREE.Color(options.color) : bodyColor.clone();
    // Material rank repaints the player's own surfaces. Rank 2 darkens them,
    // rank 3 shifts them toward that finish, so two gold ranks still differ.
    let surface = supplied;
    if (paintable && supplied.getHex() === bodyColor.getHex() && materialLevel === 2) surface = supplied.clone().multiplyScalar(.38);
    if (paintable && supplied.getHex() === bodyColor.getHex() && materialLevel >= 3) {
      const target = finish === 'gold' ? '#e7c56a' : finish === 'marble' ? '#f4f1ea' : finish === 'walnut' || finish === 'oak' ? '#8a5a32'
        : finish === 'velvet' ? '#6d3d55' : finish === 'linen' || finish === 'wool' ? '#efe2c4' : finish === 'stone' ? '#b7b1a6' : '#f6e7c4';
      surface = supplied.clone().lerp(new THREE.Color(target), .84);
    }
    const metalness = finish === 'gold' ? .65 : 0;
    const baseRoughness = finish === 'gold' ? .30 : finish === 'marble' ? .35 : finish === 'ceramic' ? .42 : .68;
    // The material dimension changes the highlight response even when the
    // selected material remains ceramic. It never swaps the user's color.
    const roughness = Math.max(.18, baseRoughness * (materialLevel >= 3 ? .58 : materialLevel === 2 ? .80 : 1));
    const materialMetalness = options.metalness ?? (finish === 'gold' ? .65 : materialLevel >= 3 && finish === 'ceramic' ? .08 : metalness);
    // Physical ceramic/wood at ranks 2–3 gets a controlled clear coat so the
    // material card is immediately visible under the room light. This changes
    // highlight response only; the supplied color and texture stay intact.
    const MaterialClass = options.cloth || materialLevel >= 2 ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    const m = new MaterialClass({
      color: surface,
      metalness: materialMetalness,
      roughness: options.roughness ?? roughness,
      ...(materialLevel >= 2 ? {
        clearcoat: materialLevel >= 3 ? .34 : .12,
        clearcoatRoughness: materialLevel >= 3 ? .13 : .27,
      } : {}),
      map: options.map === false ? null : options.map ?? (paintable ? maps[finish] || null : null),
      ...(options.cloth ? { clearcoat: 0, sheen: options.sheen ?? .3, sheenColor: options.color ?? bodyColor, sheenRoughness: .7, bumpMap: options.map || null, bumpScale: .004 } : {}),
      ...(options.glass ? { transparent: true, opacity: .84, metalness: .10, roughness: .16 } : {}),
      ...(options.emissive ? { emissive: options.emissive, emissiveIntensity: .18 } : {}),
    });
    const mesh = new THREE.Mesh(geometry, m);
    mesh.position.set(...position);
    mesh.castShadow = !options.glass;
    mesh.receiveShadow = true;
    mesh.userData.paintable = paintable;
    mesh.userData.part = options.part || (paintable ? 'body' : 'ornament');
    if(options.emissive)mesh.userData.objectPart='lamp-emitter';
    mesh.userData.upgradeDimension = options.dimension || (paintable ? 'structure' : 'decor');
    group.add(mesh);
    return mesh;
  }
  function box(size, position, options = {}) {
    const r = Math.min(options.radius ?? .035, Math.min(...size) * .45);
    return add(new RoundedBoxGeometry(...size, 3, r), position, options);
  }
  function ball(position, scale, options = {}) {
    const mesh = add(new THREE.SphereGeometry(1, 16, 12), position, options);
    mesh.scale.set(...scale);
    return mesh;
  }
  function cylinder(top, bottom, height, position, options = {}) {
    return add(new THREE.CylinderGeometry(top, bottom, height, 20), position, options);
  }
  function ring(radius, thickness, position, options = {}) {
    const mesh = add(new THREE.TorusGeometry(radius, thickness, 8, 32), position, options);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }
  function link(a, b, radius, options = {}) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
    const direction = to.clone().sub(from);
    const mesh = cylinder(radius, radius, direction.length(), from.clone().add(to).multiplyScalar(.5).toArray(), options);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return mesh;
  }
  function curve(points, radius, options = {}) {
    const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    return add(new THREE.TubeGeometry(path, 18, radius, 6, false), [0, 0, 0], options);
  }
  function jewel(position, scale, color = CRYSTAL) {
    const mesh = add(new THREE.OctahedronGeometry(1, 0), position, { color, paintable: false, glass: true, finish: 'ceramic', map: false });
    mesh.scale.set(...scale);
    return mesh;
  }
  const gold = { color: GOLD, paintable: false, finish: 'gold', map: false, dimension: 'decor' };
  const cream = { color: CREAM, paintable: false, finish: 'ceramic', map: false, roughness: .65 };
  const wood = { color: WALNUT, paintable: false, finish: 'walnut', map: maps.walnut || maps.oak || null };
  function frame(width, height, at, thickness = .016, options = gold) {
    const [x, y, z] = at;
    box([width, thickness, thickness], [x, y - height / 2, z], options);
    box([width, thickness, thickness], [x, y + height / 2, z], options);
    box([thickness, height, thickness], [x - width / 2, y, z], options);
    box([thickness, height, thickness], [x + width / 2, y, z], options);
  }
  function flower(at, radius = .05, petals = 5) {
    for (let i = 0; i < petals; i++) {
      const a = i * Math.PI * 2 / petals;
      ball([at[0] + Math.cos(a) * radius * .55, at[1], at[2] + Math.sin(a) * radius * .55], [radius * .50, radius * .22, radius * .50], cream);
    }
    ball([at[0], at[1] + radius * .12, at[2]], [radius * .25, radius * .25, radius * .25], gold);
  }

  function sofa() {
    // Structure, cloth and joinery remain independent. Fabric covers the
    // actual upholstery surfaces, including the curved back and arm rolls.
    const fabricName = ['cotton', 'linen', 'velvet'][materialLevel - 1];
    const fabricMap = maps[`sofa-${fabricName}`] || null;
    const upholstery = materialLevel === 3
      ? bodyColor.clone().multiplyScalar(.34)
      : materialLevel === 2
        ? bodyColor.clone().multiplyScalar(.76)
        : bodyColor.clone().lerp(new THREE.Color(CREAM), .34);
    const frameColor = upholstery.clone().multiplyScalar(.78);
    const fabricOptions = {
      cloth: true, map: fabricMap || false, finish: fabricName,
      color: upholstery, roughness: materialLevel === 3 ? .66 : .92,
      sheen: materialLevel === 3 ? .85 : .22,
      dimension: 'structure', part: 'upholstery',
    };
    // World-scale UVs keep the fabric pattern the same size on a seat,
    // narrow arm and extruded back, rather than stretching one image per box.
    const dress = mesh => {
      const geometry = mesh.geometry, p = geometry.attributes.position, n = geometry.attributes.normal;
      const uv = geometry.attributes.uv, repeat = .66;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) + mesh.position.x, y = p.getY(i) + mesh.position.y, z = p.getZ(i) + mesh.position.z;
        const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
        uv.setXY(i, (nx > nz && nx > ny ? z : x) / repeat, (ny > nx && ny > nz ? z : y) / repeat);
      }
      uv.needsUpdate = true;
      return mesh;
    };
    const cushion = (size, position) => { const mesh = dress(box(size, position, { ...fabricOptions, radius: .10 })); mesh.userData.seatCushion = size[2] > .30; return mesh; };
    const panel = (size, position) => dress(box(size, position, { ...fabricOptions, color: frameColor, radius: .10 }));
    const footFinish = { color: WALNUT, paintable: false, finish: 'walnut', map: false, dimension: 'structure' };
    const foot = () => {}; // The independently replaceable base supplies the feet.
    const rollPaths = [
      [[-.82, .38, .10], [-.94, .50, -.05], [-.88, .64, -.25]],
      [[.82, .38, .10], [.94, .50, -.05], [.88, .64, -.25]],
    ];
    const backShape = new THREE.Shape();
    // A low, wide sweep reads as a normal sofa from the fixed isometric view.
    // The old tall arch made every tier look like a narrow throne.
    backShape.moveTo(-.94, 0); backShape.lineTo(.94, 0); backShape.lineTo(.94, .27);
    backShape.quadraticCurveTo(.92, .46, .74, .53);
    backShape.quadraticCurveTo(0, .70, -.74, .53);
    backShape.quadraticCurveTo(-.92, .46, -.94, .27); backShape.closePath();

    if (tier === 1) {
      for (const x of [-.84, .84]) for (const z of [-.34, .34]) foot(x, z);
      panel([1.92, .10, .90], [0, .29, .02]);
      for (const x of [-.46, .46]) cushion([.88, .24, .66], [x, .36, .08]);
      panel([1.84, .34, .18], [0, .60, -.32]);
      for (const x of [-.46, .46]) cushion([.86, .27, .17], [x, .64, -.19]);
      for (const x of [-.89, .89]) panel([.18, .42, .88], [x, .38, .01]);
    } else if (tier === 2) {
      for (const x of [-.85, .85]) for (const z of [-.36, .36]) foot(x, z, 1.05);
      panel([1.94, .10, .94], [0, .29, .02]);
      for (const x of [-.47, .47]) cushion([.90, .26, .68], [x, .38, .08]);
      panel([1.86, .54, .20], [0, .65, -.31]);
      for (const x of [-.47, .47]) cushion([.89, .36, .16], [x, .70, -.17]);
      for (const x of [-.88, .88]) {
        const wing = panel([.19, .55, .88], [x, .47, .01]);
        wing.rotation.z = x < 0 ? .09 : -.09;
      }
    } else {
      for (const x of [-.86, .86]) for (const z of [-.38, .38]) foot(x, z, 1.14);
      panel([1.94, .10, .96], [0, .29, .02]);
      for (const x of [-.60, 0, .60]) cushion([.60, .25, .68], [x, .38, .08]);
      const geometry = new THREE.ExtrudeGeometry(backShape, {
        depth: .20, bevelEnabled: true, bevelThickness: .055, bevelSize: .045,
        bevelSegments: 3, curveSegments: 24,
      });
      geometry.translate(0, 0, -.10);
      dress(add(geometry, [0, .34, -.40], fabricOptions));
      // Broad, padded arms: the smaller tube radius keeps the full sofa inside
      // the shared collision cube while the low sweep carries the width.
      for (const points of rollPaths) dress(curve(points, .065, { ...fabricOptions, color: frameColor }));
    }

    // The two decorative joins attach to the manufactured perimeter. Nothing
    // floats above the cushions: D2 is cream piping + wood, D3 a wide gilt frame.
    const joint = {
      color: decor === 3 ? '#bd862f' : CREAM, paintable: false,
      finish: decor === 3 ? 'gold' : 'ceramic', map: false,
      metalness: decor === 3 ? .38 : 0, roughness: decor === 3 ? .32 : .75,
      dimension: 'decor', part: 'frame',
    };
    if (decor >= 2) {
      const baseWidth = [1.92, 1.94, 1.94][tier - 1], baseDepth = [.90, .94, .96][tier - 1];
      if (tier < 3) {
        const top = tier === 1 ? .765 : .915;
        const border = [[-.87,.40,-.19],[-.87,top-.055,-.19],[-.80,top,-.19],[.80,top,-.19],[.87,top-.055,-.19],[.87,.40,-.19]];
        curve(border, decor === 3 ? .039 : .022, joint);
        for (const sign of [-1, 1]) {
          const x = sign * .88, y = tier === 1 ? .58 : .70;
          curve([[x,.28,.416],[x,y-.035,.416],[x,y,.35],[x,y,-.26]], decor === 3 ? .034 : .020, joint);
        }
      } else {
        // Use the same sampled arch as the back so its frame follows its
        // actual silhouette, not an unrelated semicircle above the model.
        // Keep the decorative arch just inside the upholstery silhouette. A
        // centripetal spline can overshoot at the two shoulder corners.
        const points = backShape.getPoints(36).map(p => new THREE.Vector3(p.x * .92, .35 + p.y * .96, -.222));
        const path = new THREE.CatmullRomCurve3(points, true, 'centripetal');
        add(new THREE.TubeGeometry(path, 100, decor === 3 ? .041 : .024, 8, true), [0, 0, 0], joint);
        for (const points of rollPaths) curve(points.map(p => [p[0],p[1],p[2]+.116]), decor === 3 ? .031 : .019, joint);
      }
    }
    if (decor === 3) {
      const baseWidth = [1.92,1.94,1.94][tier - 1], baseDepth = [.90,.94,.96][tier - 1];
      // A compact, continuous leaf crest is part of the frame, never a studded
      // backrest or an object placed on the seating area.
      const crest = new THREE.Shape();
      crest.moveTo(-.17,0); crest.bezierCurveTo(-.14,.10,-.055,.065,-.04,.035);
      crest.quadraticCurveTo(-.06,.105,0,.15); crest.quadraticCurveTo(.06,.105,.04,.035);
      crest.bezierCurveTo(.055,.065,.14,.10,.17,0); crest.quadraticCurveTo(0,-.022,-.17,0);
      const crestY = tier === 1 ? .77 : tier === 2 ? .92 : .95;
      add(new THREE.ExtrudeGeometry(crest,{depth:.027,bevelEnabled:true,bevelSize:.007,bevelThickness:.007,bevelSegments:2,curveSegments:10}),[0,crestY,-.218],joint);
    }
    // A full row of tassels hangs from the front rail. Rank 3 lengthens and gilds them.
    if (decor >= 2) {
      const tassel = { color: decor === 3 ? '#bd862f' : CREAM, paintable: false, map: false, finish: decor === 3 ? 'gold' : 'ceramic', dimension: 'decor', part: 'tassel' };
      const drop = decor === 3 ? .22 : .12;
      for (let i = -6; i <= 6; i++) {
        const x = i * .13;
        cylinder(.018, .012, drop, [x, .24 - drop / 2, .46], tassel);
        ball([x, .24 - drop, .46], [.034, .04, .028], tassel);
      }
    }
  }
  function bed() {

    box([1.16, .08, 1.23], [0, .32, 0], { radius: .05 });
    box([1.14, .17, 1.15], [0, .434, .04], { color: tint(.55), radius: .055, roughness: .85, map: false });
    box([1.21, .79, .12], [0, .662, -.602], { radius: .075 });
    box([1.14, .32, .11], [0, .38, .605], { radius: .055 });
    box([1.10, .055, .72], [0, .543, .21], { color: tint(.13), radius: .025, roughness: .85, map: false });
    for (const x of [-.28, .28]) box([.47, .11, .27], [x, .564, -.36], { color: tint(.72), radius: .04, roughness: .88, map: false });
    if (tier >= 2) box([1.13, .045, 1.08], [0, .505, .035], { color: tint(.58), radius: .025, roughness: .90, map: false, dimension: 'structure' });
    if (tier >= 2) {
      for (const x of [-.64, .64]) box([.09, 1.15, .09], [x, .62, -.64], { radius: .02, dimension: 'structure' });
      box([1.38, .07, .12], [0, 1.18, -.64], { radius: .02, dimension: 'structure' });
    }
    if (tier >= 3) {
      box([1.17, .055, 1.12], [0, .555, .035], { color: tint(.68), radius: .03, roughness: .92, map: false, dimension: 'structure' });
      box([1.18, .05, .10], [0, .66, .605], { radius: .022, dimension: 'structure' });
      for (const x of [-.64, .64]) box([.09, 1.28, .09], [x, .68, .64], { radius: .02, dimension: 'structure' });
      box([1.46, .08, 1.42], [0, 1.32, 0], { color: tint(.35), radius: .02, map: false, dimension: 'structure' });
    }
    if (decor >= 2) {
      box([1.08, .10, .95], [0, .52, .02], { color: '#c45b6a', paintable: false, map: false, radius: .02, dimension: 'decor' });
      frame(1.055, .65, [0, .67, -.535], .02);
      box([1.10, .022, .025], [0, .552, .61], gold);
      box([1.10, .018, .026], [0, .58, .35], gold);
      for (const x of [-.28, .28]) ball([x, .84, -.529], [.019, .019, .008], gold);
    }
    if (decor >= 3) {
      box([1.12, .85, .06], [0, 1.05, -.58], { color: '#6d4c86', paintable: false, map: false, radius: .02, dimension: 'decor' });
      for (const x of [-.52, .52]) ball([x, 1.08, -.602], [.018, .018, .018], gold);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const quilt = box([.28, .012, .18], [-.33 + i * .33, .581, -.03 + j * .22], { color: tint((i + j) % 2 ? .20 : .35), radius: .005, map: false, roughness: .92 });
        quilt.rotation.y = (i + j) % 2 ? .02 : -.02;
      }
      jewel([0, .958, -.525], [.052, .05, .012]);
      for (const x of [-.42, 0, .42]) jewel([x, .45, .666], [.027, .042, .009]);
    }


  }

  function cabinet() {
    for (const x of [-.43, .43]) for (const z of [-.17, .17]) box([.09, .12, .09], [x, .06, z], decor > 1 ? gold : wood);
    box([1.03, 1.06, .43], [0, .65, 0], { radius: .032 });
    box([1.10, .062, .51], [0, 1.222, 0], { radius: .02 });
    box([1.08, .05, .50], [0, .151, 0], { radius: .018 });
    if (tier >= 2) {
      for (const x of [-.62, .62]) box([.16, 1.28, .58], [x, .70, 0], { radius: .02, dimension: 'structure' });
      box([1.42, .14, .64], [0, 1.32, 0], { radius: .02, dimension: 'structure' });
    }
    if (tier >= 3) {
      for (const y of [.39, .91]) box([.97, .045, .035], [0, y, .235], { color: tint(.08), radius: .015, dimension: 'structure' });
      box([.98, .06, .48], [0, 1.255, 0], { radius: .026, dimension: 'structure' });
      const pediment = new THREE.Shape();
      pediment.moveTo(-.58, 0); pediment.lineTo(.58, 0); pediment.lineTo(.58, .06);
      pediment.quadraticCurveTo(0, .46, -.58, .06); pediment.closePath();
      add(new THREE.ExtrudeGeometry(pediment, { depth: .50, bevelEnabled: false, curveSegments: 12 }), [0, 1.28, -.25], { dimension: 'structure' });
    }
    if (decor >= 2) {
      box([1.08, .016, .50], [0, 1.260, 0], gold);
      for (const x of [-.51, .51]) cylinder(.022, .022, .95, [x, .68, .22], gold);
    }
    if (decor >= 3) {
      box([1.16, .20, .56], [0, 1.40, 0], gold);
      for (const x of [-.28, .28]) jewel([x, 1.56, .18], [.07, .09, .04]);
    }



  }

  function bookcase() {
    box([1.03, .08, .39], [0, .04, 0], { radius: .012 });
    box([.97, 1.45, .035], [0, .805, -.183], { radius: .016 });
    for (const x of [-.475, .475]) box([.10, 1.48, .40], [x, .78, 0], { radius: .022 });
    box([1.05, .065, .42], [0, 1.503, 0], { radius: .02 });
    if (tier >= 2) box([1.22, .08, .52], [0, 1.56, 0], { radius: .02, dimension: 'structure' });
    if (tier >= 3) {
      const crown = new THREE.Shape();
      crown.moveTo(-.62, 0); crown.lineTo(.62, 0); crown.lineTo(.5, .28); crown.lineTo(-.5, .28); crown.closePath();
      add(new THREE.ExtrudeGeometry(crown, { depth: .46, bevelEnabled: false }), [0, 1.60, -.22], { dimension: 'structure' });
    }
    const shelves = detail === 1 ? (tier === 1 ? [.12, .74, 1.36] : [.12, .53, .94, 1.36]) : detail === 2 ? [.54, .95, 1.36] : [.95, 1.36];
    for (const y of shelves) box([.94, .042, .38], [0, y, 0], { radius: .008 });
    for (let row = 0; row < shelves.length - 1; row++) {
      const count = tier === 1 ? 4 : 6;
      for (let i = 0; i < count; i++) {
        const h = .21 + (i % 3) * .035;
        const book = box([.073, h, .19], [-.31 + i * .12, shelves[row] + .025 + h / 2, .02], { color: BOOK_COLORS[(i + row) % BOOK_COLORS.length], paintable: false, radius: .007, finish: 'ceramic', map: false, roughness: .9 });
        if (detail >= 2 && i === 0) book.rotation.z = -.08;
        if (decor >= 3) box([.069, .012, .006], [-.31 + i * .12, shelves[row] + .12, .118], gold);
      }
    }
    if (decor >= 2) {
      box([1.2, decor >= 3 ? .42 : .16, .5], [0, decor >= 3 ? 1.78 : 1.64, 0], decor >= 3 ? { color: '#c45b6a', paintable: false, map: false, radius: .02, dimension: 'decor' } : gold);
      for (const x of [-.48, .48]) box([.018, 1.43, .012], [x, .79, .203], gold);
      box([1.02, .018, .41], [0, 1.548, 0], gold);
    }
    if (decor >= 3) {
      for (const x of [-.37, 0, .37]) jewel([x, 1.569, .065], [.023, .026, .025]);
      for (const y of [.13, .54, .95, 1.37]) box([.90, .012, .009], [0, y, .198], gold);
    }


  }

  function rug() {
    const wool = { roughness: .98, map: false, radius: .018 };
    const weaveA = bodyColor.clone().lerp(new THREE.Color('#80627b'), .30);
    const weaveB = bodyColor.clone().lerp(new THREE.Color('#d6a25d'), .38);
    const weaveDark = bodyColor.clone().multiplyScalar(.58);
    // Structure changes the actual pile and weaving, without changing the color.
    const thickness = [.014, .022, .028][tier - 1];
    const top = thickness + .004;
    const rugFinish = typeof material === 'string' ? material : 'ceramic';
    const rugMap = maps.wool || maps[rugFinish] || null;
    box([1.57, thickness, 1.065], [0, thickness / 2 + .002, 0], { color: bodyColor, roughness: materialLevel >= 2 ? .98 : .80, finish: rugFinish, map: rugMap, radius: .018, dimension: 'structure' });
    if (materialLevel >= 2) {
      for (let i = -7; i <= 7; i++) box([1.42, .0018, .006], [0, top + .001, i * .067], { color: weaveDark, ...wool, radius: .002, paintable: false, dimension: 'material' });
      for (let i = -9; i <= 9; i++) box([.006, .0018, .95], [i * .075, top + .002, 0], { color: weaveDark, ...wool, radius: .002, paintable: false, dimension: 'material' });
    }
    if (materialLevel >= 3) {
      box([1.15, .02, .78], [0, top + .012, 0], { color: '#efe2c4', paintable: false, map: false, radius: .02, dimension: 'material' });
      for (const z of [-.41, .41]) box([1.32, .02, .06], [0, top + .02, z], { color: '#6b3a4a', paintable: false, map: false, radius: .01, dimension: 'material' });
    }
    if (tier >= 2) {
      box([1.62, .06, .12], [0, .06, -.52], { color: '#6b3a4a', paintable: false, map: false, radius: .02, dimension: 'structure' });
      box([1.62, .06, .12], [0, .06, .52], { color: '#6b3a4a', paintable: false, map: false, radius: .02, dimension: 'structure' });
      box([.12, .06, 1.05], [-.78, .06, 0], { color: '#6b3a4a', paintable: false, map: false, radius: .02, dimension: 'structure' });
      box([.12, .06, 1.05], [.78, .06, 0], { color: '#6b3a4a', paintable: false, map: false, radius: .02, dimension: 'structure' });
    }
    if (tier >= 3) {
      for (const x of [-.78, .78]) for (const z of [-.52, .52]) {
        cylinder(.02, .02, .16, [x, .12, z], { color: '#e7c56a', paintable: false, map: false, dimension: 'structure' });
        ball([x, .22, z], [.045, .045, .03], { color: '#e7c56a', paintable: false, map: false, dimension: 'structure' });
      }
      for (let row = -4; row <= 4; row++) for (let col = -6; col <= 6; col++) {
        const tuft = ball([col * .105, top + .002, row * .10], [.023, .004, .021], { color: bodyColor, ...wool, dimension: 'structure' });
        tuft.rotation.y = (row + col) % 2 ? .18 : -.18;
      }
    }
    // Decor adds the braided edge and complex medallion pattern independently.
    if (decor >= 2) {
      box([1.7, .03, .2], [0, .05, -.5], { color: '#6b3a4a', paintable: false, map: false, radius: .02, dimension: 'decor' });
      box([1.7, .03, .2], [0, .05, .5], { color: '#6b3a4a', paintable: false, map: false, radius: .02, dimension: 'decor' });
      for (const z of [-.49, .49]) for (let i = -6; i <= 6; i++) {
        const braid = box([.103, .003, .032], [i * .112, .039, z], { color: i % 2 ? weaveA : weaveB, ...wool, radius: .009, paintable: false, dimension: 'decor' });
        braid.rotation.y = i % 2 ? .04 : -.04;
      }
      for (const x of [-.70, .70]) for (let i = -4; i <= 4; i++) box([.032, .003, .103], [x, .039, i * .108], { color: i % 2 ? weaveA : weaveB, ...wool, radius: .009, paintable: false, dimension: 'decor' });
    }
    if (decor >= 3) {
      box([.7, .02, .5], [0, .05, 0], { color: '#c45b6a', paintable: false, map: false, radius: .02, dimension: 'decor' });
      const diamond = (x, z, size, color = weaveA) => {
        const mesh = box([size, .002, size], [x, .042, z], { color, ...wool, radius: .004, paintable: false, dimension: 'decor' });
        mesh.rotation.y = Math.PI / 4;
      };
      diamond(0, 0, .43, weaveA); diamond(0, 0, .27, weaveB); diamond(0, 0, .12, weaveDark);
      for (const x of [-.53, .53]) for (const z of [-.32, .32]) diamond(x, z, .14, weaveB);
      for (const x of [-.31, .31]) for (const z of [-.40, .40]) diamond(x, z, .085, weaveDark);
      for (const z of [-.42, .42]) box([1.33, .002, .011], [0, .042, z], { color: weaveB, ...wool, radius: .003, paintable: false, dimension: 'decor' });
      for (const x of [-.65, .65]) box([.011, .002, .84], [x, .042, 0], { color: weaveB, ...wool, radius: .003, paintable: false, dimension: 'decor' });
    }
    // Detail rewards add individual wool tassels and corner knots, not a level badge.


  }

  function plant() {
    // Structure controls the silhouette and leaf density.  Decor and detail are
    // deliberately separate so a brass band or a flower bouquet does not alter
    // the chosen pot geometry.
    // The whole container is supplied by the vessel route below.
    const leafGreen = ['#7d9a68', '#91ac76', '#a9bb82'];
    const leafCount = tier === 1 ? 4 : tier === 2 ? 7 : 10;
    for (let i = 0; i < leafCount; i++) {
      const a = i * 2.17, baseY = .43 + (i % 5) * .095;
      const spread = tier === 1 ? .105 : .08 + (i % 3) * .035;
      const x = Math.cos(a) * spread, z = Math.sin(a) * spread;
      curve([[0, baseY - .04, 0], [x * .34, baseY + .015, z * .34], [x, baseY + .09, z]], .010, { color: '#688655', paintable: false, map: false, roughness: .95, dimension: 'structure' });
      const leaf = ball([x, baseY + .105, z], [.13, .075, .048], { color: leafGreen[i % leafGreen.length], paintable: false, map: false, roughness: .92, dimension: 'structure' });
      leaf.rotation.y = -a; leaf.rotation.z = .28 * (i % 2 ? -1 : 1);
    }
    curve([[0, .40, 0], [.01, .67, -.01], [-.025, .91, .01], [0, 1.03, 0]], .014, { color: '#6d895c', paintable: false, map: false, roughness: 1, dimension: 'structure' });
    ball([0, 1.034, 0], [.076, .11, .076], { color: '#9eb984', paintable: false, map: false, roughness: .92, dimension: 'structure' });
    if (decor >= 2) ball([0, 1.2, .04], [decor >= 3 ? .28 : .18, decor >= 3 ? .2 : .12, decor >= 3 ? .28 : .18], { color: decor >= 3 ? '#e07a62' : '#f1c35b', paintable: false, map: false, dimension: 'decor' });




  }

  function chandelier() {
    const arms = tier === 1 ? 3 : tier === 2 ? 4 : 6;
    cylinder(.07, .13, .23, [0, .61, 0]);
    cylinder(.024, .024, .31, [0, .87, 0], decor >= 2 ? gold : {});
    cylinder(.078, .078, .04, [0, 1.035, 0]);
    if (tier < 3) {
      link([0, .055, 0], [0, .49, 0], .008, tier === 2 ? gold : {});
      if (tier === 1) ball([0, .045, 0], [.034, .045, .034]);
      else jewel([0, .06, 0], [.03, .06, .03]);
    }
    for (let i = 0; i < arms; i++) {
      const a = i * Math.PI * 2 / arms, x = Math.cos(a) * .39, z = Math.sin(a) * .39;
      curve([[0, .57, 0], [x * .45, .32, z * .45], [x, .34, z], [x, .42, z]], .017, decor >= 2 ? gold : {});
      cylinder(.068, .088, .074, [x, .43, z]);
      ball([x, .493, z], [.049, .065, .049], { ...cream, emissive: '#f1cb84' });
      if (decor >= 2) jewel([x, .265, z], [.029, .081, .029]);
      if (decor >= 3) {
        link([x, .315, z], [x, .21, z], .005, gold);
        ball([x, .15, z], [.019, .025, .019], gold);
      }
    }
    if (decor >= 2) {
      ring(.13, .012, [0, .53, 0], gold);
      jewel([0, .36, 0], [.064, .12, .064]);
    }
    if (decor >= 3) {
      ring(.28, .012, [0, .26, 0], gold);
      jewel([0, .08, 0], [.045, .08, .045]);
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        jewel([Math.cos(a) * .26, .19, Math.sin(a) * .26], [.024, .058, .024]);
      }
    }
    if (detail >= 2) {
      ring(.075, .006, [0, 1.055, 0], { color: tint(.18), paintable: false, map: false, finish: 'ceramic', dimension: 'detail' });
      for (let i = 0; i < arms; i++) {
        const a = i * Math.PI * 2 / arms;
        jewel([Math.cos(a) * .39, .535, Math.sin(a) * .39], [.015, .023, .015], '#e8cb87');
      }
    }
    if (detail >= 3) {
      for (let i = 0; i < arms; i++) {
        const a = i * Math.PI * 2 / arms;
        link([Math.cos(a) * .39, .29, Math.sin(a) * .39], [Math.cos(a) * .39, .13, Math.sin(a) * .39], .006, { color: '#e8cb87', paintable: false, map: false, dimension: 'detail' });
      }
    }
  }

  function statue() {
    // Plush rabbit structure is independently selectable from costume decor and
    // tiny keepsake details.  Each structure tier changes silhouette subtly while
    // staying inside the fixed .68 x .62 x 1.35m envelope.
    const bodyW = tier === 1 ? .182 : tier === 2 ? .195 : .205;
    const bodyH = tier === 1 ? .265 : tier === 2 ? .285 : .305;
    const headW = tier === 1 ? .188 : .205;
    const headH = tier === 1 ? .178 : .19;
    const earH = tier === 1 ? .17 : tier === 2 ? .19 : .205;


    ball([0, .465, 0], [bodyW, bodyH, .16], { roughness: .92, map: false, dimension: 'structure' });
    ball([0, .465, .145], [.145, .19, .038], { color: tint(.38), paintable: false, roughness: .96, map: false, dimension: 'structure' });
    for (const x of [-.142, .142]) ball([x, .315, .018], [.12, .145, .125], { color: tint(.03), roughness: .94, map: false, dimension: 'structure' });
    curve([[-.17, .57, .02], [-.25, .49, .08], [-.22, .37, .11]], .047, { roughness: .94, map: false, dimension: 'structure' });
    curve([[.17, .57, .02], [.25, .49, .08], [.22, .37, .11]], .047, { roughness: .94, map: false, dimension: 'structure' });
    ball([-.22, .35, .115], [.065, .052, .057], { color: tint(.10), roughness: .94, map: false, dimension: 'structure' });
    ball([.22, .35, .115], [.065, .052, .057], { color: tint(.10), roughness: .94, map: false, dimension: 'structure' });
    ball([0, .83, .025], [headW, headH, .175], { roughness: .92, map: false, dimension: 'structure' });
    ball([-.087, .785, .152], [.097, .073, .052], { color: tint(.30), paintable: false, roughness: .96, map: false, dimension: 'detail' });
    ball([.087, .785, .152], [.097, .073, .052], { color: tint(.30), paintable: false, roughness: .96, map: false, dimension: 'detail' });
    if (tier >= 2) cylinder(.14, .18, .1, [0, 1.24, -.02], { color: '#6b3a4a', paintable: false, map: false, dimension: 'structure' });
    if (tier >= 3) {
      cylinder(.18, .18, .28, [0, 1.46, -.02], { color: '#e7c56a', paintable: false, map: false, dimension: 'structure' });
      cylinder(.26, .26, .05, [0, 1.32, -.02], { color: '#6b3a4a', paintable: false, map: false, dimension: 'structure' });
    }
    for (const x of [-.082, .082]) {
      const ear = ball([x, 1.103, -.01], [.068, earH, .063], { color: tint(.04), roughness: .92, map: false, dimension: 'structure' });
      ear.rotation.z = x < 0 ? .10 : -.10;
      const inner = ball([x, 1.105, .043], [.036, earH * .70, .017], { color: '#e4b1af', paintable: false, map: false, roughness: .96, dimension: 'detail' });
      inner.rotation.z = ear.rotation.z;
      ball([x * .70, .853, .176], [.018, .022, .014], { color: '#554139', paintable: false, map: false, roughness: .72, dimension: 'detail' });
    }
    ball([0, .805, .19], [.026, .020, .017], { color: '#bf7f86', paintable: false, map: false, roughness: .65, dimension: 'detail' });
    curve([[0, .80, .18], [0, .76, .185], [-.025, .745, .16]], .007, { color: '#8c5960', paintable: false, map: false, roughness: .74, dimension: 'detail' });
    ball([0, .49, -.145], [.085, .085, .055], { color: tint(.10), paintable: false, roughness: .96, map: false, dimension: 'detail' });
    if (decor >= 2) {
      box([.62, decor >= 3 ? .78 : .42, .12], [0, .50, -.2], { color: decor >= 3 ? '#7d3d55' : '#e7a3b0', paintable: false, map: false, radius: .04, dimension: 'decor' });
      ring(.145, .018, [0, .675, 0], { ...gold, dimension: 'decor' });
      const bowL = ball([-.058, .655, .175], [.065, .040, .018], { color: '#d78f86', paintable: false, roughness: .88, map: false, dimension: 'decor' });
      bowL.rotation.z = -.22;
      const bowR = ball([.058, .655, .175], [.065, .040, .018], { color: '#d78f86', paintable: false, roughness: .88, map: false, dimension: 'decor' });
      bowR.rotation.z = .22;
      jewel([0, .655, .195], [.025, .027, .012], '#d9b5c4');

    }
    if (decor >= 3) {
      ring(.105, .014, [0, 1.055, 0], { ...gold, dimension: 'decor' });
      for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 2 / 5;
        cylinder(.005, .018, .08, [Math.cos(a) * .086, 1.092, Math.sin(a) * .086], { ...gold, dimension: 'decor' });
        jewel([Math.cos(a) * .086, 1.137, Math.sin(a) * .086], [.014, .019, .014]);
      }
      for (const x of [-.20, .20]) jewel([x, .20, .255], [.027, .032, .012]);
      jewel([0, .753, .19], [.03, .044, .014]);
    }


  }

  function vase() {
    cylinder(.084, .084, .035, [0, .0175, 0]);
    const belly = tier === 1 ? .095 : tier === 2 ? .155 : .19;
    ball([0, .18, 0], [belly, .155, belly], { dimension: 'structure' });
    cylinder(tier >= 3 ? .058 : .052, tier >= 2 ? .078 : .072, .13, [0, .338, 0], { dimension: 'structure' });
    ring(.057, .010, [0, .401, 0]);
    link([0, .36, 0], [.036, .56, .007], .004, { color: '#839664', paintable: false, map: false });
    ball([.032, .50, .006], [.057, .024, .026], { color: '#a7b97c', paintable: false, map: false });
    flower([.036, .573, .007], .037);
    if (tier >= 3) for (const sign of [-1, 1]) curve([[sign * .07, .22, 0], [sign * .24, .28, 0], [sign * .24, .12, 0], [sign * .07, .14, 0]], .022, { dimension: 'structure' });
    if (decor >= 2) {
      box([.22, .16, .05], [0, .22, .12], { color: decor >= 3 ? '#e7c56a' : '#d78f86', paintable: false, map: false, radius: .03, dimension: 'decor' });
      ring(.077, .006, [0, .075, 0], gold); ring(.057, .006, [0, .392, 0], gold);
      link([0, .36, 0], [-.041, .49, -.024], .004, { color: '#839664', paintable: false, map: false });
      flower([-.041, .51, -.024], .035);
    }
    if (decor >= 3) {
      for (const sign of [-1, 1]) {
        curve([[sign * .06, .32, 0], [sign * .18, .36, 0], [sign * .20, .16, 0], [sign * .08, .12, 0]], .016, gold);
        ball([sign * .20, .22, 0], [.04, .05, .03], gold);
      }
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        jewel([Math.cos(a) * .096, .18, Math.sin(a) * .096], [.021, .035, .012]);
      }
      flower([.007, .62, -.021], .028);
    }
    if (detail >= 2) {
      box([.20, .14, .045], [0, .24, .11], { color: '#d78f86', paintable: false, map: false, radius: .03, dimension: 'detail' });
      ring(.088, .006, [0, .095, 0], { color: tint(.15), paintable: false, map: false, dimension: 'detail' });
      for (const x of [-.055, .055]) jewel([x, .26, .07], [.015, .021, .009], '#d8b5c5');
    }
    if (detail >= 3) {
      for (const x of [-.14, .14]) cylinder(.022, .016, .20, [x, .10, .12], { color: '#cba360', paintable: false, map: false, dimension: 'detail' });
      flower([-.045, .615, .015], .029, 6);
      for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) jewel([Math.cos(a) * .105, .19, Math.sin(a) * .105], [.013, .018, .008], '#c9e2de');
    }
  }

  function lamp() {
    cylinder(.105, .105, .043, [0, .0215, 0]);
    cylinder(.012, .018, .29, [0, .188, 0]);
    const shadeTop = tier >= 3 ? .12 : .082, shadeBottom = tier >= 3 ? .20 : tier >= 2 ? .15 : .129;
    cylinder(shadeTop, shadeBottom, tier >= 3 ? .28 : tier >= 2 ? .21 : .195, [0, tier >= 3 ? .50 : tier >= 2 ? .43 : .423, 0], { roughness: .72, map: false, dimension: 'structure' });
    ball([0, .392, 0], [.035, .047, .035], { ...cream, emissive: '#f1cb84' });
    if (decor >= 2) {
      ring(.105, .006, [0, .039, 0], gold);
      ring(.127, .006, [0, .326, 0], gold);
      ring(.082, .006, [0, .520, 0], gold);
      ball([0, .549, 0], [.014, .024, .014], gold);
    }
    if (decor >= 3) {
      jewel([0, .188, 0], [.047, .095, .047]);
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        jewel([Math.cos(a) * .097, .345, Math.sin(a) * .097], [.012, .035, .012]);
      }
      jewel([0, .586, 0], [.022, .032, .022]);
    }
    if (detail >= 2) {
      cylinder(.17, .17, .045, [0, .40, 0], { color: '#d78f86', paintable: false, map: false, dimension: 'detail' });
      ring(.11, .006, [0, .045, 0], { color: tint(.10), paintable: false, map: false, dimension: 'detail' });
      for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) jewel([Math.cos(a) * .10, .42, Math.sin(a) * .10], [.012, .018, .012], '#e8cb87');
    }
    if (detail >= 3) {
      cylinder(.22, .16, .06, [0, .55, 0], { color: '#cba360', paintable: false, map: false, dimension: 'detail' });
      for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) ball([Math.cos(a) * .11, .33, Math.sin(a) * .11], [.015, .025, .015], { color: '#d78f86', paintable: false, map: false, dimension: 'detail' });
    }
  }

  function candelabra() {
    cylinder(.065, .094, .055, [0, .0275, 0]);
    cylinder(.014, .024, .40, [0, .246, 0]);
    if (materialLevel >= 2) cylinder(.11, .11, .28, [0, .24, 0], { color: materialLevel >= 3 ? '#e7c56a' : '#4a3428', paintable: false, map: false, finish: 'ceramic', dimension: 'material' });
    const branches = tier === 1 ? [[0, 0]] : tier === 2 ? [[0, 0], [-.10, 0], [.10, 0]] : [[0, 0], [-.10, 0], [.10, 0], [0, -.10], [0, .10]];
    for (const [x, z] of branches) {
      const y = x || z ? .452 : .485;
      if (x || z) curve([[0, .26, 0], [x * .65, .31, z * .65], [x, y - .045, z], [x, y, z]], .009, gold);
      cylinder(.029, .022, .025, [x, y, z], decor > 1 ? gold : {});
      cylinder(.019, .019, .125, [x, y + .075, z], cream);
      ball([x, y + .165, z], [.013, .027, .013], { color: '#e9c17c', paintable: false, map: false, emissive: '#e3ad51' });
    }
    if (decor >= 2) { ring(.08, .007, [0, .033, 0], gold); ring(.022, .007, [0, .19, 0], gold); }
    if (decor >= 3) {
      cylinder(.26, .26, .09, [0, .10, 0], { ...gold, dimension: 'decor' });
      jewel([0, .276, 0], [.03, .060, .03]);
      for (const [x, z] of branches.slice(1)) jewel([x, .405, z], [.016, .034, .016]);
    }
    if (detail >= 2) {
      ring(.073, .006, [0, .058, 0], { color: tint(.14), paintable: false, map: false, dimension: 'detail' });
      for (const [x, z] of branches) jewel([x, .54, z], [.010, .018, .010], '#f0d18c');
    }
    if (detail >= 3) {
      for (const [x, z] of branches) ball([x, .65, z], [.020, .025, .020], { color: '#f5d68d', paintable: false, map: false, emissive: '#e4ac52', dimension: 'detail' });
    }
  }

  function gem() {
    cylinder(.102, .116, .058, [0, .029, 0]);
    cylinder(tier >= 3 ? .070 : .065, tier >= 2 ? .095 : .09, tier >= 2 ? .12 : .105, [0, tier >= 2 ? .116 : .108, 0], { dimension: 'structure' });
    jewel([0, tier >= 3 ? .42 : tier >= 2 ? .345 : .324, 0], [tier >= 3 ? .14 : .099, tier >= 3 ? .28 : tier >= 2 ? .19 : .17, tier >= 3 ? .12 : .085], '#c6dbd0');
    if (decor >= 2) {
      ring(.102, .008, [0, .058, 0], gold);
      for (const x of [-.078, .078]) link([x, .12, 0], [x * .94, .26, 0], .006, gold);
      jewel([-.108, .091, 0], [.022, .035, .021], '#d8bdb1');
      jewel([.108, .091, 0], [.022, .035, .021], '#d8bdb1');
    }
    if (decor >= 3) {
      for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 2 / 5;
        link([Math.cos(a) * .082, .13, Math.sin(a) * .082], [Math.cos(a) * .072, .47, Math.sin(a) * .072], .005, gold);
        jewel([Math.cos(a) * .075, .49, Math.sin(a) * .075], [.016, .024, .016]);
      }
      jewel([0, .56, 0], [.027, .044, .027]);
    }
    if (detail >= 2) {
      ring(.112, .007, [0, .06, 0], { color: tint(.12), paintable: false, map: false, dimension: 'detail' });
      for (const x of [-.095, .095]) ball([x, .06, .03], [.018, .018, .018], { color: '#d78f86', paintable: false, map: false, dimension: 'detail' });
    }
    if (detail >= 3) {
      for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) jewel([Math.cos(a) * .09, .22, Math.sin(a) * .09], [.016, .028, .016], '#e8cb87');
    }
  }

  function musicbox() {
    for (const x of [-.074, .074]) for (const z of [-.06, .06]) ball([x, .023, z], [.019, .023, .019], decor > 1 ? gold : {});
    box([tier === 1 ? .205 : tier === 2 ? .24 : .30, tier === 1 ? .20 : tier === 2 ? .24 : .32, tier === 3 ? .24 : .173], [0, tier === 1 ? .142 : tier === 2 ? .16 : .20, 0], { radius: .018, dimension: 'structure' });
    box([tier === 3 ? .32 : .24, .03, tier === 3 ? .26 : .19], [0, tier === 3 ? .38 : tier === 2 ? .30 : .257, 0], { radius: .01, dimension: 'structure' });
    if (tier >= 3) ball([0, .62, 0], [.05, .10, .045], { color: CREAM, paintable: false, map: false, dimension: 'structure' });
    cylinder(.047, .052, .02, [0, .28, 0], decor > 1 ? gold : {});
    cylinder(.007, .007, .05, [0, .315, 0], gold);
    ball([0, .374, .004], [.025, .048, .023], cream);
    ball([0, .421, .013], [.023, .024, .024], cream);
    if (decor >= 2) {
      frame(.173, .145, [0, .14, .095], .007);
      const lid = box([.21, .019, .125], [0, .403, -.05], { radius: .006 }); lid.rotation.x = -.65;
      const lining = box([.187, .008, .105], [0, .399, -.046], gold); lining.rotation.x = -.65;
      for (const x of [-.057, .057]) link([x, .256, -.067], [x, .379, -.097], .006, gold);
    }
    if (decor >= 3) {
      box([.34, .18, .22], [0, .50, 0], { color: '#d6bfc9', paintable: false, map: false, radius: .03, dimension: 'decor' });
      jewel([0, .493, 0], [.034, .043, .034], '#d6bfc9');
      for (const sign of [-1, 1]) {
        const wing = ball([sign * .035, .379, 0], [.035, .014, .017], gold); wing.rotation.z = sign * .32;
        jewel([sign * .08, .177, .102], [.015, .023, .008]);
      }
      for (const x of [-.071, -.035, 0, .035, .071]) ball([x, .268, .076], [.007, .007, .007], gold);
    }
    if (detail >= 2) {
      const musicNote = curve([[0, .31, .087], [.035, .35, .087], [.035, .42, .087]], .006, { color: '#d6b16c', paintable: false, map: false, dimension: 'detail' });
      musicNote.rotation.z = -.08;
      ball([.04, .42, .087], [.018, .013, .009], { color: '#d6b16c', paintable: false, map: false, dimension: 'detail' });
    }
    if (detail >= 3) {
      for (const x of [-.08, .08]) jewel([x, .30, .10], [.014, .018, .008], '#c9e2de');
      ring(.07, .006, [0, .17, .092], { color: tint(.14), paintable: false, map: false, dimension: 'detail' });
    }
  }

  // A local upgrade replaces a manufactured component. It must change a large
  // connected area or a support silhouette, rather than adding tiny particles.
  function replaceablePart() {
    const woodPart = { color: WALNUT, paintable:false, map:false, finish:'walnut', dimension:'detail', part:'replaceable-base' };
    const ivoryPart = { color: CREAM, paintable:false, map:false, roughness:.58, dimension:'detail', part:'replaceable-base' };
    const brassPart = { ...gold, dimension:'detail', part:'replaceable-base' };
    const bodyPart = { color:bodyColor, map:false, dimension:'detail', part:'replaceable-base' };
    const faceted = (top,bottom,height,position,options,sides=8) => add(new THREE.CylinderGeometry(top,bottom,height,sides),position,options);
    const archedPanel = (width,height,position,options) => {
      const shape=new THREE.Shape(), r=width/2;
      shape.moveTo(-r,0);shape.lineTo(r,0);shape.lineTo(r,height-r);
      shape.absarc(0,height-r,r,0,Math.PI,false);shape.closePath();
      return add(new THREE.ExtrudeGeometry(shape,{depth:.018,bevelEnabled:false,curveSegments:20}),position,options);
    };
    if(name==='sofa') {
      if(detail===1) {
        for(const x of [-.82,.82]) for(const z of [-.31,.31]) {
          const leg=box([.10,.24,.12],[x,.12,z],{...woodPart,radius:.018}); leg.rotation.z=x<0?.12:-.12;
        }
      } else if(detail===2) {
        // A continuous upholstered skirt replaces the four exposed legs.
        box([1.88,.245,.87],[0,.125,.02],{...ivoryPart,radius:.08});
        box([1.70,.045,.70],[0,.025,.02],{...woodPart,radius:.02});
        box([1.74,.10,.025],[0,.145,.462],{...bodyPart,radius:.035});
      } else {
        // Two separate sculpted supports and a low bridge leave a real void.
        for(const x of [-.67,.67]) {
          box([.42,.11,.84],[x,.058,.02],{...woodPart,radius:.05});
          box([.28,.22,.64],[x,.17,.02],{...ivoryPart,radius:.075});
          box([.39,.045,.79],[x,.259,.02],{...brassPart,radius:.018});
          box([.17,.13,.027],[x,.165,.357],{...brassPart,radius:.035});
        }
        box([1.0,.075,.32],[0,.245,-.12],{...woodPart,radius:.025});
      }
    } else if(name==='bed') {
      if(detail===1) {
        for(const x of [-.50,.50])for(const z of [-.51,.51])box([.11,.30,.11],[x,.15,z],{...woodPart,radius:.018});
      } else if(detail===2) {
        box([1.20,.30,1.20],[0,.15,0],{...bodyPart,radius:.065});
        for(const x of [-.295,.295]) {
          box([.54,.19,.028],[x,.16,.607],{...ivoryPart,radius:.025});
          box([.23,.03,.035],[x,.18,.635],{...woodPart,radius:.012});
        }
      } else {
        box([1.22,.095,1.26],[0,.05,0],{...woodPart,radius:.045});
        box([1.08,.15,1.09],[0,.17,0],{...ivoryPart,radius:.07});
        box([1.20,.055,1.23],[0,.275,0],{...brassPart,radius:.025});
        for(const x of [-.42,0,.42])box([.15,.13,.025],[x,.17,.56],{...woodPart,radius:.025});
      }
    } else if(name==='cabinet') {
      const front=.222;
      if(detail===1) {
        for(const x of [-.245,.245]) {
          box([.458,.90,.042],[x,.67,front],{...bodyPart,radius:.025});
          box([.045,.16,.025],[Math.sign(x)*.06,.70,.256],brassPart);
        }
      } else if(detail===2) {
        for(const y of [.37,.67,.97]) {
          box([.95,.265,.045],[0,y,front],{...woodPart,radius:.02});
          box([.87,.20,.023],[0,y,.247],{...ivoryPart,radius:.02});
          box([.31,.035,.024],[0,y+.015,.266],brassPart);
        }
      } else {
        for(const x of [-.245,.245]) {
          box([.458,.92,.045],[x,.67,front],{...woodPart,radius:.025});
          archedPanel(.355,.78,[x,.245,.25],ivoryPart);
          box([.055,.19,.025],[Math.sign(x)*.085,.65,.274],brassPart);
        }
      }
    } else if(name==='bookcase') {
      if(detail===2) for(const y of [.23,.435]) {
        box([.88,.19,.037],[0,y,.207],{...woodPart,radius:.018});
        box([.73,.135,.023],[0,y,.233],ivoryPart);
        box([.26,.028,.022],[0,y+.01,.252],brassPart);
      }
      if(detail===3)for(const x of [-.23,.23]) {
        box([.435,.79,.035],[x,.525,.207],{...woodPart,radius:.02});
        archedPanel(.34,.65,[x,.18,.23],ivoryPart);
        box([.04,.14,.022],[Math.sign(x)*.065,.47,.257],brassPart);
      }
    } else if(name==='rug') {
      const dark=bodyColor.clone().multiplyScalar(.42),edge={...ivoryPart,roughness:1,radius:.02};
      if(detail===2) {
        // A broad raised ring changes the rug silhouette from a cut rectangle
        // even when the room is viewed from the overview camera.
        for(const z of [-.455,.455])box([1.57,.014,.19],[0,.041,z],{...edge,color:dark});
        for(const x of [-.71,.71])box([.19,.014,.76],[x,.041,0],{...edge,color:dark});
        for(const z of [-.43,.43])box([1.43,.006,.034],[0,.052,z],edge);
      } else if(detail===3) {
        // The collector version replaces the straight perimeter with a
        // continuous, readable scalloped edge. The lobes are intentionally
        // large enough to survive the normal isometric overview distance.
        for(const z of [-.45,.45])box([1.55,.014,.20],[0,.041,z],edge);
        for(const x of [-.71,.71])box([.20,.014,.80],[x,.041,0],edge);
        for(const sign of [-1,1]) {
          for(let i=-6;i<=6;i++)ball([i*.114,.044,sign*.505],[.078,.008,.080],{...edge,color:dark});
          for(let i=-3;i<=3;i++)ball([sign*.755,.044,i*.12],[.078,.008,.082],{...edge,color:dark});
        }
        for(const x of [-.70,.70])for(const z of [-.44,.44])ball([x,.047,z],[.095,.009,.095],{...edge,color:dark});
      }
    } else if(name==='plant') {
      if(detail===1) {
        cylinder(.185,.145,.31,[0,.185,0],{...bodyPart,roughness:.85});
        ring(.183,.02,[0,.34,0],bodyPart);
      } else if(detail===2) {
        box([.45,.33,.45],[0,.19,0],{...woodPart,radius:.05});
        box([.48,.06,.48],[0,.35,0],{...ivoryPart,radius:.025});
        for(const x of [-.14,0,.14])box([.035,.23,.022],[x,.19,.232],ivoryPart);
      } else {
        faceted(.23,.24,.075,[0,.045,0],woodPart);
        cylinder(.075,.12,.14,[0,.13,0],brassPart);
        faceted(.235,.12,.17,[0,.275,0],ivoryPart);
        ring(.225,.022,[0,.36,0],brassPart);
      }
      cylinder(.15,.15,.016,[0,.365,0],{color:'#514634',paintable:false,map:false,dimension:'detail'});
      // Container ornament follows its actual walls instead of floating at
      // coordinates that belonged to a different pot.
      if(decor>=2)for(const sign of [-1,1])flower([sign*.12,.84,.065],.075);
      if(decor>=3)for(const at of [[.04,1.02,-.03],[-.08,.97,.07],[.14,.73,-.04]])flower(at,.07);
    } else if(name==='statue') {
      if(detail===1) {
        cylinder(.27,.29,.095,[0,.05,0],{...bodyPart,roughness:.9});
        cylinder(.25,.26,.065,[0,.125,0],ivoryPart);
      } else if(detail===2) {
        for(const x of [-.23,.23])for(const z of [-.20,.20])box([.09,.14,.09],[x,.07,z],woodPart);
        box([.60,.075,.52],[0,.145,0],{...woodPart,radius:.035});
        box([.50,.035,.43],[0,.19,0],{...bodyPart,radius:.018});
      } else {
        faceted(.29,.30,.07,[0,.035,0],woodPart);
        faceted(.23,.25,.08,[0,.105,0],ivoryPart);
        faceted(.27,.27,.035,[0,.165,0],brassPart);
        for(const x of [-.18,0,.18])box([.07,.065,.018],[x,.103,.243],brassPart);
      }
    }
    group.userData.partVariant={component:({sofa:'base',bed:'base',cabinet:'doors',bookcase:'lower-cabinet',rug:'border',plant:'vessel',statue:'pedestal'})[name],rank:detail};
  }

  ({ sofa, bed, cabinet, bookcase, rug, plant, chandelier, statue, vase, lamp, candelabra, gem, musicbox })[name]();
  replaceablePart();
  // Every model follows the same readable silhouette rule: occupy its floor
  // footprint first, then add height only where the object needs it. These
  // scales are part of the model contract, so the engine dimensions and
  // collision boxes stay in sync with what is actually visible.
  const bodyScales = {
    sofa: [.955, 1, .95],
    bed: [1.25, .86, 1.12],
    cabinet: [1.20, .93, .98],
    bookcase: [1.25, .93, 1.10],
    rug: [1.16, 1.40, 1.18],
    plant: [1.45, .98, 1.36],
    chandelier: [1.08, .88, 1.08],
    statue: [1.28, .86, 1.20],
    vase: [1.15, .90, 1.15],
    lamp: [1.28, .90, 1.28],
    candelabra: [1.42, .90, 1.42],
    gem: [1.50, .90, 1.50],
    musicbox: [1.60, .90, 1.45],
  }[name];
  if (bodyScales) group.scale.set(...bodyScales);
  group.updateMatrixWorld(true);
  // Center the actual mesh envelope on the collision origin. An asymmetric
  // handle or flower must not poke outside a nominal half-width box.
  const bounds=new THREE.Box3().setFromObject(group),center=bounds.getCenter(new THREE.Vector3());
  for(const child of group.children) {
    child.position.x-=center.x/group.scale.x;
    child.position.z-=center.z/group.scale.z;
    child.position.y-=bounds.min.y/group.scale.y;
  }
  group.updateMatrixWorld(true);
  return group;
}
