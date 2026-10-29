import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {BATH_DAILY_COLLECTION} from './home-bath-daily-collection.js';

const products=new Map(BATH_DAILY_COLLECTION.map(p=>[p.id,p]));
export const isBathDailyProduct=kind=>products.has(kind);

/** Every instance owns its geometry/materials. Caller owns optional texture maps. */
export function createBathDailyProduct({kind,color,material,maps={}}={}){
  const spec=products.get(kind);if(!spec)throw new RangeError(`Unknown bathroom daily product: ${kind}`);
  const root=new THREE.Group();root.name=`bath-daily-${kind}`;color||=spec.defaultColor;material||=spec.material;
  root.userData={kind,level:1,noUpgrade:true,origin:'bottom',placement:spec.placement,tier:spec.tier,family:spec.family,dimensions:{width:spec.width,height:spec.height,depth:spec.depth},...(spec.supportSurface?{supportSurface:{...spec.supportSurface}}:{})};
  const paint=new THREE.Color(color),pale=paint.clone().lerp(new THREE.Color('#fff3df'),.32),shade=paint.clone().multiplyScalar(.68);
  const fixed=(color,finish='ceramic')=>({color,finish,paintable:false});
  const cream=fixed('#fff2dd'),dark=fixed('#3c5557'),steel=fixed('#afc7c2','gold'),gold=fixed('#c7a169','gold'),wood=fixed('#ba915f','oak'),paper=fixed('#fff7e8','linen'),mirror=fixed('#aecac9','gold');
  function mesh(geometry,at=[0,0,0],opt={}){
    const finish=opt.paintable===false?(opt.finish||'ceramic'):material;
    const m=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:opt.color??paint,map:maps[finish]||null,metalness:finish==='gold'?.62:0,roughness:finish==='gold'?.27:['wool','linen','velvet'].includes(finish)?.94:.52,side:opt.doubleSide?THREE.DoubleSide:THREE.FrontSide}));
    m.position.set(...at);m.castShadow=true;m.receiveShadow=true;m.userData={part:opt.part||'body',paintable:opt.paintable!==false,...(opt.supportTop?{supportTop:true}:{})};if(opt.supportTop)m.name='furniture-support-top';root.add(m);return m;
  }
  const box=(size,at,opt={})=>mesh(new RoundedBoxGeometry(...size,1,Math.min(opt.radius??.018,Math.min(...size)*.35)),at,opt);
  const cyl=(r1,r2,h,at,opt={},segments=16)=>mesh(new THREE.CylinderGeometry(r1,r2,h,segments),at,opt);
  function ball(at,size,opt={}){const m=mesh(new THREE.SphereGeometry(1,12,8),at,opt);m.scale.set(...size);return m;}
  function ring(r,t,at,opt={},vertical=false){const m=mesh(new THREE.TorusGeometry(r,t,5,20),at,opt);if(!vertical)m.rotation.x=Math.PI/2;return m;}
  function line(a,b,r,opt={}){const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),d=q.clone().sub(p);const m=cyl(r,r,d.length(),p.add(q).multiplyScalar(.5).toArray(),opt,10);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m;}
  const curve=(points,r,opt={})=>mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),12,r,6,false),[0,0,0],opt);
  function cup(r,h,at,opt={},bottom=.025){const profile=[[0,0],[r*.82,0],[r,h],[r-.018,h],[r*.82-.018,bottom],[0,bottom]];return mesh(new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)),20),at,opt);}
  function basin(w,d,h,at,opt={}){const m=cup(.5,h,[...at],opt,.035);m.scale.set(w,1,d);return m;}
  function button(r,at,opt=steel){const m=cyl(r,r,.012,at,opt);m.rotation.x=Math.PI/2;return m;}
  function backplate(w,h,y=.15){box([w,h,.035],[0,y,.018],{color:shade});}
  function pump(y,x=0,z=0){cyl(.035,.035,.05,[x,y,z],steel);line([x,y+.03,z],[x+.09,y+.03,z],.014,steel);line([x+.09,y+.03,z],[x+.09,y+.008,z],.013,steel);}
  function toothbrush(x,z,h,opt={}){box([.022,h,.023],[x,.14+h/2,z],opt);box([.044,.09,.025],[x,.14+h,z],opt);for(const y of [-.027,0,.027])box([.039,.017,.024],[x,.14+h+y,z+.019],paper);}
  function towel(w,h,at,opt={}){box([w,h,.028],at,{...opt,radius:.01});for(const y of [-h/2+.035,-h/2+.060])box([w-.01,.009,.006],[at[0],at[1]+y,at[2]+.017],cream);}
  function tap(x,y,z){curve([[x,y,z],[x,y+.22,z],[x,y+.26,z+.07],[x,y+.21,z+.15]],.017,steel);line([x+.02,y+.07,z],[x+.085,y+.11,z],.012,steel);}
  function toiletBowl(w,d,y,z,seatColor={color:pale}){
    // The inner wall descends to the drain. Nothing spans the open seat aperture.
    const profile=[[.12,0],[.32,.025],[.46,.105],[.50,.19],[.47,.205],[.405,.185],[.34,.075],[.10,.045],[.10,0]];
    const bowl=mesh(new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)),24),[0,y,z],cream);bowl.scale.set(w,1,d);bowl.userData.part='toilet-open-bowl';
    const seat=ring(.442,.041,[0,y+.218,z],seatColor);seat.scale.set(w,d,1);seat.userData.part='toilet-seat-ring';
    cyl(.047,.047,.012,[0,y+.011,z],dark).userData.part='toilet-recessed-drain';
  }
  function raisedLid(w,h,at,opt={color:pale}){const shape=new THREE.Shape();shape.absellipse(0,0,w/2,h/2,0,Math.PI*2,false,0);const lid=mesh(new THREE.ExtrudeGeometry(shape,{depth:.028,bevelEnabled:true,bevelSegments:1,bevelSize:.009,bevelThickness:.006,curveSegments:16}),at,opt);lid.userData.part='toilet-open-lid';return lid;}
  const builds={
    bdBrushCup(){cup(.10,.23,[0,0,0]);ring(.095,.008,[0,.23,0],{color:pale});toothbrush(-.035,0,.26,{});toothbrush(.035,.02,.22,{color:shade});},
    bdPasteStation(){backplate(.27,.30,.18);box([.22,.25,.115],[0,.18,.086]);button(.062,[0,.19,.152],{color:pale});box([.12,.13,.06],[0,.37,.08],cream);cyl(.03,.03,.036,[0,.292,.08],steel);box([.09,.043,.007],[0,.375,.114],{color:shade});box([.25,.026,.14],[0,.035,.086]);for(const x of [-.08,.08])line([x,.035,.14],[x,.115,.14],.013,steel);},
    bdSoapPump(){ball([0,.15,0],[.105,.14,.10]);cyl(.077,.077,.025,[0,.013,0]);cyl(.046,.065,.035,[0,.28,0]);pump(.326);button(.044,[0,.16,.10],cream);box([.024,.040,.009],[0,.16,.111],{color:shade});},
    bdSoapDish(){basin(.34,.22,.055,[0,0,0]);for(const x of [-.08,0,.08])box([.016,.016,.14],[x,.037,0],{color:pale});box([.22,.05,.12],[0,.074,0],cream);box([.09,.008,.06],[0,.103,0],{color:pale});},
    bdShampooPump(){box([.18,.33,.16],[0,.18,0],{radius:.06});cyl(.045,.06,.028,[0,.356,0]);pump(.404);box([.11,.15,.008],[0,.20,.082],cream);ball([0,.215,.09],[.023,.041,.008],{color:shade});},
    bdShowerGel(){box([.23,.28,.14],[0,.15,0],{radius:.055});box([.14,.048,.12],[0,.313,0],{color:pale});box([.14,.022,.12],[0,.349,0],{color:shade});box([.125,.12,.009],[0,.155,.074],cream);const leaf=ball([0,.16,.083],[.021,.039,.008],{color:shade});leaf.rotation.z=-.5;},
    bdTissueBox(){box([.40,.17,.245],[0,.085,0]);for(const x of [-.12,.12])box([.15,.028,.25],[x,.18,0],wood);for(const z of [-.085,.085])box([.16,.028,.080],[0,.18,z],wood);box([.14,.028,.015],[0,.185,0],dark);const sheet=box([.13,.055,.009],[.01,.216,0],paper);sheet.rotation.z=-.18;},
    bdRollHolder(){backplate(.32,.18,.22);for(const x of [-.16,.16])line([x,.19,.02],[x,.19,.15],.018,steel);line([-.16,.19,.15],[.16,.19,.15],.014,steel);const roll=mesh(new THREE.LatheGeometry([[.035,-.12],[.093,-.12],[.093,.12],[.035,.12],[.035,-.12]].map(p=>new THREE.Vector2(...p)),20),[0,.17,.12],paper);roll.rotation.z=Math.PI/2;box([.23,.15,.009],[0,.073,.208],paper);box([.39,.032,.22],[0,.297,.11]);},
    bdToiletBrush(){cup(.115,.26,[0,0,0]);ring(.107,.012,[0,.26,0],{color:pale});ball([0,.21,0],[.075,.085,.075],dark);line([0,.20,0],[0,.57,0],.016,steel);box([.044,.16,.045],[0,.575,0],{radius:.018});cyl(.04,.055,.025,[0,.282,0],steel);},
    bdPedalBin(){cyl(.17,.145,.46,[0,.245,0]);cyl(.172,.175,.045,[0,.487,0],{color:pale});cyl(.13,.14,.025,[0,.013,0],dark);box([.13,.027,.09],[0,.045,.163],steel);box([.09,.07,.06],[0,.47,-.16],steel);ring(.17,.008,[0,.463,0],{color:shade});},
    bdTowelRing(){backplate(.115,.13,.41);line([0,.41,.03],[0,.41,.10],.022);ring(.16,.018,[0,.25,.105],{},true);towel(.18,.28,[0,.155,.13],fixed('#b2c5ae','linen'));box([.18,.06,.05],[0,.294,.12],fixed('#b2c5ae','linen'));},
    bdTowelBar(){for(const x of [-.43,.43]){box([.06,.14,.035],[x,.37,.018]);curve([[x,.41,.03],[x,.41,.12],[x,.31,.23]],.018);}line([-.43,.41,.12],[.43,.41,.12],.018);line([-.43,.31,.23],[.43,.31,.23],.021);towel(.55,.28,[0,.17,.235],fixed('#deb49f','linen'));box([.55,.05,.05],[0,.311,.23],fixed('#deb49f','linen'));},
    bdHookRail(){backplate(.69,.15,.14);for(const x of [-.245,-.082,.082,.245]){curve([[x,.14,.025],[x,.08,.09],[x,.10,.13],[x,.17,.13]],.016);ball([x,.17,.13],[.025,.025,.025],{color:pale});}},
    bdShowerBasket(){for(const y of [.08,.43]){box([.43,.035,.23],[0,y,.13]);for(const x of [-.205,.205])for(const z of [.035,.23])line([x,y,z],[x,y+.16,z],.012);for(const z of [.035,.23])line([-.21,y+.16,z],[.21,y+.16,z],.014);for(const x of [-.12,0,.12])line([x,y,.23],[x,y+.16,.23],.009);}for(const x of [-.17,.17])line([x,.06,.035],[x,.72,.035],.015);curve([[-.17,.72,.035],[0,.85,.055],[.17,.72,.035]],.019);},
    bdHairDryer(){backplate(.15,.34,.18);const body=cyl(.086,.073,.24,[0,.35,.15]);body.rotation.z=Math.PI/2;ring(.068,.010,[-.13,.35,.15],dark,true).rotation.y=Math.PI/2;button(.05,[.13,.35,.15],dark).rotation.set(0,0,Math.PI/2);box([.06,.19,.07],[.035,.22,.14]);box([.14,.035,.17],[0,.17,.11],{color:shade});curve([[.04,.125,.14],[.10,.04,.15],[-.10,.02,.10],[-.12,.16,.07]],.009,dark);box([.016,.045,.012],[.036,.25,.18],cream);},
    bdRoundMirror(){const disc=button(.29,[0,.38,.062],mirror);disc.scale.z=1;ring(.311,.023,[0,.38,.063],{},true);box([.11,.075,.045],[0,.038,.03]);line([0,.04,.04],[0,.04,.105],.016);ball([0,.04,.105],[.021,.021,.021],{color:pale});},
    bdMedicineCabinet(){box([.78,.68,.19],[0,.43,.095]);for(const x of [-.19,.19]){box([.365,.48,.025],[x,.52,.20],mirror);box([.022,.16,.027],[x<0?-.025:.025,.50,.225],steel);}box([.70,.17,.21],[0,.12,.115],{color:shade});box([.72,.035,.22],[0,.023,.12]);box([.14,.13,.10],[-.21,.105,.17],cream);box([.07,.13,.009],[-.21,.105,.225],fixed('#d69c96'));cyl(.048,.048,.095,[.08,.073,.17],paper);cyl(.04,.04,.13,[.23,.09,.17],{color:pale});},
    bdRainShower(){for(const y of [.38,1.23])button(.043,[0,y,.025],steel);curve([[0,.34,.05],[0,1.42,.05],[0,1.48,.31]],.018);cyl(.16,.16,.028,[0,1.43,.30]);cyl(.14,.14,.012,[0,1.408,.30],dark);for(const x of [-.055,.055])for(const z of [.25,.35])cyl(.009,.009,.006,[x,1.398,z],cream);line([-.18,.32,.08],[.18,.32,.08],.027);for(const x of [-.18,.18])ball([x,.32,.08],[.045,.04,.04],{color:pale});line([.12,.77,.06],[.14,.91,.13],.023);const head=button(.055,[.14,.94,.15],steel);head.rotation.x=.3;curve([[.12,.77,.07],[.26,.25,.17],[.13,.03,.17],[0,.32,.08]],.011,steel);},
    bdWaterHeater(){const tank=cyl(.22,.22,.95,[0,.40,.24]);tank.rotation.z=Math.PI/2;for(const x of [-.47,.47]){const cap=cyl(.22,.22,.045,[x,.40,.24],{color:pale});cap.rotation.z=Math.PI/2;}box([.25,.10,.018],[0,.39,.468],dark);box([.13,.035,.010],[0,.40,.48],fixed('#91ccc7'));for(const x of [-.18,.18]){line([x,.22,.22],[x,.02,.22],.018,steel);cyl(.027,.027,.04,[x,.14,.22],fixed(x<0?'#a0c2d6':'#dcaa9c'));}},
    bdBathMat(){box([.82,.035,.54],[0,.018,0],{radius:.015});for(const s of [.91,.70,.49]){const r=ring(.21,.010,[0,.043,0],{color:s===.70?pale:paint});r.scale.set(1.7*s,1*s,1);}box([.19,.014,.08],[0,.043,0],{color:pale});},
    bdFootBath(){basin(.60,.48,.25,[0,0,0]);box([.43,.08,.12],[0,.255,-.155],{color:pale});box([.16,.013,.053],[0,.303,-.155],dark);for(const x of [-.105,.105]){const roller=cyl(.044,.044,.19,[x,.082,.03],steel,10);roller.rotation.x=Math.PI/2;}curve([[-.25,.20,0],[-.27,.30,0],[.27,.30,0],[.25,.20,0]],.014);},
    bdBathStool(){for(const x of [-.19,.19])for(const z of [-.14,.14]){line([x,.025,z],[x*.80,.38,z*.80],.028);cyl(.036,.036,.035,[x,.018,z],dark);}for(const z of [-.15,-.075,.075,.15])box([.46,.055,.058],[0,.405,z]);for(const x of [-.18,.18])box([.09,.055,.06],[x,.405,0]);},
    bdRolledTowels(){box([.44,.035,.30],[0,.018,0],wood);for(const [x,y]of [[-.10,.12],[.10,.12],[0,.287]]){const roll=cyl(.094,.094,.26,[x,y,0]);roll.rotation.x=Math.PI/2;ring(.060,.009,[x,y,.136],{color:pale},true);button(.031,[x,y,.137],{color:shade});}for(const x of [-.217,.217])box([.025,.12,.27],[x,.075,0],wood);},
    bdCottonJar(){cup(.105,.20,[0,0,0]);for(const [x,z,h]of [[-.045,0,.25],[0,-.03,.27],[.04,0,.245],[0,.04,.26]]){line([x,.10,z],[x,h,z],.006,wood);ball([x,h,z],[.014,.029,.014],paper);}for(let i=0;i<3;i++)cyl(.035,.035,.010,[0,.021+i*.014,.102],paper);},
    bdToiletryTray(){box([.47,.035,.29],[0,.018,0]);for(const z of [-.14,.14])box([.47,.065,.02],[0,.05,z],{color:pale});for(const x of [-.23,.04,.23])box([.018,.065,.27],[x,.05,0]);cyl(.077,.077,.10,[-.12,.083,.015],cream);cyl(.08,.08,.022,[-.12,.144,.015],gold);box([.11,.16,.07],[.14,.115,-.035],{color:pale});box([.06,.035,.05],[.14,.213,-.035],gold);box([.105,.024,.025],[.14,.10,.09],wood);for(const x of [.10,.12,.14,.16,.18])box([.010,.076,.017],[x,.135,.09],wood);},
    bdBathCaddy(){for(const z of [-.13,-.065,0,.065,.13])box([1.08,.035,.045],[0,.04,z]);for(const x of [-.44,.44])box([.055,.06,.28],[x,.03,0],{color:shade});ring(.072,.012,[.32,.071,0]);box([.32,.015,.023],[-.11,.075,.065],{color:shade});const rest=box([.31,.09,.018],[-.11,.115,-.065]);rest.rotation.x=-.30;},
    bdPlunger(){cyl(.125,.13,.032,[0,.016,0],{color:pale});cyl(.045,.103,.105,[0,.093,0],dark);ring(.099,.017,[0,.05,0],dark);cyl(.017,.017,.49,[0,.38,0],wood);ball([0,.65,0],[.032,.055,.032]);ring(.018,.008,[0,.676,0],{color:pale},true);},
    bdSqueegee(){backplate(.09,.09,.52);curve([[0,.52,.03],[0,.56,.06],[0,.52,.09]],.012,steel);line([0,.50,.08],[0,.13,.08],.018);box([.44,.05,.055],[0,.087,.08]);box([.45,.034,.019],[0,.044,.10],dark);box([.044,.14,.046],[0,.35,.08],{color:pale});},
    bdScale(){box([.44,.045,.40],[0,.034,0],{radius:.015});for(const x of [-.135,.135])for(const z of [-.10,.10])box([.072,.006,.10],[x,.060,z],steel);box([.13,.008,.06],[0,.061,-.125],dark);for(const x of [-.035,0,.035])box([.014,.003,.028],[x,.068,-.125],fixed('#bce0d2'));for(const x of [-.15,.15])for(const z of [-.13,.13])cyl(.029,.029,.018,[x,.009,z],dark);},
    bdShowerCurtain(){line([- .53,1.76,.08],[.53,1.76,.08],.018,steel);for(let i=0;i<5;i++){const x=(i-2)*.21;const panel=box([.22,1.59,.07],[x,.805,.085],{color:i%2?pale:paint,radius:.025});panel.rotation.y=(i%2?1:-1)*.18;ring(.037,.009,[x,1.71,.08],steel,true);for(const y of [.08,.13])box([.20,.015,.012],[x,y,.129],cream);}for(const x of [-.52,.52])button(.032,[x,1.76,.025],steel);},
    bdLaundryLiquid(){box([.19,.27,.19],[-.035,.15,0],{radius:.035});box([.15,.08,.16],[-.035,.32,0],{radius:.025});cyl(.046,.046,.035,[-.065,.378,0],{color:shade});curve([[.055,.31,0],[.14,.29,0],[.14,.15,0],[.055,.13,0]],.021);box([.11,.15,.009],[-.04,.16,.099],cream);ball([-.04,.17,.108],[.024,.039,.007],{color:shade});},
    bdCompactVanity(){for(const x of [-.49,.49])for(const z of [-.24,.24])cyl(.032,.039,.18,[x,.09,z],wood);box([1.12,.64,.58],[0,.48,0]);box([1.20,.08,.64],[0,.86,0],{...cream,supportTop:true});for(const x of [-.285,.285]){box([.53,.52,.027],[x,.48,.305],{color:pale});line([x-.07,.62,.329],[x+.07,.62,.329],.012,gold);}basin(.51,.43,.13,[-.29,.90,.015],cream);tap(-.30,.91,-.22);cyl(.019,.019,.008,[-.29,.94,.015],steel);},
    bdSplitToilet(){
      box([.37,.065,.56],[0,.033,.08]);cyl(.14,.175,.30,[0,.21,.09]);box([.26,.25,.22],[0,.32,-.16],{color:shade});
      toiletBowl(.62,.74,.31,.13);box([.56,.44,.23],[0,.75,-.39],{radius:.055});box([.59,.045,.25],[0,.99,-.39],{color:pale});
      button(.031,[-.17,.86,-.267],steel);raisedLid(.44,.43,[0,.76,-.252]);
      line([-.14,.54,-.20],[.14,.54,-.20],.024,steel);for(const x of[-.13,.13])cyl(.018,.018,.012,[x,.07,.23],steel);
    },
    bdMonoblocToilet(){
      box([.62,.09,.83],[0,.045,.03],{radius:.035});box([.52,.32,.63],[0,.24,.035],{radius:.11});
      box([.59,.79,.29],[0,.43,-.32],{radius:.09});box([.65,.055,.31],[0,.85,-.32],{color:pale});
      toiletBowl(.69,.77,.31,.17);raisedLid(.49,.45,[0,.77,-.208]);line([-.17,.54,-.15],[.17,.54,-.15],.025,steel);
      for(const x of[-.045,.045])cyl(.036,.036,.016,[x,.885,-.32],steel);box([.53,.035,.67],[0,.102,.05],{color:pale});
    },
    bdSmartToilet(){
      box([.58,.095,.82],[0,.048,0],{radius:.043});box([.53,.31,.68],[0,.24,.025],{radius:.12});
      toiletBowl(.64,.75,.30,.09);box([.55,.17,.22],[0,.46,-.29],{color:pale});
      raisedLid(.47,.37,[0,.635,-.267]);line([-.16,.52,-.22],[.16,.52,-.22],.024,steel);
      const dial=cyl(.044,.044,.025,[.29,.36,-.14],steel);dial.rotation.z=Math.PI/2;ring(.027,.007,[.306,.36,-.14],dark,true).rotation.y=Math.PI/2;
      box([.19,.035,.009],[0,.47,-.174],dark);for(const x of[-.055,0,.055])ball([x,.47,-.166],[.009,.009,.005],fixed('#a8d7c8'));
      box([.40,.015,.035],[0,.113,.343],{color:pale});
    },
  };
  builds[kind]();root.updateMatrixWorld(true);
  const authored=new THREE.Box3().setFromObject(root),size=authored.getSize(new THREE.Vector3()),scale=Math.min(1,spec.width/size.x,spec.height/size.y,spec.depth/size.z);
  for(const child of root.children){child.position.multiplyScalar(scale);child.scale.multiplyScalar(scale);}
  root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root),center=bounds.getCenter(new THREE.Vector3());
  for(const child of root.children){child.position.x-=center.x;child.position.y-=bounds.min.y;child.position.z-=spec.placement==='wall'?bounds.min.z:center.z;}
  root.updateMatrixWorld(true);return root;
}
