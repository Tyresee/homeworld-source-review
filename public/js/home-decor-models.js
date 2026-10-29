import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EXTRA_SHOP_BY_KIND } from './home-shop-catalog.js';

const CREAM = '#fff3dd', INK = '#4b4651', GREEN = '#72a17b', GOLD = '#dcba70';
const BOOKS = ['#da9182', '#89aaa8', '#e1bd71', '#ad9cbd'];
export const isDecorItem = kind => EXTRA_SHOP_BY_KIND.has(kind) && !EXTRA_SHOP_BY_KIND.get(kind).collection;

/** Original small, rounded furnishings; no network assets or hidden static room props. */
export function createDecorItem({ kind, color, material, maps = {} } = {}) {
  const spec = EXTRA_SHOP_BY_KIND.get(kind);
  if (!spec || spec.collection) throw new RangeError(`Unknown decor item: ${kind}`);
  color ||= spec.defaultColor;
  material ||= spec.material;
  const group = new THREE.Group();
  group.name = `decor-${kind}`;
  group.userData = { kind, origin: 'bottom', placement: spec.placement, level: 1, materialVariant: material,
    dimensions: { width: spec.width, depth: spec.depth, height: spec.height }, noUpgrade: true };
  const body = new THREE.Color(color);
  const pale = body.clone().lerp(new THREE.Color(CREAM), .5);
  const shade = body.clone().multiplyScalar(.70);
  const plain = (tone, extra = {}) => ({ color: tone, paintable: false, ...extra });
  const gold = plain(GOLD, { finish: 'gold' });
  const cream = plain(CREAM);
  const dark = plain(INK);
  const leaf = plain(GREEN, { roughness: .78 });

  function add(geometry, at, opts = {}) {
    const finish = opts.finish || (opts.paintable === false ? 'ceramic' : material);
    const cloth = ['wool', 'linen', 'velvet'].includes(finish);
    const paintable = opts.paintable !== false;
    const glass = opts.glass && finish === 'ceramic';
    const mat = new THREE.MeshStandardMaterial({
      color: opts.color ?? body,
      roughness: opts.roughness ?? (cloth ? .93 : finish === 'gold' ? .28 : finish === 'marble' ? .3 : .5),
      metalness: finish === 'gold' ? .6 : 0,
      map: paintable ? maps[finish] || null : null,
      ...(glass ? { transparent: true, opacity: .72, roughness: .13, metalness: .15, depthWrite: false } : {}),
      ...(opts.emissive ? { emissive: opts.emissive, emissiveIntensity: .22 } : {}),
    });
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(...at);
    mesh.castShadow = !glass;
    mesh.receiveShadow = true;
    mesh.userData = { paintable, part: opts.part || (paintable ? 'body' : 'detail') };
    if(opts.emissive)mesh.userData.objectPart='lamp-emitter';
    group.add(mesh);
    return mesh;
  }
  function box(size, at, opts = {}) {
    return add(new RoundedBoxGeometry(...size, 2, Math.min(opts.radius ?? .018, Math.min(...size) * .43)), at, opts);
  }
  function ball(at, scale, opts = {}) {
    const mesh = add(new THREE.SphereGeometry(1, 16, 10), at, opts);
    mesh.scale.set(...scale); return mesh;
  }
  function cylinder(top, bottom, height, at, opts = {}) {
    return add(new THREE.CylinderGeometry(top, bottom, height, 20), at, opts);
  }
  function ring(radius, tube, at, opts = {}) {
    return add(new THREE.TorusGeometry(radius, tube, 6, 28), at, opts);
  }
  function link(from, to, radius, opts = {}) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), vector = b.clone().sub(a);
    const mesh = cylinder(radius, radius, vector.length(), a.clone().add(b).multiplyScalar(.5).toArray(), opts);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize()); return mesh;
  }
  function curve(points, radius, opts = {}) {
    const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    return add(new THREE.TubeGeometry(path, 14, radius, 6, false), [0, 0, 0], opts);
  }
  function shapeMesh(shape, depth, at, opts = {}) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: opts.bevelRadius ?? .006, bevelSize: opts.bevelRadius ?? .006, bevelSegments: opts.bevelRadius ? 4 : 2, curveSegments: opts.curveSegments ?? 12 });
    return add(geo, at, opts);
  }
  function polygon(points, depth, at, opts = {}) {
    const shape = new THREE.Shape(); shape.moveTo(...points[0]);
    for (const p of points.slice(1)) shape.lineTo(...p);
    shape.closePath(); return shapeMesh(shape, depth, at, opts);
  }
  function star(at, r, depth, opts = {}) {
    return polygon(Array.from({ length: 10 }, (_, i) => {
      const a = Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? r * .46 : r;
      return [Math.cos(a) * radius, Math.sin(a) * radius];
    }), depth, at, opts);
  }
  function moon(at, size, depth, opts = {}) {
    const shape = new THREE.Shape();
    shape.moveTo(.34 * size, .46 * size);
    shape.bezierCurveTo(-.45 * size, .65 * size, -.70 * size, -.46 * size, .05 * size, -.52 * size);
    shape.bezierCurveTo(.32 * size, -.55 * size, .50 * size, -.36 * size, .47 * size, -.30 * size);
    shape.bezierCurveTo(-.11 * size, -.40 * size, -.22 * size, .25 * size, .34 * size, .46 * size);
    shape.closePath(); return shapeMesh(shape, depth, at, { curveSegments: 28, bevelRadius: .010, ...opts });
  }
  function face(x, y, z, width = .10, expression = 'happy') {
    for (const sign of [-1, 1]) {
      if (expression === 'sleepy') {
        curve([[x + sign * width / 2 - .015, y + .005, z], [x + sign * width / 2, y - .005, z + .003], [x + sign * width / 2 + .015, y + .005, z]], .006, dark);
      } else ball([x + sign * width / 2, y, z], [.010, .014, .006], dark);
      ball([x + sign * width * .75, y - .026, z - .002], [.021, .010, .005], plain('#edaa9b'));
    }
    curve([[x - .021, y - .035, z], [x, y - .046, z + .002], [x + .021, y - .035, z]], .005, dark);
  }
  function book(x, y, z, width, height, depth, tone) {
    box([width, height, depth], [x, y + height / 2, z], plain(tone));
    box([width * .68, height * .84, .006], [x, y + height / 2, z + depth / 2 + .003], cream);
    box([width * .7, .012, depth + .003], [x, y + height * .82, z], gold);
  }
  function blossom(at, radius, tone) {
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      ball([at[0] + Math.cos(a) * radius * .65, at[1] + Math.sin(a) * radius * .65, at[2]], [radius * .52, radius * .52, radius * .28], plain(tone));
    }
    ball([at[0], at[1], at[2] + radius * .26], [radius * .27, radius * .27, radius * .18], gold);
  }
  function pot(at, radius, height, opts = {}) {
    cylinder(radius, radius * .80, height, [at[0], at[1] + height / 2, at[2]], opts);
    const lip = ring(radius * .97, .013, [at[0], at[1] + height, at[2]], opts); lip.rotation.x = Math.PI / 2;
    cylinder(radius * .87, radius * .87, .012, [at[0], at[1] + height, at[2]], plain('#685442'));
  }
  function leafShape(at, scale, rotation = 0, opts = leaf) {
    const mesh = ball(at, scale, opts); mesh.rotation.z = rotation; return mesh;
  }
  function clockFace(x, y, z, radius) {
    const disk = cylinder(radius, radius, .022, [x, y, z], cream); disk.rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      const m = box([.013, radius * .17, .009], [x + Math.sin(a) * radius * .76, y + Math.cos(a) * radius * .76, z + .017], dark);
      m.rotation.z = -a;
    }
    for(const[part,length,width,depth,tone]of[['clock-hour',radius*.46,.014,.027,INK],['clock-minute',radius*.65,.010,.034,INK],['clock-second',radius*.72,.004,.041,'#bc7357']]){
      const pivot=new THREE.Group();pivot.name=part;pivot.userData.objectPart=part;pivot.position.set(x,y,z+depth);group.add(pivot);
      const hand=box([width,length,.006],[0,length/2,0],plain(tone));group.remove(hand);pivot.add(hand);
    }
    ball([x, y, z + .034], [.017, .017, .012], gold);
  }
  function framedLandscape(width, height, z, y, opts = {}) {
    box([width, height, .06], [0, y, z], opts);
    box([width - .07, height - .07, .015], [0, y, z + .036], plain('#a8ccd8'));
    ball([width * .21, y + height * .23, z + .052], [height * .11, height * .11, .008], plain('#f3d48c'));
    polygon([[-width * .43, -height * .42], [-width * .43, -height * .04], [-width * .16, height * .20], [width * .12, -height * .15], [width * .43, -height * .03], [width * .43, -height * .42]], .008, [0, y, z + .048], plain('#849d94'));
    polygon([[-width * .43, -height * .42], [-width * .43, -height * .25], [-width * .10, -height * .12], [width * .12, height * .05], [width * .43, -height * .17], [width * .43, -height * .42]], .008, [0, y, z + .065], plain('#567e75'));
  }

  const builders = {
    deskShelf() {
      for (const x of [-.33, .33]) box([.045, .45, .26], [x, .27, 0]);
      for (const y of [.055, .30]) box([.70, .045, .28], [0, y, 0]);
      box([.67, .10, .025], [0, .115, -.122], { color: shade });
      curve([[-.32, .47, 0], [-.23, .55, 0], [0, .59, 0], [.23, .55, 0], [.32, .47, 0]], .021);
      for (let i = 0; i < 4; i++) book(-.25 + i * .075, .079, .015, .06, .16 + (i % 2) * .025, .16, BOOKS[i]);
      for (let i = 0; i < 3; i++) book(.09 + i * .075, .324, .005, .06, .15 + (i % 2) * .03, .17, BOOKS[(i + 1) % 4]);
    },
    bookends() {
      for (const sign of [-1, 1]) {
        box([.10, .025, .22], [sign * .17, .014, 0]);
        polygon([[-.04, 0], [.04, 0], [.04, .22], [.015, .28], [-.04, .22]], .12, [sign * .17, .025, -.06]);
      }
      for (let i = 0; i < 3; i++) book(-.075 + i * .075, .025, 0, .062, .27 + (i % 2) * .045, .185, BOOKS[i]);
    },
    openBook() {
      for (const sign of [-1, 1]) {
        const cover = box([.20, .018, .27], [sign * .10, .025, 0]); cover.rotation.z = sign * .09;
        const pages = box([.19, .045, .245], [sign * .10, .05, 0], cream); pages.rotation.z = sign * .09;
        for (let i = 0; i < 3; i++) box([.13, .003, .005], [sign * .105, .08 + Math.abs(sign) * .001, -.06 + i * .045], plain('#c9bda4'));
      }
      curve([[0, .07, -.13], [0, .043, 0], [0, .065, .13]], .009, { color: shade });
      box([.024, .006, .16], [.05, .079, .08], plain('#e6a19b'));
    },
    pencilCup() {
      cylinder(.105, .085, .20, [0, .10, 0]);
      const lip = ring(.103, .012, [0, .20, 0], { color: pale }); lip.rotation.x = Math.PI / 2;
      cylinder(.088, .088, .010, [0, .192, 0], plain('#625b51'));
      const positions = [[-.05, -.03, .36], [.045, -.035, .39], [0, .025, .34], [.062, .025, .32]];
      for (let i = 0; i < positions.length; i++) {
        const [x, z, y] = positions[i];
        cylinder(.011, .011, y - .13, [x, (y + .13) / 2, z], plain(BOOKS[i]));
        cylinder(0, .012, .04, [x, y + .02, z], plain('#e6c79c'));
        cylinder(0, .004, .012, [x, y + .044, z], dark);
      }
      face(0, .108, .102, .07);
    },
    deskOrganizer() {
      box([.45, .095, .27], [0, .05, 0]);
      for (const x of [-.207, -.04, .207]) box([.025, .22, .27], [x, .19, 0]);
      box([.45, .22, .022], [0, .19, -.124]);
      box([.15, .12, .025], [-.126, .15, .125], { color: pale });
      box([.22, .075, .022], [.08, .09, .143], { color: pale });
      ball([.08, .09, .162], [.026, .012, .015], gold);
      for (let i = 0; i < 3; i++) box([.18, .008, .20], [.085, .16 + i * .012, 0], cream);
      for (const x of [-.16, -.12, -.08]) cylinder(.009, .009, .20, [x, .235, -.015], plain(BOOKS[Math.round((x + .16) * 50)] || BOOKS[0]));
    },
    globe() {
      cylinder(.12, .13, .04, [0, .02, 0], { color: shade });
      cylinder(.018, .025, .14, [0, .10, 0], gold);
      const orb = ball([0, .315, 0], [.145, .145, .145]);
      const axis = ring(.174, .013, [0, .315, 0], gold); axis.rotation.z = -.30;
      link([-.052, .14, 0], [.052, .49, 0], .009, gold);
      // Latitude/longitude coastlines follow the globe surface. Subdividing
      // each triangle prevents flat land patches from sinking into the sphere.
      for (const coastline of [
        [[-.34,.27],[-.03,.28],[.22,.18],[.20,-.05],[.02,-.24],[-.06,-.54],[-.21,-.64],[-.37,-.32],[-.49,-.03],[-.43,.13]],
        [[-.40,.34],[-.31,.48],[-.12,.48],[-.05,.67],[.12,.78],[.30,.62],[.30,.43],[.12,.30],[-.04,.35],[-.20,.29]],
        [[.28,.59],[.53,.73],[.93,.67],[1.22,.43],[.94,.20],[.69,.20],[.59,-.02],[.41,.15],[.21,.26]],
        [[-.85,.09],[-.61,-.02],[-.53,-.22],[-.69,-.53],[-.86,-.80],[-.91,-.44],[-1.04,-.18]],
        [[-1.43,.55],[-1.13,.76],[-.83,.72],[-.67,.49],[-.91,.31],[-.97,.11],[-1.16,.24],[-1.29,.41]],
        [[.72,-.49],[.97,-.42],[1.12,-.60],[.88,-.75],[.68,-.62]],
      ]) {
        const contour = coastline.map(point => new THREE.Vector2(...point));
        const positions = [];
        const spherical = point => {
          const [lon,lat] = point, radius = .148;
          return [radius*Math.cos(lat)*Math.sin(lon), .315+radius*Math.sin(lat), radius*Math.cos(lat)*Math.cos(lon)];
        };
        const split = (a,b,c,depth) => {
          if (!depth) { positions.push(...spherical(a),...spherical(b),...spherical(c)); return; }
          const mid = (p,q) => [(p[0]+q[0])/2,(p[1]+q[1])/2];
          const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);
          split(a,ab,ca,depth-1);split(ab,b,bc,depth-1);split(ca,bc,c,depth-1);split(ab,bc,ca,depth-1);
        };
        for (const [a,b,c] of THREE.ShapeUtils.triangulateShape(contour,[])) split(coastline[a],coastline[b],coastline[c],2);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
        add(geometry,[0,0,0],leaf).material.side=THREE.DoubleSide;
      }
      orb.userData.part = 'globe';
    },
    deskClock() {
      const casing = cylinder(.135, .135, .12, [0, .19, 0]); casing.rotation.x = Math.PI / 2;
      clockFace(0, .19, .071, .108);
      for (const sign of [-1, 1]) {
        link([sign * .07, .065, 0], [sign * .095, .01, .015], .018, { color: shade });
        const bell = ball([sign * .09, .32, 0], [.068, .033, .067]); bell.rotation.z = -sign * .4;
      }
      curve([[-.065, .345, 0], [0, .38, 0], [.065, .345, 0]], .008, gold);
      link([0, .32, 0], [0, .362, 0], .008, gold);
    },
    taskLamp() {
      cylinder(.13, .145, .035, [0, .019, 0]);
      link([0, .035, 0], [-.09, .26, 0], .018);
      link([-.09, .26, 0], [.10, .42, 0], .018);
      for (const [x, y] of [[0, .05], [-.09, .26], [.10, .42]]) ball([x, y, 0], [.03, .03, .025], gold);
      const hood = cylinder(.075, .13, .13, [.13, .43, 0]); hood.rotation.z = -.6;hood.userData.objectPart='lamp-shade';
      const light = cylinder(.115, .115, .009, [.166, .374, 0], { ...cream, emissive: '#ffd992' }); light.rotation.z = -.6;
    },
    miniPlant() {
      pot([0, 0, 0], .105, .16);
      link([0, .16, 0], [0, .39, 0], .011, leaf);
      for (const [x, y, z, a] of [[-.065, .28, 0, -.75], [.065, .34, .01, .7], [-.04, .40, 0, -.35], [.06, .23, .03, 1.0]]) leafShape([x, y, z], [.048, .080, .026], a);
    },
    succulent() {
      pot([0, 0, 0], .11, .11);
      for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 + row * .4, r = row ? .04 : .075;
        const blade = leafShape([Math.cos(a) * r, .14 + row * .033, Math.sin(a) * r], [.039, .025 + row * .014, .07 - row * .02], 0, plain(row ? '#97bb97' : '#78a48c'));
        blade.rotation.y = -a + Math.PI / 2; blade.rotation.x = row ? .35 : .12;
      }
      ball([0, .205, 0], [.035, .035, .035], plain('#b6cfa7'));
    },
    flowerVase() {
      const profile = [[0, 0], [.075, 0], [.105, .055], [.10, .18], [.055, .23], [.055, .285], [.04, .29]].map(p => new THREE.Vector2(...p));
      add(new THREE.LatheGeometry(profile, 20), [0, 0, 0], { glass: true });
      const lip = ring(.048, .009, [0, .285, 0]); lip.rotation.x = Math.PI / 2;
      for (const [x, y, z, tone] of [[-.09, .46, .005, '#e8a297'], [.07, .53, -.025, '#e6bd69'], [.025, .42, .04, '#bba5c8']]) {
        curve([[0, .05, 0], [x * .3, .30, z], [x, y, z]], .007, leaf);
        blossom([x, y, z], .06, tone);
      }
      leafShape([-.04, .32, .01], [.025, .065, .014], -.6);
    },
    photoFrame() {
      framedLandscape(.30, .34, 0, .18);
      link([0, .28, -.025], [0, .015, -.125], .018, { color: shade });
    },
    toyRobot() {
      for (const x of [-.064, .064]) {
        box([.07, .075, .13], [x, .038, .02], { color: shade });
        cylinder(.025, .025, .08, [x, .11, 0], gold);
      }
      box([.19, .16, .12], [0, .21, 0]);
      for (const sign of [-1, 1]) {
        ball([sign * .125, .25, 0], [.028, .03, .03], gold);
        box([.045, .10, .07], [sign * .143, .20, 0], { color: pale });
      }
      box([.23, .14, .15], [0, .36, 0], { radius: .032 });
      box([.18, .085, .012], [0, .36, .08], plain('#6a848a'));
      for (const x of [-.05, .05]) ball([x, .373, .09], [.015, .018, .006], cream);
      curve([[-.025, .34, .091], [0, .333, .093], [.025, .34, .091]], .005, cream);
      cylinder(.009, .009, .03, [0, .445, 0], gold);
      ball([0, .466, 0], [.020, .020, .020], { color: pale });
      box([.07, .04, .01], [0, .21, .066], gold);
    },
    woodTrain() {
      box([.31, .045, .18], [-.105, .075, 0]);
      box([.17, .12, .15], [-.14, .15, 0], { color: pale });
      box([.11, .18, .17], [.0, .18, 0]);
      box([.15, .025, .20], [0, .275, 0], { color: shade });
      box([.065, .07, .012], [0, .22, .09], plain('#a8d2d5'));
      cylinder(.025, .025, .07, [-.20, .245, 0], { color: shade });
      box([.18, .09, .17], [.20, .12, 0], { color: pale });
      link([.065, .08, 0], [.13, .08, 0], .015, gold);
      for (const x of [-.22, -.02, .15, .25]) for (const z of [-.102, .102]) {
        const wheel = cylinder(.042, .042, .024, [x, .045, z], plain('#98775d')); wheel.rotation.x = Math.PI / 2;
        ball([x, .045, z * 1.13], [.014, .014, .005], gold);
      }
    },
    blockCastle() {
      box([.43, .045, .29], [0, .022, 0], { color: pale });
      box([.19, .19, .17], [0, .14, 0]);
      polygon([[-.035, 0], [.035, 0], [.035, .075], [.021, .102], [-.021, .102], [-.035, .075]], .012, [0, .045, .091], plain('#7c6a8b'));
      for (const sign of [-1, 1]) {
        cylinder(.072, .072, .26, [sign * .148, .175, 0], { color: pale });
        cylinder(0, .089, .13, [sign * .148, .371, 0], { color: shade });
        box([.025, .04, .014], [sign * .148, .235, .074], gold);
      }
      for (const x of [-.062, 0, .062]) box([.04, .045, .17], [x, .25, 0]);
    },
    teddyBear() {
      ball([0, .17, 0], [.115, .13, .09]);
      ball([0, .33, .008], [.117, .105, .088]);
      for (const sign of [-1, 1]) {
        ball([sign * .088, .414, .003], [.048, .048, .029]);
        ball([sign * .088, .414, .026], [.028, .027, .008], plain('#e1b890'));
        ball([sign * .084, .055, .065], [.064, .052, .074]);
        ball([sign * .084, .06, .122], [.035, .028, .014], plain('#e4c7a6'));
        const arm = ball([sign * .113, .185, .015], [.045, .085, .05]); arm.rotation.z = sign * .28;
        ball([sign * .045, .35, .088], [.009, .012, .006], dark);
      }
      ball([0, .297, .088], [.053, .04, .028], plain('#e9cbaa'));
      ball([0, .314, .112], [.018, .012, .008], dark);
      curve([[-.017, .284, .112], [0, .279, .115], [.017, .284, .112]], .004, dark);
      ball([0, .17, .085], [.065, .075, .015], plain('#e9cbaa'));
    },
    happyCloud() {
      ball([0, .14, 0], [.12, .13, .10]);
      ball([-.105, .10, 0], [.09, .085, .09]);
      ball([.11, .10, 0], [.085, .08, .085]);
      box([.26, .08, .16], [0, .055, 0], { radius: .036 });
      face(0, .133, .104, .10);
      for (const x of [-.072, .072]) ball([x, .025, .03], [.04, .024, .048], plain('#e1c2b2'));
    },
    shyMushroom() {
      cylinder(.065, .085, .20, [0, .105, 0], cream);
      const cap = add(new THREE.SphereGeometry(1, 28, 16, 0, Math.PI*2, 0, Math.PI/2), [0,.23,0]);
      cap.scale.set(.154,.12,.13);
      const underside = cylinder(.149,.149,.018,[0,.225,0],{color:pale}); underside.scale.z=.13/.154;
      for (const [x,z] of [[-.068,.04],[.055,.045],[.073,-.055]]) {
        const y=.23+.12*Math.sqrt(1-(x/.154)**2-(z/.13)**2);
        const spot=ball([x,y+.002,z],[.022,.006,.019],cream);
        spot.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(x/(.154**2),(y-.23)/(.12**2),z/(.13**2)).normalize());
      }
      face(0, .13, .073, .065);
    },
    braveSun() {
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        const ray = add(new THREE.CapsuleGeometry(.019,.055,5,12),[Math.cos(a)*.151,.205+Math.sin(a)*.151,-.01]); ray.rotation.z=a-Math.PI/2;
      }
      ball([0, .205, .008], [.116, .116, .069]);
      face(0, .22, .078, .085);
      for (const x of [-.055, .055]) ball([x, .025, .025], [.040, .026, .044], { color: shade });
    },
    sleepyMoon() {
      moon([.025, .21, -.035], .30, .085);
      for (const [x, y, sx, sy] of [[-.08, .045, .07, .04], [0, .055, .10, .055], [.09, .04, .055, .035]]) ball([x, y, .008], [sx, sy, .07], cream);
      face(-.041, .218, .061, .061, 'sleepy');
    },
    wallClock() {
      const casing = cylinder(.278, .278, .09, [0, .28, .045]); casing.rotation.x = Math.PI / 2;
      clockFace(0, .28, .096, .225);
    },
    cuckooClock() {
      box([.39, .43, .17], [0, .42, .09]);
      polygon([[-.26, 0], [0, .20], [.26, 0], [.23, -.03], [0, .135], [-.23, -.03]], .21, [0, .635, 0], { color: shade });
      clockFace(0, .40, .184, .125);
      box([.126,.125,.012],[0,.626,.179],dark);
      for(const sign of[-1,1]){
        const hinge=new THREE.Group();hinge.position.set(sign*.064,.626,.18);hinge.name=sign<0?'cuckoo-door-left':'cuckoo-door-right';hinge.userData.objectPart=hinge.name;group.add(hinge);
        const door=box([.062,.122,.012],[-sign*.031,0,0],{color:shade});group.remove(door);hinge.add(door);
        const latch=ball([-sign*.009,-.015,.012],[.006,.009,.005],gold);group.remove(latch);hinge.add(latch);
      }
      const bird=new THREE.Group();bird.name='cuckoo-bird';bird.position.set(0,.63,.10);bird.userData={objectPart:'cuckoo-bird',objectTravel:.08};bird.visible=false;group.add(bird);
      const toBird=m=>{group.remove(m);bird.add(m);return m;};
      toBird(ball([0,-.005,0],[.025,.026,.027],plain('#e4ba65')));toBird(ball([0,.019,.009],[.019,.019,.019],plain('#e4ba65')));
      for(const sign of[-1,1]){
        toBird(ball([sign*.014,.026,.022],[.0035,.0035,.003],dark));
        const wing=new THREE.Group();wing.position.set(sign*.024,.005,0);wing.name=sign<0?'cuckoo-wing-left':'cuckoo-wing-right';wing.userData.objectPart=wing.name;bird.add(wing);
        const feather=ball([sign*.013,0,0],[.018,.009,.022],plain('#b27b4f'));group.remove(feather);wing.add(feather);
      }
      const beak=toBird(cylinder(0,.009,.022,[0,.017,.036],gold));beak.rotation.x=Math.PI/2;
      const pendulum=new THREE.Group();pendulum.name='clock-pendulum';pendulum.position.set(0,.21,.095);pendulum.userData.objectPart='clock-pendulum';group.add(pendulum);
      const rod=link([0,0,0],[0,-.145,0],.009,gold);group.remove(rod);pendulum.add(rod);
      const weight=ball([0,-.155,0],[.050,.05,.024],gold);group.remove(weight);pendulum.add(weight);
    },
    landscapeArt() { framedLandscape(.83, .55, .035, .285); },
    corkBoard() {
      box([.70, .55, .06], [0, .28, .035]);
      box([.63, .48, .012], [0, .28, .072], plain('#c8a178', { roughness: .98 }));
      for (const [x, y, a, tone] of [[-.17, .36, -.12, '#f2dca4'], [.13, .33, .08, '#b5d4cd'], [-.06, .16, .06, '#e8b6ad']]) {
        const note = box([.20, .15, .007], [x, y, .084], plain(tone)); note.rotation.z = a;
        ball([x, y + .05, .098], [.014, .014, .009], plain('#9e7569'));
        for (let i = 0; i < 2; i++) box([.10 - i * .025, .006, .004], [x, y - i * .026, .092], plain('#b29e88'));
      }
    },
    pegboard() {
      box([.62, .60, .04], [0, .31, .025]);
      for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) ball([-.23 + col * .115, .085 + row * .115, .048], [.009, .009, .003], { color: shade });
      box([.26, .025, .18], [-.14, .16, .125], { color: pale });
      cylinder(.063, .052, .13, [.16, .26, .11], { color: pale });
      for (const x of [.135, .17]) cylinder(.009, .009, .19, [x, .35, .11], plain(x < .15 ? '#d4ad68' : '#d19883'));
      book(-.17, .175, .10, .055, .15, .11, BOOKS[0]);
      book(-.10, .175, .10, .055, .17, .11, BOOKS[2]);
    },
    wallShelf() {
      for (const x of [-.38, .38]) box([.04, .39, .24], [x, .22, .13]);
      for (const y of [.035, .26]) box([.80, .035, .26], [0, y, .135]);
      for (const sign of [-1, 1]) {
        const roof = box([.44, .035, .26], [sign * .19, .48, .135]); roof.rotation.z = -sign * .37;
      }
      for (let i = 0; i < 4; i++) book(-.27 + i * .08, .055, .14, .065, .15 + (i % 2) * .025, .16, BOOKS[i]);
      for (let i = 0; i < 2; i++) book(.12 + i * .08, .28, .12, .065, .16 + i * .015, .16, BOOKS[i + 1]);
    },
    flowerWreath() {
      ring(.215, .022, [0, .275, .045], { color: shade });
      for (let i = 0; i < 10; i++) {
        const a = i * Math.PI / 5;
        const blade = ball([Math.cos(a) * .215, .275 + Math.sin(a) * .215, .058], [.035, .064, .021]); blade.rotation.z = a - .4;
      }
      for (const [x, y, tone] of [[-.15, .12, '#e5a39d'], [.16, .40, '#e8ca7b'], [.07, .06, '#d8b4c5']]) blossom([x, y, .085], .055, tone);
    },
    starMobile() {
      link([-.29, .77, .06], [.29, .77, .06], .014);
      curve([[-.22, .77, .06], [0, .86, .06], [.22, .77, .06]], .006, gold);
      for (const [x, y] of [[-.21, .34], [0, .16], [.22, .44]]) {
        link([x, .755, .06], [x, y + .10, .06], .004, gold);
        ball([x, y + .16, .06], [.021, .021, .021], plain('#dca397'));
      }
      star([-.21, .34, .025], .10, .05);
      moon([.02, .17, .018], .27, .06, { color: pale });
      star([.22, .44, .025], .085, .05);
    },
    beanbag() {
      ball([0, .25, 0], [.46, .255, .425]);
      ball([0, .43, -.21], [.38, .31, .20]);
      ball([0, .36, .10], [.32, .055, .25], { color: pale });
      curve([[-.36, .24, .22], [-.25, .31, .36], [0, .34, .40], [.25, .31, .36], [.36, .24, .22]], .012, { color: shade });
      box([.10, .10, .018], [.30, .25, .29], plain('#e8cfa7'));
    },
    toyChest() {
      box([.88, .40, .50], [0, .24, 0], { radius: .05 });
      box([.92, .09, .54], [0, .48, 0], { radius: .035, color: pale });
      for (const x of [-.37, .37]) for (const z of [-.18, .18]) box([.09, .055, .10], [x, .027, z], { color: shade });
      box([.075, .11, .028], [0, .39, .268], gold);
      for (const x of [-.30, .30]) box([.14, .055, .025], [x, .29, .263], { color: shade });
      star([0, .22, .255], .084, .012, cream);
    },
    readingLamp() {
      cylinder(.22, .25, .045, [0, .024, 0]);
      cylinder(.025, .027, 1.08, [0, .58, 0], gold);
      curve([[0, 1.10, 0], [0, 1.32, 0], [.13, 1.36, 0], [.22, 1.29, 0]], .025, gold);
      const hood = cylinder(.10, .19, .22, [.22, 1.20, 0]); hood.rotation.z = -.18;hood.userData.objectPart='lamp-shade';
      const bulb = cylinder(.17, .17, .014, [.24, 1.095, 0], { ...cream, emissive: '#ffdc99' }); bulb.rotation.z = -.18;
      link([.28, 1.10, .05], [.28, .91, .05], .004, gold);
      ball([.28, .90, .05], [.015, .025, .015], gold);
    },
    bonsai() {
      box([.56, .16, .39], [0, .11, 0], { radius: .055 });
      box([.60, .06, .43], [0, .20, 0], { radius: .025, color: pale });
      box([.51, .02, .34], [0, .235, 0], plain('#6d6651'));
      for (const x of [-.20, .20]) box([.095, .055, .26], [x, .028, 0], { color: shade });
      curve([[0, .23, 0], [-.06, .42, 0], [.05, .60, -.01], [0, .88, -.01]], .038, plain('#8a6d50'));
      curve([[0, .42, 0], [-.18, .60, .01], [-.28, .64, .01]], .022, plain('#8a6d50'));
      curve([[.02, .58, -.01], [.22, .72, -.02], [.28, .73, -.02]], .023, plain('#8a6d50'));
      for (const [x, y, z, sx] of [[-.25, .67, .02, .19], [.26, .77, -.025, .19], [0, .91, -.025, .23]]) {
        ball([x, y, z], [sx, .10, .18], plain('#74966b'));
        ball([x - .035, y + .04, z - .025], [sx * .67, .07, .14], plain('#90ad7d'));
      }
      for (const x of [-.18, .13]) ball([x, .25, .09], [.045, .026, .035], plain('#bcb8a0'));
    },
  };
  builders[kind]();
  group.updateMatrixWorld(true);
  const initial = new THREE.Box3().setFromObject(group), size = initial.getSize(new THREE.Vector3());
  // Preserve each design's proportions, while ensuring its conservative catalog
  // envelope contains every mesh. Anchors are shared by renderer and collision math.
  const scale = Math.min(1, spec.width / size.x, spec.height / size.y, spec.depth / size.z);
  for (const child of group.children) { child.position.multiplyScalar(scale); child.scale.multiplyScalar(scale); }
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group), center = bounds.getCenter(new THREE.Vector3());
  for (const child of group.children) {
    child.position.x -= center.x;
    child.position.y -= bounds.min.y;
    child.position.z -= spec.placement === 'wall' ? bounds.min.z : center.z;
  }
  group.updateMatrixWorld(true);
  return group;
}
