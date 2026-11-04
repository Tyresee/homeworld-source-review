import * as THREE from 'three';

/** Exterior orbit camera only. No room, first-person or transport state exists. */
export const HOME_SHARE_CAMERA = Object.freeze({
  yaw: -.78, orbitFov: 42, orbitDragX: .006, orbitDragY: .005, wheel: .0012,
});
const clamp = THREE.MathUtils.clamp;
export const shareEase = value => {const t = clamp(value, 0, 1);return t < .5 ? 4*t*t*t : 1-Math.pow(-2*t+2, 3)/2;};
const vec = value => value?.isVector3 ? value.clone() : new THREE.Vector3(value?.x??0, value?.y??0, value?.z??0);
const direction = (yaw,pitch) => new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
const isEditing = target => target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName??'');

/**
 * All times are seconds. tick(dt) is deliberately caller-driven: a viewer owns
 * its RAF and may stop it with page visibility without losing camera state.
 * Model coordinates and save records are only read, never modified.
 */
export function createHomeShareController({element,eventTarget=globalThis.window,model,bounds=model?.bounds,houseBounds=model?.houseBounds,
  floors=model?.floors??[],spots=model?.spots??[],storeyHeight=model?.storeyHeight??3,
  reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches??false,
  onChange=()=>{},onStateChange=()=>{},onLayout=()=>{},onTap=()=>{}}={}) {
  if(!element || !bounds?.isBox3 || bounds.isEmpty() || !houseBounds?.isBox3 || houseBounds.isEmpty() || !floors.length)throw new TypeError('A share camera requires a surface and real land, house and floor geometry.');
  const height=Number.isFinite(storeyHeight)&&storeyHeight>0?storeyHeight:3;
  const camera=new THREE.PerspectiveCamera(HOME_SHARE_CAMERA.orbitFov,1,.03,1000);
  const landCenter=bounds.getCenter(new THREE.Vector3()),houseCenter=houseBounds.getCenter(new THREE.Vector3());
  const floorMap=new Map(floors.map((floor,index)=>[floor.index??index,floor]));
  const spotMap=new Map(spots.map(spot=>[spot.id,spot]));
  const orbit={target:landCenter.clone().setY(1.5),yaw:HOME_SHARE_CAMERA.yaw,pitch:.55,dist:58,lim:{pmin:.15,pmax:1.25,dmin:20,dmax:95}};
  const look=new THREE.Vector3(),listeners=[],points=new Map();
  let active=false,disposed=false,control=null,transition=null,drag=null,pinch=null;
  let framingBox=null;
  let state={name:'ORBIT',floor:null,roomId:null,spotId:null,layoutName:'ORBIT'},lastSignature='';
  const previousTouchAction=element.style?.touchAction;
  if(element.style)element.style.touchAction='none';

  function baseY(index){return floorMap.get(index)?.baseY??index*height;}
  function roomAt(index,id){return floorMap.get(index)?.rooms?.find(room=>room.id===id);}
  function orbitPose(){return {pos:orbit.target.clone().addScaledVector(direction(orbit.yaw,orbit.pitch),orbit.dist),look:orbit.target.clone(),fov:42};}
  function locked(){return !active || disposed || !!transition;}
  function snapshot(){return {...state,active,locked:locked(),controller:control,
    orbit:{target:{x:orbit.target.x,y:orbit.target.y,z:orbit.target.z},yaw:orbit.yaw,pitch:orbit.pitch,dist:orbit.dist,lim:{...orbit.lim}}};}
  function publish(layout=false){
    const value=snapshot(),signature=JSON.stringify([value.name,value.floor,value.roomId,value.spotId,value.layoutName,value.active,value.locked,value.controller]);
    if(signature!==lastSignature){lastSignature=signature;onStateChange(value);}
    if(layout)onLayout(value);
    onChange();
  }
  function clearPointers(){
    for(const id of points.keys()){try{element.releasePointerCapture?.(id);}catch{/* A canceled pointer may already have lost capture. */}}
    points.clear();drag=null;pinch=null;
  }
  function setCamera(pose){camera.position.copy(pose.pos);look.copy(pose.look);camera.fov=pose.fov;camera.lookAt(look);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);}
  function camTo(pose,duration,done){
    clearPointers();control=null;
    transition={from:{pos:camera.position.clone(),look:look.clone(),fov:camera.fov},to:pose,time:0,duration:reducedMotion?.01:Math.max(.01,duration),done};
  }
  function setState(name,values={}){state={name,floor:null,roomId:null,spotId:null,layoutName:name,...values};publish(true);}
  function finishOrbit(){control='orbit';publish(true);}

  // Preserve the approved baseline distances but widen them when a purchased
  // estate or a portrait viewport would clip actual geometry. This is camera
  // framing only; no layout or ownership data is normalized or rewritten.
  function fitDistance(box,target,pitch=orbit.pitch,yaw=orbit.yaw){
    const outward=direction(yaw,pitch),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
    const up=new THREE.Vector3().crossVectors(outward,right).normalize(),tanV=Math.tan(THREE.MathUtils.degToRad(42)/2),tanH=tanV*camera.aspect;
    let distance=0;
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
      const rel=new THREE.Vector3(x,y,z).sub(target),depth=rel.dot(outward);
      distance=Math.max(distance,depth+Math.abs(rel.dot(right))/tanH,depth+Math.abs(rel.dot(up))/tanV);
    }
    return distance*1.08;
  }
  function orbitConfig(target,pitch,initial,limits,box){
    orbit.target.copy(target);orbit.pitch=pitch;framingBox=box?.clone()??null;
    const fitted=box?Math.max(initial,fitDistance(box,target,pitch)):initial;
    orbit.dist=fitted;orbit.lim={...limits,dmax:Math.max(limits.dmax,fitted*1.15)};
  }
  function goOrbit(){
    if(locked())return false;
    orbitConfig(landCenter.clone().setY(1.5),.55,58,{pmin:.15,pmax:1.25,dmin:20,dmax:95},bounds);
    camTo(orbitPose(),1,finishOrbit);setState('ORBIT');return true;
  }
  function goSpot(id){
    if(locked())return false;
    const spot=spotMap.get(typeof id==='object'?id.id:id);if(!spot)return false;if(spot.house)return goExploded();
    const distance=Number.isFinite(spot.dist)&&spot.dist>0?spot.dist:21;
    orbitConfig(vec(spot.center).setY(.5),.6,distance,{pmin:.15,pmax:1.25,dmin:distance*.45,dmax:distance*1.8},spot.bounds);
    camTo(orbitPose(),1,finishOrbit);setState('SPOT',{spotId:spot.id});return true;
  }
  function goExploded(){
    if(locked())return false;
    const top=Math.max(...floorMap.keys()),box=houseBounds.clone();box.max.y+=top*height*1.2+2.6;
    const target=houseCenter.clone().setY((box.min.y+box.max.y)/2);
    orbitConfig(target,.36,42,{pmin:.05,pmax:1.1,dmin:20,dmax:60},box);
    camTo(orbitPose(),1,finishOrbit);setState('EXPLODED');return true;
  }
  function goFocus(index){
    if(locked() || !floorMap.has(index))return false;
    const target=houseCenter.clone().setY(baseY(index)+1),row=floorMap.get(index);
    const box=houseBounds.clone();box.min.y=baseY(index);box.max.y=baseY(index)+height;
    if(row.bounds?.isBox3){box.min.x=row.bounds.min.x;box.max.x=row.bounds.max.x;box.min.z=row.bounds.min.z;box.max.z=row.bounds.max.z;}
    orbitConfig(target,.9,21,{pmin:.35,pmax:1.35,dmin:9,dmax:34},box);
    camTo(orbitPose(),1,finishOrbit);setState('FOCUS',{floor:index});return true;
  }
  // Retain a safe compatibility entry for callers of earlier viewers. A room
  // selection can only keep or focus its exterior floor, never enter it.
  function goRoom(index,id){
    if(locked()||!roomAt(index,id))return false;
    if(state.name==='FOCUS'&&state.floor===index)return true;
    return goFocus(index);
  }
  // Transport is scenery in a share. These legacy calls cannot move either
  // the camera or the cabin, including when invoked directly by a caller.
  const goElevator=()=>false,ride=()=>false,leaveElevator=()=>false;
  function back(){
    if(locked())return false;
    if(state.name==='SPOT'||state.name==='EXPLODED')return goOrbit();
    if(state.name==='FOCUS')return goExploded();
    return false;
  }
  function start(){
    if(disposed||active)return false;
    active=true;orbit.yaw=HOME_SHARE_CAMERA.yaw;
    orbitConfig(landCenter.clone().setY(1.5),.55,58,{pmin:.15,pmax:1.25,dmin:20,dmax:95},bounds);
    const destination=orbitPose(),saved={yaw:orbit.yaw,pitch:orbit.pitch,dist:orbit.dist};
    orbit.yaw-=1.4;orbit.pitch=1.05;orbit.dist=Math.max(100,saved.dist*100/58);setCamera(orbitPose());Object.assign(orbit,saved);
    camTo(destination,2.2,finishOrbit);setState('ORBIT');return true;
  }
  function tick(delta){
    if(!active||disposed)return false;
    const dt=clamp(Number.isFinite(delta)?delta:0,0,.05);let changed=false;
    if(transition){
      const animation=transition;animation.time+=dt;const t=shareEase(animation.time/animation.duration);
      camera.position.lerpVectors(animation.from.pos,animation.to.pos,t);look.lerpVectors(animation.from.look,animation.to.look,t);camera.fov=THREE.MathUtils.lerp(animation.from.fov,animation.to.fov,t);
      if(animation.time>=animation.duration){transition=null;animation.done?.();}
      camera.lookAt(look);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);changed=true;
    }else if(control){
      const pose=orbitPose();
      if(camera.position.distanceToSquared(pose.pos)>1e-14 || look.distanceToSquared(pose.look)>1e-14 || Math.abs(camera.fov-pose.fov)>1e-10){setCamera(pose);changed=true;}
    }
    if(changed)onChange();return changed;
  }
  function lookBy(dx,dy){
    if(locked()||!Number.isFinite(dx)||!Number.isFinite(dy))return false;
    if(control==='orbit'){orbit.yaw-=dx*.006;orbit.pitch=clamp(orbit.pitch+dy*.005,orbit.lim.pmin,orbit.lim.pmax);}
    else return false;
    setCamera(orbitPose());onChange();return true;
  }
  function zoomBy(factor){
    if(locked()||!Number.isFinite(factor)||factor<=0)return false;
    if(control==='orbit')orbit.dist=clamp(orbit.dist*factor,orbit.lim.dmin,orbit.lim.dmax);
    else return false;
    setCamera(orbitPose());onChange();return true;
  }
  function add(target,type,fn,options){target?.addEventListener?.(type,fn,options);listeners.push(()=>target?.removeEventListener?.(type,fn,options));}
  function pointerDown(event){
    if(locked() || (event.button!==undefined&&event.button!==0))return;
    points.set(event.pointerId,{x:event.clientX,y:event.clientY});try{element.setPointerCapture?.(event.pointerId);}catch{/* Synthetic input may not own a native pointer. */}
    if(points.size===1)drag={moved:0,multi:false};
    else{if(drag)drag.multi=true;pinch=points.size===2?pointerDistance():null;}
  }
  function pointerDistance(){const[a,b]=[...points.values()];return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;}
  function pointerMove(event){
    if(locked())return;const point=points.get(event.pointerId);if(!point)return;
    const dx=event.clientX-point.x,dy=event.clientY-point.y;point.x=event.clientX;point.y=event.clientY;
    if(points.size>=2){
      if(drag)drag.multi=true;
      if(points.size===2){const distance=pointerDistance();if(pinch>0&&distance>0)zoomBy(pinch/distance);pinch=distance;}
      return;
    }
    if(drag){drag.moved+=Math.abs(dx)+Math.abs(dy);if(drag.moved>4)lookBy(dx,dy);}
  }
  function pointerUp(event){
    const had=points.has(event.pointerId),tap=had&&points.size===1&&drag&&!drag.multi&&drag.moved<6&&!locked();
    points.delete(event.pointerId);try{element.releasePointerCapture?.(event.pointerId);}catch{/* Pointer capture may have already ended. */}
    pinch=points.size===2?pointerDistance():null;
    if(points.size===0)drag=null;else if(drag)drag.multi=true;
    if(tap)onTap(event);
  }
  function pointerCancel(event){points.delete(event.pointerId);pinch=null;if(drag)drag.multi=true;if(!points.size)drag=null;try{element.releasePointerCapture?.(event.pointerId);}catch{/* Capture may already be lost. */}}
  add(element,'pointerdown',pointerDown);add(element,'pointermove',pointerMove);add(element,'pointerup',pointerUp);add(element,'pointercancel',pointerCancel);add(element,'lostpointercapture',pointerCancel);
  add(element,'wheel',event=>{event.preventDefault();if(!locked())zoomBy(Math.exp(clamp(event.deltaY,-10000,10000)*.0012));},{passive:false});
  add(element,'contextmenu',event=>event.preventDefault());
  add(eventTarget,'keydown',event=>{if(event.key==='Escape'&&!isEditing(event.target)&&!locked()){if(back())event.preventDefault();}});
  add(eventTarget,'blur',clearPointers);
  return {camera,start,tick,getState:snapshot,goOrbit,goSpot,goExploded,goFocus,goRoom,goElevator,ride,leaveElevator,back,
    look:lookBy,zoom:zoomBy,getCameraPose:()=>({position:camera.position.toArray(),look:look.toArray(),fov:camera.fov}),
    resize(width,height){
      if(disposed||!(width>0&&height>0))return false;camera.aspect=width/height;
      if(active&&framingBox&&['ORBIT','SPOT','EXPLODED','FOCUS'].includes(state.name)){
        const required=fitDistance(framingBox,orbit.target);
        if(required>orbit.dist){orbit.dist=required;orbit.lim.dmax=Math.max(orbit.lim.dmax,required*1.15);if(transition)transition.to=orbitPose();else setCamera(orbitPose());}
      }
      camera.updateProjectionMatrix();onChange();return true;
    },
    get orbit(){return snapshot().orbit;},
    dispose(){if(disposed)return;clearPointers();disposed=true;active=false;transition=null;control=null;for(const remove of listeners)remove();if(element.style)element.style.touchAction=previousTouchAction??'';},
  };
}
