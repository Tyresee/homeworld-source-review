import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { HOUSEHOLD_COLLECTION } from './home-household-collection.js';

const specs = new Map(HOUSEHOLD_COLLECTION.map(row => [row.id,row]));
export const isHouseholdProduct = kind => specs.has(kind);

/** Independent original model instances, with no shared disposable resources. */
export function createHouseholdProduct({kind, color, material, maps = {}} = {}) {
  const spec = specs.get(kind); if (!spec) throw new RangeError(`Unknown household product: ${kind}`);
  const root = new THREE.Group(); root.name=`household-${kind}`;
  color ||= spec.defaultColor; material ||= spec.material;
  root.userData={kind,level:1,noUpgrade:true,origin:'bottom',placement:spec.placement,tier:spec.tier,family:spec.family,
    dimensions:{width:spec.width,depth:spec.depth,height:spec.height},...(spec.supportSurface?{supportSurface:{...spec.supportSurface}}:{})};
  const paint=new THREE.Color(color), pale=paint.clone().lerp(new THREE.Color('#fff3dc'),.40), shade=paint.clone().multiplyScalar(.72);
  const fixed=(color,finish='ceramic',extra={})=>({color,finish,paintable:false,...extra});
  const cream=fixed('#fff1dc'), gold=fixed('#c7a25a','gold'), wood=fixed('#b98c5a','oak'), dark=fixed('#3b5053');
  const steel=fixed('#b4c8c6','gold'), soil=fixed('#654c36'), green=fixed('#66956d'), lightGreen=fixed('#8cb57e');
  const glow=fixed('#ffe6a9','ceramic',{emissive:'#e8bb67',emissiveIntensity:.24});
  function mesh(geometry,at=[0,0,0],opt={}) {
    const finish=opt.paintable===false?(opt.finish||'ceramic'):material;
    const result=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:opt.color??paint,map:maps[finish]||null,
      metalness:finish==='gold'?.58:0,roughness:['linen','wool','velvet'].includes(finish)?.9:finish==='gold'?.3:.57,
      ...(opt.emissive?{emissive:opt.emissive,emissiveIntensity:opt.emissiveIntensity}:{}),side:opt.doubleSide?THREE.DoubleSide:THREE.FrontSide}));
    result.position.set(...at);result.castShadow=true;result.receiveShadow=true;
    result.userData={paintable:opt.paintable!==false,part:opt.part||'body',...(opt.supportTop?{supportTop:true}:{})};
    if(opt.emissive)result.userData.objectPart='lamp-emitter';
    if(opt.supportTop)result.name='furniture-support-top';root.add(result);return result;
  }
  const box=(size,at,opt={})=>mesh(new RoundedBoxGeometry(...size,1,Math.min(opt.radius??.025,Math.min(...size)*.4)),at,opt);
  function ball(at,size,opt={}) {const m=mesh(new THREE.SphereGeometry(1,12,8),at,opt);m.scale.set(...size);return m;}
  const cyl=(r1,r2,h,at,opt={},segments=16)=>mesh(new THREE.CylinderGeometry(r1,r2,h,segments),at,opt);
  function ring(radius,tube,at,opt={},vertical=false) {const m=mesh(new THREE.TorusGeometry(radius,tube,6,24),at,opt);if(!vertical)m.rotation.x=Math.PI/2;return m;}
  function line(a,b,r,opt={}) {const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),d=q.clone().sub(p);const m=cyl(r,r,d.length(),p.add(q).multiplyScalar(.5).toArray(),opt,10);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m;}
  function curve(points,r,opt={}) {return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),16,r,6,false),[0,0,0],opt);}
  function feet(w,d,h=.15,opt=wood,r=.04) {for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])cyl(r,r,h,[x,h/2,z],opt);}
  function handle(x,y,z,w=.17,opt=gold) {curve([[x-w/2,y,z],[x-w/2,y,z+.022],[x+w/2,y,z+.022],[x+w/2,y,z]],.012,opt);}
  function bowl(w,d,h,at,opt=cream) {const profile=[[0,.03],[.28,.03],[.42,.15],[.5,.9],[.48,1],[.42,.98],[.39,.33],[.28,.2],[0,.2]];const m=mesh(new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y*h)),24),at,opt);m.scale.set(w,1,d);return m;}
  function tap(x,y,z,h=.25) {curve([[x,y,z],[x,y+h*.8,z],[x,y+h,z+.05],[x,y+h*.85,z+.13]],.018,steel);line([x+.02,y+.09,z],[x+.09,y+.14,z],.012,steel);}
  function knobs(count,y,z,start=-.12,step=.12) {for(let i=0;i<count;i++){const m=cyl(.025,.025,.018,[start+i*step,y,z],gold);m.rotation.x=Math.PI/2;}}
  function doors(w,d,y,h,count=2) {for(let i=0;i<count;i++){const x=(i-(count-1)/2)*w/count;box([w/count-.025,h,.035],[x,y,d/2],{color:pale});handle(x,y,d/2+.022,.11);}}
  function cabinet(w,d,h,opt={}) {feet(w-.15,d-.14,.14);box([w,.06,d],[0,.17,0]);box([w+.025,.065,d+.025],[0,h-.0325,0],{...opt,supportTop:!!opt.supportTop});for(const x of [-w/2+.025,w/2-.025])box([.05,h-.21,d],[x,(h+.15)/2,0]);box([w-.08,h-.23,.035],[0,(h+.15)/2,-d/2+.02],{color:shade});}
  function lampShade(rBottom,rTop,h,at,opt={}) {const p=[[rBottom,0],[rTop,h],[rTop-.012,h],[rBottom-.015,.02]];const m=mesh(new THREE.LatheGeometry(p.map(p=>new THREE.Vector2(...p)),24),at,opt);m.userData.objectPart='lamp-shade';return m;}
  function leaf(at,size,angle=0,opt=green) {const m=ball(at,size,opt);m.rotation.z=angle;return m;}
  function pot(r,h,opt={}) {cyl(r,r*.78,h,[0,h/2,0],opt);ring(r-.01,.022,[0,h,0],opt);cyl(r-.025,r-.025,.02,[0,h-.025,0],soil);}
  function arch(w,h,d,at,opt={}) {const s=new THREE.Shape(),r=w/2;s.moveTo(-r,0);s.lineTo(r,0);s.lineTo(r,h-r);s.absarc(0,h-r,r,0,Math.PI,false);s.lineTo(-r,0);return mesh(new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:false,curveSegments:18}),at,opt);}

  const builds={
    hhKettle(){
      cyl(.15,.14,.035,[0,.0175,0],dark);ball([0,.17,0],[.15,.16,.13]);cyl(.10,.12,.035,[0,.30,0]);ball([0,.337,0],[.026,.026,.026],gold);
      curve([[-.10,.27,0],[-.22,.26,0],[-.23,.13,0],[-.13,.10,0]],.024,dark);
      line([.09,.15,0],[.22,.29,0],.033);cyl(.014,.018,.035,[0,.085,.128],gold);
    },
    hhToaster(){
      box([.40,.24,.27],[0,.15,0],{radius:.07});box([.34,.035,.24],[0,.03,0],dark);
      for(const z of [-.068,.068]){box([.29,.018,.035],[0,.268,z],dark);box([.235,.035,.019],[0,.278,z],fixed('#d6ac71'));}
      line([.208,.10,0],[.208,.23,0],.012,steel);box([.065,.026,.07],[.219,.14,0],dark);knobs(1,.11,.142,0);
    },
    hhMixer(){
      box([.34,.045,.46],[0,.0225,0]);box([.15,.37,.17],[0,.23,-.13],{radius:.06});box([.27,.14,.39],[0,.45,-.015],{radius:.055});
      bowl(.30,.30,.20,[0,.055,.09],steel);cyl(.018,.018,.18,[0,.32,.11],steel);ring(.065,.012,[0,.24,.11],steel);
      knobs(1,.39,.185,0);box([.15,.025,.07],[0,.532,-.05],{color:pale});
    },
    hhEspresso(){
      box([.58,.46,.30],[0,.27,-.035],{radius:.055});box([.60,.06,.42],[0,.03,0],dark);box([.50,.025,.21],[0,.075,.09],steel);
      box([.46,.15,.07],[0,.37,.145],{color:pale});for(const x of [-.105,.105]){cyl(.045,.045,.08,[x,.26,.17],steel);line([x,.23,.17],[x,.23,.265],.018,dark);}
      const gauge=cyl(.05,.05,.02,[0,.454,.127],cream);gauge.rotation.x=Math.PI/2;line([0,.454,.14],[.026,.474,.14],.006,dark);
      curve([[.245,.32,.09],[.29,.26,.13],[.29,.12,.19]],.014,steel);knobs(2,.45,.131,-.18,.36);box([.44,.02,.20],[0,.51,-.04],steel);
    },
    hhRiceCooker(){
      ball([0,.17,0],[.17,.15,.16]);cyl(.163,.17,.045,[0,.289,0],{color:pale});box([.14,.045,.055],[0,.337,0],dark);
      for(const x of [-.179,.179])box([.055,.045,.10],[x,.18,0]);box([.11,.047,.018],[0,.15,.159],dark);knobs(1,.085,.151,0);cyl(.13,.13,.027,[0,.014,0],dark);
    },
    hhAirFryer(){
      box([.32,.40,.33],[0,.22,0],{radius:.065});box([.29,.18,.035],[0,.135,.17],{color:shade});handle(0,.16,.194,.16,dark);
      box([.17,.04,.015],[0,.34,.17],dark);knobs(2,.28,.179,-.055,.11);box([.26,.035,.27],[0,.0175,0],dark);box([.20,.012,.19],[0,.425,0],{color:pale});
    },
    hhDishRack(){
      box([.58,.035,.35],[0,.0175,0],{color:pale});for(const x of [-.26,.26])box([.035,.12,.30],[x,.095,0]);
      for(const z of [-.10,0,.10]){box([.51,.025,.027],[0,.08,z]);}
      for(const x of [-.16,0,.16]){const plate=cyl(.13,.13,.018,[x,.22,0],cream);plate.rotation.z=Math.PI/2;ring(.103,.007,[x+.013,.22,0],gold,true).rotation.y=Math.PI/2;}
    },
    hhBarCart(){
      for(const x of [-.32,.32])for(const z of [-.16,.16]){const wheel=cyl(.045,.045,.028,[x,.045,z],dark);wheel.rotation.z=Math.PI/2;line([x,.08,z],[x,.79,z],.019,gold);}
      for(const y of [.20,.75]){box([.78,.06,.42],[0,y,0],{supportTop:y===.75});for(const z of [-.20,.20])box([.78,.04,.025],[0,y+.05,z],gold);}
      curve([[.35,.72,-.16],[.42,.87,-.16],[.42,.87,.16],[.35,.72,.16]],.021,gold);
    },
    hhMicrowaveCabinet(){
      cabinet(.86,.53,1.22);doors(.76,.50,.38,.40);box([.78,.055,.50],[0,.65,0]);
      box([.70,.37,.43],[0,.875,0],cream);box([.47,.25,.018],[-.065,.88,.225],dark);box([.37,.17,.012],[-.065,.88,.238],fixed('#698b90'));
      handle(.20,.89,.24,.04,steel);knobs(2,1.01,.237,.23,.07);box([.10,.045,.018],[.24,.76,.24],dark);
    },
    hhPantryHutch(){
      cabinet(1.12,.53,1.91);doors(1.02,.50,.46,.49);box([1.05,.06,.51],[0,.77,0]);
      for(const y of [1.05,1.35,1.66])box([1.02,.035,.45],[0,y,-.015],{color:pale});
      for(const x of [-.27,.27]){arch(.48,1.01,.035,[x,.83,.255]);arch(.39,.86,.012,[x,.91,.295],fixed('#adc6bd'));line([x,1.03,.311],[x,1.61,.311],.012,gold);}
      box([1.16,.075,.57],[0,1.95,0],{color:pale});
    },
    hhTrestleTable(){
      box([1.90,.08,.90],[0,.84,0],{supportTop:true,radius:.03});
      for(const x of [-.59,.59]){for(const z of [-.32,.32])line([x,.03,z],[x,.79,z*.42],.055);box([.15,.04,.76],[x,.02,0]);box([.16,.07,.68],[x,.75,0]);}
      box([1.26,.09,.09],[0,.29,0],{color:shade});
    },
    hhOvalTable(){
      const top=cyl(.5,.5,.09,[0,.855,0],{supportTop:true},32);top.scale.set(2.17,1,1.07);
      for(const x of [-.55,.55]){const leg=cyl(.20,.25,.76,[x,.40,0],{color:pale},12);leg.scale.z=1.24;for(const dx of [-.13,0,.13])line([x+dx,.06,-.16],[x+dx,.75,-.16],.017,gold);}
      box([1.67,.04,.62],[0,.02,0],{color:shade});
    },
    hhDropLeafTable(){
      box([.60,.08,.74],[0,.82,0],{supportTop:true});for(const sign of [-1,1]){box([.39,.08,.74],[sign*.505,.82,0],{color:pale,supportTop:true});
        box([.065,.78,.065],[sign*.25,.39,-.26]);box([.065,.78,.065],[sign*.25,.39,.26]);box([.065,.05,.58],[sign*.25,.12,0]);}
      box([.47,.12,.59],[0,.69,0],{color:shade});handle(0,.69,.31,.17);
    },
    hhSpindleChair(){
      feet(.40,.40,.45,{},.03);const seat=cyl(.27,.25,.075,[0,.475,0]);seat.scale.z=.87;
      for(const x of [-.22,-.13,-.044,.044,.13,.22])line([x*.84,.49,-.19],[x,.91,-.21+Math.abs(x)*.25],.013);
      curve([[-.25,.86,-.14],[-.21,.94,-.18],[0,.98,-.23],[.21,.94,-.18],[.25,.86,-.14]],.025);
      for(const x of [-.20,.20])line([x,.20,-.20],[x,.20,.20],.017,{color:shade});
    },
    hhTulipChair(){
      cyl(.27,.29,.045,[0,.0225,0],cream);cyl(.045,.08,.40,[0,.24,0],cream);ball([0,.48,0],[.29,.09,.27]);
      box([.51,.10,.43],[0,.51,.03],{color:pale,radius:.045});ball([0,.73,-.20],[.29,.19,.08]);for(const x of [-.25,.25])ball([x,.62,-.065],[.065,.15,.19]);
    },
    hhBarStool(){
      for(const x of [-.18,.18])for(const z of [-.18,.18])line([x,.02,z],[x*.70,.77,z*.70],.023);
      ring(.17,.017,[0,.33,0],gold);cyl(.22,.21,.06,[0,.80,0]);for(const x of [-.16,.16])line([x,.80,-.13],[x,1.05,-.14],.018);
      box([.36,.13,.06],[0,1.02,-.15],{color:pale,radius:.025});
    },
    hhDiningBench(){feet(1.14,.31,.43,wood,.042);box([1.38,.09,.42],[0,.43,0],wood);box([1.42,.11,.45],[0,.515,0],{radius:.045});box([1.17,.07,.07],[0,.16,0],wood);},
    hhReededSideboard(){
      cabinet(1.84,.55,.98,{supportTop:true});for(let i=0;i<4;i++){const x=(i-1.5)*.44;box([.42,.64,.035],[x,.55,.26]);for(const dx of [-.13,0,.13])box([.025,.59,.024],[x+dx,.55,.289],{color:pale});handle(x,.56,.309,.07);}
    },
    hhShowerCabin(){
      box([.99,.12,.97],[0,.06,0],cream);box([.84,.025,.81],[0,.128,0],{color:pale});
      for(const x of [-.46,.46])for(const z of [-.44,.44])line([x,.13,z],[x,1.94,z],.023,steel);
      box([.91,1.78,.035],[0,1.05,-.43],{color:pale});box([.035,1.78,.83],[-.45,1.05,0],{color:pale});
      box([.28,1.73,.023],[.30,1.05,.44],{color:pale});handle(.20,1.03,.465,.035,steel);
      curve([[.22,.50,-.37],[.22,1.83,-.37],[.22,1.89,-.13]],.020,steel);cyl(.13,.13,.025,[.22,1.85,-.13],steel);knobs(1,.70,-.37,.22);
    },
    hhClawfootBath(){
      for(const x of [-.57,.57])for(const z of [-.24,.24]){curve([[x,.23,z],[x*1.08,.13,z*1.15],[x*1.1,.04,z*1.2]],.045,gold);ball([x*1.1,.045,z*1.2],[.08,.045,.055],gold);}
      bowl(1.69,.80,.51,[0,.18,0],{});bowl(1.53,.67,.43,[0,.27,0],cream);tap(.66,.26,-.25,.54);ring(.065,.014,[.66,.27,-.25],gold);
    },
    hhDoubleVanity(){
      cabinet(1.82,.65,.83);for(const x of [-.46,.46])for(const y of [.34,.60]){box([.82,.23,.03],[x,y,.325],{color:pale});handle(x,y,.348,.22);}
      for(const x of [-.45,.45]){bowl(.61,.46,.19,[x,.83,.035],cream);tap(x,.83,-.22,.28);}
    },
    hhPedestalSink(){
      cyl(.13,.21,.72,[0,.36,0]);cyl(.23,.27,.06,[0,.03,0],{color:pale});bowl(.66,.55,.21,[0,.72,0]);tap(0,.75,-.19,.27);cyl(.03,.03,.015,[0,.77,.015],steel);
    },
    hhTowelLadder(){
      for(const x of [-.28,.28])line([x,0,.12],[x,1.49,-.10],.028);for(let i=0;i<6;i++)line([-.28,.16+i*.23,.10-i*.033],[.28,.16+i*.23,.10-i*.033],.021);
      box([.31,.42,.045],[0,.91,-.005],fixed('#88b9c0','linen'));box([.31,.20,.042],[0,1.02,-.06],fixed('#6d9da7','linen'));
    },
    hhWasher(){
      box([.69,.84,.64],[0,.46,0],{radius:.04});box([.69,.06,.64],[0,.85,0],{color:pale,supportTop:true});box([.62,.055,.58],[0,.0275,0],dark);
      ring(.225,.045,[0,.40,.328],steel,true);const drum=cyl(.20,.20,.022,[0,.40,.332],dark);drum.rotation.x=Math.PI/2;
      const glass=cyl(.16,.16,.024,[0,.40,.351],fixed('#719b9b'));glass.rotation.x=Math.PI/2;box([.21,.055,.016],[-.15,.74,.328],dark);knobs(2,.74,.335,.10,.13);
    },
    hhHamper(){
      const body=cyl(.27,.23,.61,[0,.32,0]);body.scale.z=.80;for(const y of [.08,.19,.30,.41,.52,.63]){const band=ring(.263,.015,[0,y,0],{color:pale});band.scale.z=.8;}
      const lid=cyl(.285,.285,.055,[0,.66,0],{color:pale});lid.scale.z=.8;handle(0,.71,0,.14,wood);for(const x of [-.24,.24])curve([[x,.42,-.05],[x*1.1,.52,0],[x,.42,.05]],.014,wood);
    },
    hhBathShelf(){
      for(const x of [-.25,.25])for(const z of [-.17,.17])line([x,0,z],[x,1.25,z],.022);
      for(const y of [.12,.58,1.05]){box([.57,.055,.43],[0,y,0]);for(const z of [-.19,.19])box([.56,.08,.025],[0,y+.06,z],{color:pale});}
      box([.37,.27,.30],[0,.29,0],wood);box([.13,.045,.015],[0,.32,.16],dark);
    },
    hhTripodLamp(){
      for(let i=0;i<3;i++){const a=i*Math.PI*2/3;line([Math.cos(a)*.31,0,Math.sin(a)*.31],[Math.cos(a)*.07,1.31,Math.sin(a)*.07],.026,wood);}
      lampShade(.35,.21,.43,[0,1.19,0]);ring(.34,.012,[0,1.20,0],{color:pale});cyl(.035,.035,.21,[0,1.30,0],gold);ball([0,1.30,0],[.07,.09,.07],glow);
    },
    hhArcLamp(){
      cyl(.29,.30,.10,[-.30,.05,0],cream);curve([[-.30,.10,0],[-.28,1.35,0],[0,1.73,0],[.52,1.64,0]],.026);
      const dome=mesh(new THREE.SphereGeometry(.23,20,10,0,Math.PI*2,0,Math.PI/2),[.52,1.47,0]);
      ring(.23,.013,[.52,1.47,0],gold);ball([.52,1.48,0],[.14,.07,.14],glow);cyl(.055,.055,.05,[.52,1.71,0],gold);
    },
    hhLanternLamp(){
      cyl(.19,.21,.055,[0,.0275,0],dark);cyl(.018,.018,1.41,[0,.75,0],gold);
      for(const [y,s] of [[.58,.31],[1.19,.33]]){ball([0,y,0],[.22,s,.22],{emissive:'#e8bb67',emissiveIntensity:.24});for(const dy of [-.23,0,.23])ring(.22*Math.sqrt(1-(dy/s)**2),.008,[0,y+dy,0],{color:shade});}
      cyl(.07,.07,.035,[0,1.54,0],dark);
    },
    hhMushroomLamp(){
      cyl(.13,.17,.055,[0,.0275,0]);cyl(.075,.115,.25,[0,.18,0]);mesh(new THREE.SphereGeometry(.24,24,12,0,Math.PI*2,0,Math.PI/2),[0,.25,0]);
      ring(.23,.012,[0,.25,0],{color:pale});cyl(.20,.20,.018,[0,.25,0],glow);cyl(.09,.09,.025,[0,.065,0],gold);
    },
    hhTaskLamp(){
      cyl(.16,.17,.035,[0,.0175,0]);line([0,.03,0],[-.10,.29,0],.020);line([-.10,.29,0],[.12,.51,0],.020);
      for(const [x,y] of [[0,.06],[-.10,.29],[.12,.51]]){const m=cyl(.033,.033,.05,[x,y,0],gold);m.rotation.x=Math.PI/2;}
      const head=lampShade(.12,.06,.14,[.15,.45,0]);head.rotation.z=-.55;ball([.19,.43,0],[.065,.04,.065],glow);
    },
    hhPleatedLamp(){
      cyl(.13,.17,.04,[0,.02,0],gold);cyl(.025,.025,.34,[0,.21,0],gold);cyl(.065,.08,.04,[0,.32,0],gold);
      const points=[];for(let i=0;i<=32;i++){const a=i*Math.PI*2/32,r=i%2?.21:.235;points.push([Math.cos(a)*r,Math.sin(a)*r]);}
      const vertices=[],idx=[];for(let i=0;i<32;i++){const a=points[i],b=points[i+1];let n=vertices.length/3;vertices.push(a[0],.32,a[1],b[0],.32,b[1],a[0]*.5,.60,a[1]*.5,b[0]*.5,.60,b[1]*.5);idx.push(n,n+1,n+2,n+1,n+3,n+2);}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(idx);g.computeVertexNormals();mesh(g,[0,0,0],{doubleSide:true});ring(.115,.009,[0,.60,0],{color:pale});ball([0,.39,0],[.05,.08,.05],glow);
    },
    hhWallSconce(){
      box([.12,.29,.04],[0,.24,.02]);for(const sign of [-1,1]){curve([[0,.14,.04],[sign*.20,.12,.11],[sign*.22,.26,.17]],.017);cyl(.055,.035,.06,[sign*.22,.28,.17],gold);cyl(.035,.035,.13,[sign*.22,.375,.17],cream);ball([sign*.22,.474,.17],[.025,.045,.025],glow);}
      ball([0,.37,.05],[.045,.045,.035],gold);
    },
    hhFlowerSconce(){
      const back=cyl(.085,.085,.03,[0,.25,.015],gold);back.rotation.x=Math.PI/2;
      for(let i=0;i<5;i++){const a=i*Math.PI*2/5;const petal=ball([Math.sin(a)*.14,.25+Math.cos(a)*.14,.085],[.074,.13,.045]);petal.rotation.z=-a;}
      ball([0,.25,.13],[.09,.09,.055],glow);ring(.067,.008,[0,.25,.18],gold,true);
    },
    hhFiddlePlant(){
      pot(.23,.39);curve([[0,.36,0],[-.02,.80,0],[.04,1.41,0]],.022,wood);
      for(let i=0;i<7;i++){const sign=i%2?1:-1,y=.62+i*.11,x=sign*(.16+(i%3)*.035),z=(i%3-1)*.12;line([0,y-.1,0],[x,y,z],.009,green);leaf([x,y+.06,z],[.145,.19,.055],sign*.60,i%2?green:lightGreen);}
    },
    hhMonstera(){
      pot(.23,.26);for(let i=0;i<5;i++){const a=i*Math.PI*2/5,x=Math.sin(a)*.22,z=Math.cos(a)*.21,y=.52+(i%2)*.16;curve([[0,.24,0],[x*.5,.44,z*.5],[x,y,z]],.014,green);
        const s=new THREE.Shape();s.moveTo(0,0);s.bezierCurveTo(-.06,.03,-.13,.05,-.17,.11);s.lineTo(-.07,.13);s.lineTo(-.20,.16);s.bezierCurveTo(-.22,.18,-.21,.21,-.20,.23);s.lineTo(-.08,.21);s.lineTo(-.18,.28);s.bezierCurveTo(-.16,.35,-.07,.37,0,.30);s.bezierCurveTo(.07,.37,.16,.35,.18,.28);s.lineTo(.08,.21);s.lineTo(.20,.23);s.bezierCurveTo(.21,.21,.22,.18,.20,.16);s.lineTo(.07,.13);s.lineTo(.17,.11);s.bezierCurveTo(.13,.05,.06,.03,0,0);
        const m=mesh(new THREE.ExtrudeGeometry(s,{depth:.016,bevelEnabled:true,bevelSize:.005,bevelThickness:.004,bevelSegments:1}),[x,y-.08,z],i%2?green:lightGreen);m.rotation.y=a;m.rotation.x=-.45;}
    },
    hhOliveTree(){
      pot(.23,.42,{color:pale});curve([[0,.40,0],[-.03,.95,0],[.02,1.43,0]],.028,wood);
      for(const [x,y,z,s] of [[-.24,1.20,.02,.23],[.24,1.30,-.12,.24],[.02,1.58,.08,.25],[-.18,1.47,-.17,.19],[.20,1.11,.18,.20]]){line([0,y-.28,0],[x,y,z],.013,wood);ball([x,y,z],[s,s*.63,s*.76],green);ball([x+.03,y+.06,z+.02],[s*.84,s*.48,s*.67],lightGreen);}
    },
    hhCactus(){
      pot(.22,.29);for(const [x,z,h,r] of [[0,0,.57,.075],[-.14,.04,.33,.061],[.14,-.03,.40,.06]]){cyl(r,r,h,[x,.28+h/2,z],green);ball([x,.28+h,z],[r,r,r],green);for(const dx of [-r*.5,r*.5])line([x+dx,.31,z+r*.83],[x+dx,.26+h,z+r*.83],.005,lightGreen);}
      ball([.14,.73,-.03],[.04,.025,.04],fixed('#e4b0ba'));
    },
    hhPineBonsai(){
      box([.67,.12,.36],[0,.06,0]);box([.61,.02,.30],[0,.13,0],soil);curve([[-.13,.13,0],[-.09,.35,0],[.03,.46,0],[.19,.54,0]],.032,wood);
      for(const [x,y,z,s]of [[-.21,.36,.02,.16],[.06,.48,-.045,.19],[.23,.58,.02,.16],[-.04,.63,.035,.13]]){line([-.06,.33,0],[x,y,z],.013,wood);ball([x,y,z],[s,.065,s*.64],green);ball([x+.02,y+.035,z],[s*.77,.05,s*.55],lightGreen);}
      for(const x of [-.23,.23])box([.10,.04,.25],[x,.02,0],{color:shade});
    },
    hhSucculentTray(){
      box([.61,.08,.34],[0,.04,0]);box([.56,.02,.29],[0,.085,0],soil);
      for(let i=0;i<4;i++){const x=(i-1.5)*.13;for(let n=0;n<4;n++){const a=n*Math.PI/2+i*.4;const m=leaf([x+Math.sin(a)*.04,.13+Math.cos(a)*.015,Math.cos(a)*.045],[.035,.10-(i%2)*.025,.025],-Math.sin(a)*.6,i%2?lightGreen:green);m.rotation.x=Math.cos(a)*.5;}}
      for(const z of [-.16,.16])box([.60,.04,.025],[0,.09,z],{color:pale});
    },
    hhHangingIvy(){
      box([.39,.055,.25],[0,.45,.13]);box([.43,.22,.04],[0,.53,.25]);for(const x of [-.19,.19])box([.035,.21,.24],[x,.53,.13]);box([.35,.02,.20],[0,.57,.13],soil);
      curve([[-.18,.59,.03],[0,.76,.03],[.18,.59,.03]],.016,gold);
      for(let i=0;i<3;i++){const x=(i-1)*.13;curve([[x,.60,.20],[x+.04,.36,.27],[x-.025,.06+i*.055,.25]],.009,green);for(let j=0;j<5;j++)leaf([x+(j%2?.04:-.03),.56-j*.105+i*.016,.27],[.055,.068,.017],j%2?.7:-.7,lightGreen);}
    },
    hhOrchid(){
      pot(.12,.19);for(const sign of [-1,1]){leaf([sign*.08,.23,0],[.11,.035,.055],sign*.2,green);curve([[0,.18,0],[sign*.06,.49,0],[sign*.15,.59,0]],.006,green);
        for(let j=0;j<2;j++){const x=sign*(.09+j*.07),y=.49+j*.08;for(let p=0;p<4;p++){const a=p*Math.PI/2;leaf([x+Math.sin(a)*.038,y+Math.cos(a)*.038,.014],[.041,.046,.013],-a,{color:pale});}ball([x,y,.034],[.015,.017,.015],gold);}}
    },
    hhShoeBench(){
      feet(1.16,.31,.52);box([1.35,.07,.44],[0,.52,0]);box([1.37,.09,.45],[0,.59,0],{color:pale});
      for(const y of [.12,.30])for(const z of [-.13,0,.13])box([1.22,.035,.065],[0,y,z],wood);
    },
    hhCoatTree(){
      for(let i=0;i<3;i++){const a=i*Math.PI*2/3;line([Math.sin(a)*.31,.015,Math.cos(a)*.31],[0,.39,0],.035);}
      cyl(.035,.045,1.50,[0,.89,0]);ball([0,1.68,0],[.055,.055,.055]);
      for(let i=0;i<6;i++){const a=i*Math.PI/3,y=.95+(i%3)*.22;curve([[0,y,0],[Math.sin(a)*.20,y+.10,Math.cos(a)*.20],[Math.sin(a)*.22,y+.17,Math.cos(a)*.22]],.021);ball([Math.sin(a)*.22,y+.17,Math.cos(a)*.22],[.031,.031,.031],{color:pale});}
    },
    hhUmbrellaStand(){
      cyl(.16,.17,.035,[0,.0175,0]);for(const y of [.10,.38,.49])ring(.16,.014,[0,y,0]);
      for(let i=0;i<8;i++){const a=i*Math.PI/4;line([Math.sin(a)*.15,.03,Math.cos(a)*.15],[Math.sin(a)*.15,.49,Math.cos(a)*.15],.012);}
      line([-.04,.04,0],[.04,.61,0],.018,dark);curve([[.04,.61,0],[.04,.69,0],[.11,.69,0],[.11,.63,0]],.016,wood);cyl(.04,.06,.34,[-.01,.28,0],{color:shade});
    },
    hhStorageTrunk(){
      box([1.05,.43,.56],[0,.245,0],{radius:.035});const lid=cyl(.30,.30,1.05,[0,.46,0]);lid.rotation.z=Math.PI/2;lid.scale.x=.45;
      box([1.08,.035,.59],[0,.44,0],gold);for(const x of [-.35,.35]){box([.055,.42,.022],[x,.25,.29],gold);box([.08,.09,.045],[x,.43,.31],gold);}
      for(const x of [-.49,.49])for(const z of [-.25,.25])box([.08,.10,.08],[x,.06,z],gold);handle(0,.26,.31,.20,wood);
    },
    hhMirrorConsole(){
      feet(.91,.32,.70,{},.028);box([1.11,.08,.46],[0,.76,0],{supportTop:true});box([.97,.16,.34],[0,.64,0],{color:shade});
      for(const x of [-.25,.25]){box([.46,.14,.025],[x,.64,.18],{color:pale});handle(x,.64,.20,.12);}
      arch(.82,.88,.045,[0,.84,-.19],gold);arch(.70,.76,.012,[0,.90,-.137],fixed('#b9d3cb'));box([.67,.025,.20],[0,.13,0]);
    },
    hhLetterCabinet(){
      cabinet(.86,.41,1.19);for(let row=0;row<4;row++)for(let col=0;col<3;col++){const x=(col-1)*.265,y=.28+row*.235;box([.25,.215,.025],[x,y,.21],{color:(row+col)%2?pale:paint});ball([x,y-.027,.242],[.020,.020,.014],gold);}
    },
  };
  builds[kind]();
  root.updateMatrixWorld(true);
  const authored=new THREE.Box3().setFromObject(root),size=authored.getSize(new THREE.Vector3());
  const scale=Math.min(1,spec.width/size.x,spec.height/size.y,spec.depth/size.z);
  for(const child of root.children){child.position.multiplyScalar(scale);child.scale.multiplyScalar(scale);}
  root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root),center=bounds.getCenter(new THREE.Vector3());
  for(const child of root.children){child.position.x-=center.x;child.position.y-=bounds.min.y;child.position.z-=spec.placement==='wall'?bounds.min.z:center.z;}
  root.updateMatrixWorld(true);
  return root;
}
