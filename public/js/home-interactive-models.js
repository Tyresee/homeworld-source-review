import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {INTERACTIVE_COLLECTION} from './home-interactive-collection.js';

const specs=new Map(INTERACTIVE_COLLECTION.map(row=>[row.id,row]));
export const isInteractiveProduct=kind=>specs.has(kind);

/** Independent source geometry, no external media, no shared disposable
 * resources. The runtime owns screen content, light and remote visibility. */
export function createInteractiveProduct({kind,color,material,maps={}}={}){
  const spec=specs.get(kind);if(!spec)throw new RangeError(`Unknown interactive product: ${kind}`);
  const root=new THREE.Group();root.name=`interactive-${kind}`;
  root.userData={kind,origin:'bottom',placement:'floor',noUpgrade:true,level:1,tier:spec.tier,family:spec.family,
    dimensions:{width:spec.width,depth:spec.depth,height:spec.height}};
  const paint=new THREE.Color(color||spec.defaultColor),cream='#fff0d7',dark='#222c33',brass='#c8a15e';
  function mesh(geometry,at,opt={}){
    const finish=opt.fixed?'ceramic':material||spec.material;
    const object=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:opt.color??paint,
      map:opt.fixed?null:maps[finish]||null,roughness:opt.roughness??(finish==='gold'?.3:.54),metalness:opt.metalness??(finish==='gold'?.58:0),
      ...(opt.emissive?{emissive:opt.emissive,emissiveIntensity:0}:{}),side:THREE.FrontSide}));
    object.position.set(...at);object.castShadow=true;object.receiveShadow=true;
    object.userData={paintable:!opt.fixed,part:opt.part??'body',...(opt.objectPart?{objectPart:opt.objectPart}:{})};
    root.add(object);return object;
  }
  const fixed=(color,extra={})=>({color,fixed:true,...extra});
  const box=(size,at,opt={})=>mesh(new RoundedBoxGeometry(...size,2,Math.min(opt.radius??.025,...size.map(n=>n*.35))),at,opt);
  const cylinder=(radius,height,at,opt={})=>mesh(new THREE.CylinderGeometry(radius,radius,height,18),at,opt);
  function line(a,b,r,opt={}){const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),d=q.clone().sub(p);const m=cylinder(r,d.length(),p.add(q).multiplyScalar(.5).toArray(),opt);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m;}
  function screen(w,h,x,y,z){
    const face=mesh(new THREE.PlaneGeometry(w,h),[x,y,z],fixed('#101c26',{emissive:'#ffffff',roughness:.28,part:'television-screen',objectPart:'tv-screen'}));
    face.castShadow=false;face.receiveShadow=false;face.name='television-screen';
    face.userData.screenAspect=w/h;root.userData.screenCentre={x,y,z};return face;
  }
  function remote(x,y,z){
    const dock=new THREE.Group();dock.name='television-remote';dock.position.set(x,y,z);dock.userData={objectPart:'tv-remote',part:'remote-control'};root.add(dock);
    const toDock=object=>{root.remove(object);object.position.sub(dock.position);dock.add(object);return object;};
    toDock(box([.105,.027,.23],[x,y,z],fixed(dark,{radius:.015,part:'remote-body'})));
    toDock(cylinder(.014,.005,[x-.024,y+.016,z-.071],fixed('#d77f65',{part:'remote-power'})));
    toDock(box([.052,.005,.045],[x,y+.016,z-.015],fixed('#849ba4',{part:'remote-channel'})));
    for(const dx of[-.024,.024])for(const dz of[.037,.069])toDock(cylinder(.008,.004,[x+dx,y+.016,z+dz],fixed('#c1c5c5',{part:'remote-button'})));
    root.userData.remoteDock={x,y,z};
  }
  function cabinet(w,d,top,{tone=paint,open=false}={}){
    for(const x of[-w*.39,w*.39])for(const z of[-d*.34,d*.34])box([.075,.15,.075],[x,.075,z],fixed(brass));
    box([w,.055,d],[0,.18,0],fixed(dark));box([w,top-.24,d-.025],[0,(top+.19)/2,0],{color:tone});
    box([w+.025,.055,d+.025],[0,top-.0275,0],fixed(cream,{part:'cabinet-top'}));
    if(open){
      box([w*.31,.19,.04],[0,top-.19,d/2-.025],fixed(dark));
      for(const sign of[-1,1]){box([w*.31,.29,.028],[sign*w*.335,top-.21,d/2+.006],{color:tone});line([sign*w*.335-.13,top-.10,d/2+.031],[sign*w*.335+.13,top-.10,d/2+.031],.008,fixed(brass));}
      box([w*.23,.025,d*.65],[0,top-.21,d*.08],fixed('#4d5b5d'));
    }else{
      for(const sign of[-1,1]){box([w*.46,top-.31,.027],[sign*w*.24,(top+.19)/2,d/2+.006],{color:tone});line([sign*.08,top-.16,d/2+.031],[sign*.08,top-.27,d/2+.031],.009,fixed(brass));}
    }
  }
  if(kind==='ipRetroTelevision'){
    cabinet(1.43,.61,.68);box([1.16,.74,.32],[-.075,1.065,-.025],{radius:.075,part:'television-casing'});
    box([.91,.62,.025],[-.16,1.08,.146],fixed(cream,{radius:.04}));
    box([.82,.54,.018],[-.18,1.08,.166],fixed(dark,{radius:.045}));screen(.77,.49,-.18,1.08,.178);
    for(const y of[1.19,1.04]){const knob=cylinder(.048,.025,[.433,y,.158],fixed(cream));knob.rotation.x=Math.PI/2;box([.009,.053,.009],[.433,y,.178],fixed(brass));}
    for(let i=0;i<4;i++)box([.10,.012,.013],[.43,.90+i*.022,.157],fixed(dark));
    for(const sign of[-1,1])line([-.075,1.44,-.045],[-.075+sign*.23,1.51,-.045],.009,fixed(brass));
    remote(.565,.70,.20);
  }else if(kind==='ipWideTelevision'){
    cabinet(2.12,.63,.71,{open:true});
    for(const x of[-.61,.61]){line([x,.72,.06],[x*.88,.88,-.035],.022,fixed(dark));line([x,.72,-.13],[x*.88,.88,-.035],.022,fixed(dark));}
    box([1.93,.99,.085],[0,1.335,-.045],fixed(dark,{radius:.035,part:'television-casing'}));screen(1.82,.89,0,1.34,.003);
    box([.17,.018,.018],[0,.852,.012],fixed('#81948b'));remote(.88,.735,.21);
  }else{
    cabinet(2.98,.68,.74,{tone:paint,open:true});
    // Long clean fluted doors flank a central equipment bay.
    for(const sign of[-1,1])for(let i=0;i<4;i++)box([.024,.32,.015],[sign*(.60+i*.20),.46,.36],fixed('#75716b'));
    box([2.65,1.36,.10],[0,1.44,-.07],fixed('#30383b',{radius:.035,part:'television-casing'}));screen(2.53,1.245,0,1.445,-.012);
    for(const x of[-1.43,1.43]){
      box([.19,1.20,.21],[x,1.35,-.035],fixed(dark,{radius:.025,part:'cinema-speaker'}));
      for(const[y,r]of[[1.12,.060],[1.42,.060],[1.72,.035]]){const speaker=cylinder(r,.013,[x,y,.078],fixed('#52636a',{part:'speaker-cone'}));speaker.rotation.x=Math.PI/2;}
    }
    box([1.27,.075,.13],[0,.80,.045],fixed(dark,{radius:.025,part:'soundbar'}));remote(1.28,.765,.23);
  }
  root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root),centre=bounds.getCenter(new THREE.Vector3());
  for(const child of root.children){child.position.x-=centre.x;child.position.y-=bounds.min.y;child.position.z-=centre.z;}
  const dock=root.getObjectByName('television-remote'),face=root.getObjectByName('television-screen');
  root.userData.remoteDock={x:dock.position.x,y:dock.position.y,z:dock.position.z};
  root.userData.screenCentre={x:face.position.x,y:face.position.y,z:face.position.z};
  root.updateMatrixWorld(true);return root;
}
