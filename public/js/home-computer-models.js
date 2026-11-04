import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {COMPUTER_COLLECTION} from './home-computer-collection.js';

const specs=new Map(COMPUTER_COLLECTION.map(row=>[row.id,row]));
export const isComputerProduct=kind=>specs.has(kind);

/** Original tabletop computers. Every part is real geometry; the display
 * binder owns powered screen content, so model/thumbnail teardown never has
 * hidden texture ownership. Finished tabletop is local y=0, user faces +Z. */
export function createComputerProduct({kind,color,material,maps={}}={}){
  const spec=specs.get(kind);if(!spec)throw new RangeError(`Unknown computer product: ${kind}`);
  const root=new THREE.Group();root.name=`computer-${kind}`;
  root.userData={kind,origin:'bottom',placement:'table',family:'computers',noUpgrade:true,level:1,
    dimensions:{width:spec.width,depth:spec.depth,height:spec.height},forward:{x:0,y:0,z:1}};
  const geometries=new Set(),materials=new Set();let disposed=false,screenIndex=0;
  const paint=new THREE.Color(color??spec.defaultColor),cream='#fff1d8',ink='#283644',keycap='#e4ebe9',silver='#a9b9bf';
  function mesh(parent,geometry,at,tone=paint,{fixed=true,part='body',objectPart,emissive=false,transparent=false}={}){
    const finish=material??spec.material,mat=new THREE.MeshStandardMaterial({color:tone,
      map:fixed?null:maps[finish]??null,roughness:fixed?.57:finish==='gold'?.3:.48,metalness:fixed?0:finish==='gold'?.55:.04,
      ...(emissive?{emissive:tone,emissiveIntensity:0}:{}),...(transparent?{transparent:true,opacity:.28,depthWrite:false,roughness:.19}:{}),side:THREE.FrontSide});
    geometries.add(geometry);materials.add(mat);
    const node=new THREE.Mesh(geometry,mat);node.position.set(...at);node.name=`${kind}-${part}`;
    node.castShadow=!transparent;node.receiveShadow=!transparent;node.userData={paintable:!fixed,part,...objectPart?{objectPart}:{}};parent.add(node);return node;
  }
  function box(parent,size,at,tone=paint,options={}){
    const radius=Math.min(options.radius??.008,...size.map(n=>n*.35));
    return mesh(parent,new RoundedBoxGeometry(...size,1,radius),at,tone,options);
  }
  function cylinder(parent,radius,height,at,tone,options={}){return mesh(parent,new THREE.CylinderGeometry(radius,radius,height,16),at,tone,options);}
  function ball(parent,scale,at,tone,options={}){const node=mesh(parent,new THREE.SphereGeometry(1,14,10),at,tone,options);node.scale.set(...scale);return node;}
  function cable(points,tone=ink,radius=.002){
    const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    return mesh(root,new THREE.TubeGeometry(path,10,radius,5,false),[0,0,0],tone,{part:'cable'});
  }
  function led(parent,at,size=[.014,.004,.003],tone='#73d8bb'){
    return box(parent,size,at,tone,{part:'power-led',objectPart:'computer-power-led',emissive:true,radius:.001});
  }
  function monitor({width,height,x,y,z,yaw=0,tilt=0,style='learning',tone=paint,back=ink}){
    const group=new THREE.Group();group.name=`${kind}-monitor-${screenIndex}`;group.position.set(x,y,z);group.rotation.set(tilt,yaw,0);root.add(group);
    box(group,[width,height,.032],[0,0,0],tone,{fixed:false,part:'monitor-casing',radius:.012});
    box(group,[width-.021,height-.021,.006],[0,0,.018],back,{part:'monitor-bezel',radius:.006});
    const w=width-.052,h=height-.055;
    const face=mesh(group,new THREE.PlaneGeometry(w,h),[0,.006,.022], '#101b25',{part:'display',objectPart:'computer-screen'});
    face.castShadow=false;face.receiveShadow=false;
    Object.assign(face.userData,{screenAspect:w/h,screenIndex:screenIndex++,computerScreenStyle:style});
    led(group,[width/2-.030,-height/2+.012,.0225],[.012,.003,.002]);
    ball(group,[.003,.003,.001],[0,height/2-.011,.022],ink,{part:'webcam'});
    return group;
  }
  function keys({width,depth,x=0,z=0,y=.025,rows=4,cols=10,tone=keycap}){
    // Merge the static caps into one draw call; floor snapshots and temporary
    // visits consume ordinary meshes, with no special instancing path needed.
    const source=new THREE.BoxGeometry(width/cols*.72,.005,depth/rows*.68),pieces=[];
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const geo=source.clone();geo.translate(x+(col-(cols-1)/2)*width/cols,y,z+(row-(rows-1)/2)*depth/rows);pieces.push(geo);
    }
    const geometry=mergeGeometries(pieces,false);source.dispose();for(const piece of pieces)piece.dispose();
    const node=mesh(root,geometry,[0,0,0],tone,{part:'keyboard-keys'});node.userData.keyboardKeyCount=rows*cols;
    return node;
  }
  function keyboard({width,depth,x,z,tone=cream,accent=paint}){
    box(root,[width,.020,depth],[x,.010,z],tone,{part:'keyboard-case',radius:.007});
    keys({width:width-.027,depth:depth-.025,x,z,y:.023,cols:12});
    box(root,[width*.26,.006,.011],[x,.023,z+depth*.40],accent,{part:'spacebar',radius:.002});
  }
  function mouse(x,z,{width=.060,depth=.10,tone=cream,wire=true}={}){
    ball(root,[width/2,.017,depth/2],[x,.017,z],tone,{part:'mouse'});
    box(root,[.0015,.003,depth*.45],[x,.034,z-depth*.13],ink,{part:'mouse-split',radius:.0005});
    box(root,[.006,.005,.015],[x,.034,z-depth*.12],silver,{part:'mouse-wheel',radius:.002});
    if(wire)cable([[x,.009,z-depth/2],[x-.015,.007,z-depth*.85],[x-.05,.006,z-depth*1.2]],ink,.0018);
  }
  function stand(x,z,{height=.19,width=.055,tone=silver}={}){
    box(root,[.20,.018,.19],[x,.009,z+.015],tone,{part:'stand-foot',radius:.008});
    box(root,[width,height,.04],[x,height/2+.012,z],tone,{part:'stand-neck',radius:.006});
  }
  if(kind==='pcPocketLaptop'){
    const cx=-.023;
    box(root,[.40,.025,.33],[cx,.0185,0],paint,{fixed:false,part:'laptop-deck',radius:.009});
    for(const x of[cx-.15,cx+.15])for(const z of[-.12,.12])box(root,[.035,.006,.024],[x,.003,z],ink,{part:'rubber-foot',radius:.002});
    const hinge=cylinder(root,.010,.32,[cx,.037,-.093],silver,{part:'laptop-hinge'});hinge.rotation.z=Math.PI/2;
    const height=.28,tilt=-.20;
    monitor({width:.395,height,x:cx,y:.040+height/2*Math.cos(tilt),z:-.093+height/2*Math.sin(tilt),tilt,style:'learning'});
    keys({width:.337,depth:.099,x:cx,z:-.004,y:.034,cols:10,rows:4,tone:'#eaf3eb'});
    box(root,[.106,.0015,.060],[cx,.032,.107],cream,{part:'trackpad',radius:.005});
    box(root,[.020,.002,.002],[cx,.033,.130],silver,{part:'trackpad-click',radius:.0005});
    for(const z of[-.070,-.024])box(root,[.002,.006,.027],[-.224,.020,z],ink,{part:'laptop-port',radius:.001});
    mouse(.207,.127,{width:.039,depth:.074,tone:cream,wire:false});
  }else if(kind==='pcStudyAllInOne'){
    stand(0,-.13,{height:.19,width:.065,tone:paint});
    monitor({width:.63,height:.36,x:0,y:.35,z:-.155,style:'learning'});
    box(root,[.19,.023,.004],[0,.185,-.132],cream,{part:'aio-speaker-bar',radius:.004});
    for(let i=0;i<8;i++)box(root,[.008,.002,.002],[(i-3.5)*.017,.185,-.129],silver,{part:'speaker-grille',radius:.0005});
    keyboard({width:.45,depth:.12,x:-.04,z:.13,tone:cream,accent:paint});
    mouse(.273,.13,{width:.060,depth:.108,tone:paint});
    cable([[-.04,.007,.065],[-.07,.006,.01],[0,.007,-.06]],silver);
  }else if(kind==='pcNeonDesktop'){
    stand(-.17,-.145,{height:.21,width:.05,tone:ink});
    monitor({width:.59,height:.35,x:-.17,y:.365,z:-.15,style:'starmap',back:'#172434'});
    box(root,[.25,.55,.32],[.345,.280,-.025],paint,{fixed:false,part:'tower-case',radius:.015});
    for(const x of[.265,.425])for(const z of[-.14,.085])box(root,[.035,.012,.035],[x,.006,z],ink,{part:'tower-foot',radius:.003});
    box(root,[.211,.485,.008],[.345,.285,.139],ink,{part:'tower-front',radius:.009});
    const fanTones=['#6ed5dd','#c895ef','#f2c35f'];
    for(const [index,y]of[.145,.29,.435].entries()){
      const ring=mesh(root,new THREE.TorusGeometry(.055,.0055,6,18),[.345,y,.147],fanTones[index],{part:'rgb-fan-ring',objectPart:'computer-power-led',emissive:true});
      for(let i=0;i<5;i++){const a=i*Math.PI*2/5,blade=box(root,[.015,.036,.003],[.345+Math.sin(a)*.022,y+Math.cos(a)*.022,.146],silver,{part:'fan-blade',radius:.001});blade.rotation.z=-a;}
      cylinder(root,.010,.005,[.345,y,.150],ink,{part:'fan-hub'}).rotation.x=Math.PI/2;
    }
    // A shallow physical component panel beneath its tinted side cover.
    box(root,[.003,.36,.235],[.472,.29,-.027],ink,{part:'tower-component-panel',radius:.001});
    for(const [y,z]of[[.19,-.075],[.30,-.01],[.40,-.065]])box(root,[.003,.035,.09],[.475,y,z],silver,{part:'component-card',radius:.001});
    box(root,[.003,.38,.25],[.478,.29,-.027],'#94bac5',{part:'tower-side-window',transparent:true,radius:.001});
    led(root,[.345,.558,.06],[.027,.003,.018],'#6ed5dd');
    keyboard({width:.47,depth:.14,x:-.18,z:.158,tone:ink,accent:'#83d8d4'});
    box(root,[.14,.003,.16],[.12,.0015,.153],'#64769b',{part:'mouse-pad',radius:.006});mouse(.12,.16,{width:.060,depth:.105,tone:cream,wire:false});
  }else{
    stand(0,-.15,{height:.25,width:.055,tone:silver});
    box(root,[.58,.035,.035],[0,.25,-.16],silver,{part:'dual-monitor-arm',radius:.006});
    monitor({width:.50,height:.34,x:-.27,y:.39,z:-.16,yaw:.12,style:'art',back:'#253442'});
    monitor({width:.50,height:.34,x:.27,y:.39,z:-.16,yaw:-.12,style:'starmap',back:'#253442'});
    keyboard({width:.52,depth:.13,x:-.23,z:.155,tone:cream,accent:paint});
    box(root,[.13,.003,.15],[.10,.0015,.16],'#8fa7b5',{part:'mouse-pad',radius:.006});mouse(.10,.16,{width:.058,depth:.10,tone:cream,wire:false});
    box(root,[.27,.018,.19],[.385,.009,.13],ink,{part:'pen-tablet',radius:.007});
    box(root,[.215,.002,.142],[.393,.019,.13],'#7d91ad',{part:'tablet-work-area',radius:.005});
    for(const z of[.07,.115,.16])box(root,[.009,.003,.016],[.268,.020,z],silver,{part:'tablet-shortcut',radius:.001});
    cable([[.298,.027,.075],[.365,.028,.13],[.470,.027,.195]],cream,.003);
    box(root,[.015,.003,.009],[.478,.027,.200],ink,{part:'pen-tip',radius:.001});
    for(const x of[-.548,.548]){
      box(root,[.060,.20,.11],[x,.10,-.025],paint,{fixed:false,part:'studio-speaker',radius:.007});
      for(const [y,r]of[[.065,.019],[.143,.012]])cylinder(root,r,.003,[x,y,.032],ink,{part:'speaker-cone'}).rotation.x=Math.PI/2;
    }
  }
  root.userData.screenCount=screenIndex;
  root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(root),centre=bounds.getCenter(new THREE.Vector3());
  // Center the full set, including the mouse and peripherals, so saved table
  // anchors and rotated collision footprints describe the real visible mesh.
  for(const child of root.children){child.position.x-=centre.x;child.position.z-=centre.z;child.position.y-=bounds.min.y;}
  root.userData.dispose=root.dispose=onDispose=>{
    if(disposed)return;disposed=true;
    for(const geometry of geometries){onDispose?.(geometry);geometry.dispose();}
    for(const mat of materials){onDispose?.(mat);mat.dispose();}
    root.removeFromParent();root.clear();
  };
  root.updateMatrixWorld(true);return root;
}
