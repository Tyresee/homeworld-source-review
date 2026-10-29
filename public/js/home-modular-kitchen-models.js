import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {MODULAR_KITCHEN_COLLECTION} from './home-modular-kitchen-collection.js';
const specs=new Map(MODULAR_KITCHEN_COLLECTION.map(row=>[row.id,row]));
export const isModularKitchenProduct=kind=>specs.has(kind);
/** Original kitchen models. All floor docking modules share an unscaled 1.02
 * worktop datum and .84 depth, so their shape and collision remain in agreement. */
export function createModularKitchenProduct({kind,color,material,maps={}}={}){
 const spec=specs.get(kind);if(!spec)throw new RangeError(`Unknown modular kitchen product: ${kind}`);
 const root=new THREE.Group();root.name=`modular-kitchen-${kind}`;
 root.userData={kind,level:1,noUpgrade:true,origin:'bottom',placement:spec.placement,tier:spec.tier,family:spec.family,dimensions:{width:spec.width,depth:spec.depth,height:spec.height},kitchenFit:{...spec.kitchenFit},...(spec.supportSurface?{supportSurface:{...spec.supportSurface}}:{})};
 const paint=new THREE.Color(color??spec.defaultColor),shade=paint.clone().multiplyScalar(.72),pale=paint.clone().lerp(new THREE.Color('#fff4dc'),.22);material??=spec.material;
 const fixed=(hex,finish='ceramic')=>({color:hex,finish,paintable:false});
 const steel=fixed('#b6cbc9','gold'),dark=fixed('#263c42'),glass=fixed('#4d7580'),stone=fixed(spec.kitchenFit.series==='pro'?'#e0e1d5':'#fff2d6'),gold=fixed('#d4b36a','gold'),wood=fixed('#b9905c','oak'),blue=fixed('#8edcd6');
 function mesh(geo,p=[0,0,0],o={}){const finish=o.paintable===false?(o.finish??'ceramic'):material;const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:o.color??paint,map:maps[finish]??null,metalness:finish==='gold'?.52:0,roughness:finish==='gold'?.31:finish==='oak'?.78:.58}));m.position.set(...p);m.castShadow=true;m.receiveShadow=true;m.name=o.part??'kitchen-body';m.userData={paintable:o.paintable!==false,part:o.part??'body',...(o.supportTop?{supportTop:true}:{})};if(o.supportTop)m.name='furniture-support-top';root.add(m);return m;}
 const box=(s,p,o={})=>mesh(new RoundedBoxGeometry(...s,1,Math.min(o.radius??.014,...s.map(x=>x*.32))),p,o);
 const cyl=(r,h,p,o={},segments=20)=>mesh(new THREE.CylinderGeometry(r,r,h,segments),p,o);
 const ring=(r,t,p,o={})=>{const m=mesh(new THREE.TorusGeometry(r,t,6,24),p,o);m.rotation.x=Math.PI/2;return m;};
 function tube(points,r,o={}){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),12,r,6,false),[0,0,0],o);}
 function beam(a,b,r,o={}){const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),d=q.clone().sub(p);const m=cyl(r,d.length(),p.add(q).multiplyScalar(.5).toArray(),o,10);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m;}
 function handle(x,y,z,w=.24,o=steel){tube([[x-w/2,y,z-.012],[x-w/2,y,z+.025],[x+w/2,y,z+.025],[x+w/2,y,z-.012]],.012,{...o,part:'handle'});}
 function knob(x,y,z,r=.029,o=steel){const m=cyl(r,.022,[x,y,z],{...o,part:'control-knob'});m.rotation.x=Math.PI/2;return m;}
 function front(w,x=0,y=.55,h=.75,mode='door'){
  box([w-.012,h,.035],[x,y,.368],{color:pale,part:mode==='drawer'?'drawer-front':'cabinet-door'});
  if(spec.kitchenFit.series==='oak')for(const dx of[-w*.30,0,w*.30])box([.009,h*.85,.006],[x+dx,y,.39],{color:shade,part:'wood-front-groove'});
  if(spec.kitchenFit.series==='cream'&&mode==='door')box([w-.09,h-.09,.009],[x,y,.39],{color:paint,part:'inset-door-panel'});
  handle(x,y+h*.24,.393,Math.min(.28,w*.5),spec.kitchenFit.series==='cream'?gold:steel);
 }
 function carcass(w,depth=.84,height=1.02){
  box([w-.09,.105,depth-.16],[0,.0525,-.025],{color:shade,part:'recessed-plinth'});
  for(const x of[-w/2+.023,w/2-.023])box([.045,height-.14,depth-.07],[x,(height+.10)/2,-.035],{part:'cabinet-side'});
  box([w-.07,height-.14,.04],[0,(height+.10)/2,-depth/2+.025],{color:shade,part:'cabinet-back'});
  box([w-.065,.055,depth-.09],[0,.145,-.025],{color:shade,part:'cabinet-floor'});
 }
 function top(w,d=.84,support=false){box([w,.065,d],[0,.9875,0],{...stone,part:'worktop',supportTop:support});}
 function doorBase(w,doors=1,support=false){carcass(w);for(let i=0;i<doors;i++)front((w-.07)/doors,-(w-.07)/2+(i+.5)*(w-.07)/doors,.555,.76);top(w,.84,support);}
 function drawerBase(w,drawers=3,support=false){carcass(w);const h=.76/drawers;for(let i=0;i<drawers;i++)front(w-.07,0,.18+h*(i+.5),h-.018,'drawer');top(w,.84,support);}
 function burner(x,z,r=.13){cyl(r,.018,[x,1.036,z],{...dark,part:'burner-well'});ring(r*.70,.016,[x,1.052,z],{...steel,part:'burner-ring'});cyl(r*.46,.020,[x,1.056,z],{...dark,part:'burner-cap'});for(const direction of[0,Math.PI/2]){const grate=box([r*2.15,.025,.028],[x,1.082,z],{...dark,part:'pan-support'});grate.rotation.y=direction;}}
 function hob(w,count,induction=false,griddle=false){
  box([w-.10,.018,.65],[0,1.029,-.018],{...dark,part:induction?'induction-glass':'hob-tray'});
  const gasWidth=griddle?w*.60:w-.16,cols=count>2?Math.ceil(count/2):count,rows=count>2?2:1,offset=griddle?-w*.16:0;
  for(let i=0;i<count;i++){const x=offset+(i%cols-(cols-1)/2)*gasWidth/cols,z=rows===1?-.03:(Math.floor(i/cols)-.5)*.31-.035;if(induction){ring(.13,.007,[x,1.044,z],{...steel,part:'induction-zone'});cyl(.025,.004,[x,1.044,z],blue);}else burner(x,z,Math.min(.13,gasWidth/cols*.38));}
  if(griddle){box([w*.30,.024,.61],[w*.30,1.047,-.018],{...steel,part:'flat-griddle'});for(const z of[-.20,-.10,0,.10,.20])box([w*.25,.008,.012],[w*.30,1.065,z],{...dark,part:'griddle-rib'});}
  if(induction){for(const x of[-.13,0,.13])box([.055,.006,.014],[x,1.045,.255],blue);}
  else for(let i=0;i<count;i++)knob((i-(count-1)/2)*Math.min(.17,(w-.18)/count),.91,.40,.026);
 }
 function ovenDoor(w,x,y,h=.48){box([w,h,.038],[x,y,.372],{...dark,part:'oven-frame'});box([w-.10,h-.10,.012],[x,y,.397],{...glass,part:'oven-glass'});for(const row of[-.10,.02,.13])box([w-.16,.012,.008],[x,y+row,.406],{...steel,part:'visible-oven-rack'});handle(x,y+h*.36,.407,Math.min(.50,w*.70));}
 function cooker(count,w,induction=false,griddle=false){
  if(['mkRangeOven','mkWideRange','mkSteelRange'].includes(kind)){carcass(w);const n=kind==='mkWideRange'?2:1;for(let i=0;i<n;i++)ovenDoor((w-.14)/n,-(w-.14)/2+(i+.5)*(w-.14)/n,.53,.62);top(w);}else drawerBase(w,induction?3:2);
  hob(w,count,induction,griddle);
 }
 function dishwasher(w,drawers=1,integrated=false){carcass(w);top(w);const h=.76/drawers;for(let i=0;i<drawers;i++){
   const y=.18+h*(i+.5);box([w-.07,h-.015,.04],[0,y,.37],{color:integrated?paint:pale,part:'dishwasher-door'});
   const panelY=y+h/2-.075;box([w-.14,.085,.012],[0,panelY,.397],{...dark,part:'dishwasher-controls'});box([Math.min(.19,w*.28),.036,.008],[-w*.18,panelY,.409],{...blue,part:'dishwasher-display'});
   for(const x of[.05,.13,.21].filter(x=>x<w*.38))knob(x,panelY,.412,.012);handle(0,panelY-.11,.397,w*.55);
   if(integrated)for(const x of[-w*.28,0,w*.28])box([.009,h-.18,.006],[x,y-.035,.397],{color:shade,part:'integrated-door-grain'});
  }if(spec.kitchenFit.series==='pro')for(const x of[-w*.30,-w*.15,0,w*.15,w*.30])box([.065,.018,.009],[x,.12,.366],{...dark,part:'dishwasher-vent'});
 }
 function basin(cx,w,d=.48,ceramic=false){const finish=ceramic?stone:steel,bottom=.79,wall=.17;
  box([w,.027,d],[cx,bottom,0],{...finish,part:'sink-basin-bottom'});
  for(const x of[-w/2+.016,w/2-.016])box([.032,wall,d],[cx+x,bottom+wall/2,0],{...finish,part:'sink-basin-wall'});
  for(const z of[-d/2+.016,d/2-.016])box([w-.06,wall,.032],[cx,bottom+wall/2,z],{...finish,part:'sink-basin-wall'});
  cyl(.044,.007,[cx,bottom+.018,0],{...dark,part:'sink-drain'});ring(.042,.006,[cx,bottom+.024,0],steel);
 }
 function sink(w,count=1,apron=false,drainer=false){carcass(w);for(let i=0;i<2;i++)front((w-.07)/2,(i-.5)*(w-.07)/2,.49,.63);
  const bowlArea=drainer?w*.63:w-.13,bowlW=(bowlArea-.06*(count+1))/count,center=drainer?-w*.17:0;
  // Four strips leave an actual opening; no hidden slab fills the sink cavity.
  for(const z of[-.345,.345])box([w,.065,.15],[0,.9875,z],{...stone,part:'sink-worktop'});
  const left=center-bowlArea/2,right=center+bowlArea/2;
  for(const [a,b]of[[-w/2,left],[right,w/2]])if(b-a>.002)box([b-a,.065,.54],[(a+b)/2,.9875,0],{...stone,part:'sink-worktop'});
  for(let i=0;i<count;i++){const x=center+(i-(count-1)/2)*(bowlW+.06);basin(x,bowlW,.54,apron);if(i<count-1)box([.06,.065,.54],[x+bowlW/2+.03,.9875,0],stone);}
  if(apron)box([bowlArea,.20,.055],[center,.91,.378],{...stone,part:'farmhouse-apron'});
  if(drainer){box([w*.29,.035,.54],[w*.33,1.005,0],{...steel,part:'drainer-board'});for(let i=0;i<5;i++)box([w*.23,.009,.016],[w*.33,1.026,-.20+i*.10],{...dark,part:'drainer-rib'});}
  tube([[center,1.02,-.285],[center,1.38,-.285],[center,1.49,-.18],[center,1.38,.02]],.025,{...steel,part:'sink-faucet'});
  cyl(.045,.055,[center+.14,1.05,-.28],steel);beam([center+.14,1.08,-.28],[center+.14,1.18,-.23],.012,steel);
 }
 function tall(w,h,fridge=false){carcass(w,.84,h);box([w,.055,.84],[0,h-.0275,0],{color:pale,part:'cabinet-top'});
  if(fridge){const splits=kind==='mkFrenchFridge'?[.93,1.53]:[.53,1.03];if(kind==='mkFrenchFridge'){
    for(const x of[-w*.24,w*.24]){box([w*.47,h*.49,.045],[x,h*.73,.372],{color:pale,part:'fridge-door'});handle(x,h*.77,.405,w*.26);}
    for(const y of[.39,.79]){box([w-.09,.37,.045],[0,y,.372],{part:'freezer-drawer'});handle(0,y+.075,.405,w*.55);}
    box([.16,.23,.025],[-w*.24,h*.70,.403],{...dark,part:'fridge-water-dispenser'});box([.10,.02,.06],[-w*.24,h*.61,.404],steel);
   }else{for(const[y,hh]of[[.35,.40],[.77,.36],[1.51,.99]]){box([w-.075,hh,.045],[0,y,.372],{part:'fridge-door'});handle(w*.15,y+hh*.2,.405,w*.39);}box([.075,.22,.01],[-w*.26,1.62,.405],{...blue,part:'fridge-display'});}
  }else if(kind==='mkOvenTower'){for(const y of[.78,1.45])ovenDoor(w-.13,0,y,.54);front(w-.07,0,.32,.25,'drawer');front(w-.07,0,2.02,.32);for(const x of[-.23,-.11,0,.11,.23])box([.07,.018,.012],[x,.13,.367],dark);
  }else{for(const x of[-w*.24,w*.24]){front(w*.47,x,.69,.99);front(w*.47,x,1.73,.94);}}
 }
 function wallCabinet(w,h,glassDoors=false){const d=spec.depth;box([w,h,.035],[0,h/2,.0175],{color:shade,part:'wall-cabinet-back'});for(const x of[-w/2+.018,w/2-.018])box([.035,h,d],[x,h/2,d/2],{part:'wall-cabinet-side'});for(const y of[.022,h-.022])box([w,.044,d],[0,y,d/2],{part:'wall-cabinet-shelf'});
  for(const x of[-w*.24,w*.24]){box([w*.47,h-.07,.026],[x,h/2,d-.018],{color:glassDoors?'#75918e':pale,paintable:!glassDoors,part:glassDoors?'cabinet-glass':'cabinet-door'});if(glassDoors){for(const y of[h*.34,h*.64])box([w*.43,.025,.012],[x,y,d-.002],{...wood,part:'glass-door-shelf-line'});for(const dx of[-w*.216,w*.216])box([.035,h-.08,.026],[x+dx,h/2,d-.008],wood);}handle(x,.17,d-.035,w*.24);}
 }
 function hood(w,h,pro=false){const d=spec.depth;
  if(pro){for(const x of[-w*.24,w*.24])box([w*.20,h*.64,d*.42],[x,h*.68,d*.23],{color:shade,part:'hood-chimney'});box([w,h*.29,d],[0,h*.19,d/2],{part:'extractor-hood'});}
  else{box([w*.28,h*.60,d*.37],[0,h*.70,d*.20],{color:pale,part:'hood-chimney'});const shape=new THREE.Shape();shape.moveTo(-w/2,0);shape.lineTo(w/2,0);shape.lineTo(w*.20,h*.25);shape.lineTo(-w*.20,h*.25);shape.closePath();mesh(new THREE.ExtrudeGeometry(shape,{depth:d-.04,bevelEnabled:false}),[0,h*.08,.02],{part:'hood-canopy'});}
  for(const x of[-w*.27,0,w*.27]){box([w*.24,.02,d*.72],[x,.025,d*.51],{...dark,part:'hood-filter'});for(const z of[d*.23,d*.37,d*.51,d*.65,d*.79])box([w*.20,.008,.014],[x,.009,z],steel);}for(const x of[-w*.40,w*.40])cyl(.042,.016,[x,.028,d*.83],{...stone,part:'hood-light'});
  for(const x of[-.11,0,.11])knob(x,h*.20,d-.005,.018);
 }
 function countertopAppliance(){const w=spec.width,d=spec.depth,h=spec.height;
  if(kind==='mkPortableHob'){box([w,.10,d],[0,.067,0],{color:shade,part:'portable-induction-body'});for(const x of[-w*.33,w*.33])for(const z of[-d*.30,d*.30])cyl(.035,.04,[x,.02,z],dark);ring(.17,.008,[0,.124,-.045],{...steel,part:'induction-zone'});for(const x of[-.10,0,.10])box([.045,.006,.02],[x,.128,.18],blue);return;}
  if(kind==='mkWaterPurifier'){box([w,.065,d],[0,.0325,0],{color:shade,part:'water-machine-base'});box([w*.85,h*.90,d*.48],[0,h*.51,-d*.22],{part:'water-reservoir'});box([w*.69,.07,d*.79],[0,h*.77,.02],{color:pale,part:'water-machine-head'});cyl(.034,.10,[0,h*.67,.12],steel);box([w*.67,.025,d*.50],[0,.085,d*.20],{...dark,part:'drip-tray'});for(const x of[-.10,-.05,0,.05,.10])box([.016,.009,d*.35],[x,.104,d*.20],steel);box([.11,.14,.012],[0,h*.68,-d*.22+d*.25],blue);return;}
  box([w-.03,h-.07,d-.07],[0,h/2+.005,-.015],{radius:.035});for(const x of[-w*.32,w*.32])for(const z of[-d*.28,d*.28])cyl(.025,.05,[x,.025,z],dark);
  if(kind==='mkCoffeeBar'){box([w*.72,h*.62,.025],[0,h*.50,d*.40],dark);for(const x of[-.15,.15]){cyl(.065,.035,[x,h*.58,d*.30],steel);beam([x,h*.60,d*.29],[x,h*.60,d*.48],.018,wood);}box([w*.76,.035,d*.31],[0,.11,d*.28],steel);for(const x of[-.13,.13]){knob(x,h*.80,d*.45,.045);box([.025,.04,.008],[x,h*.80,d*.473],dark);}tube([[w*.35,h*.61,d*.40],[w*.37,h*.35,d*.44],[w*.29,h*.25,d*.44]],.012,steel);return;}
  const washing=kind==='mkCounterDishwasher';box([w*.70,h*.65,.025],[-w*.07,h*.48,d*.47],{...dark,part:washing?'dishwasher-window-frame':'steam-oven-frame'});box([w*.58,h*.49,.010],[-w*.07,h*.48,d*.498],{...glass,part:washing?'dishwasher-window':'steam-oven-window'});
  for(const y of[h*.31,h*.48,h*.64])box([w*.49,.012,.008],[-w*.07,y,d*.508],{...steel,part:washing?'dish-basket':'oven-rack'});
  if(washing){for(const x of[-.17,-.06,.05]){const dish=ring(.067,.008,[x,h*.47,d*.513],stone);dish.rotation.x=0;}box([w*.60,.045,.01],[0,h*.86,d*.497],dark);for(const x of[-.14,0,.14])knob(x,h*.86,d*.513,.013);}
  else{for(const y of[h*.35,h*.67])knob(w*.36,y,d*.486,.037);handle(-w*.07,h*.79,d*.491,w*.50);}
 }
 const w=spec.width;
 switch(kind){
  case'mkSingleHob':cooker(1,w);break;case'mkDoubleGas':cooker(2,w);break;case'mkFourGas':case'mkRangeOven':cooker(4,w);break;case'mkInduction':cooker(4,w,true);break;case'mkWideRange':cooker(6,w);break;case'mkSteelRange':cooker(4,w,false,true);break;
  case'mkSlimDishwasher':case'mkDishwasher':case'mkProDishwasher':dishwasher(w);break;case'mkIntegratedDishwasher':dishwasher(w,1,true);break;case'mkDrawerDishwasher':dishwasher(w,2);break;
  case'mkSingleSink':sink(w);break;case'mkDoubleSink':sink(w,2);break;case'mkFarmhouseSink':sink(w,1,true);break;case'mkSteelSink':sink(w,2,false,true);break;
  case'mkBaseDoor':doorBase(w,1,true);break;case'mkBaseDrawers':case'mkWideDrawers':drawerBase(w,3,true);break;case'mkPullout':doorBase(w,1,true);front(w-.07,0,.49,.29,'drawer');break;
  case'mkCorner':{const d=spec.depth;for(const x of[-.55,.55])box([.10,.96,.10],[x,.48,-.53]);box([1.2,.065,.62],[0,.9875,-.29],{...stone,part:'corner-worktop'});box([.62,.065,.58],[-.29,.9875,.31],{...stone,part:'corner-worktop'});box([1.14,.80,.51],[0,.53,-.31],{part:'corner-cabinet'});box([.51,.80,.55],[-.31,.53,.22],{part:'corner-cabinet'});front(.52,-.29,.55,.72);break;}
  case'mkBreakfastIsland':{carcass(w,.75);for(const x of[-w*.23,w*.23])front(w*.46,x,.55,.76);box([w,.065,1.2],[0,.9875,0],{...stone,part:'island-worktop',supportTop:true});for(const x of[-w*.43,w*.43])box([.09,.95,.09],[x,.475,.48],{part:'island-support-leg'});break;}
  case'mkPrepIsland':{for(const x of[-w*.46,w*.46])for(const z of[-.51,.51])box([.11,.97,.11],[x,.485,z]);box([w-.16,.055,1.10],[0,.22,0],{part:'island-open-shelf'});for(const x of[-.72,0,.72]){box([.65,.44,1.08],[x,.71,-.04],{color:shade});front(.65,x,.74,.38,'drawer');}box([w,.065,1.3],[0,.9875,0],{...stone,part:'island-worktop',supportTop:true});break;}
  case'mkOvenTower':case'mkPantryTower':tall(w,spec.height);break;case'mkFrenchFridge':case'mkSlimFridge':tall(w,spec.height,true);break;
  case'mkWallCabinet':case'mkGlassWallCabinet':wallCabinet(w,spec.height,kind==='mkGlassWallCabinet');break;
  case'mkWideHood':case'mkProHood':hood(w,spec.height,kind==='mkProHood');break;
  default:countertopAppliance();
 }
 root.updateMatrixWorld(true);
 // Wall origin is the back plane. Floor and table origins remain centred on
 // their full catalogue footprint. Authored worktops are never rescaled.
 if(spec.placement==='wall'){
  const bounds=new THREE.Box3().setFromObject(root);for(const child of root.children){child.position.y-=bounds.min.y;child.position.z-=bounds.min.z;}
 }
 // Pull small front fittings into the catalogue volume instead of scaling the
 // whole appliance (which would break the common worktop height/depth).
 for(const child of root.children){
  child.updateWorldMatrix(true,true);const b=new THREE.Box3().setFromObject(child),minZ=spec.placement==='wall'?0:-spec.depth/2,maxZ=spec.placement==='wall'?spec.depth:spec.depth/2;
  if(b.max.z>maxZ)child.position.z-=b.max.z-maxZ;
  else if(b.min.z<minZ)child.position.z+=minZ-b.min.z;
 }
 root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root),center=bounds.getCenter(new THREE.Vector3());
 for(const child of root.children){child.position.x-=center.x;child.position.y-=bounds.min.y;if(spec.placement!=='wall')child.position.z-=center.z;}
 root.updateMatrixWorld(true);return root;
}
