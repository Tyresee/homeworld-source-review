import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {UTILITY_DAILY_COLLECTION} from './home-utility-daily-collection.js';
const specs=new Map(UTILITY_DAILY_COLLECTION.map(s=>[s.id,s]));
export const isUtilityDailyProduct=kind=>specs.has(kind);

/** Each item owns its geometry/materials; caller may traverse and dispose like other home assets. */
export function createUtilityDailyProduct({kind,color,material,maps={}}={}){
 const spec=specs.get(kind);if(!spec)throw new RangeError(`Unknown daily utility product: ${kind}`);
 const root=new THREE.Group();root.name=`daily-utility-${kind}`;color||=spec.defaultColor;material||=spec.material;
 root.userData={kind,level:1,noUpgrade:true,origin:'bottom',placement:spec.placement,tier:spec.tier,family:spec.family,dimensions:{width:spec.width,depth:spec.depth,height:spec.height},...(spec.supportSurface?{supportSurface:{...spec.supportSurface}}:{})};
 const paint=new THREE.Color(color),pale=paint.clone().lerp(new THREE.Color('#fff5df'),.35),shade=paint.clone().multiplyScalar(.68);
 const fixed=(color,finish='ceramic')=>({color,finish,paintable:false});
 const cream=fixed('#fff3dc'),dark=fixed('#405159'),steel=fixed('#b3c8c4','gold'),wood=fixed('#be9867','oak'),cloth=fixed('#e6dac3','linen'),blue=fixed('#759da9'),green=fixed('#6b9c83');
 function mesh(geometry,at=[0,0,0],opt={}){
  const finish=opt.paintable===false?(opt.finish||'ceramic'):material;
  const m=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:opt.color??paint,map:maps[finish]||null,metalness:finish==='gold'?.58:0,roughness:['linen','wool','velvet'].includes(finish)?.9:finish==='gold'?.3:.58,side:opt.doubleSide?THREE.DoubleSide:THREE.FrontSide}));
  m.position.set(...at);m.castShadow=true;m.receiveShadow=true;m.userData={paintable:opt.paintable!==false,part:opt.part||'body',...(opt.supportTop?{supportTop:true}:{})};if(opt.supportTop)m.name='furniture-support-top';root.add(m);return m;
 }
 const box=(s,at,o={})=>mesh(new RoundedBoxGeometry(...s,1,Math.min(o.radius??.022,Math.min(...s)*.38)),at,o);
 const cyl=(rt,rb,h,at,o={},segments=16)=>mesh(new THREE.CylinderGeometry(rt,rb,h,segments),at,o);
 function ball(at,s,o={}){const m=mesh(new THREE.SphereGeometry(1,12,8),at,o);m.scale.set(...s);return m;}
 function ring(r,t,at,o={},vertical=false){const m=mesh(new THREE.TorusGeometry(r,t,6,24),at,o);if(!vertical)m.rotation.x=Math.PI/2;return m;}
 function line(a,b,r,o={}){const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),d=q.clone().sub(p),m=cyl(r,r,d.length(),p.add(q).multiplyScalar(.5).toArray(),o,8);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m;}
 function curve(points,r,o={}){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),16,r,6,false),[0,0,0],o);}
 function handle(at,w,h=.11,o={}){const [x,y,z]=at;return curve([[x-w/2,y,z],[x-w/2,y+h*.85,z],[x,y+h,z],[x+w/2,y+h*.85,z],[x+w/2,y,z]],.017,o);}
 function wheel(x,y,z,r=.045){const m=cyl(r,r,.035,[x,y,z],dark);m.rotation.x=Math.PI/2;return m;}
 function knob(x,y,z,r=.025){const m=cyl(r,r,.018,[x,y,z],dark);m.rotation.x=Math.PI/2;return m;}
 function openBox(w,d,h,at=[0,0,0],o={}){const [x,y,z]=at;box([w,.04,d],[x,y+.02,z],o);for(const s of [-1,1]){box([.035,h,d],[x+s*(w-.035)/2,y+h/2,z],o);box([w-.06,h,.035],[x,y+h/2,z+s*(d-.035)/2],o);}}
 function bottle(at,h=.3,r=.07,o={}){const [x,y,z]=at;cyl(r*.85,r,h*.70,[x,y+h*.35,z],o);ball([x,y+h*.70,z],[r*.85,h*.10,r*.85],o);cyl(r*.36,r*.36,h*.20,[x,y+h*.86,z],cream);}
 function hanger(x,y,z,w=.32){curve([[x,y,z],[x-w/2,y-.10,z],[x-w/2,y-.13,z],[x+w/2,y-.13,z],[x+w/2,y-.10,z],[x,y,z]],.012,wood);curve([[x,y,z],[x,y+.08,z],[x+.045,y+.10,z],[x+.04,y+.055,z]],.010,steel);}
 function label(w,h,at,o=cream){return box([w,h,.012],at,o);}
 function taperedPlate(w,d,h,at,o={}){const s=new THREE.Shape();s.moveTo(-w/2,-d/2);s.lineTo(w*.27,-d/2);s.quadraticCurveTo(w*.65,0,w*.27,d/2);s.lineTo(-w/2,d/2);s.quadraticCurveTo(-w*.59,0,-w/2,-d/2);const g=new THREE.ExtrudeGeometry(s,{depth:h,bevelEnabled:true,bevelSize:.008,bevelThickness:.008,bevelSegments:1,curveSegments:10});const m=mesh(g,at,o);m.rotation.x=-Math.PI/2;return m;}
 const builds={
  udBroomDustpan(){
   openBox(.32,.30,.15,[-.13,0,0]);line([-.13,.14,-.11],[-.13,1.19,-.11],.022);handle([-.13,1.18,-.11],.12,.10,dark);
   const brush=box([.29,.11,.12],[.20,.09,.01],{color:shade});brush.rotation.z=.12;box([.25,.08,.10],[.20,.17,.01]);line([.20,.2,.01],[.26,1.28,.01],.018,wood);
   for(let i=0;i<6;i++)line([.085+i*.047,.025,.073],[.095+i*.043,.127,.073],.008,cloth);ball([.26,1.30,.01],[.025,.035,.025]);
  },
  udMopBucket(){
   openBox(.61,.38,.30,[-.035,0,0]);box([.035,.28,.33],[.06,.17,0]);ring(.12,.023,[.19,.31,0],cream);cyl(.095,.095,.03,[.19,.18,0],dark);
   handle([-.035,.30,0],.54,.19,dark);line([-.22,.10,.08],[-.31,1.29,.06],.018,steel);cyl(.085,.085,.04,[-.22,.08,.08],{color:pale});
   for(let i=0;i<7;i++){const a=i*Math.PI*2/7;curve([[-.22+Math.cos(a)*.055,.075,.08+Math.sin(a)*.055],[-.22+Math.cos(a)*.09,.035,.08+Math.sin(a)*.09],[-.22+Math.cos(a)*.12,.015,.08+Math.sin(a)*.12]],.016,cloth);}
  },
  udCanisterVacuum(){
   ball([-.12,.28,0],[.25,.22,.22]);for(const z of [-.22,.22])wheel(-.14,.11,z,.095);cyl(.16,.20,.045,[-.12,.48,0],{color:pale});handle([-.12,.48,0],.20,.11,dark);
   curve([[.04,.35,.13],[.29,.57,.20],[.36,.82,.05],[.48,.75,-.09]],.035,dark);line([.48,.76,-.09],[.31,.08,-.18],.022,steel);box([.36,.065,.17],[.30,.035,-.18],{color:shade});knob(-.15,.38,.213,.035);
  },
  udStickVacuum(){
   box([.43,.045,.36],[0,.0225,0],dark);box([.40,.075,.18],[0,.08,.07]);line([0,.11,.03],[0,.94,-.07],.024,steel);
   cyl(.082,.068,.23,[0,1.00,-.07],blue);cyl(.10,.085,.08,[0,1.15,-.07]);curve([[.02,1.20,-.07],[.15,1.22,-.07],[.15,1.04,-.07],[.04,1.02,-.07]],.026);cyl(.06,.09,.07,[0,1.22,-.07],{color:pale});
   for(const x of [-.14,.14])wheel(x,.09,.155,.038);
  },
  udRobotVacuum(){
   cyl(.29,.30,.11,[0,.085,.07]);ring(.29,.025,[0,.08,.07],dark);cyl(.25,.27,.025,[0,.15,.07],{color:pale});cyl(.07,.065,.045,[.08,.185,0],dark);
   box([.39,.37,.15],[0,.205,-.24]);box([.27,.095,.02],[0,.24,-.157],dark);box([.49,.04,.25],[0,.02,-.20],{color:shade});knob(-.08,.164,.07,.02).rotation.x=0;
   for(const x of [-.20,.20])line([x,.025,.23],[x*1.23,.025,.31],.012,dark);
  },
  udCleaningCaddy(){
   openBox(.50,.31,.20);handle([0,.20,0],.40,.31);bottle([-.12,.04,.02],.33,.07,{color:pale});box([.13,.035,.045],[-.10,.40,.025],dark);box([.025,.08,.02],[-.12,.36,.048],dark);
   bottle([.11,.04,-.015],.26,.06,blue);box([.16,.08,.13],[.12,.11,.08],cloth);label(.065,.09,[-.12,.22,.09]);
  },
  udDetergent(){
   box([.23,.30,.19],[-.10,.15,0],{radius:.055});box([.13,.10,.15],[-.13,.32,0],{radius:.03});cyl(.047,.047,.045,[-.13,.392,0],cream);handle([.01,.23,0],.09,.11,{});
   bottle([.18,0,.01],.29,.085,{color:shade});label(.12,.14,[-.10,.17,.10]);label(.08,.09,[.18,.13,.094],cream);
  },
  udIroningBoard(){
   taperedPlate(1.17,.40,.045,[-.07,.86,0]);for(const z of [-.15,.15]){line([-.43,.035,z],[.30,.85,z],.022,steel);line([.36,.035,z],[-.34,.85,z],.022,steel);}
   for(const x of [-.43,.36])line([x,.035,-.20],[x,.035,.20],.03,dark);for(const z of [-.14,.14])line([.43,.84,z],[.70,.84,z],.014,steel);line([.70,.84,-.14],[.70,.84,.14],.014,steel);
   for(const x of [.50,.59])line([x,.84,-.14],[x,.84,.14],.012,steel);
  },
  udIron(){
   taperedPlate(.34,.20,.025,[0,.012,0],steel);taperedPlate(.29,.17,.075,[-.015,.043,0]);handle([-.035,.12,0],.16,.11,dark);cyl(.041,.041,.019,[.07,.135,0],{color:pale});
   box([.04,.03,.035],[-.18,.07,0],dark);label(.08,.035,[-.025,.10,.092],blue);
  },
  udDryingRack(){
   for(const z of [-.27,.27]){line([-.41,.02,z],[.39,.78,z],.019);line([.41,.02,z],[-.39,.78,z],.019);line([-.38,.78,z],[.38,.78,z],.017);}
   for(const x of [-.34,-.17,0,.17,.34])line([x,.78,-.27],[x,.78,.27],.011,steel);
   for(const sign of [-1,1]){for(const z of [-.27,.27])line([sign*.36,.78,z],[sign*.78,.97,z],.016);for(const f of [.47,.60,.74])line([sign*f,.78+(f-.36)*.45,-.27],[sign*f,.78+(f-.36)*.45,.27],.011,steel);}
   for(const x of [-.41,.41])line([x,.02,-.30],[x,.02,.30],.024,dark);
  },
  udHangerRack(){
   for(const x of [-.49,.49]){line([x,.10,0],[x,1.47,0],.025);line([x,.09,-.20],[x,.09,.20],.025);for(const z of [-.18,.18])wheel(x,.045,z);}
   line([-.49,1.47,0],[.49,1.47,0],.024);line([-.49,.14,0],[.49,.14,0],.017,steel);
   for(const x of [-.30,0,.30])hanger(x,1.36,0,.26);
  },
  udClothesSteamer(){
   box([.48,.28,.35],[0,.14,0],{radius:.07});box([.21,.23,.04],[0,.18,.18],blue);line([0,.28,-.08],[0,1.42,-.08],.019,steel);
   hanger(0,1.43,-.08,.48);curve([[.20,.19,.10],[.30,.60,.08],[.26,1.07,.02],[.20,1.34,.01]],.025,dark);box([.15,.06,.10],[.18,1.37,.01]);knob(-.14,.21,.17,.026);
  },
  udDryer(){
   box([.72,.82,.66],[0,.48,0],{radius:.035});box([.74,.04,.68],[0,.92,0],{color:pale,supportTop:true});box([.66,.04,.60],[0,.02,0],dark);
   ring(.225,.034,[0,.46,.325],steel,true);const door=cyl(.19,.19,.02,[0,.46,.337],dark);door.rotation.x=Math.PI/2;const glass=cyl(.15,.15,.025,[0,.46,.352],blue);glass.rotation.x=Math.PI/2;
   box([.23,.055,.02],[-.16,.79,.34],dark);knob(.20,.79,.343,.04);for(const x of [-.16,-.08,0,.08,.16])box([.04,.06,.012],[x,.15,.336],dark);
  },
  udSortingBins(){
   for(const x of [-.49,.49]){for(const z of [-.19,.19]){line([x,.10,z],[x,.83,z],.018,steel);wheel(x,.05,z,.04);}line([x,.83,-.19],[x,.83,.19],.018,steel);}
   for(const z of [-.19,.19])line([-.49,.83,z],[.49,.83,z],.018,steel);
   for(let i=0;i<3;i++){const x=(i-1)*.31;box([.29,.54,.33],[x,.46,0],{color:i%2?pale:paint,radius:.06});box([.24,.025,.28],[x,.737,0],dark);label(.12,.10,[x,.51,.17]);}
  },
  udFoldedTowels(){
   for(let i=0;i<3;i++){const w=.53-i*.045,d=.37-i*.03,y=.045+i*.085;box([w,.085,d],[0,y,0],{color:i===1?pale:paint,radius:.03});curve([[-w*.4,y-.02,d/2],[w*.4,y-.02,d/2],[w*.43,y+.018,d/2]],.008,{color:shade});}
   for(const x of [-.17,.17])box([.023,.01,.29],[x,.262,0],{color:pale});
  },
  udBlanketBasket(){
   openBox(.59,.42,.35);for(const y of [.08,.18,.28]){box([.56,.015,.02],[0,y,.223],{color:pale});}
   for(const x of [-.15,.15]){const roll=cyl(.10,.10,.34,[x,.39,-.015],cloth);roll.rotation.x=Math.PI/2;ring(.065,.009,[x,.39,.163],{color:shade},true);}
   box([.20,.35,.035],[0,.36,.235],{color:pale});for(const x of [-.08,-.04,0,.04,.08])line([x,.18,.24],[x,.12,.24],.009,cloth);
  },
  udToolbox(){
   box([.56,.23,.30],[0,.115,0]);box([.57,.055,.31],[0,.25,0],{color:shade});handle([0,.28,0],.23,.09,dark);
   for(const x of [-.18,.18]){box([.055,.10,.027],[x,.23,.166],steel);box([.026,.045,.012],[x,.23,.184],dark);}label(.16,.055,[0,.12,.157],cream);
  },
  udFirstAidBox(){
   box([.47,.25,.29],[0,.125,0],{radius:.04});box([.49,.045,.31],[0,.264,0],{color:pale});handle([0,.29,0],.20,.07,{});
   box([.06,.16,.018],[0,.14,.154],green);box([.16,.06,.018],[0,.14,.154],green);for(const x of [-.16,.16])box([.035,.06,.025],[x,.26,.164],steel);
  },
  udSewingMachine(){
   box([.61,.07,.29],[0,.035,0]);box([.16,.42,.23],[.20,.28,0],{radius:.055});box([.49,.13,.22],[.025,.47,0],{radius:.05});box([.12,.15,.16],[-.19,.37,0]);
   line([-.19,.15,0],[-.19,.31,0],.009,steel);box([.11,.013,.06],[-.19,.08,.025],steel);box([.19,.01,.19],[-.17,.077,0],steel);
   const wheel=cyl(.075,.075,.045,[.30,.35,0],cream);wheel.rotation.z=Math.PI/2;cyl(.025,.025,.06,[.17,.563,0],wood);cyl(.04,.04,.035,[.17,.56,0],cloth);knob(.16,.34,.122,.035);label(.08,.045,[.13,.45,.121],blue);
  },
  udSewingBox(){
   openBox(.43,.29,.18);handle([0,.18,-.06],.32,.17);for(const [x,z] of [[-.12,.02],[0,-.04],[.11,.02]]){cyl(.039,.039,.11,[x,.225,z],{color:x===0?shade:pale});for(const y of [.17,.28])cyl(.05,.05,.016,[x,y,z],wood);}
   ball([0,.20,.10],[.085,.07,.07],fixed('#cb8e90','wool'));for(const x of [-.035,.025]){line([x,.23,.10],[x,.32,.10],.004,steel);ball([x,.325,.10],[.012,.012,.012],cream);}
  },
  udStandingFan(){
   const foot=cyl(.21,.22,.055,[0,.0275,0]);foot.scale.z=.78;line([0,.05,0],[0,.94,0],.025);box([.12,.16,.10],[0,.78,0]);
   const back=cyl(.23,.23,.035,[0,1.02,-.025],{color:shade});back.rotation.x=Math.PI/2;for(const r of [.08,.15,.24])ring(r,.009,[0,1.02,.08],steel,true);
   for(let i=0;i<8;i++){const a=i*Math.PI/4;line([0,1.02,.09],[Math.sin(a)*.24,1.02+Math.cos(a)*.24,.075],.006,steel);}
   for(let i=0;i<3;i++){const a=i*Math.PI*2/3,m=ball([Math.sin(a)*.10,1.02+Math.cos(a)*.10,.03],[.075,.13,.015],{color:pale});m.rotation.z=-a+.4;}
   const hub=cyl(.045,.045,.04,[0,1.02,.11],cream);hub.rotation.x=Math.PI/2;
  },
  udAirPurifier(){
   box([.46,.83,.36],[0,.43,0],{radius:.065});box([.39,.57,.025],[0,.39,.184],dark);for(let i=0;i<9;i++)box([.022,.54,.02],[(i-4)*.039,.39,.20],{color:pale});
   cyl(.13,.13,.014,[0,.854,0],dark);for(const z of [-.06,0,.06])line([-.10,.865,z],[.10,.865,z],.008,steel);box([.13,.025,.015],[0,.75,.19],blue);
  },
  udHumidifier(){
   cyl(.14,.16,.06,[0,.03,0],{color:shade});ball([0,.20,0],[.175,.16,.15]);cyl(.12,.165,.035,[0,.33,0],{color:pale});cyl(.045,.04,.035,[.05,.365,0],cream);cyl(.025,.025,.004,[.05,.384,0],dark);
   label(.045,.13,[0,.19,.148],blue);knob(0,.06,.146,.016);
  },
  udTissueBox(){
   // Six upholstered lobes leave a true slit; the outline is soft rather than a box with a cloud decal.
   box([.34,.065,.21],[0,.0325,0],{radius:.025,part:'cloud-bottom'});
   for(const x of[-.12,.12])for(const z of[-.057,.057])ball([x,.104,z],[.087,.088,.071],{part:'cloud-lobe'});
   for(const z of[-.079,.079])ball([0,.126,z],[.095,.105,.055],{color:pale,part:'cloud-lobe'});
   const p=box([.105,.095,.008],[0,.214,0],{...cream,part:'tissue-sheet'});p.rotation.z=.16;
   const q=box([.046,.036,.008],[.053,.252,0],{...cream,part:'tissue-sheet'});q.rotation.z=-.50;
  },
  udPedalBin(){
   // Open square wire basket: only the base, bars and rim have volume. No lid or pedal.
   box([.29,.035,.29],[0,.0175,0],{color:shade,part:'wastebasket-bottom'});
   for(const sign of[-1,1]){
    box([.36,.027,.027],[0,.565,sign*.167],{part:'wastebasket-rim'});
    box([.027,.027,.36],[sign*.167,.565,0],{part:'wastebasket-rim'});
    for(const v of[-.14,-.07,0,.07,.14])line([v,.035,sign*.14],[v*1.19,.55,sign*.167],.009,{part:'wastebasket-side-bar'});
    for(const v of[-.07,0,.07])line([sign*.14,.035,v],[sign*.167,.55,v*1.19],.009,{part:'wastebasket-side-bar'});
   }
  },
  udRecyclingStation(){
   box([.77,.05,.41],[0,.025,0],dark);for(const x of [-.19,.19]){box([.35,.58,.36],[x,.34,0],{color:x<0?paint:pale,radius:.04});box([.36,.06,.37],[x,.66,0],{color:x<0?shade:paint});label(.16,.15,[x,.39,.188]);
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3;line([x+Math.sin(a)*.047,.39+Math.cos(a)*.047,.20],[x+Math.sin(a+1.25)*.047,.39+Math.cos(a+1.25)*.047,.20],.009,x<0?green:blue);}}
  },
  udStorageBoxes(){
   for(let i=0;i<3;i++){const w=.66-i*.06,d=.44-i*.04,y=.12+i*.235;box([w,.21,d],[0,y,0],{color:i===1?pale:paint});box([w+.025,.035,d+.025],[0,y+.12,0],{color:shade});label(w*.55,.11,[0,y,d/2+.008],blue);for(const x of [-w*.39,w*.39])box([.04,.07,.025],[x,y+.095,d/2+.015],cream);}
  },
  udStepStool(){
   box([.62,.06,.26],[0,.21,.14]);box([.62,.06,.27],[0,.49,-.12],{color:pale});for(const x of [-.25,.25]){line([x,.02,.24],[x,.47,-.05],.032);line([x,.02,-.24],[x,.47,-.20],.032);line([x,.02,.24],[x,.02,-.24],.025);}
   box([.48,.04,.04],[0,.12,-.20],{color:shade});
  },
  udLintRoller(){
   box([.27,.06,.22],[0,.03,0]);line([0,.07,0],[0,.24,0],.027);curve([[0,.23,0],[0,.30,0],[.10,.30,0],[.10,.35,0]],.014,steel);
   const roll=cyl(.068,.068,.20,[0,.35,0],cream);roll.rotation.z=Math.PI/2;const cap=cyl(.045,.045,.018,[-.11,.35,0]);cap.rotation.z=Math.PI/2;
  },
  udShoeDryer(){
   box([.47,.11,.33],[0,.055,0],{radius:.045});for(const x of [-.12,.12]){cyl(.035,.045,.25,[x,.23,-.025],steel);box([.075,.13,.10],[x,.39,0]);box([.09,.045,.14],[x,.463,.02],{color:pale});}
   box([.17,.025,.022],[0,.092,.165],dark);for(const x of [-.15,-.05,.05,.15])box([.025,.009,.08],[x,.115,-.09],dark);
  },
  udDehumidifier(){
   for(const x of [-.17,.17])for(const z of [-.14,.14])wheel(x,.035,z,.033);box([.47,.67,.35],[0,.405,0],{radius:.04});box([.40,.28,.028],[0,.25,.183],{color:pale});label(.045,.18,[0,.25,.203],blue);box([.14,.024,.025],[0,.40,.203],dark);
   for(let i=0;i<5;i++)box([.34,.018,.018],[0,.52+i*.036,.182],dark);box([.16,.012,.06],[0,.746,0],dark);
  },
  udExtensionReel(){
   for(const x of [-.17,.17])curve([[x,.02,.12],[x,.08,-.11],[x,.31,-.10]],.022,steel);line([-.17,.02,.12],[.17,.02,.12],.022,steel);
   const drum=cyl(.18,.18,.17,[0,.25,0],dark);drum.rotation.x=Math.PI/2;for(const z of [-.10,.10]){const disc=cyl(.21,.21,.025,[0,.25,z]);disc.rotation.x=Math.PI/2;}
   for(const x of [-.075,.075])for(const y of [.18,.32]){knob(x,y,.122,.033);for(const dx of [-.009,.009])box([.006,.017,.004],[x+dx,y,.133],cream);}
   handle([0,.38,0],.23,.09,dark);line([.15,.25,.13],[.15,.32,.13],.014,steel);knob(.15,.33,.15,.02);
  },
 };
 builds[kind]();root.updateMatrixWorld(true);
 const b=new THREE.Box3().setFromObject(root),size=b.getSize(new THREE.Vector3()),scale=Math.min(1,spec.width/size.x,spec.height/size.y,spec.depth/size.z);
 for(const child of root.children){child.position.multiplyScalar(scale);child.scale.multiplyScalar(scale);}
 root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root),center=bounds.getCenter(new THREE.Vector3());
 for(const child of root.children){child.position.x-=center.x;child.position.y-=bounds.min.y;child.position.z-=spec.placement==='wall'?bounds.min.z:center.z;}
 root.updateMatrixWorld(true);return root;
}
