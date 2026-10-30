import * as THREE from 'three';
import {createHomeRoamAudio} from './home-roam-audio.js';

const V=()=>new THREE.Vector3(),Y=new THREE.Vector3(0,1,0),HOVER='#3b2a14';
const smooth=value=>value*value*(3-2*value);
const part=mesh=>mesh.userData.part??'';
const color=mesh=>mesh.material?.color?.getHexString()??'';
const visible=object=>{for(let node=object;node;node=node.parent)if(!node.visible)return false;return true;};
const materials=mesh=>[].concat(mesh.material??[]);

/** Temporary interaction layer for a cloned real interior. Model builders,
 * collision, navigation, wardrobe and student saves are deliberately absent. */
export function createHomeRoamInteractions({root,rooms=[],ceilingLights=[],onInvalidate=()=>{},onCeilingLightChange,muted=false,audio=null}={}) {
  if(!root?.isObject3D)throw new TypeError('A cloned interior root is required');
  const sound=audio??createHomeRoamAudio({muted}),ownsAudio=!audio;
  const targets=[],byMesh=new WeakMap(),byId=new Map(),animations=new Set(),generated=new Set(),materialOwners=new Map(),transformOwners=new Map(),reparents=[],parentOrders=new Map();
  let hovered=null,clock=0,disposed=false;
  root.updateWorldMatrix(true,true);
  root.traverse(parent=>parentOrders.set(parent,parent.children.slice()));

  function ownMaterial(mesh) {
    if(!materialOwners.has(mesh)) {
      const original=mesh.material,clones=materials(mesh).map(material=>material.clone());
      materialOwners.set(mesh,{original,clones,emission:null});mesh.material=Array.isArray(original)?clones:clones[0];
    }
    return materialOwners.get(mesh);
  }
  function refreshEmission(mesh) {
    const row=materialOwners.get(mesh);if(!row)return;
    const base=[].concat(row.original);
    row.clones.forEach((material,i)=>{
      if(!material.emissive)return;
      const original=base[i];material.emissive.copy(row.emission?.color??original.emissive??new THREE.Color());
      material.emissiveIntensity=row.emission?.intensity??original.emissiveIntensity??1;
      if(hovered?.meshes.includes(mesh)){material.emissive.add(new THREE.Color(HOVER));material.emissiveIntensity=Math.max(1,material.emissiveIntensity);}
    });
  }
  function setEmission(mesh,hex,intensity) {const row=ownMaterial(mesh);row.emission={color:new THREE.Color(hex),intensity};refreshEmission(mesh);}
  function rememberTransform(mesh) {
    if(!transformOwners.has(mesh))transformOwners.set(mesh,{position:mesh.position.clone(),quaternion:mesh.quaternion.clone(),scale:mesh.scale.clone()});
    return transformOwners.get(mesh);
  }
  function addEffect(object,parent=root) {parent.add(object);generated.add(object);return object;}
  function addWorldEffect(object,position,parent=root) {
    object.position.copy(position);root.updateWorldMatrix(true,true);root.worldToLocal(object.position);return addEffect(object,parent);
  }
  function register(type,group,meshes,behavior) {
    const sourceId=group?.userData.furnitureId??group?.userData.id??group?.userData.kind??'room';
    const target={id:behavior.id??`${sourceId}:${type}:${targets.length}`,type,kind:group?.userData.kind??'ceiling',sourceId,meshes:[...new Set(meshes)],on:false,progress:0,busy:false,...behavior};
    for(const mesh of target.meshes)byMesh.set(mesh,target);targets.push(target);byId.set(target.id,target);return target;
  }
  function tween(target,to,duration,apply) {target.tween={from:target.progress,to,elapsed:0,duration,apply};target.on=to===1;animations.add(target);}
  function moveParts(parts,worldHinge=null) {
    const mover=new THREE.Group();mover.name=worldHinge?'roam-door-hinge':'roam-drawer-slide';
    if(worldHinge)mover.position.copy(root.worldToLocal(worldHinge.clone()));
    addEffect(mover);root.updateWorldMatrix(true,true);
    for(const mesh of parts) {
      rememberTransform(mesh);reparents.push({mesh,parent:mesh.parent,index:mesh.parent.children.indexOf(mesh)});mover.attach(mesh);
    }
    return mover;
  }
  function loopSound(kind,target,on) {sound.play(kind,on,target);}

  const furniture=[];
  root.traverse(group=>{
    if(!group.isMesh&&group.userData.kind&&!furniture.some(parent=>{for(let p=group.parent;p;p=p.parent)if(p===parent)return true;return false;}))furniture.push(group);
  });
  for(const group of furniture) {
    root.updateWorldMatrix(true,true);
    const meshes=[];group.traverse(mesh=>{if(mesh.isMesh)meshes.push(mesh);});if(!meshes.length)continue;
    const boxes=new Map(meshes.map(mesh=>[mesh,new THREE.Box3().setFromObject(mesh)])),kind=group.userData.kind;
    const forward=new THREE.Vector3(0,0,1).transformDirection(group.matrixWorld);
    if(Math.abs(forward.x)>Math.abs(forward.z))forward.set(Math.sign(forward.x),0,0);else forward.set(0,0,Math.sign(forward.z));
    const axis=forward.x?'x':'z',lateral=forward.x?'z':'x',sign=forward[axis],gb=new THREE.Box3().setFromObject(group),used=new Set();
    const face=box=>sign>0?box.max[axis]:-box.min[axis],centre=box=>sign*(box.min[axis]+box.max[axis])/2;

    if(kind==='compactToilet') {
      const bowl=meshes.find(mesh=>part(mesh)==='toilet-bowl');if(!bowl)continue;
      const bb=boxes.get(bowl),size=bb.getSize(V()),centre=bb.getCenter(V()),texture=spiralTexture();
      const water=new THREE.Mesh(new THREE.CircleGeometry(Math.min(size.x,size.z)*.3,40),new THREE.MeshStandardMaterial({color:'#d7eef4',map:texture,roughness:.05,transparent:true,opacity:.9,side:THREE.DoubleSide}));
      water.rotation.x=-Math.PI/2;addWorldEffect(water,new THREE.Vector3(centre.x,bb.max.y-.085,centre.z));
      const initial={position:water.position.clone(),rotation:water.rotation.clone()},button=meshes.filter(mesh=>color(mesh)==='c7d7d5').sort((a,b)=>boxes.get(b).max.y-boxes.get(a).max.y)[0],buttonPose=button?rememberTransform(button):null;
      const target=register('toilet',group,[...meshes,water],{label:()=> "Flush",water,button,
        activate(){if(this.busy)return false;this.busy=true;this.elapsed=0;sound.play('click');sound.play('flush');animations.add(this);return true;},
        update(dt){this.elapsed=Math.min(2.8,this.elapsed+dt);const u=this.elapsed/2.8,pulse=Math.sin(Math.PI*Math.min(1,u*1.6));
          water.rotation.z=initial.rotation.z-u*Math.PI*5;water.position.y=initial.position.y-.045*pulse;water.scale.setScalar(1-.35*pulse);
          if(button)button.position.y=buttonPose.position.y-(u<.15?.012:0);
          if(u>=1){this.busy=false;water.position.copy(initial.position);water.rotation.copy(initial.rotation);water.scale.setScalar(1);if(button)button.position.copy(buttonPose.position);return false;}return true;},
      });
      target.texture=texture;continue;
    }
    if(kind==='hhTripodLamp') {
      const shade=meshes.find(mesh=>mesh.userData.objectPart==='lamp-shade')??meshes.reduce((a,b)=>boxes.get(a).getCenter(V()).y>boxes.get(b).getCenter(V()).y?a:b),position=boxes.get(shade).getCenter(V());position.y-=.06;
      const light=addWorldEffect(new THREE.PointLight('#ffd49a',0,6,2),position);
      register('floor-lamp',group,meshes,{light,shade,label(){return this.on?"Turn off floor lamp":"Turn on floor lamp";},activate(){this.on=!this.on;light.intensity=this.on?7:0;setEmission(shade,this.on?'#ffc477':'#000000',this.on?.8:0);sound.play('click');return true;}});continue;
    }

    const taps=meshes.filter(mesh=>part(mesh)==='sink-faucet'||(kind==='mkSingleSink'&&part(mesh)==='body'&&boxes.get(mesh).min.y>1.05)||(kind==='bathroomVanity'&&color(mesh)==='c7d7d5'&&boxes.get(mesh).max.y>1));
    if(taps.length) {
      const main=taps.reduce((a,b)=>boxes.get(a).getSize(V()).y>boxes.get(b).getSize(V()).y?a:b),tb=boxes.get(main);
      const basin=meshes.find(mesh=>part(mesh)==='sink-basin-bottom')??meshes.filter(mesh=>color(mesh)==='fff2dc'&&boxes.get(mesh).getSize(V()).y>.1).sort((a,b)=>boxes.get(b).max.y-boxes.get(a).max.y)[0];
      const bb=basin?boxes.get(basin):tb,bc=bb.getCenter(V()),bottom=basin&&part(basin)==='sink-basin-bottom'?bb.max.y:bb.min.y+.035;
      const tip=new THREE.Vector3(THREE.MathUtils.clamp(bc.x,tb.min.x,tb.max.x),tb.max.y-.07,THREE.MathUtils.clamp(bc.z,tb.min.z,tb.max.z));
      tip.x+=Math.sign(bc.x-tip.x)*.015;tip.z+=Math.sign(bc.z-tip.z)*.015;
      const height=Math.max(.02,tip.y-bottom),stream=new THREE.Mesh(new THREE.CylinderGeometry(.009,.013,height,12,1,true),new THREE.MeshStandardMaterial({color:'#cdeaf6',emissive:'#8fcde6',emissiveIntensity:.25,roughness:.05,transparent:true,opacity:.72,side:THREE.DoubleSide}));
      stream.visible=false;addWorldEffect(stream,new THREE.Vector3(tip.x,bottom+height/2,tip.z));
      const ripple=new THREE.Mesh(new THREE.RingGeometry(.02,.05,24),new THREE.MeshStandardMaterial({color:'#e6f6fb',transparent:true,opacity:.6,roughness:.1,side:THREE.DoubleSide}));
      ripple.rotation.x=-Math.PI/2;ripple.visible=false;addWorldEffect(ripple,new THREE.Vector3(tip.x,bottom+.004,tip.z));
      register('faucet',group,[...taps,stream,ripple],{stream,ripple,label(){return this.on?"Turn off tap":"Turn on tap";},activate(){this.on=!this.on;stream.visible=ripple.visible=this.on;loopSound('water',this,this.on);sound.play('click');if(this.on)animations.add(this);else animations.delete(this);return true;},update(){stream.scale.x=stream.scale.z=1+.12*Math.sin(clock*47);const t=clock*1.6%1;ripple.scale.setScalar(.6+t*1.4);ripple.material.opacity=.6*(1-t);return this.on;}});
      for(const tap of taps)used.add(tap);
    }

    const rings=meshes.filter(mesh=>part(mesh)==='burner-ring');
    for(const knob of meshes.filter(mesh=>part(mesh)==='control-knob')) {
      const kc=boxes.get(knob).getCenter(V()),ring=rings.sort((a,b)=>Math.abs(boxes.get(a).getCenter(V())[lateral]-kc[lateral])-Math.abs(boxes.get(b).getCenter(V())[lateral]-kc[lateral]))[0];if(!ring)continue;
      rings.splice(rings.indexOf(ring),1);const rb=boxes.get(ring),rc=rb.getCenter(V()),flame=new THREE.Group(),flameMaterial=new THREE.MeshStandardMaterial({color:'#7fb6ff',emissive:'#3d7dff',emissiveIntensity:2.2,transparent:true,opacity:.85});
      for(let i=0;i<14;i++){const angle=i/14*Math.PI*2,mesh=new THREE.Mesh(new THREE.ConeGeometry(.009,.045,6),flameMaterial);mesh.position.set(Math.cos(angle)*.085,.02,Math.sin(angle)*.085);flame.add(mesh);}
      flame.visible=false;addWorldEffect(flame,new THREE.Vector3(rc.x,rb.max.y,rc.z));
      const light=addWorldEffect(new THREE.PointLight('#6f9dff',0,1.2,2),new THREE.Vector3(rc.x,rb.max.y+.08,rc.z)),pose=rememberTransform(knob),rotationAxis=forward.clone().applyQuaternion(knob.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
      const target=register('hob',group,[knob,ring,...flame.children],{flame,light,knob,ring,label(){return this.on?"Turn off hob":"Light hob";},activate(){this.on=!this.on;flame.visible=this.on;light.intensity=this.on?.2:0;knob.quaternion.copy(pose.quaternion).premultiply(new THREE.Quaternion().setFromAxisAngle(rotationAxis,this.on?.9:0));loopSound('gas',this,this.on);sound.play('click');if(this.on)animations.add(this);else animations.delete(this);return true;},update(){for(const[i,mesh]of flame.children.entries())mesh.scale.y=.8+.35*Math.abs(Math.sin(clock*13+i*1.7));return this.on;}});
      byMesh.set(flame,target);used.add(knob);
    }

    // Recognition deliberately uses geometry and handle metadata, not a list
    // of catalog furniture IDs. Existing/new drawers share these rules.
    const handles=meshes.filter(mesh=>{const size=boxes.get(mesh).getSize(V());return !used.has(mesh)&&mesh.userData.paintable===false&&part(mesh)!=='control-knob'&&Math.max(size.x,size.y,size.z)<.4&&face(boxes.get(mesh))>face(gb)-.09;});
    for(const handle of handles) {
      if(used.has(handle))continue;
      const hb=boxes.get(handle),hc=hb.getCenter(V()),inside=(box,point,tolerance=.01)=>point[lateral]>box.min[lateral]-tolerance&&point[lateral]<box.max[lateral]+tolerance&&point.y>box.min.y-tolerance&&point.y<box.max.y+tolerance;
      const volume=box=>{const size=box.getSize(V());return size.x*size.y*size.z;},priority=mesh=>/^(drawer-front|cabinet-door)$/.test(part(mesh))?0:1;
      const panels=meshes.filter(mesh=>mesh!==handle&&!used.has(mesh)&&mesh.userData.paintable!==false&&!mesh.userData.supportTop&&inside(boxes.get(mesh),hc)&&face(boxes.get(mesh))<=face(hb)+.01&&face(boxes.get(mesh))>=face(hb)-.12&&boxes.get(mesh).getSize(V())[lateral]>.2);
      const panel=panels.sort((a,b)=>priority(a)-priority(b)||volume(boxes.get(a))-volume(boxes.get(b)))[0];if(!panel)continue;
      const pb=boxes.get(panel),size=pb.getSize(V()),door=part(panel)==='cabinet-door'||size.y>.45;
      const moving=[panel,...meshes.filter(mesh=>mesh!==panel&&!used.has(mesh)&&(mesh===handle||(inside(pb,boxes.get(mesh).getCenter(V()),.005)&&centre(boxes.get(mesh))>=centre(pb)-.005&&boxes.get(mesh).getSize(V())[lateral]<size[lateral]+.01&&!mesh.userData.supportTop&&part(mesh)!=='control-knob'&&face(boxes.get(mesh))<=face(pb)+.05)))];
      for(const mesh of moving)used.add(mesh);
      if(door) {
        const outer=(pb.min[lateral]+pb.max[lateral])/2<(gb.min[lateral]+gb.max[lateral])/2?pb.min[lateral]:pb.max[lateral],inner=outer===pb.min[lateral]?pb.max[lateral]:pb.min[lateral],hinge=V();hinge[lateral]=outer;hinge[axis]=sign>0?pb.max[axis]:pb.min[axis];
        const mover=moveParts(moving,hinge),base=mover.quaternion.clone(),along=V();along[lateral]=inner-outer;
        const direction=along.clone().applyAxisAngle(Y,1).dot(forward)>0?1:-1;
        register('cabinet-door',group,moving,{mover,hinge:hinge.clone(),panel,label(){return this.on?"Close cabinet door":"Open cabinet door";},activate(){tween(this,this.on?0:1,.65,u=>mover.quaternion.copy(base).multiply(new THREE.Quaternion().setFromAxisAngle(Y,direction*1.75*u)));sound.play('slide');return true;}});
      } else {
        const mover=moveParts(moving),origin=mover.position.clone(),distance=Math.min(.32,gb.getSize(V())[axis]*.6),delta=forward.clone().applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()).invert()).multiplyScalar(distance),drawerBox=[];
        if(size[axis]<.1) {
          const width=Math.max(.02,size[lateral]-.05),height=Math.max(.02,size.y-.05),depth=Math.max(.025,Math.min(.34,gb.getSize(V())[axis]-.12)),back=sign>0?pb.min[axis]:pb.max[axis],bottom=pb.min.y+.025,wood=new THREE.MeshStandardMaterial({color:'#e7d2ae',roughness:.8});
          const slab=(width,height,depth,side,y,inset)=>{const dimensions=V();dimensions[lateral]=width;dimensions.y=height;dimensions[axis]=depth;const mesh=new THREE.Mesh(new THREE.BoxGeometry(dimensions.x,dimensions.y,dimensions.z),wood),position=V();position[lateral]=(pb.min[lateral]+pb.max[lateral])/2+side;position.y=y;position[axis]=back-sign*inset;addWorldEffect(mesh,position);mover.attach(mesh);mesh.castShadow=mesh.receiveShadow=true;drawerBox.push(mesh);};
          slab(width,.012,depth,0,bottom+.006,depth/2);slab(.012,height,depth,-(width-.012)/2,bottom+height/2,depth/2);slab(.012,height,depth,(width-.012)/2,bottom+height/2,depth/2);slab(width,height,.012,0,bottom+height/2,depth-.006);
        }
        register('drawer',group,[...moving,...drawerBox],{mover,panel,drawerBox,distance,label(){return this.on?"Close drawer":"Open drawer";},activate(){tween(this,this.on?0:1,.45,u=>mover.position.copy(origin).addScaledVector(delta,u));sound.play('slide');return true;}});
      }
    }
  }

  for(const descriptor of ceilingLights) {
    if(!descriptor.disc?.isMesh)continue;const initialOn=descriptor.on!==false,disc=descriptor.disc,initialIntensity=descriptor.light?.intensity??24;
    descriptor.on=descriptor.enabled=initialOn;
    register('ceiling-light',null,[disc],{id:descriptor.id??`ceiling:${descriptor.roomId??targets.length}`,roomId:descriptor.roomId,on:initialOn,descriptor,label(){return this.on?"Turn off light":"Turn on light";},activate(){this.on=!this.on;descriptor.on=descriptor.enabled=this.on;ownMaterial(disc);
      if(descriptor.setEnabled)descriptor.setEnabled(this.on);else if(descriptor.light)descriptor.light.intensity=this.on?initialIntensity:0;
      const owned=materialOwners.get(disc),base=[].concat(owned?.original??disc.material)[0];setEmission(disc,this.on?(base.emissive??new THREE.Color('#ffe1b8')):'#000000',this.on?(base.emissiveIntensity??1):0);
      sound.play('click');onCeilingLightChange?.(descriptor,this.on);return true;}});
  }

  function pick(raycaster) {
    if(disposed||!raycaster?.intersectObjects)return null;
    root.updateWorldMatrix(true,true);
    const roots=[root,...ceilingLights.map(row=>row.disc).filter(Boolean)];for(const disc of roots.slice(1))disc.updateWorldMatrix(true,true);
    const hit=raycaster.intersectObjects(roots,true).find(hit=>visible(hit.object)&&materials(hit.object).some(material=>material.visible!==false&&(!material.transparent||material.opacity>0)));
    if(!hit||hit.distance>6)return null;
    for(let mesh=hit.object;mesh;mesh=mesh.parent){const target=byMesh.get(mesh);if(target)return{target,point:hit.point,distance:hit.distance,object:hit.object,label:target.label()};}
    return null;
  }
  function setHover(target) {
    if(hovered===target)return;
    const before=hovered;hovered=target;
    for(const mesh of before?.meshes??[])refreshEmission(mesh);
    for(const mesh of target?.meshes??[]){ownMaterial(mesh);refreshEmission(mesh);}onInvalidate();
  }
  function hover(raycaster) {const hit=pick(raycaster);setHover(hit?.target??null);return hit;}
  function clearHover(){setHover(null);}
  function activate(value) {
    const target=typeof value==='string'?byId.get(value):value;if(disposed||!target||!byId.has(target.id)||target.busy)return false;
    sound.unlock();const changed=target.activate();if(changed!==false){for(const mesh of target.meshes)refreshEmission(mesh);onInvalidate();return true;}return false;
  }
  function tick(delta) {
    if(disposed)return false;const dt=Number.isFinite(delta)?Math.max(0,Math.min(.1,delta)):0;clock+=dt;const hadAnimation=animations.size>0;
    for(const target of[...animations]) {
      if(target.tween) {
        const tween=target.tween;tween.elapsed=Math.min(tween.duration,tween.elapsed+dt);target.progress=tween.from+(tween.to-tween.from)*smooth(tween.elapsed/tween.duration);tween.apply(target.progress);
        if(tween.elapsed>=tween.duration){target.tween=null;animations.delete(target);}
      }else if(!target.update(dt))animations.delete(target);
    }
    return hadAnimation;
  }
  function dispose() {
    if(disposed)return;clearHover();disposed=true;animations.clear();
    for(const target of targets)if(target.on&&(target.type==='faucet'||target.type==='hob'))loopSound(target.type==='faucet'?'water':'gas',target,false);
    // Reattach originals before releasing temporary pivots and drawer boxes.
    for(const{mesh,parent}of reparents)parent.add(mesh);
    for(const[mesh,pose]of transformOwners){mesh.position.copy(pose.position);mesh.quaternion.copy(pose.quaternion);mesh.scale.copy(pose.scale);}
    for(const[mesh,row]of materialOwners){mesh.material=row.original;for(const material of row.clones)material.dispose();}materialOwners.clear();
    const geometries=new Set(),ownedMaterials=new Set(),textures=new Set();
    for(const object of generated){object.removeFromParent();object.traverse(mesh=>{if(mesh.geometry)geometries.add(mesh.geometry);for(const material of materials(mesh))ownedMaterials.add(material);});}
    for(const target of targets)if(target.texture)textures.add(target.texture);
    for(const geometry of geometries)geometry.dispose();for(const material of ownedMaterials)material.dispose();for(const texture of textures)texture.dispose();
    for(const parent of new Set(reparents.map(row=>row.parent))) {
      const original=parentOrders.get(parent)??[],set=new Set(original),children=[...original.filter(child=>child.parent===parent),...parent.children.filter(child=>!set.has(child))];
      parent.children.splice(0,parent.children.length,...children);
    }
    generated.clear();if(ownsAudio)sound.dispose();
  }
  return {targets,getTargets:()=>targets.slice(),pick,hover,clearHover,click:ray=>{const hit=pick(ray);return hit?activate(hit.target):false;},activate,tick,
    unlockAudio:()=>sound.unlock(),setMuted:value=>sound.setMuted(value),getMuted:()=>sound.getMuted?.()??false,
    getState:()=>({disposed,hovered:hovered?.id??null,activeAnimations:animations.size,counts:targets.reduce((counts,target)=>(counts[target.type]=(counts[target.type]??0)+1,counts),{}),targets:targets.map(target=>({id:target.id,type:target.type,kind:target.kind,on:target.on,progress:target.progress,busy:target.busy,roomId:target.roomId}))}),dispose};
}

function spiralTexture() {
  const size=128,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const dx=x-size/2,dy=y-size/2,r=Math.hypot(dx,dy),angle=Math.atan2(dy,dx),line=Math.abs(Math.sin(angle*3-r*.15))<.10&&r<size*.47,index=(y*size+x)*4;
    data[index]=line?165:255;data[index+1]=line?201:255;data[index+2]=line?215:255;data[index+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;return texture;
}
