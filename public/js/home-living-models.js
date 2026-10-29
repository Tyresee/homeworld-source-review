import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LIVING_COLLECTION } from './home-living-collection.js';

const SPECS = new Map(LIVING_COLLECTION.map(spec => [spec.id, spec]));
export const isLivingProduct = kind => SPECS.has(kind);

/** Forty-eight authored constructions. No shared disposable meshes/materials;
 * borrowed texture maps remain owned by the caller. Flat tops are identified for
 * the game's existing parent-relative tabletop placement contract. */
export function createLivingProduct({ kind, color, material, maps = {} } = {}) {
  const spec = SPECS.get(kind);
  if (!spec) throw new RangeError(`Unknown living product: ${kind}`);
  color ||= spec.defaultColor; material ||= spec.material;
  const group = new THREE.Group(); group.name = `furniture-${kind}`;
  group.userData = { kind, level: 1, noUpgrade: true, origin: 'bottom', placement: 'floor', tier: spec.tier,
    family: spec.family, materialVariant: material, dimensions: { width: spec.width, depth: spec.depth, height: spec.height },
    ...(spec.supportSurface ? { supportSurface: { ...spec.supportSurface } } : {}) };
  const body = new THREE.Color(color), pale = body.clone().lerp(new THREE.Color('#fff4df'), .40), shade = body.clone().multiplyScalar(.70);
  const fixed = (tone, finish = 'ceramic', extra = {}) => ({ color: tone, finish, paintable: false, ...extra });
  const wood = fixed('#b68b5e', 'oak'), cream = fixed('#fff3dc', 'linen'), gold = fixed('#c9a260', 'gold');
  const dark = fixed('#455453'), mirror = fixed('#aac7ca', 'gold', { roughness: .15 });
  function add(geometry, at = [0,0,0], opts = {}) {
    const paintable = opts.paintable !== false, finish = paintable ? material : opts.finish ?? 'ceramic';
    const mat = new THREE.MeshStandardMaterial({ color: opts.color ?? body, map: maps[finish] ?? null,
      roughness: opts.roughness ?? (['linen','wool','velvet'].includes(finish) ? .88 : finish === 'gold' ? .26 : finish === 'marble' ? .32 : .57),
      metalness: finish === 'gold' ? .58 : 0, ...(opts.opacity ? { transparent: true, opacity: opts.opacity, depthWrite: false } : {}) });
    const mesh = new THREE.Mesh(geometry, mat); mesh.position.set(...at); mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData = { paintable, part: opts.part ?? (paintable ? 'body' : 'detail'), ...(opts.supportTop ? { supportTop: true } : {}) };
    if (opts.supportTop) mesh.name = 'furniture-support-top'; group.add(mesh); return mesh;
  }
  function box(size, at, opts = {}) { return add(new RoundedBoxGeometry(...size, 1, Math.min(opts.radius ?? .025, Math.min(...size) * .40)), at, opts); }
  function cyl(top, bottom, height, at, opts = {}) { return add(new THREE.CylinderGeometry(top,bottom,height,16), at, opts); }
  function ball(at, scale, opts = {}) { const mesh = add(new THREE.SphereGeometry(1,16,10),at,opts); mesh.scale.set(...scale); return mesh; }
  function link(a,b,radius,opts={}) {
    const from=new THREE.Vector3(...a), to=new THREE.Vector3(...b), delta=to.clone().sub(from);
    const mesh=cyl(radius,radius,delta.length(),from.add(to).multiplyScalar(.5).toArray(),opts);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()); return mesh;
  }
  function curve(points,radius,opts={}) { return add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),12,radius,6,false),[0,0,0],opts); }
  function panel(points,depth,at,opts={}) {
    const shape=new THREE.Shape(); shape.moveTo(...points[0]); points.slice(1).forEach(p=>shape.lineTo(...p)); shape.closePath();
    return add(new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:true,bevelSize:.008,bevelThickness:.008,bevelSegments:1}),at,opts);
  }
  function arch(width,height,depth,at,opts={}) {
    const shape=new THREE.Shape(), r=width/2, shoulder=height-r;
    shape.moveTo(-r,0); shape.lineTo(r,0); shape.lineTo(r,shoulder); shape.absarc(0,shoulder,r,0,Math.PI,false); shape.lineTo(-r,0);
    return add(new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:true,bevelSize:.012,bevelThickness:.012,bevelSegments:1,curveSegments:12}),at,opts);
  }
  function feet(w,d,h=.16,opts=wood,r=.045) { for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])cyl(r*.85,r,h,[x,h/2,z],opts); }
  function knob(x,y,z,opts=gold) { const stem=cyl(.018,.018,.045,[x,y,z],opts); stem.rotation.x=Math.PI/2; ball([x,y,z+.027],[.034,.034,.024],opts); }
  function handle(x,y,z,w=.18,opts=gold) { box([w,.035,.035],[x,y,z+.025],opts); }
  function top(w,d,y,at=[0,0],opts={}) { return box([w,.09,d],[at[0],y-.045,at[1]],{part:'supporting-top',supportTop:true,...opts}); }
  function shell(w,d,bottom,upper,opts={},support=false) {
    box([w,.065,d],[0,bottom+.0325,0],opts);
    box([w,.075,d],[0,upper-.0375,0],{...opts,...(support?{supportTop:true}: {})});
    for(const x of [-w/2+.033,w/2-.033])box([.066,upper-bottom-.10,d],[x,(upper+bottom)/2,0],opts);
    box([w-.12,upper-bottom-.12,.035],[0,(upper+bottom)/2,-d/2+.018],{color:shade,...opts});
  }
  function drawers(w,h,count,at,d=.045) {
    const [x,y,z]=at, row=h/count;
    for(let i=0;i<count;i++) { box([w,row-.025,d],[x,y+row*(i+.5),z],{color:pale,part:'drawer-front'}); handle(x,y+row*(i+.5),z+d/2,.18); }
  }
  function bedding(w,d,y,pillows=2,x=0,z=0) {
    box([w,.15,d],[x,y,z],{...cream,radius:.065,part:'mattress'});
    box([w+.018,.10,d*.67],[x,y+.105,z+d*.15],{color:pale,radius:.04,part:'duvet'});
    for(let i=0;i<pillows;i++)box([w/pillows*.81,.11,.32],[x+(i-(pillows-1)/2)*w/pillows,y+.13,z-d*.34],{...cream,radius:.045,part:'pillow'});
  }
  function sofaBase(w,d,y=.27) { feet(w-.27,d-.25,.16,wood,.048); box([w,.25,d],[0,y,0],{radius:.09,part:'sofa-base'}); }
  function flatSeat(w,d,y,x=0,z=.04) { box([w,.18,d],[x,y,z],{color:pale,radius:.065,part:'seat-cushion'}); }
  function door(w,h,at,opts={}) { const [x,y,z]=at; return box([w,h,.045],[x,y,z],{color:pale,part:'door-panel',...opts}); }

  const builders = {
    lcDrawerBed() {
      box([1.73,.45,2.01],[0,.225,0],{part:'storage-bed-base',radius:.045});
      box([1.78,.10,2.07],[0,.49,0],{color:shade});
      box([1.77,.78,.13],[0,.58,-.97],{radius:.06,part:'broad-headboard'});
      for(const x of [-.43,.43]) { box([.77,.29,.045],[x,.25,1.025],{color:pale,part:'bed-drawer'}); handle(x,.26,1.058,.24); }
      bedding(1.60,1.84,.58);
    },
    lcBunkBed() {
      for(const x of [-.55,.55])for(const z of [-.97,.97])box([.10,1.84,.10],[x,.92,z],{part:'bunk-post'});
      for(const y of [.28,1.17]) { box([1.18,.13,2.03],[0,y,0]); bedding(1.03,1.84,y+.13,1); }
      for(const z of [-.97,.97])box([1.13,.27,.07],[0,1.70,z],{color:pale,part:'end-guard'});
      for(const x of [-.55,.55])box([.065,.25,1.93],[x,1.69,0],{color:pale,part:'side-guard'});
      for(const z of [.25,.75])link([.65,.025,z],[.58,1.60,z],.035,{part:'ladder-rail'});
      for(const y of [.25,.50,.75,1.0,1.25])link([.62,y,.25],[.62,y,.75],.028,{color:pale,part:'ladder-step'});
    },
    lcLoftBed() {
      for(const x of [-.62,.62])for(const z of [-.97,.97])box([.10,1.98,.10],[x,.99,z],{part:'loft-post'});
      box([1.35,.13,2.04],[0,1.42,0]); bedding(1.18,1.83,1.55,1);
      for(const x of [-.62,.62])box([.07,.25,1.95],[x,1.86,0],{color:pale,part:'upper-guard'});
      for(const z of [-.97,.97])box([1.27,.25,.07],[0,1.86,z],{color:pale});
      for(const x of [-.62,.62])link([x,.24,-.91],[x,1.34,.90],.035,{color:shade,part:'diagonal-frame'});
      for(const z of [.26,.77])box([.055,1.54,.055],[.70,.77,z],{part:'ladder-rail'});
      for(const y of [.23,.49,.75,1.01,1.27])link([.70,y,.26],[.70,y,.77],.028,{part:'ladder-step'});
    },
    lcTrundleBed() {
      feet(1.00,1.80,.52,{},.045); for(const leg of group.children) leg.position.x-=.18;
      box([1.19,.15,2.04],[-.18,.59,0]);
      box([1.18,.75,.11],[-.18,.665,-.97],{part:'headboard'});
      box([1.18,.36,.095],[-.18,.67,.97]); bedding(1.05,1.80,.72,1,-.18);
      box([1.08,.15,1.88],[.32,.18,.06],{color:shade,part:'sliding-trundle'});
      bedding(.98,1.70,.30,1,.32,.06);
      for(const z of [-.65,.72]) { const wheel=cyl(.055,.055,.045,[.81,.07,z],dark); wheel.rotation.z=Math.PI/2; }
      handle(.53,.17,1.04,.25);
    },
    lcHouseBed() {
      box([1.18,.18,2.01],[0,.09,0],{part:'low-bed-platform'}); bedding(1.03,1.82,.28,1);
      for(const x of [-.60,.60])for(const z of [-.97,.97])box([.075,1.22,.075],[x,.61,z],{part:'house-post'});
      for(const z of [-.97,.97])for(const x of [-.60,.60])link([x,1.20,z],[0,1.73,z],.045,{part:'roof-pitch'});
      link([0,1.73,-.97],[0,1.73,.97],.045,{part:'roof-ridge'});
      for(const y of [.58,.88])box([1.18,.06,.065],[0,y,-.97]);
      for(const x of [-.20,.20])box([.055,.63,.055],[x,.61,-.97],{color:pale});
    },
    lcDayBed() {
      feet(1.89,.70,.18,{},.045); box([2.08,.16,.89],[0,.25,0]);
      for(const x of [-.99,.99])box([.08,.76,.08],[x,.55,-.39]);
      box([2.06,.075,.075],[0,.90,-.39]);
      for(let i=-4;i<=4;i++)box([.045,.49,.045],[i*.22,.63,-.39],{part:'daybed-spindle'});
      for(const x of [-.99,.99]) { box([.08,.55,.08],[x,.40,.39]); box([.075,.075,.84],[x,.67,0]); }
      box([1.89,.18,.74],[0,.44,.025],{...cream,radius:.065,part:'daybed-mattress'});
      box([1.89,.075,.52],[0,.56,.11],{color:pale,radius:.03});
    },
    lcRoyalBed() {
      box([2.43,.12,2.08],[0,.06,0],{color:shade,radius:.045,part:'low-plinth'});
      box([2.52,.11,2.14],[0,.175,0],gold); box([2.48,.25,2.12],[0,.35,0],{radius:.09,part:'wide-bed-platform'});
      box([2.48,.75,.19],[0,.74,-.98],{radius:.09,part:'wide-headboard'});
      for(const x of [-1.20,1.20]) { const wing=box([.20,.77,.51],[x,.74,-.82],{radius:.08,part:'headboard-wing'}); wing.rotation.y=x>0?-.10:.10; }
      box([2.12,.51,.07],[0,.80,-.85],{color:pale,radius:.03,part:'headboard-center'});
      bedding(2.12,1.89,.58);
    },
    lcCloudSofa() {
      sofaBase(2.52,.96); box([2.47,.51,.23],[0,.66,-.36],{radius:.10,part:'low-cloud-back'});
      for(const x of [-1.16,1.16])box([.29,.41,.97],[x,.46,0],{radius:.12,part:'round-arm'});
      for(const x of [-.75,-.25,.25,.75]) { flatSeat(.49,.71,.47,x); box([.50,.36,.17],[x,.68,-.21],{color:pale,radius:.07,part:'back-cushion'}); }
    },
    lcSpindleSofa() {
      feet(1.60,.63,.35,{},.035); box([1.76,.09,.78],[0,.36,0]);
      for(const x of [-.82,.82]) { box([.065,.53,.065],[x,.64,-.34]); box([.075,.07,.77],[x,.65,0]); box([.06,.29,.06],[x,.50,.31]); }
      box([1.73,.075,.07],[0,.90,-.34]);
      for(let i=-3;i<=3;i++)box([.045,.45,.045],[i*.24,.66,-.34],{part:'back-spindle'});
      for(const x of [-.41,.41])flatSeat(.78,.64,.48,x);
    },
    lcCurvedSofa() {
      const shape=new THREE.Shape(); shape.moveTo(-1.16,.25); shape.quadraticCurveTo(0,-.65,1.16,.25); shape.lineTo(1.22,.77); shape.quadraticCurveTo(0,-.07,-1.22,.77); shape.closePath();
      const base=add(new THREE.ExtrudeGeometry(shape,{depth:.24,steps:1,bevelEnabled:true,bevelSize:.065,bevelThickness:.045,bevelSegments:2,curveSegments:16}),[0,.39,0],{part:'curved-seat-base'}); base.rotation.x=Math.PI/2;
      const backShape=new THREE.Shape(); backShape.moveTo(-1.18,.19);backShape.quadraticCurveTo(0,-.70,1.18,.19);backShape.lineTo(1.18,.38);backShape.quadraticCurveTo(0,-.46,-1.18,.38);backShape.closePath();
      const back=add(new THREE.ExtrudeGeometry(backShape,{depth:.53,steps:1,bevelEnabled:true,bevelSize:.05,bevelThickness:.035,bevelSegments:2,curveSegments:16}),[0,.91,0],{part:'continuous-curved-back'});back.rotation.x=Math.PI/2;
      for(const x of [-.78,0,.78]) { const z=.17+.22*x*x; const seat=box([.73,.15,.53],[x,.48,z],{color:pale,radius:.065,part:'curved-seat-section'});seat.rotation.y=-x*.48; }
      for(const x of [-1.05,1.05])cyl(.055,.065,.17,[x,.085,.32],wood);
      cyl(.055,.065,.17,[0,.085,-.02],wood);
    },
    lcChaise() {
      feet(.66,1.56,.17,wood,.045); box([.86,.23,1.77],[0,.27,0],{radius:.085});
      flatSeat(.74,1.50,.44,0,.07); const back=box([.85,.55,.22],[0,.64,-.69],{radius:.09,part:'sloping-back'});back.rotation.x=-.19;
      box([.12,.30,1.35],[-.38,.46,-.11],{radius:.05,part:'single-low-arm'});
    },
    lcWingChair() {
      sofaBase(.85,.79); flatSeat(.64,.64,.48);
      const back=box([.74,.86,.18],[0,.83,-.31],{radius:.075,part:'high-wing-back'});back.rotation.x=-.08;
      for(const x of [-.37,.37]) { box([.15,.38,.74],[x,.49,.02],{radius:.06}); const wing=box([.16,.48,.31],[x,.97,-.20],{radius:.06,part:'upper-wing'});wing.rotation.y=x>0?-.16:.16; }
      box([.55,.55,.08],[0,.91,-.18],{color:pale,radius:.04});
    },
    lcRockingChair() {
      for(const x of [-.34,.34])curve([[x,.15,-.49],[x,.035,-.26],[x,.025,.23],[x,.17,.54]],.032,{part:'rocker-runner'});
      for(const x of [-.29,.29])for(const z of [-.29,.28])link([x,.12,z],[x,.47,z*.8],.027);
      box([.69,.07,.60],[0,.47,0]);for(const x of [-.29,.29])link([x,.45,-.25],[x,1.08,-.36],.031);
      for(let i=-2;i<=2;i++) { const bar=box([.075,.53,.045],[i*.115,.81,-.30]);bar.rotation.x=-.16; }
      box([.69,.07,.07],[0,1.08,-.36]);
      for(const x of [-.32,.32]) { box([.08,.07,.64],[x,.72,-.01],{part:'wood-arm'});link([x,.48,.25],[x,.70,.25],.026); }
    },
    lcBarrelChair() {
      cyl(.34,.39,.13,[0,.065,0],{color:shade,part:'round-pedestal'});cyl(.44,.42,.17,[0,.215,0]);
      const outer=new THREE.Shape();outer.absarc(0,0,.49,Math.PI*.03,Math.PI*.97,false);outer.lineTo(-.36,.035);outer.absarc(0,0,.36,Math.PI*.97,Math.PI*.03,true);outer.closePath();
      const wrap=add(new THREE.ExtrudeGeometry(outer,{depth:.58,steps:1,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:2,curveSegments:18}),[0,.85,0],{part:'wraparound-barrel-back'});wrap.rotation.x=Math.PI/2;
      cyl(.38,.38,.16,[0,.40,.055],{color:pale,part:'round-seat'});
      for(const x of [-.42,.42])ball([x,.55,.13],[.095,.22,.12],{part:'rolled-arm-end'});
    },
    lcRecliner() {
      sofaBase(.94,.83);flatSeat(.65,.66,.48,0,-.01);
      const back=box([.76,.76,.23],[0,.78,-.36],{radius:.08,part:'recliner-high-back'});back.rotation.x=-.14;
      box([.65,.23,.10],[0,1.03,-.20],{color:pale,radius:.04,part:'head-rest'});
      for(const x of [-.40,.40])box([.21,.44,.89],[x,.49,-.02],{radius:.08});
      for(const x of [-.22,.22])link([x,.22,.31],[x,.31,.78],.032,dark);
      const rest=box([.68,.15,.44],[0,.37,.73],{color:pale,radius:.05,part:'extended-footrest'});rest.rotation.x=.20;
    },
    lcWovenBench() {
      feet(1.28,.37,.48,{},.038);
      for(const z of [-.23,.23])box([1.48,.10,.08],[0,.47,z]);
      for(const x of [-.70,.70])box([.08,.10,.46],[x,.47,0]);
      for(let i=-4;i<=4;i++)box([.11,.045,.43],[i*.15,.52,0],{color:pale,part:'woven-seat-strip'});
      box([1.30,.045,.045],[0,.18,0],{color:shade});
    },
    lcPianoBench() {
      for(const z of [-.19,.19]) { link([-.46,.035,z],[.36,.44,z],.035,{part:'cross-leg'});link([.46,.035,z],[-.36,.44,z],.035,{part:'cross-leg'}); }
      box([1.10,.075,.47],[0,.44,0],wood);box([1.10,.14,.48],[0,.54,0],{radius:.055,part:'wide-bench-cushion'});
      for(const x of [-.57,.57]) { const wheel=cyl(.055,.055,.04,[x,.43,0],gold);wheel.rotation.z=Math.PI/2; }
    },
    lcEntryBench() {
      shell(1.42,.50,.04,.50);box([1.42,.13,.52],[0,.565,0],{color:pale,radius:.05,part:'bench-cushion'});
      for(const x of [-.24,.23])box([.055,.37,.45],[x,.26,0]);
      box([.43,.045,.43],[-.46,.27,0]);door(.42,.37,[.46,.28,.255]);knob(.32,.28,.28);
    },
    lcOttoman() {
      cyl(.30,.32,.07,[0,.035,0],wood);cyl(.33,.33,.12,[0,.39,0],{color:pale,part:'round-seat'});
      for(let i=0;i<8;i++) {const a=i*Math.PI/4;ball([Math.sin(a)*.23,.25,Math.cos(a)*.23],[.135,.18,.135],{part:'soft-segment'});}
    },
    lcTrestleDesk() {
      top(1.48,.74,.89);
      for(const x of [-.49,.49]) { for(const z of [-.30,.30])link([x,.025,z],[x,.82,z*.38],.037,{part:'trestle-leg'});box([.075,.055,.62],[x,.28,0]);box([.18,.065,.62],[x,.80,0]); }
      box([1.07,.055,.055],[0,.30,0],{color:shade});
    },
    lcExecutiveDesk() {
      top(2.10,.94,.92);
      for(const x of [-.77,.77]) {box([.48,.73,.77],[x,.405,0],{part:'desk-pedestal'});box([.52,.08,.81],[x,.04,0],{color:shade});drawers(.40,.61,3,[x,.13,.399]);}
      box([1.06,.38,.05],[0,.56,-.38],{color:pale,part:'modesty-panel'});
    },
    lcDraftingDesk() {
      for(const x of [-.49,.49]) { link([x,.025,-.37],[x,.86,0],.043);link([x,.025,.39],[x,.86,0],.043);link([x,.30,-.23],[x,.30,.24],.03); }
      box([1.04,.05,.055],[0,.39,0],{color:shade});
      const board=box([1.26,.075,.90],[0,.88,0],{part:'inclined-drawing-board'});board.rotation.x=-.32;
      const lip=box([1.20,.07,.06],[0,.755,.42],{color:shade,part:'drawing-board-lip'});lip.rotation.x=-.32;
      for(const x of [-.53,.53])ball([x,.85,0],[.065,.065,.065],gold);
    },
    lcSecretaryDesk() {
      feet(.88,.48,.15,{},.035);box([1.13,.65,.55],[0,.45,-.15]);drawers(1.01,.51,2,[0,.19,.145]);
      box([1.12,.07,.51],[0,1.40,-.15]);for(const x of [-.53,.53])box([.06,.61,.51],[x,1.10,-.15]);
      box([1.08,.59,.04],[0,1.11,-.39],{color:shade});box([1.03,.055,.48],[0,1.13,-.15]);
      for(const x of [-.17,.17])box([.045,.24,.46],[x,1.28,-.15]);
      top(1.12,.45,.84,[0,.22],{part:'fold-down-desktop'});
      for(const x of [-.46,.46])link([x,.48,.09],[x,.78,.40],.022,gold);
    },
    lcCornerDesk() {
      top(1.50,.70,.89,[0,.20]);box([.51,.09,.78],[.495,.845,-.36],{part:'return-wing'});
      for(const x of [-.67,.67])for(const z of [-.04,.44])box([.055,.80,.055],[x,.40,z],dark);
      box([.43,.68,.62],[.50,.39,-.37],{color:shade,part:'return-storage'});
      drawers(.35,.51,2,[.50,.14,-.041]);
      box([1.34,.04,.055],[0,.16,-.04],dark);
    },
    lcPedestalDesk() {
      top(1.62,.74,.89);cyl(.17,.21,.78,[.54,.39,0],{part:'round-pedestal'});
      const foot=panel([[-.19,0],[.19,0],[.07,.24],[-.08,.53],[.15,.79],[-.14,.79],[-.30,.51],[-.12,.22]],.48,[-.47,0,-.24],{part:'sculpted-panel-leg'});
      box([.53,.055,.59],[-.49,.028,0],{color:shade});cyl(.25,.25,.045,[.54,.0225,0],{color:shade});
      box([1.14,.055,.41],[0,.77,0],{color:pale});
    },
    lcCoffeeTable() {
      feet(1.02,.43,.39,{},.039);top(1.22,.62,.48);box([1.09,.06,.49],[0,.18,0],{color:pale,part:'lower-shelf'});
    },
    lcOvalCoffeeTable() {
      const slab=cyl(.47,.47,.095,[0,.4025,0],{part:'oval-stone-top',supportTop:true});slab.scale.x=1.70;
      for(const x of [-.46,.46]) {cyl(.20,.24,.32,[x,.16,0],{part:'paired-pedestal'});cyl(.25,.26,.045,[x,.0225,0],{color:shade});}
      box([1.14,.045,.45],[0,.34,0],{color:pale});
    },
    lcNestingTables() {
      for(const [x,z,r,h]of[[-.26,0,.38,.57],[.36,.16,.29,.39]]) {cyl(r,r,.075,[x,h-.0375,z],{part:'round-nesting-top',supportTop:h>.5});for(let i=0;i<3;i++){const a=i*2*Math.PI/3;link([x+Math.sin(a)*r*.77,0,z+Math.cos(a)*r*.77],[x+Math.sin(a)*r*.60,h-.09,z+Math.cos(a)*r*.60],.025,wood);}}
    },
    lcCSideTable() {
      top(.54,.59,.70);box([.54,.055,.59],[0,.0275,0],{color:shade,part:'under-sofa-foot'});
      for(const x of [-.22,.22])box([.055,.59,.055],[x,.34,-.24],{part:'C-upright'});box([.48,.07,.07],[0,.13,-.24]);box([.48,.06,.07],[0,.59,-.24]);
    },
    lcDrumSideTable() {
      cyl(.33,.33,.085,[0,.5475,0],{part:'drum-top',supportTop:true});cyl(.24,.30,.17,[0,.13,0],{part:'lower-drum'});cyl(.30,.20,.29,[0,.35,0],{part:'upper-drum'});cyl(.31,.32,.045,[0,.0225,0],{color:shade});cyl(.205,.205,.045,[0,.235,0],gold);
    },
    lcLadderShelf() {
      for(const x of [-.41,.41])link([x,.02,.24],[x,1.64,-.17],.037,{part:'sloping-side'});
      for(let i=0;i<5;i++){const y=.15+i*.34,d=.55-i*.068,z=.01-i*.026;box([.87,.065,d],[0,y,z],{part:'graduated-shelf'});box([.86,.10,.035],[0,y+.055,z-d/2+.015],{color:shade});}
    },
    lcCubeShelf() {
      shell(1.48,.43,0,.96,{},true);box([1.36,.055,.40],[0,.48,0]);for(const x of [-.245,.245])box([.055,.82,.39],[x,.48,0]);
    },
    lcSteppedShelf() {
      for(const [x,h]of[[-.51,.55],[0,1.03],[.51,1.51]]) {
        box([.49,.065,.43],[x,.0325,0]);box([.49,.065,.43],[x,h-.0325,0]);
        for(const side of[-1,1])box([.055,h-.09,.43],[x+side*.217,h/2,0]);
        box([.39,h-.11,.03],[x,h/2,-.20],{color:shade});
        if(h>.7)box([.39,.055,.39],[x,.51,0]);if(h>1.3)box([.39,.055,.39],[x,1.0,0]);
      }
    },
    lcArchBookcase() {
      feet(1.02,.29,.14,{},.045);arch(1.20,1.70,.045,[0,.15,-.22],{color:shade,part:'arched-back'});
      for(const x of[-.58,.58])box([.075,1.22,.44],[x,.76,0]);
      curve([[-.58,1.35,0],[-.54,1.65,0],[0,1.89,0],[.54,1.65,0],[.58,1.35,0]],.045,{part:'arched-crown'});
      for(const y of[.18,.62,1.04,1.43])box([1.12,.065,.43],[0,y,0]);
      for(const x of[-.28,.28]){door(.53,.36,[x,.40,.22]);knob(x+(x>0?-.16:.16),.40,.25);}
    },
    lcDisplayCabinet() {
      feet(1.04,.37,.17,{},.045);shell(1.23,.46,.17,1.85);
      for(const y of[.58,.99,1.40])box([1.10,.045,.40],[0,y,0],{color:pale,part:'display-shelf'});
      for(const x of[-.57,0,.57])box([.04,1.50,.04],[x,1.04,.245],gold);
      for(const y of[.28,1.80])box([1.18,.04,.04],[0,y,.245],gold);
      for(const x of[-.285,.285]) {box([.52,1.45,.018],[x,1.04,.242],fixed('#c3dbd3','ceramic',{opacity:.20,part:'clear-display-door'}));handle(x<0?-.055:.055,1.01,.27,.035);}
    },
    lcSlidingWardrobe() {
      shell(1.72,.63,.07,1.89);box([1.80,.07,.69],[0,.035,0],{color:shade,part:'bottom-track'});box([1.80,.075,.69],[0,1.90,0],{part:'top-track'});
      door(.85,1.68,[-.41,.98,.297]);door(.85,1.68,[.41,.98,.354]);
      for(const x of[-.11,.12])box([.035,.54,.035],[x,1.06,x<0?.328:.385],gold);
      box([.72,.045,.018],[-.42,1.58,.326],{color:shade});box([.72,.045,.018],[.42,.42,.383],{color:shade});
    },
    lcMirroredWardrobe() {
      shell(1.94,.64,.12,1.94);box([2.04,.12,.71],[0,.06,0],{color:shade,part:'wide-foot'});box([2.04,.10,.71],[0,1.97,0],{part:'wide-crown'});
      for(const x of[-.64,.64]) {door(.58,1.66,[x,1.04,.34]);box([.45,1.45,.027],[x,1.04,.375],{color:shade,part:'recessed-panel'});handle(x+(x>0?-.20:.20),1.0,.404,.035);}
      door(.61,1.66,[0,1.04,.34]);box([.47,1.50,.026],[0,1.04,.376],{...mirror,part:'long-mirror'});box([.52,.045,.04],[0,1.77,.39],gold);
    },
    lcClothesRail() {
      for(const x of[-.61,.61]) {box([.11,.07,.58],[x,.035,0],{color:shade});link([x,.04,0],[x,1.66,0],.038);link([x,1.37,0],[x+(x>0?.10:-.10),1.48,0],.022);}
      link([-.65,1.66,0],[.65,1.66,0],.034,{part:'clothes-rail'});box([1.31,.06,.55],[0,.24,0],{part:'shoe-shelf'});
      box([1.18,.045,.045],[0,.12,0],{color:shade});
    },
    lcTallChest() {
      feet(.53,.35,.12,{},.037);shell(.71,.51,.11,1.28,{},true);drawers(.59,1.01,5,[0,.16,.270]);
    },
    lcMediaCabinet() {
      feet(1.78,.32,.14,{},.035);shell(2.05,.49,.14,.60,{},true);
      for(const x of[-.34,.34])box([.045,.33,.44],[x,.36,0]);box([.63,.04,.43],[0,.36,0]);
      for(const x of[-.69,.69]) {door(.62,.33,[x,.37,.252]);handle(x,.48,.28,.18);}
    },
    lcShoeCabinet() {
      feet(.78,.22,.12,{},.033);shell(.98,.36,.10,1.08,{},true);
      for(const y of[.35,.80]) {const front=door(.85,.39,[0,y,.202],{part:'tilted-shoe-front'});front.rotation.x=.095;handle(0,y+.13,.237,.27);}
    },
    lcStorageTrunk() {
      box([1.17,.43,.58],[0,.235,0],{part:'trunk-body',radius:.035});top(1.17,.58,.55,[0,0],{part:'trunk-lid'});
      for(const x of[-.38,.38]) {box([.085,.028,.59],[x,.565,0],{color:shade,part:'trunk-strap'});box([.085,.38,.028],[x,.25,.298],{color:shade});}
      box([.13,.13,.045],[0,.38,.31],gold);for(const x of[-.53,.53])box([.10,.12,.055],[x,.11,.29],gold);
    },
    lcApothecaryCabinet() {
      feet(1.12,.31,.14,{},.055);shell(1.38,.45,.13,1.10,{},true);
      for(let r=0;r<3;r++)for(let c=0;c<3;c++){const x=(c-1)*.43,y=.30+r*.28;box([.40,.25,.045],[x,y,.241],{color:pale,part:'collection-drawer'});handle(x,y,.268,.13);}
    },
    lcFilingCabinet() {
      for(const x of[-.23,.23])for(const z of[-.22,.22]){const wheel=cyl(.055,.055,.035,[x,.055,z],dark);wheel.rotation.z=Math.PI/2;}
      shell(.61,.56,.13,.88,{},true);drawers(.51,.31,2,[0,.52,.29]);drawers(.51,.34,1,[0,.16,.29]);
    },
    lcVanityDesk() {
      feet(1.20,.45,.75,{},.026);top(1.46,.69,.85);box([1.32,.14,.52],[0,.73,0],{color:shade});
      for(const x of[-.32,.32]){door(.60,.12,[x,.73,.28]);handle(x,.73,.31,.15);}
      const mirrorPlate=ball([0,1.20,-.24],[.35,.37,.035],{...mirror,part:'oval-mirror'});
      const edge=add(new THREE.TorusGeometry(.35,.023,6,32),[0,1.20,-.27],gold);edge.scale.y=1.06;
      for(const x of[-.24,.24])box([.035,.39,.035],[x,1.0,-.25],gold);
    },
    lcDressingScreen() {
      for(let i=-1;i<=1;i++) {
        const x=i*.55,z=i===0?-.10:.03,angle=-i*.34;
        const frame=arch(.55,1.61,.065,[x,.10,z],{part:'arched-screen-frame'});frame.rotation.y=angle;
        const inset=arch(.45,1.47,.035,[x,.18,z+.052],{color:pale,part:'screen-fabric'});inset.rotation.y=angle;
        for(const sign of[-1,1])cyl(.025,.03,.14,[x+sign*.22,.07,z],gold);
      }
    },
    lcWovenScreen() {
      for(let side=-1;side<=1;side+=2) {
        const section=new THREE.Group(),first=group.children.length;
        for(const x of[-.34,.34])box([.055,1.55,.055],[x,.87,0]);for(const y of[.13,1.62])box([.73,.055,.055],[0,y,0]);
        for(let i=-2;i<=2;i++)box([.045,1.41,.04],[i*.12,.87,0],{color:pale,part:'screen-slat'});
        for(const y of[.50,.87,1.24])box([.66,.04,.04],[0,y,.035],{part:'screen-crossbar'});
        for(const x of[-.29,.29])box([.10,.09,.30],[x,.045,0],{color:shade});
        const parts=group.children.slice(first);parts.forEach(mesh=>section.add(mesh));section.position.x=side*.37;section.rotation.y=-side*.28;group.add(section);
      }
    },
    lcHallTree() {
      for(const x of[-.51,.51])box([.075,1.80,.075],[x,.90,-.19]);
      box([1.12,.075,.50],[0,.13,0],{part:'shoe-shelf'});box([1.12,.09,.54],[0,.54,0],{part:'bench-seat'});
      box([1.12,.075,.36],[0,1.77,-.10],{part:'hat-shelf'});box([1.02,1.05,.055],[0,1.16,-.21],{color:pale,part:'hook-backboard'});
      for(const x of[-.35,0,.35]){link([x,1.40,-.17],[x,1.46,-.04],.022,gold);ball([x,1.46,-.04],[.035,.035,.035],gold);}
      for(const x of[-.50,.50])box([.065,.51,.065],[x,.255,.20]);
    },
  };
  builders[kind]();
  group.updateMatrixWorld(true);
  const initial=new THREE.Box3().setFromObject(group), size=initial.getSize(new THREE.Vector3());
  const scale=Math.min(1,spec.width/size.x,spec.height/size.y,spec.depth/size.z);
  // Only a uniform fit is permitted. It never narrows a wide sofa or bed.
  for(const child of group.children){child.position.multiplyScalar(scale);child.scale.multiplyScalar(scale);}
  group.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(group), center=bounds.getCenter(new THREE.Vector3());
  for(const child of group.children){child.position.x-=center.x;child.position.y-=bounds.min.y;child.position.z-=center.z;}
  group.updateMatrixWorld(true); return group;
}
