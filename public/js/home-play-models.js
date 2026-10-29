import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PLAY_COLLECTION } from './home-play-collection.js';

const SPECS = new Map(PLAY_COLLECTION.map(item => [item.id, item]));
export const isPlayProduct = kind => SPECS.has(kind);
const CREAM = '#fff1d9', INK = '#414550', GOLD = '#d6b465', CORAL = '#dc9888', GREEN = '#91b295';
const PALETTE = ['#db9687','#e1bb6b','#99b18b','#83adaf','#9d9bc3','#cc9aba','#b58b72'];

/** All shapes below are original procedural meshes, with independent disposable resources. */
export function createPlayProduct({ kind, color, material, maps = {} } = {}) {
  const spec = SPECS.get(kind);
  if (!spec) throw new RangeError(`Unknown play product: ${kind}`);
  color ||= spec.defaultColor; material ||= spec.material;
  const body = new THREE.Color(color), pale = body.clone().lerp(new THREE.Color(CREAM), .45), shade = body.clone().multiplyScalar(.73);
  const group = new THREE.Group(); group.name = `play-${kind}`;
  group.userData = { kind, origin: 'bottom', placement: spec.placement, noUpgrade: true, level: 1,
    materialVariant: material, dimensions: { width: spec.width, depth: spec.depth, height: spec.height } };
  const fixed = (tone, extra = {}) => ({ color: tone, paintable: false, ...extra });
  const cream = fixed(CREAM), dark = fixed(INK), gold = fixed(GOLD, { finish: 'gold' }), leaf = fixed(GREEN);
  const glass = fixed('#c0e0df', { transparent: true, opacity: .19, roughness: .15 });
  function add(geometry, at, opts = {}) {
    const paintable = opts.paintable !== false, finish = paintable ? material : opts.finish || 'ceramic';
    const mat = new THREE.MeshStandardMaterial({ color: opts.color ?? body, map: paintable ? maps[finish] || null : null,
      roughness: opts.roughness ?? (['wool','linen','velvet'].includes(finish) ? .92 : finish === 'gold' ? .28 : .53),
      metalness: finish === 'gold' ? .6 : 0,
      ...(opts.transparent ? { transparent: true, opacity: opts.opacity, depthWrite: false, side: THREE.DoubleSide } : {}),
      ...(opts.glow ? { emissive: '#ffc891', emissiveIntensity: .35 } : {}),
    });
    const mesh = new THREE.Mesh(geometry, mat); mesh.position.set(...at);
    mesh.castShadow = !opts.transparent; mesh.receiveShadow = true; mesh.userData = { paintable, part: opts.part || (paintable ? 'body' : 'detail') };
    if(opts.glow)mesh.userData.objectPart='lamp-emitter';
    group.add(mesh); return mesh;
  }
  const box = (size, at, opts = {}) => add(new RoundedBoxGeometry(...size, 1, Math.min(opts.radius ?? .015, ...size.map(n => n * .38))), at, opts);
  function ball(at, scale, opts = {}) { const mesh = add(new THREE.SphereGeometry(1, 12, 8), at, opts); mesh.scale.set(...scale); return mesh; }
  const cyl = (r, rb, h, at, opts = {}) => add(new THREE.CylinderGeometry(r, rb, h, 16), at, opts);
  const cone = (r,h,at,opts = {}) => cyl(0,r,h,at,opts);
  const ring = (r,t,at,opts = {}) => add(new THREE.TorusGeometry(r,t,6,24),at,opts);
  function link(a,b,r,opts={}) { const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b), d = bv.clone().sub(av); const mesh = cyl(r,r,d.length(),av.clone().add(bv).multiplyScalar(.5).toArray(),opts); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()); return mesh; }
  function curve(points,r,opts={}) { return add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),12,r,6,false),[0,0,0],opts); }
  function poly(points, depth, at, opts={}) { const shape = new THREE.Shape(); shape.moveTo(...points[0]); points.slice(1).forEach(p=>shape.lineTo(...p)); shape.closePath(); return add(new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:.004,bevelSize:.004,bevelSegments:1,curveSegments:12}),at,opts); }
  function shape(shape,depth,at,opts={}) { return add(new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:.004,bevelSize:.004,bevelSegments:1,curveSegments:16}),at,opts); }
  function star(at,r,depth,opts={}) { return poly(Array.from({length:10},(_,i)=>{const a=Math.PI/2+i*Math.PI/5,q=i%2?r*.47:r;return[Math.cos(a)*q,Math.sin(a)*q];}),depth,at,opts); }
  function face(x,y,z,w=.09,sleep=false) {
    for(const sign of [-1,1]) {
      if(sleep) curve([[x+sign*w/2-.014,y,z],[x+sign*w/2,y-.008,z+.002],[x+sign*w/2+.014,y,z]],.005,dark);
      else ball([x+sign*w/2,y,z],[.009,.012,.006],dark);
    }
    curve([[x-.017,y-.028,z],[x,y-.036,z+.002],[x+.017,y-.028,z]],.004,dark);
  }
  function wheel(x,y,z,r=.045) { const tire=cyl(r,r,.035,[x,y,z],dark); tire.rotation.x=Math.PI/2; const hub=cyl(r*.43,r*.43,.039,[x,y,z],cream); hub.rotation.x=Math.PI/2; }
  function disk(r,depth,at,opts={}) { const mesh=cyl(r,r,depth,at,opts);mesh.rotation.x=Math.PI/2;return mesh; }
  function clock(at,r) {
    disk(r,.02,at,cream);
    for(let i=0;i<4;i++){const a=i*Math.PI/2;box([.015,.023,.01],[at[0]+Math.sin(a)*r*.76,at[1]+Math.cos(a)*r*.76,at[2]+.018],dark);}
    for(const[part,length,width,depth,tone]of[['clock-hour',r*.46,.014,.023,INK],['clock-minute',r*.65,.010,.029,INK],['clock-second',r*.72,.004,.035,CORAL]]){
      const pivot=new THREE.Group();pivot.name=part;pivot.position.set(at[0],at[1],at[2]+depth);pivot.userData.objectPart=part;group.add(pivot);
      const hand=box([width,length,.006],[0,length/2,0],fixed(tone));group.remove(hand);pivot.add(hand);
    }
    ball([at[0],at[1],at[2]+.03],[.014,.014,.009],gold);
  }
  function frame(w,h) {box([w,h,.055],[0,h/2,.028]);box([w-.06,h-.06,.012],[0,h/2,.063],cream);}
  function feet(y=.026,z=.06,gap=.07) {for(const sign of[-1,1])ball([sign*gap,y,z],[.043,.026,.06],{color:shade});}
  function eyePair(x,y,z,w=.11){for(const sign of[-1,1])ball([x+sign*w/2,y,z],[.010,.013,.008],dark);}

  const builders = {
    toyBiplane() {
      ball([0,.14,0],[.26,.075,.075]);box([.19,.04,.51],[0,.17,0],{color:pale});box([.18,.035,.53],[0,.29,0]);
      for(const z of[-.20,.20])for(const x of[-.05,.06])link([x,.18,z],[x,.27,z],.008,gold);
      box([.13,.025,.23],[-.21,.18,0],{color:pale});poly([[-.07,0],[.04,0],[-.01,.13]],.025,[-.21,.19,-.012]);
      const prop=box([.018,.24,.035],[.27,.145,0],cream);prop.rotation.x=.35;ball([.28,.145,0],[.025,.025,.025],gold);
      for(const z of[-.09,.09])wheel(.05,.045,z);ball([-.045,.20,0],[.055,.022,.046],dark);
    },
    toySailboat() {
      ball([0,.075,0],[.25,.075,.12]);box([.40,.018,.18],[0,.12,0],cream);link([-.015,.125,0],[-.015,.55,0],.009,gold);
      poly([[0,0],[0,.36],[.23,.02]],.012,[-.005,.17,-.006],cream);poly([[0,0],[0,.28],[-.19,.02]],.012,[-.03,.17,-.006],{color:pale});
      box([.16,.035,.12],[-.06,.15,0]);poly([[0,0],[.08,-.02],[0,-.04]],.01,[-.015,.56,0],fixed(CORAL));
      for(const x of[-.14,.05,.14])disk(.022,.008,[x,.078,.107],gold);
    },
    toyFireEngine() {
      box([.58,.09,.23],[0,.105,0],{color:shade});box([.19,.19,.25],[.19,.205,0]);box([.37,.14,.24],[-.12,.18,0]);
      for(const z of[-.124,.124])box([.12,.075,.008],[.19,.24,z],fixed('#b8d9dd'));
      box([.008,.073,.20],[.29,.24,0],fixed('#b8d9dd'));for(const z of[-.14,.14])for(const x of[-.20,.20])wheel(x,.055,z,.054);
      for(const z of[-.075,.075])link([-.28,.29,z],[.22,.33,z],.012,cream);
      for(let i=0;i<5;i++)link([-.25+i*.10,.292+i*.008,-.075],[-.25+i*.10,.292+i*.008,.075],.009,cream);
      for(const z of[-.123,.123])for(let i=0;i<3;i++)box([.27,.015,.009],[-.13,.145+i*.032,z],gold);
      box([.08,.035,.15],[.19,.32,0],fixed('#d77d73'));
    },
    toyRocketShip() {
      cyl(.09,.09,.34,[0,.32,0]);cone(.091,.15,[0,.565,0],{color:shade});cyl(.073,.10,.075,[0,.13,0],gold);
      for(let i=0;i<3;i++){const a=i*Math.PI*2/3;const fin=poly([[0,0],[.15,-.10],[.12,.09],[0,.20]],.025,[0,.15,0],{color:shade});fin.rotation.y=a;}
      disk(.047,.021,[0,.36,.092],gold);disk(.035,.025,[0,.36,.104],fixed('#b7dbe1'));
      cyl(.047,.033,.045,[0,.071,0],fixed(CORAL));ring(.092,.009,[0,.24,0],cream).rotation.x=Math.PI/2;
    },
    toySubmarine() {
      ball([0,.12,0],[.25,.12,.12]);box([.13,.09,.10],[.03,.25,0]);curve([[.03,.29,0],[.03,.37,0],[.11,.37,0]],.014,gold);
      for(const x of[-.13,0,.13]){disk(.034,.017,[x,.14,.112],gold);disk(.023,.020,[x,.14,.122],fixed('#bcdfe3'));}
      for(const z of[-.12,.12])box([.13,.025,.12],[-.12,.07,z],{color:shade});link([-.25,.12,0],[-.32,.12,0],.017,gold);
      for(let i=0;i<4;i++){const a=i*Math.PI/2;ball([-.32,.12+Math.cos(a)*.057,Math.sin(a)*.057],[.014,.036,.036],{color:pale});}
    },
    toyHelicopter() {
      ball([.09,.16,0],[.18,.115,.105]);ball([.195,.175,0],[.09,.077,.089],fixed('#b1d2db'));link([-.03,.16,0],[-.30,.23,0],.031);
      poly([[0,0],[-.06,.06],[-.04,.13],[.025,.09]],.018,[-.28,.18,-.009]);link([.055,.25,0],[.055,.32,0],.018,gold);
      for(const a of[0,Math.PI/2]){const rotor=box([.53,.012,.045],[.055,.33,0],{color:shade});rotor.rotation.y=a;}
      for(const z of[-.12,.12]){curve([[-.12,.035,z],[.18,.035,z],[.25,.07,z]],.012,cream);for(const x of[-.04,.15])link([x,.11,z*.65],[x,.035,z],.009,cream);}
      disk(.043,.013,[-.29,.24,.025],gold);box([.015,.11,.015],[-.29,.24,.038],cream);
    },
    toyTriceratops() {
      ball([-.045,.17,0],[.19,.11,.12]);ball([.16,.20,0],[.10,.09,.09]);ball([.09,.26,0],[.035,.105,.135],{color:shade});
      for(const x of[-.16,.075])for(const z of[-.08,.08])ball([x,.06,z],[.043,.065,.043]);
      curve([[-.20,.18,0],[-.30,.19,0],[-.34,.24,0]],.025);for(const z of[-.045,.045]){const h=cone(.023,.085,[.20,.29,z],cream);h.rotation.z=-.7;}
      cone(.018,.055,[.25,.255,0],cream);for(const z of[-.079,.079])ball([.19,.22,z],[.012,.013,.008],dark);
      for(const z of[-.075,0,.075])ball([.085,.34,z],[.018,.025,.021],cream);
    },
    toyDuckling() {
      ball([0,.11,-.02],[.13,.095,.13]);ball([0,.255,.055],[.095,.09,.09]);ball([0,.232,.145],[.067,.025,.048],fixed('#df9c51'));
      for(const sign of[-1,1]){ball([sign*.115,.135,-.015],[.025,.058,.075],{color:shade});ball([sign*.065,.025,.055],[.049,.021,.063],fixed('#df9c51'));}
      eyePair(0,.275,.128,.085);ball([0,.15,-.13],[.045,.048,.042]);
    },
    toyPenguin() {
      ball([0,.19,0],[.14,.18,.12]);ball([0,.32,.025],[.11,.105,.10]);ball([0,.17,.10],[.10,.13,.027],cream);
      for(const sign of[-1,1]){const wing=ball([sign*.14,.19,0],[.032,.12,.048],{color:shade});wing.rotation.z=sign*.25;ball([sign*.065,.03,.065],[.058,.027,.065],fixed('#dfb268'));}
      ball([0,.29,.13],[.039,.022,.035],fixed('#dfb268'));eyePair(0,.34,.112,.078);
      ring(.107,.021,[0,.26,.005],fixed(CORAL)).rotation.x=Math.PI/2;box([.045,.13,.025],[.073,.205,.103],fixed(CORAL));
    },
    toyCatNap() {
      ball([-.025,.095,-.01],[.18,.095,.135]);ball([.10,.145,.075],[.087,.073,.075]);
      for(const x of[.047,.149])cone(.032,.073,[x,.225,.064],{color:shade});
      curve([[-.16,.12,-.08],[-.20,.08,.03],[-.12,.045,.13],[.025,.045,.13]],.029,{color:pale});
      for(const x of[.055,.135])ball([x,.035,.13],[.038,.025,.045]);face(.10,.155,.144,.069,true);
    },
    toyPuppy() {
      ball([0,.15,0],[.11,.135,.10]);ball([0,.31,.025],[.12,.105,.105]);ball([0,.28,.116],[.071,.047,.05],cream);
      for(const sign of[-1,1]){ball([sign*.115,.26,.013],[.045,.10,.057],{color:shade});ball([sign*.07,.075,.082],[.038,.077,.04]);}
      eyePair(0,.331,.115,.10);ball([0,.30,.161],[.026,.018,.018],dark);curve([[.05,.09,-.06],[.12,.10,-.12],[.14,.18,-.10]],.027);
      ring(.083,.012,[0,.22,0],fixed('#94b2a9')).rotation.x=Math.PI/2;
    },
    toyWhale() {
      ball([-.04,.12,0],[.21,.105,.13]);ball([-.07,.075,.043],[.16,.04,.10],cream);
      curve([[.13,.12,0],[.24,.14,0],[.27,.20,0]],.034);
      for(const sign of[-1,1]){const tail=ball([.285,.215,sign*.065],[.045,.025,.085]);tail.rotation.x=sign*.3;ball([-.025,.065,sign*.13],[.07,.025,.043],{color:shade});}
      for(const z of[-.117,.117])ball([-.15,.14,z],[.012,.014,.006],dark);
      curve([[-.07,.20,0],[-.07,.29,0],[-.13,.31,0]],.013,fixed('#b9d8e0'));curve([[-.07,.27,0],[-.015,.315,0]],.012,fixed('#b9d8e0'));
    },
    toyFox() {
      ball([0,.13,-.02],[.105,.12,.10]);ball([0,.295,.015],[.115,.10,.10]);
      for(const sign of[-1,1]){poly([[-.035,0],[.035,0],[0,.115]],.045,[sign*.075,.36,-.025]);ball([sign*.061,.268,.093],[.056,.043,.04],cream);ball([sign*.055,.035,.072],[.043,.027,.05],{color:shade});}
      const tail=ball([.095,.14,-.11],[.08,.13,.075]);tail.rotation.z=-.4;ball([.14,.23,-.11],[.049,.043,.05],cream);eyePair(0,.313,.105,.10);ball([0,.27,.132],[.021,.014,.016],dark);
    },
    toyElephant() {
      ball([-.05,.17,0],[.15,.12,.13]);ball([.12,.25,0],[.10,.10,.10]);
      for(const x of[-.14,.06])for(const z of[-.08,.08])cyl(.035,.043,.13,[x,.065,z]);
      for(const sign of[-1,1])ball([.085,.24,sign*.11],[.065,.105,.025],{color:pale});
      curve([[.19,.24,0],[.23,.16,0],[.28,.15,0],[.29,.24,0]],.026);for(const z of[-.085,.085])ball([.16,.275,z],[.011,.014,.006],dark);
      curve([[-.18,.18,0],[-.24,.19,0],[-.25,.12,0]],.010,{color:shade});
    },
    moodSprout() {
      ball([0,.16,0],[.13,.13,.105]);feet(.024,.04,.065);face(0,.19,.098);
      link([0,.27,0],[.005,.37,0],.014,leaf);const a=ball([-.06,.36,0],[.08,.033,.04],leaf);a.rotation.z=-.35;const b=ball([.058,.39,0],[.078,.034,.039],leaf);b.rotation.z=.4;
    },
    moodStar() {star([0,.23,-.065],.185,.13);feet(.027,.015,.07);face(0,.23,.072,.10);for(const s of[-1,1])ball([s*.17,.16,0],[.026,.031,.03],{color:pale});},
    moodRaindrop() {
      const s=new THREE.Shape();s.moveTo(0,.40);s.bezierCurveTo(-.02,.29,-.15,.22,-.13,.12);s.bezierCurveTo(-.11,-.02,.12,-.02,.13,.12);s.bezierCurveTo(.15,.22,.02,.29,0,.40);shape(s,.14,[0,.02,-.07]);feet(.023,.03,.062);face(0,.18,.077,.09);
      link([.105,.08,.07],[.105,.18,.07],.009,leaf);for(let i=0;i<5;i++){const a=i*Math.PI*2/5;ball([.105+Math.cos(a)*.025,.20+Math.sin(a)*.025,.081],[.021,.021,.012],cream);}ball([.105,.20,.095],[.015,.015,.009],gold);
    },
    moodPeach() {for(const s of[-1,1])ball([s*.055,.17,0],[.105,.135,.12]);feet(.025,.04,.065);face(0,.19,.112);link([0,.29,0],[.025,.34,0],.012,{color:shade});const l=ball([.069,.321,0],[.075,.025,.034],leaf);l.rotation.z=-.25;},
    moodToast() {
      box([.25,.25,.13],[0,.17,0],{radius:.04});ball([0,.285,0],[.135,.06,.067]);box([.21,.22,.012],[0,.18,.073],cream);ball([0,.28,.074],[.112,.042,.008],cream);
      feet(.024,.015,.063);for(const s of[-1,1])ball([s*.151,.15,0],[.028,.035,.036]);face(0,.18,.085);box([.065,.037,.025],[.048,.269,.097],gold);
    },
    moodAcorn() {ball([0,.17,0],[.11,.14,.10]);ball([0,.29,0],[.142,.055,.13],{color:shade});cyl(.018,.022,.07,[0,.355,0],{color:shade});feet(.025,.03,.057);face(0,.19,.095);for(const s of[-1,1])ball([s*.11,.15,0],[.025,.035,.034]);poly([[-.10,0],[0,-.07],[.1,0],[0,.025]],.035,[0,.24,.08],leaf);},
    musicGuitar() {
      ball([0,.19,0],[.135,.15,.055]);ball([0,.32,0],[.10,.10,.05]);box([.044,.32,.04],[0,.52,0],{color:shade});box([.075,.11,.045],[0,.73,0]);
      disk(.044,.008,[0,.30,.052],dark);box([.10,.023,.012],[0,.12,.057],gold);
      for(const x of[-.012,0,.012])link([x,.13,.067],[x,.73,.031],.0025,cream);for(const sign of[-1,1])for(const y of[.70,.75])ball([sign*.05,y,0],[.016,.009,.012],gold);
      for(const sign of[-1,1])link([0,.25,-.04],[sign*.11,0,.07],.012,dark);link([0,.22,-.04],[0,0,-.10],.012,dark);
    },
    musicKeyboard() {
      box([.68,.13,.25],[0,.075,0]);box([.47,.018,.13],[0,.149,.035],cream);
      for(let i=0;i<10;i++)box([.003,.021,.13],[-.212+i*.047,.15,.035],dark);
      for(const i of[0,1,3,4,5,7,8])box([.022,.025,.075],[-.188+i*.047,.165,.01],dark);
      for(const s of[-1,1]){box([.067,.009,.15],[s*.285,.145,0],dark);cyl(.017,.017,.016,[s*.20,.159,-.087],gold);}
      box([.12,.009,.035],[0,.149,-.087],fixed('#84a5a9'));
    },
    musicDrums() {
      disk(.125,.16,[0,.14,.05]);disk(.109,.012,[0,.14,.138],cream);ring(.115,.01,[0,.14,.147],gold);
      for(const s of[-1,1]){cyl(.075,.075,.085,[s*.11,.35,0]);cyl(.068,.068,.01,[s*.11,.398,0],cream);link([s*.11,.30,0],[s*.11,.10,0],.01,gold);link([s*.26,.03,0],[s*.26,.49,0],.009,gold);cyl(.105,.115,.018,[s*.26,.49,0],gold);for(const z of[-.08,.08])link([s*.26,.11,0],[s*.26+.04,.02,z],.009,gold);}
      cyl(.055,.055,.025,[0,.19,-.17],dark);link([0,.18,-.17],[0,.02,-.17],.014,gold);for(const s of[-1,1])link([s*.11,.40,-.04],[s*.02,.44,.06],.006,cream);
    },
    musicXylophone() {
      for(const z of[-.09,.09])box([.52,.055,.035],[0,.04,z]);
      for(let i=0;i<7;i++)box([.052,.023,.27-i*.018],[-.21+i*.070,.081,0],fixed(PALETTE[i]));
      for(const s of[-1,1]){link([s*.16,.11,-.11],[s*.025,.13,.11],.007,gold);ball([s*.025,.13,.11],[.026,.026,.026],{color:pale});}
    },
    musicHarp() {
      box([.38,.065,.19],[0,.033,0]);link([-.14,.06,0],[-.14,.61,0],.025,gold);
      curve([[-.14,.61,0],[-.08,.68,0],[.10,.56,0],[.15,.49,0]],.03);link([.15,.49,0],[.11,.07,0],.035);
      for(let i=0;i<6;i++){const x=-.10+i*.04;link([x,.09,0],[x,.62-i*.022,0],.0035,cream);}
      for(const x of[-.14,.12])ball([x,.073,0],[.038,.022,.07],gold);
    },
    musicBoxStage() {
      cyl(.18,.19,.11,[0,.055,0]);cyl(.167,.167,.025,[0,.125,0],gold);cyl(.14,.14,.012,[0,.145,0],cream);
      const lid=disk(.18,.027,[0,.31,-.14]);lid.rotation.x+=.25;const mirror=disk(.15,.012,[0,.31,-.118],fixed('#bbd0d0',{roughness:.12}));mirror.rotation.x+=.25;
      cyl(.013,.013,.16,[0,.235,0],gold);cone(.075,.09,[0,.31,0],{color:pale});ball([0,.39,0],[.026,.045,.023],cream);ball([0,.455,0],[.037,.04,.035],cream);curve([[-.066,.42,0],[0,.48,0],[.066,.42,0]],.009,cream);
      ball([.19,.07,0],[.025,.012,.019],gold);
    },
    hobbyTelescope() {
      for(let i=0;i<3;i++){const a=i*Math.PI*2/3;link([0,.37,0],[Math.cos(a)*.18,.01,Math.sin(a)*.18],.014,gold);}
      link([0,.28,0],[0,.48,0],.021,{color:shade});link([-.16,.43,0],[.20,.61,0],.065);link([.20,.61,0],[.24,.63,0],.077,gold);link([.24,.63,0],[.25,.635,0],.066,fixed('#a9d2db'));
      link([-.16,.43,0],[-.21,.405,0],.026,dark);ball([.01,.47,.074],[.028,.028,.014],gold);
    },
    hobbyEasel() {
      for(const s of[-1,1])link([s*.17,.02,.10],[s*.06,.60,-.02],.016);link([0,.57,-.025],[0,.02,-.18],.016);
      box([.40,.035,.10],[0,.17,.02]);box([.32,.33,.025],[0,.36,.003],cream);box([.33,.34,.012],[0,.36,-.016],{color:shade});
      ball([.08,.44,.024],[.042,.042,.006],gold);poly([[-.14,0],[-.14,.07],[-.05,.16],[.14,0]],.006,[0,.205,.022],leaf);poly([[-.14,0],[.05,.12],[.14,.07],[.14,0]],.008,[0,.21,.03],fixed('#80a9b2'));
      for(const x of[-.12,.12])cyl(.023,.024,.025,[x,.20,.04],fixed(x<0?CORAL:GREEN));
    },
    hobbyChess() {
      box([.46,.035,.40],[0,.018,0]);box([.41,.009,.35],[0,.04,0],cream);
      // One mesh for the alternating chess squares keeps a detailed board inexpensive.
      const ps=[];for(let x=0;x<6;x++)for(let z=0;z<6;z++)if((x+z)%2===0){const a=-.205+x*.41/6,b=-.175+z*.35/6,c=a+.41/6,d=b+.35/6;ps.push(a,.046,b,c,.046,d,c,.046,b,a,.046,b,a,.046,d,c,.046,d);}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));geo.computeVertexNormals();add(geo,[0,0,0],{color:shade});
      for(const [x,z,h,r,tone]of[[-.13,-.11,.09,.023,CREAM],[0,-.11,.13,.027,CREAM],[.13,-.11,.07,.025,CREAM],[-.13,.11,.07,.025,INK],[0,.11,.12,.028,INK],[.13,.11,.09,.023,INK]]){cyl(r*.6,r,h,[x,.045+h/2,z],fixed(tone));ball([x,.045+h,z],[r*.85,r*.85,r*.85],fixed(tone));}
      box([.045,.01,.01],[0,.199,-.11],gold);box([.01,.04,.01],[0,.197,-.11],gold);
    },
    hobbyArtCaddy() {
      box([.40,.13,.23],[0,.07,0]);for(const s of[-1,1])box([.035,.25,.23],[s*.18,.18,0]);link([-.18,.315,0],[.18,.315,0],.016,{color:shade});
      for(let i=0;i<4;i++){const x=-.12+i*.045;link([x,.12,-.03],[x,.31+(i%2)*.025,-.03],.007,fixed(PALETTE[i]));cone(.012,.035,[x,.33+(i%2)*.025,-.03],cream);}
      cyl(.034,.034,.19,[.11,.22,-.015],cream);for(const x of[-.09,0,.09]){cyl(.027,.027,.045,[x,.153,.071],fixed(PALETTE[Math.round((x+.09)*20)]));cyl(.024,.024,.01,[x,.181,.071],gold);}
      for(const x of[.005,.055])ring(.023,.006,[x,.23,.06],fixed('#97a9b5'));link([.025,.22,.06],[.04,.15,.06],.006,dark);
    },
    hobbyMicroscope() {
      box([.27,.035,.25],[0,.02,0]);curve([[.06,.035,-.07],[.11,.26,-.07],[.07,.35,-.02],[-.03,.38,.035]],.026);
      link([-.03,.38,.035],[-.10,.48,.045],.035,dark);link([-.03,.38,.035],[.025,.29,.025],.032);box([.19,.022,.16],[0,.185,.045],{color:shade});
      box([.09,.005,.055],[0,.201,.045],cream);disk(.045,.035,[.10,.285,.005],gold);cyl(.025,.03,.07,[0,.075,.04],gold);cyl(.041,.041,.012,[0,.113,.04],cream);
    },
    hobbyTypewriter() {
      box([.43,.095,.31],[0,.055,0]);box([.39,.08,.15],[0,.13,-.07]);box([.30,.025,.13],[0,.113,.072],{color:shade});
      for(let row=0;row<3;row++)for(let col=0;col<6;col++)cyl(.011,.011,.012,[-.12+col*.047,.133+row*.002,.036+row*.038],cream);
      link([-.19,.215,-.09],[.19,.215,-.09],.024,dark);for(const s of[-1,1]){const k=cyl(.035,.035,.025,[s*.213,.215,-.09],gold);k.rotation.z=Math.PI/2;}
      box([.22,.13,.008],[0,.268,-.095],cream);for(let i=0;i<3;i++)box([.14-i*.025,.004,.004],[0,.28-i*.018,-.089],dark);box([.16,.009,.023],[0,.135,.14],gold);
    },
    wallArchMirror() {
      const arch=new THREE.Shape();arch.moveTo(-.25,0);arch.lineTo(.25,0);arch.lineTo(.25,.61);arch.absarc(0,.61,.25,0,Math.PI,false);arch.lineTo(-.25,0);shape(arch,.055,[0,0,0]);
      const inner=new THREE.Shape();inner.moveTo(-.215,.035);inner.lineTo(.215,.035);inner.lineTo(.215,.61);inner.absarc(0,.61,.215,0,Math.PI,false);inner.closePath();shape(inner,.008,[0,0,.061],fixed('#bfd1cc',{roughness:.15}));
      for(const [x,h]of[[-.10,.36],[.04,.22]]){const glint=box([.018,h,.007],[x,.50,.079],cream);glint.rotation.z=-.40;}box([.51,.033,.075],[0,.017,.038]);
    },
    wallSunMirror() {
      disk(.21,.055,[0,.36,.03]);disk(.176,.012,[0,.36,.066],fixed('#bdd0d2',{roughness:.15}));
      for(let i=0;i<12;i++){const a=i*Math.PI/6,r=i%2?.28:.31;const ray=box([.033,i%2?.13:.18,.035],[Math.sin(a)*r,.36+Math.cos(a)*r,.03]);ray.rotation.z=-a;}
      const glint=box([.013,.15,.007],[-.045,.39,.077],cream);glint.rotation.z=-.4;
    },
    wallCloudMirror() {
      const outline=new THREE.Shape();outline.moveTo(-.3,0);outline.bezierCurveTo(-.41,.02,-.38,.18,-.25,.19);outline.bezierCurveTo(-.27,.36,-.02,.43,.075,.29);outline.bezierCurveTo(.23,.39,.38,.24,.31,.16);outline.bezierCurveTo(.45,.06,.36,-.01,.26,0);outline.closePath();shape(outline,.05,[0,.035,0]);
      const inner=outline.clone();const mirror=shape(inner,.009,[0,.061,.06],fixed('#c4d9d7',{roughness:.15}));mirror.scale.set(.88,.82,1);
      for(const[x,h]of[[-.12,.10],[.04,.17]]){const glint=box([.014,h,.006],[x,.18,.079],cream);glint.rotation.z=-.35;}box([.19,.018,.058],[0,.012,.029]);
    },
    wallPendulum() {
      box([.35,.65,.12],[0,.36,.06]);ball([0,.67,.06],[.175,.15,.06]);disk(.145,.018,[0,.60,.131],{color:shade});clock([0,.60,.145],.125);
      box([.23,.24,.015],[0,.20,.13],{color:shade});
      const pendulum=new THREE.Group();pendulum.name='clock-pendulum';pendulum.position.set(0,.35,.152);pendulum.userData.objectPart='clock-pendulum';group.add(pendulum);
      const rod=link([0,0,0],[0,-.21,0],.011,gold);group.remove(rod);pendulum.add(rod);
      const weight=disk(.055,.022,[0,-.22,.005],gold);group.remove(weight);pendulum.add(weight);box([.39,.055,.17],[0,.028,.085]);
    },
    wallDaisyClock() {
      for(let i=0;i<8;i++){const a=i*Math.PI/4;const p=ball([Math.sin(a)*.22,.32+Math.cos(a)*.22,.055],[.075,.105,.047]);p.rotation.z=-a;}
      disk(.175,.065,[0,.32,.057],{color:shade});clock([0,.32,.10],.148);
    },
    wallGeoArt() {
      frame(.70,.60);disk(.09,.018,[.18,.44,.085],gold);poly([[-.25,0],[-.25,.26],[-.13,.37],[0,.26],[0,0]],.018,[0,.065,.08],fixed('#85aba4'));
      box([.18,.13,.025],[.17,.13,.09],fixed(CORAL));box([.12,.08,.028],[.20,.235,.09],fixed('#ac9ab7'));curve([[-.2,.18,.105],[-.2,.34,.105],[-.125,.40,.105],[-.055,.34,.105],[-.055,.18,.105]],.014,cream);
    },
    wallWhaleArt() {
      frame(.80,.46);box([.73,.39,.012],[0,.23,.078],fixed('#b5d6db'));ball([-.06,.25,.104],[.20,.09,.023]);
      for(const sign of[-1,1]){const tail=ball([.21,.28+sign*.042,.111],[.070,.035,.018]);tail.rotation.z=sign*.5;}ball([-.16,.27,.13],[.010,.010,.007],dark);ball([-.03,.20,.127],[.065,.025,.014],{color:pale});
      for(let i=0;i<3;i++)curve([[-.34,.07+i*.025,.10+i*.008],[-.15,.095+i*.025,.10+i*.008],[.05,.07+i*.025,.10+i*.008],[.33,.10+i*.025,.10+i*.008]],.010,fixed(i%2?CREAM:'#85a9ba'));
    },
    wallLeafArt() {
      frame(.42,.75);curve([[0,.08,.09],[.015,.33,.09],[-.025,.63,.09]],.009,gold);
      for(let i=0;i<6;i++){const sign=i%2?-1:1;const l=ball([sign*.062,.18+i*.075,.094],[.073,.029,.015],leaf);l.rotation.z=sign*.5;link([0,.15+i*.075,.10],[sign*.10,.20+i*.075,.10],.0035,gold);}
    },
    decorDollhouse() {
      for(const y of[.03,.30,.58])box([.63,.035,.28],[0,y,0]);for(const x of[-.30,0,.30])box([.025,.53,.27],[x,.30,0]);
      box([.62,.54,.025],[0,.30,-.125],{color:pale});for(const s of[-1,1]){const roof=box([.38,.03,.33],[s*.16,.67,0],{color:shade});roof.rotation.z=-s*.5;}
      for(let i=0;i<4;i++)box([.10,.025,.07],[.17,.06+i*.06,.08-i*.05],cream);
      box([.18,.055,.12],[-.15,.065,0],cream);box([.06,.025,.10],[-.21,.108,0],{color:pale});box([.14,.02,.12],[.15,.43,0],gold);for(const x of[.10,.20])link([x,.32,0],[x,.42,0],.01,gold);
      box([.11,.10,.08],[-.15,.37,0]);box([.08,.10,.008],[.15,.47,-.105],fixed('#b5d6d7'));
    },
    decorLavaLamp() {
      cyl(.075,.115,.10,[0,.05,0]);cyl(.07,.075,.08,[0,.14,0],gold);cyl(.047,.09,.30,[0,.32,0],glass);cone(.065,.10,[0,.52,0]);
      for(const[x,y,z,r]of[[-.018,.22,0,.043],[.021,.32,-.005,.028],[-.011,.40,.01,.025]])ball([x,y,z],[r,r*1.4,r],fixed(CORAL,{glow:true}));ring(.087,.008,[0,.18,0],gold).rotation.x=Math.PI/2;
    },
    decorOrbLamp() {
      cyl(.14,.15,.035,[0,.018,0]);link([-.09,.04,0],[-.09,.25,0],.016,gold);curve([[-.09,.18,0],[-.15,.35,0],[.025,.43,0],[.13,.31,0]],.017);
      ball([.03,.28,0],[.115,.115,.115],fixed(CREAM,{glow:true}));cyl(.045,.045,.02,[.03,.157,0],gold);box([.035,.016,.024],[.07,.041,.07],gold);
    },
    decorTerrarium() {
      box([.38,.04,.29],[0,.02,0]);box([.34,.014,.25],[0,.049,0],fixed('#9b9473'));box([.37,.25,.28],[0,.18,0],glass);
      for(const x of[-.18,.18])for(const z of[-.13,.13])link([x,.05,z],[x,.31,z],.006,gold);
      for(const z of[-.13,.13]){link([-.18,.31,z],[0,.45,z],.007,gold);link([0,.45,z],[.18,.31,z],.007,gold);}link([0,.45,-.13],[0,.45,.13],.007,gold);
      for(const[x,y,z]of[[-.09,.12,-.03],[.07,.10,.06],[.04,.16,-.06]]){link([x,.05,z],[x,y+.03,z],.008,leaf);for(const sign of[-1,1])ball([x+sign*.025,y,z],[.04,.022,.025],leaf);}
      for(const x of[-.10,.10])ball([x,.06,.075],[.032,.017,.027],cream);
    },
    decorCarousel() {
      cyl(.21,.23,.055,[0,.028,0]);cyl(.19,.20,.025,[0,.068,0],gold);cyl(.027,.027,.42,[0,.30,0],gold);cone(.24,.15,[0,.54,0]);
      for(let i=0;i<3;i++){const a=i*Math.PI*2/3,x=Math.cos(a)*.14,z=Math.sin(a)*.14;link([x,.09,z],[x,.47,z],.008,gold);ball([x,.26,z],[.057,.027,.025],cream);ball([x+.048,.31,z],[.025,.035,.023],cream);for(const dx of[-.035,.035])link([x+dx,.25,z],[x+dx+.014,.20,z],.009,cream);}
      ball([0,.635,0],[.025,.025,.025],gold);ring(.232,.009,[0,.465,0],cream).rotation.x=Math.PI/2;
    },
    decorSnowGlobe() {
      cyl(.145,.16,.065,[0,.033,0]);cyl(.15,.15,.025,[0,.078,0],gold);ball([0,.26,0],[.158,.17,.158],glass);cyl(.128,.128,.015,[0,.10,0],cream);
      cone(.07,.20,[-.055,.21,-.03],fixed('#9baeb4'));cone(.034,.08,[-.055,.29,-.03],cream);box([.085,.075,.07],[.045,.144,.04],fixed(CORAL));
      poly([[-.05,0],[.05,0],[0,.055]],.08,[.045,.183,0],cream);box([.024,.043,.008],[.045,.132,.08],gold);cone(.05,.13,[.08,.18,-.07],leaf);cyl(.009,.009,.05,[.08,.12,-.07],gold);
    },
    decorBookStack() {
      for(let i=0;i<3;i++){const y=.033+i*.063;const b=box([.37-i*.025,.055,.27],[0,y,0],i?fixed(PALETTE[i+3]):{});b.rotation.y=(i-1)*.10;const pages=box([.32-i*.025,.037,.274],[0,y,.006],cream);pages.rotation.y=(i-1)*.10;}
      for(const x of[-.055,.055]){const lens=ring(.046,.005,[x,.207,.02],gold);lens.rotation.x=Math.PI/2;}link([-.01,.207,.02],[.01,.207,.02],.004,gold);for(const x of[-.10,.10])link([x,.207,.02],[x,.22,-.09],.004,gold);box([.032,.007,.19],[.10,.197,.08],fixed(CORAL));
    },
    decorLetterRack() {
      box([.34,.035,.22],[0,.018,0]);for(const z of[-.08,.08])poly([[-.16,0],[.16,0],[.16,.11],[.07,.24],[0,.14],[-.07,.21],[-.16,.10]],.018,[0,.035,z]);
      for(let i=0;i<3;i++){const letter=box([.23,.16,.009],[(i-1)*.022,.16,-.045+i*.044],fixed([CREAM,'#b2c7c6','#e4b5a4'][i]));letter.rotation.z=(i-1)*.08;}
      disk(.024,.012,[0,.09,.109],gold);link([-.10,.17,.063],[0,.12,.063],.003,cream);link([0,.12,.063],[.10,.17,.063],.003,cream);
    },
  };
  builders[kind]();
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group), size = bounds.getSize(new THREE.Vector3());
  const fit = Math.min(1, spec.width / size.x, spec.height / size.y, spec.depth / size.z);
  for(const child of group.children) { child.position.multiplyScalar(fit); child.scale.multiplyScalar(fit); }
  group.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(group), center = fitted.getCenter(new THREE.Vector3());
  for(const child of group.children) {child.position.x-=center.x;child.position.y-=fitted.min.y;child.position.z-=spec.placement==='wall'?fitted.min.z:center.z;}
  group.updateMatrixWorld(true);return group;
}
