import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {ROOMY_FURNITURE_COLLECTION} from './home-roomy-furniture-collection.js';

const specs=new Map(ROOMY_FURNITURE_COLLECTION.map(row=>[row.id,row]));
export const isRoomyFurniture=kind=>specs.has(kind);
/** Original large constructions. Fixed envelopes never grow when recoloured;
 * supporting tops and sleeping surfaces use the existing placement markers. */
export function createRoomyFurniture({kind,color,material,maps={}}={}){
 const spec=specs.get(kind);if(!spec)throw new RangeError(`Unknown roomy furniture: ${kind}`);
 color||=spec.defaultColor;material||=spec.material;
 const group=new THREE.Group();group.name=`furniture-${kind}`;
 group.userData={kind,noUpgrade:true,level:1,origin:'bottom',placement:'floor',family:spec.family,tier:spec.tier,robotAction:spec.robotAction,
  materialVariant:material,dimensions:{width:spec.width,depth:spec.depth,height:spec.height},...(spec.supportSurface?{supportSurface:{...spec.supportSurface}}:{})};
 const w=spec.width,d=spec.depth,h=spec.height,paint=new THREE.Color(color),pale=paint.clone().lerp(new THREE.Color('#fff2dd'),.43),shade=paint.clone().multiplyScalar(.69);
 const cream={color:'#fff3dc',finish:'linen',paintable:false},wood={color:'#b58c5e',finish:'oak',paintable:false},gold={color:'#caa666',finish:'gold',paintable:false},steel={color:'#657b7a',finish:'ceramic',paintable:false};
 const geometries=new Map(),materials=new Map();
 function add(geometry,p=[0,0,0],opts={}){
  const paintable=opts.paintable!==false,finish=paintable?material:opts.finish??'ceramic';
  const tone=opts.color??paint,key=`${new THREE.Color(tone).getHex()}:${finish}:${paintable}`;
  if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color:tone,map:maps[finish]??null,roughness:['linen','wool','velvet'].includes(finish)?.88:finish==='marble'?.30:finish==='gold'?.25:.62,metalness:finish==='gold'?.6:0}));
  const mesh=new THREE.Mesh(geometry,materials.get(key));mesh.position.set(...p);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={paintable,part:opts.part??'body',...(opts.supportTop?{supportTop:true}:{})};
  if(opts.supportTop)mesh.name='furniture-support-top';group.add(mesh);return mesh;
 }
 function box(size,p,opts={}){
  const radius=Math.min(opts.radius??.025,...size.map(n=>n*.40)),key=`box:${size}:${radius}`;
  if(!geometries.has(key))geometries.set(key,new RoundedBoxGeometry(...size,2,radius));return add(geometries.get(key),p,opts);
 }
 function cyl(top,bottom,height,p,opts={}){
  const key=`cyl:${top}:${bottom}:${height}`;if(!geometries.has(key))geometries.set(key,new THREE.CylinderGeometry(top,bottom,height,24));return add(geometries.get(key),p,opts);
 }
 function beam(a,b,r,opts={}){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);const mesh=cyl(r,r,delta.length(),start.add(end).multiplyScalar(.5).toArray(),opts);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return mesh;}
 function arch(width,height,depth,p,opts={}){
  const s=new THREE.Shape();s.moveTo(-width/2,0);s.lineTo(width/2,0);s.lineTo(width/2,height*.63);s.quadraticCurveTo(width/2,height,-width*.16,height);s.quadraticCurveTo(-width/2,height,-width/2,height*.63);s.closePath();
  return add(new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:false,curveSegments:20}),p,opts);
 }
 function handle(x,y,z,width=.22){box([width,.035,.038],[x,y,z],gold);}
 function feet(width,depth,height=.18,opts=wood,r=.055){for(const x of[-width/2,width/2])for(const z of[-depth/2,depth/2])cyl(r*.8,r,height,[x,height/2,z],opts);}
 function bedding(width,depth,y,pillows=2){
  box([width,.19,depth],[0,y,0],{...cream,radius:.07,part:'mattress'});
  box([width+.012,.095,depth*.64],[0,y+.14,depth*.15],{color:pale,radius:.048,part:'duvet'});
  // Pillows are the only contents on a bed: the central sleeping surface stays clear.
  for(let i=0;i<pillows;i++)box([width/pillows*.80,.14,.39],[(i-(pillows-1)/2)*width/pillows,y+.16,-depth*.35],{...cream,radius:.058,part:'pillow'});
  box([width*.99,.012,.09],[0,y+.193,depth*.30],{color:shade,radius:.004,part:'duvet-border'});
 }
 function bedBase(style='raised'){
  if(style==='low'){box([w,.15,d],[0,.075,0],{part:'low-wide-platform',radius:.06});box([w-.12,.17,d-.12],[0,.23,0],{color:shade,radius:.055});return .43;}
  if(style==='storage'){box([w,.46,d],[0,.23,0],{part:'storage-base',radius:.035});box([w,.07,d],[0,.495,0],{color:shade});return .64;}
  feet(w-.22,d-.24,.20,wood,.062);box([w,.20,d],[0,.29,0],{part:'wide-bed-frame',radius:.065});return .51;
 }
 function plankHead(height=h,width=w*.97){box([width,height-.18,.12],[0,(height+.18)/2,-d/2+.06],{part:'broad-headboard',radius:.045});}
 function drawerFronts(count,y=.26,height=.30){for(let i=0;i<count;i++){const width=(w-.12)/count,x=(i-(count-1)/2)*width;box([width-.035,height,.045],[x,y,d/2-.045],{color:pale,part:'bed-storage-drawer'});handle(x,y,d/2-.025,width*.32);}}
 function roundTop(width,depth,y,opts={}){const mesh=cyl(1,1,.10,[0,y-.05,0],{part:'supporting-top',supportTop:true,...opts});mesh.scale.set(width/2,1,depth/2);return mesh;}
 function rectTop(width=w,depth=d,y=h,at=[0,0],opts={}){return box([width,.11,depth],[at[0],y-.055,at[1]],{part:'supporting-top',supportTop:true,radius:.055,...opts});}
 function tableLegs(width=w-.28,depth=d-.24,height=h-.11,opts={}){for(const x of[-width/2,width/2])for(const z of[-depth/2,depth/2]){
  cyl(.052,.055,.05,[x,.025,z],{...opts,part:'table-ground-foot'});beam([x,.05,z],[x-Math.sign(x)*.055,height-.02,z],.048,{...opts,part:'table-leg'});
 }}
 const builders={
  rfBirchSingle(){const y=bedBase();for(const x of[-w*.45,w*.45])box([.10,h-.16,.13],[x,(h+.16)/2,-d/2+.065],{part:'headboard-post'});for(const yy of[.49,h-.045])box([w*.96,.09,.13],[0,yy,-d/2+.065]);for(let i=0;i<6;i++)box([.11,h-.57,.065],[(i-2.5)*w*.138,(h+.49)/2,-d/2+.05],{color:pale,part:'broad-head-slat'});bedding(w-.24,d-.29,y,1);},
  rfDrawerSingle(){const y=bedBase('storage');plankHead();drawerFronts(3);bedding(w-.22,d-.28,y,1);},
  rfCloudDouble(){const y=bedBase();arch(w*.98,h-.25,.20,[0,.25,-d/2+.025],{part:'soft-arched-headboard',color:pale});box([w*.99,.25,d*.96],[0,.29,.02],{radius:.10,part:'rounded-upholstered-frame'});bedding(w-.28,d-.35,y,2);},
  rfOakPlatform(){const y=bedBase('low');for(let i=0;i<3;i++)box([w*.98,.135,.13],[0,.47+i*.15,-d/2+.065],{part:'horizontal-head-plank'});for(const x of[-w*.42,w*.42])box([.10,.65,.10],[x,.425,-d/2+.05]);bedding(w-.34,d-.33,y,2);},
  rfCaneDouble(){const y=bedBase();for(const x of[-w*.46,w*.46])box([.105,h-.20,.13],[x,(h+.20)/2,-d/2+.065],{part:'cane-head-frame'});for(const yy of[.51,h-.05])box([w*.96,.10,.13],[0,yy,-d/2+.065]);for(let i=-4;i<=4;i++)box([.028,h-.66,.028],[i*w*.095,(h+.51)/2,-d/2+.055],{...wood,part:'woven-cane-vertical'});for(let i=0;i<4;i++)box([w*.88,.026,.026],[0,.64+i*.145,-d/2+.08],{color:pale,part:'woven-cane-horizontal'});bedding(w-.27,d-.31,y,2);},
  rfWalnutSleigh(){const y=bedBase();arch(w*.98,h-.23,.16,[0,.23,-d/2+.015],{part:'sleigh-arched-head'});arch(w*.96,.51,.16,[0,.19,d/2-.16],{part:'sleigh-curved-foot',color:pale});for(const x of[-w*.43,w*.43]){beam([x,.07,-d*.38],[x,.23,-d*.27],.055,{part:'sleigh-curved-leg'});beam([x,.07,d*.38],[x,.23,d*.27],.055,{part:'sleigh-curved-leg'});}bedding(w-.30,d-.44,y,2);},
  rfFlutedKing(){const y=bedBase('low');box([w,.30,d],[0,.30,0],{part:'floating-wide-platform',radius:.075});for(let i=0;i<7;i++)box([w*.138,h-.30,.18],[(i-3)*w*.14,(h+.30)/2,-d/2+.09],{color:i%2?pale:paint,radius:.065,part:'broad-upholstery-panel'});bedding(w-.35,d-.36,.55,2);},
  rfCanopyKing(){const y=bedBase();for(const x of[-w/2+.055,w/2-.055])for(const z of[-d/2+.055,d/2-.055])box([.11,h,.11],[x,h/2,z],{part:'canopy-post'});for(const x of[-w/2+.055,w/2-.055])box([.11,.11,d],[x,h-.055,0],{part:'canopy-side-rail'});for(const z of[-d/2+.055,d/2-.055])box([w,.11,.11],[0,h-.055,z],{part:'canopy-end-rail'});plankHead(1.10,w-.16);for(const x of[-w*.44,w*.44]){const cloth=box([.21,1.30,.10],[x,1.30,-d*.36],{color:pale,radius:.045,part:'tied-side-curtain'});cloth.rotation.z=x>0?.06:-.06;box([.23,.065,.12],[x,1.02,-d*.36],gold);}bedding(w-.34,d-.36,y,2);},
  rfGrandHotel(){box([w-.35,.16,d-.28],[0,.08,.01],{color:shade,part:'recessed-shadow-base'});box([w,.10,d],[0,.21,0],gold);box([w,.30,d],[0,.41,0],{part:'hotel-wide-platform',radius:.11});box([w*.99,.67,.20],[0,.865,-d/2+.10],{color:pale,radius:.08,part:'hotel-wide-headboard'});for(const x of[-w*.465,w*.465])box([.20,.73,.55],[x,.835,-d/2+.29],{part:'low-headboard-wing',radius:.06});bedding(w-.49,d-.42,.68,2);},
  rfHouseSingle(){const y=bedBase('low');const roofY=h-.04,postY=1.31;for(const x of[-w*.45,w*.45])for(const z of[-d*.46,d*.46])box([.085,postY,.085],[x,postY/2,z],{part:'house-upright'});for(const z of[-d*.46,d*.46])for(const x of[-w*.45,w*.45])beam([x,postY,z],[0,roofY,z],.038,{part:'house-roof-slope'});beam([0,roofY,-d*.46],[0,roofY,d*.46],.038,{part:'house-roof-ridge'});for(const x of[-w*.45,w*.45])box([.07,.23,d*.84],[x,.54,0],{color:pale,part:'low-side-guard'});plankHead(.94,w*.90);bedding(w-.30,d-.34,y,1);},
  rfRoundBed(){const low=cyl(1,1,.20,[0,.10,0],{part:'circular-low-base',color:shade});low.scale.set(w/2,1,d/2);const band=cyl(1,1,.24,[0,.32,0],{part:'circular-padded-frame'});band.scale.set(w*.49,1,d*.49);const mattress=cyl(1,1,.18,[0,.53,0],{...cream,part:'mattress'});mattress.scale.set(w*.43,1,d*.43);const quilt=cyl(1,1,.075,[0,.655,0],{color:pale,part:'duvet'});quilt.scale.set(w*.425,1,d*.425);for(let i=0;i<9;i++){const a=Math.PI+(i+.5)*Math.PI/9,x=Math.cos(a)*w*.43,z=Math.sin(a)*d*.43;const panel=box([w*.14,.72,.16],[x,.82,z],{radius:.06,part:'crescent-back-panel'});panel.rotation.y=Math.PI/2-a;}for(const x of[-.40,.40])box([.60,.13,.35],[x,.76,-.57],{...cream,radius:.05,part:'pillow'});},
  rfPanelStorageKing(){const y=bedBase('storage');for(const yy of[.19,.39])drawerFronts(3,yy,.165);box([w*.98,h-.22,.15],[0,(h+.22)/2,-d/2+.075],{part:'storage-headboard'});box([w*.90,.055,.20],[0,.89,-d/2+.16],{color:shade,part:'headboard-open-ledge'});box([w*.90,.05,.20],[0,1.09,-d/2+.16],{color:pale,part:'headboard-open-ledge'});bedding(w-.30,d-.40,y,2);},
  rfFourSeatTable(){rectTop();tableLegs();for(const z of[-d*.37,d*.37])box([w*.90,.13,.065],[0,h-.18,z],{color:shade,part:'table-apron'});},
  rfSixSeatTable(){rectTop();for(const x of[-w*.31,w*.31]){box([.55,.09,d*.79],[x,.045,0],{part:'trestle-foot'});for(const z of[-d*.28,d*.28])beam([x,.09,z],[x,h-.13,z*.45],.065,{part:'trestle-leg'});}box([w*.63,.12,.13],[0,.30,0],{part:'trestle-crossbar'});},
  rfEightSeatTable(){rectTop();for(const x of[-w*.27,w*.27]){const p=cyl(.28,.34,h-.11,[x,(h-.11)/2,0],{part:'elliptical-pedestal'});p.scale.z=1.35;box([.85,.065,d*.72],[x,.0325,0],{color:shade,radius:.035,part:'pedestal-plinth'});}},
  rfRoundDining(){roundTop(w,d,h);cyl(.36,.55,h-.15,[0,(h-.15)/2+.025,0],{part:'waisted-round-pedestal'});cyl(w*.31,w*.31,.07,[0,.035,0],{color:shade,part:'round-ground-disc'});},
  rfOvalDining(){roundTop(w,d,h);for(const x of[-w*.255,w*.255]){const p=cyl(.29,.32,h-.10,[x,(h-.10)/2,0],{part:'flattened-stone-pillar'});p.scale.z=1.42;}},
  rfExpandedDining(){rectTop();for(const x of[-w*.20,w*.20])box([.014,.005,d*.94],[x,h-.0025,0],{color:shade,part:'extension-leaf-seam'});tableLegs(w-.24,d-.25,h-.11);for(const x of[-w*.34,w*.34])box([.44,.06,d*.82],[x,h-.16,0],{part:'extension-support'});},
  rfFarmhouseTable(){rectTop();for(let i=-2;i<=2;i++)box([w*.95,.005,.009],[0,h-.0025,i*d*.18],{color:shade,part:'plank-joint'});for(const x of[-w*.32,w*.32]){for(const z of[-d*.38,d*.38])cyl(.065,.07,.06,[x,.03,z],{part:'farmhouse-ground-foot'});beam([x,.065,-d*.38],[x,h-.13,d*.31],.065,{part:'farmhouse-x-leg'});beam([x,.065,d*.38],[x,h-.13,-d*.31],.065,{part:'farmhouse-x-leg'});}box([w*.66,.13,.13],[0,.32,0],{part:'farmhouse-long-stretcher'});},
  rfWideDesk(){rectTop();box([.59,h-.14,d*.79],[-w*.32,(h-.14)/2,0],{part:'desk-side-cabinet'});for(const yy of[.29,.62]){box([.55,.28,.055],[-w*.32,yy,d*.405],{color:pale,part:'desk-drawer'});handle(-w*.32,yy,d*.438,.22);}for(const z of[-d*.35,d*.35])box([.085,h-.11,.085],[w*.41,(h-.11)/2,z],{part:'open-desk-leg'});},
  rfStudioDesk(){rectTop();for(const x of[-w*.34,w*.34]){beam([x,.055,-d*.36],[x,h-.12,-d*.25],.045,{...steel,part:'studio-steel-trestle'});beam([x,.055,d*.36],[x,h-.12,d*.25],.045,{...steel,part:'studio-steel-trestle'});box([.15,.065,d*.78],[x,.0325,0],{...steel,part:'steel-ground-rail'});}box([w*.72,.07,.07],[0,.35,-d*.30],steel);},
  rfDoubleDesk(){rectTop();box([.52,h-.11,d*.82],[0,(h-.11)/2,0],{part:'shared-center-cabinet'});for(let i=0;i<3;i++){const yy=.20+i*.265;box([.47,.225,.055],[0,yy,d*.425],{color:pale,part:'center-storage-drawer'});handle(0,yy,d*.46,.18);}for(const x of[-w*.46,w*.46])for(const z of[-d*.35,d*.35])box([.085,h-.11,.085],[x,(h-.11)/2,z],{part:'double-desk-open-leg'});},
  rfCornerDesk(){rectTop(w,.88,h,[0,.50]);box([.83,.11,d-.15],[-w/2+.415,h-.055,-.035],{part:'return-wing-top',supportTop:true,radius:.04});for(const [x,z]of[[-w/2+.12,-d/2+.12],[-w/2+.12,d/2-.10],[w/2-.12,d/2-.10],[w/2-.12,.17],[-w/2+.72,-d/2+.12]])box([.085,h-.11,.085],[x,(h-.11)/2,z],{part:'corner-open-leg'});box([.68,.28,.64],[-w/2+.42,.68,-d/2+.41],{color:pale,part:'wing-storage-drawer'});},
  rfWideCoffee(){rectTop();box([w-.14,.065,d-.14],[0,.13,0],{color:shade,part:'lower-open-tray'});feet(w-.32,d-.32,h-.11,wood,.095);},
  rfRoundCoffee(){roundTop(w,d,h);for(let i=0;i<3;i++){const a=i*Math.PI*2/3+.35;cyl(.11,.18,h-.10,[Math.cos(a)*w*.24,(h-.10)/2,Math.sin(a)*d*.24],{part:'three-rounded-cone-feet'});}},
  rfBreakfastBar(){rectTop();box([.12,h-.11,d*.86],[-w*.44,(h-.11)/2,0],{part:'bar-solid-side-panel'});for(const z of[-d*.33,d*.33])box([.07,h-.11,.07],[w*.43,(h-.11)/2,z],{...steel,part:'bar-steel-leg'});beam([-w*.42,.29,d*.27],[w*.43,.29,d*.27],.032,{...steel,part:'long-footrest'});},
 };
 builders[kind]();group.updateMatrixWorld(true);
 // Authors work at final scale. Only centre/ground translation is needed; the
 // support heights above remain exact, rather than being shrunk by a fit step.
 const bounds=new THREE.Box3().setFromObject(group),centre=bounds.getCenter(new THREE.Vector3());
 for(const child of group.children){child.position.x-=centre.x;child.position.y-=bounds.min.y;child.position.z-=centre.z;}
 group.updateMatrixWorld(true);return group;
}
