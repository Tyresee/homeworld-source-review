import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

// A temporary viewing camera. It never writes to the editor camera, home, or
// walkability data; the caller owns scene visibility, picking and rendering.
export const HOME_ROAM_CAMERA = Object.freeze({fov:38, freeFov:68, eye:1.45, minHeight:.25, maxHeight:30, minDistance:1.6, maxDistance:45});
const UP = new THREE.Vector3(0,1,0);
const MOVEMENT_CODES = new Set(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight']);
const clamp = THREE.MathUtils.clamp;
const smooth = t => {const u=clamp(t,0,1);return u*u*(3-2*u);};
const vector = (value,fallback=new THREE.Vector3()) => {
  if(Array.isArray(value))return new THREE.Vector3(...value);
  return value&&[value.x,value.y,value.z].every(Number.isFinite)?new THREE.Vector3(value.x,value.y,value.z):fallback.clone();
};
export function isHomeRoamInputTarget(target){
  return !!(target?.isContentEditable||/^(INPUT|TEXTAREA|SELECT|OPTION)$/.test(String(target?.tagName).toUpperCase())||target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="dialog"],[role="menu"]'));
}

export function createHomeRoamController({element,eventTarget=globalThis.window,bounds,interiorBounds,containsInterior,wallTop=2.85,entrance,onChange=()=>{},onMode=()=>{},onDoorAngle=()=>{},onExit=()=>{},now=()=>performance.now(),controlsFactory=(camera,canvas)=>new OrbitControls(camera,canvas)}={}){
  if(!element)throw new TypeError('A canvas is required for the viewing camera.');
  const camera=new THREE.PerspectiveCamera(HOME_ROAM_CAMERA.fov,1,.05,400);
  const controls=controlsFactory(camera,element);
  Object.assign(controls,{enabled:false,enableDamping:true,dampingFactor:.08,zoomToCursor:true,screenSpacePanning:false,minDistance:1.6,maxDistance:45,maxPolarAngle:THREE.MathUtils.degToRad(86),rotateSpeed:.7,autoRotateSpeed:.6,autoRotate:false});
  controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};
  const listeners=[],keys=new Set();
  let active=false,disposed=false,phase='inactive',displayMode='auto',shown='exterior',sceneMode='ext',dirty=false,lastTime=null,lastSignature='',drag=null,lastPointer=null,glide=null,flight=null,steps=[],stepStart=0,doorAngle=0,yaw=0,pitch=0;
  let houseBounds=new THREE.Box3(),insideBounds=new THREE.Box3(),center=new THREE.Vector3(),span=8,door=null;
  const add=(target,type,listener,options)=>{target?.addEventListener?.(type,listener,options);listeners.push(()=>target?.removeEventListener?.(type,listener,options));};
  const invalidate=()=>{if(!active||disposed)return;dirty=true;onChange();};
  const state=()=>({active,phase,walking:phase==='free',transition:active&&!['orbit','free'].includes(phase),view:shown,sceneMode,displayMode,autoRotate:!!controls.autoRotate,doorAngle});
  function publish(force=false){const snapshot=state(),signature=JSON.stringify(snapshot);if(force||signature!==lastSignature){lastSignature=signature;onMode(snapshot);}}
  function setDoorAngle(value){doorAngle=value;onDoorAngle(value);}
  function setFov(value){if(Math.abs(camera.fov-value)<1e-10)return;camera.fov=value;camera.updateProjectionMatrix();}
  function setSceneMode(value){sceneMode=value;shown=value==='ext'||value==='ext+in'?'exterior':'interior';publish();}
  function configure(options={}){
    const value=options.bounds??bounds;
    const min=vector(value?.min,new THREE.Vector3(-4,0,-4)),max=vector(value?.max,new THREE.Vector3(4,2.85,4));
    if(min.x>=max.x||min.z>=max.z||min.y>max.y)throw new TypeError('Viewing bounds must have a positive footprint.');
    houseBounds.set(min,max);houseBounds.getCenter(center);span=Math.max(...houseBounds.getSize(new THREE.Vector3()).toArray(),1);
    const indoor=options.interiorBounds??interiorBounds;
    insideBounds.set(indoor?vector(indoor.min):min.clone(),indoor?vector(indoor.max):new THREE.Vector3(max.x,(options.wallTop??wallTop)+min.y,max.z));
    const valueDoor=options.entrance??entrance;
    if(valueDoor){
      const at=vector(valueDoor.center??valueDoor.position??valueDoor,new THREE.Vector3(center.x,min.y,max.z));
      const outward=vector(valueDoor.outward??valueDoor.normal,new THREE.Vector3(0,0,1));outward.y=0;
      if(outward.lengthSq()<1e-8)throw new TypeError('The doorway needs a horizontal outward direction.');
      outward.normalize();const ground=Number.isFinite(valueDoor.thresholdY)?valueDoor.thresholdY:at.y;
      door={center:at,outward,ground};
    }else door=null;
  }
  function isInside(){return camera.position.x>=insideBounds.min.x&&camera.position.x<=insideBounds.max.x&&camera.position.z>=insideBounds.min.z&&camera.position.z<=insideBounds.max.z&&camera.position.y>=insideBounds.min.y&&camera.position.y<insideBounds.max.y&&(!containsInterior||containsInterior(camera.position));}
  function updateDisplay(){
    if(phase==='orbit'){
      const view=displayMode==='auto'?(camera.position.distanceTo(controls.target)>1.55*span?'exterior':'interior'):displayMode;
      setSceneMode(view==='exterior'?'ext':'orbit-in');
    }else if(phase==='free'||phase==='entering'||phase==='leaving')setSceneMode(isInside()?'in':'ext+in');
  }
  function lookFromCamera(){const direction=camera.getWorldDirection(new THREE.Vector3());yaw=Math.atan2(-direction.x,-direction.z);pitch=Math.asin(clamp(direction.y,-1,1));}
  function applyLook(){pitch=clamp(pitch,-1.45,1.45);camera.rotation.set(pitch,yaw,0,'YXZ');}
  function releaseDrag(){if(drag){try{element.releasePointerCapture?.(drag.id);}catch{/* A canceled pointer may already be released. */}}drag=null;}
  function clearInput(){keys.clear();releaseDrag();}
  function overview(animate=true){
    if(!active||phase!=='orbit')return false;
    glide=null;clearInput();
    const to=center.clone().add(new THREE.Vector3(.95,1.05,1.25).multiplyScalar(span));
    if(!animate){camera.position.copy(to);controls.target.copy(center);setFov(38);controls.update(0);updateDisplay();invalidate();return true;}
    flight={from:camera.position.clone(),to,fromTarget:controls.target.clone(),toTarget:center.clone(),fromFov:camera.fov,start:now(),duration:700};
    controls.enabled=false;invalidate();return true;
  }
  function beginSequence(sequence,finish){
    clearInput();glide=null;flight=null;controls.enabled=false;controls.autoRotate=false;
    steps=sequence;steps.onComplete=finish;stepStart=now();phase=steps[0].name;steps[0].begin?.();publish();invalidate();
  }
  function doorPoints(){
    const eye=door.ground+1.45,look=door.center.clone().setY(door.ground+1.2);
    return {outside:door.center.clone().addScaledVector(door.outward,2.8).setY(eye),inside:door.center.clone().addScaledVector(door.outward,-2).setY(eye),look,far:door.center.clone().addScaledVector(door.outward,-8).setY(eye-.1)};
  }
  function enterDoor(){
    if(!active||phase!=='orbit'||shown!=='exterior'||!door)return false;
    const points=doorPoints(),from=camera.position.clone(),target=controls.target.clone(),fov=camera.fov,temp=new THREE.Vector3();
    beginSequence([
      {name:'approaching',duration:1500,begin:()=>setSceneMode('ext'),apply:e=>{camera.position.lerpVectors(from,points.outside,e);camera.lookAt(temp.lerpVectors(target,points.look,e));setFov(fov+(50-fov)*e);}},
      {name:'pausing',duration:250,begin:()=>setSceneMode('ext+in'),apply:()=>{}},
      {name:'opening',duration:1200,apply:e=>setDoorAngle(e*1.8)},
      {name:'entering',duration:1800,apply:e=>{camera.position.lerpVectors(points.outside,points.inside,e);camera.lookAt(temp.lerpVectors(points.look,points.far,e));setFov(50+18*e);updateDisplay();}},
    ],()=>{phase='free';lookFromCamera();applyLook();setFov(68);updateDisplay();publish();});
    return true;
  }
  function leave(){
    if(!active||phase!=='free'||!door)return false;
    const points=doorPoints(),from=camera.position.clone(),target=camera.getWorldDirection(new THREE.Vector3()).add(from),fov=camera.fov,temp=new THREE.Vector3();
    beginSequence([
      {name:'leaving',duration:1200,begin:()=>{setDoorAngle(1.8);setSceneMode('ext+in');},apply:e=>{camera.position.lerpVectors(from,points.outside,e);camera.lookAt(temp.lerpVectors(target,points.look,e));setFov(fov+(38-fov)*e);updateDisplay();}},
      {name:'closing',duration:800,begin:()=>setSceneMode('ext+in'),apply:e=>setDoorAngle(1.8*(1-e))},
    ],()=>{phase='orbit';controls.target.copy(points.look);controls.enabled=true;displayMode='auto';setSceneMode('ext');publish();overview();});
    return true;
  }
  function moveTo(point,{floor=false,direction}={}){
    if(!active||phase!=='free')return false;
    const to=vector(point,camera.position),ray=vector(direction,to.clone().sub(camera.position));
    if(!floor&&ray.lengthSq()>1e-8)to.addScaledVector(ray.normalize(),-.9);
    to.y=camera.position.y;const distance=to.distanceTo(camera.position);if(distance<.15)return false;
    const targetYaw=Math.atan2(-(to.x-camera.position.x),-(to.z-camera.position.z));
    const delta=Math.atan2(Math.sin(targetYaw-yaw),Math.cos(targetYaw-yaw));
    glide={from:camera.position.clone(),to,yaw0:yaw,yaw1:yaw+delta*(floor?1:.6),pitch0:pitch,start:now(),duration:clamp(distance/3*1000,350,2600)};
    invalidate();return true;
  }
  function setDisplayMode(value){if(!active||phase!=='orbit'||!['auto','exterior','interior'].includes(value))return false;displayMode=value;updateDisplay();publish();invalidate();return true;}
  function setAutoRotate(value){if(!active||phase!=='orbit')return false;controls.autoRotate=!!value;publish();invalidate();return true;}
  function start(options={}){
    if(disposed)return false;configure(options);active=true;phase='orbit';displayMode='auto';shown='exterior';sceneMode='ext';lastTime=now();steps=[];flight=null;glide=null;lastPointer=null;clearInput();controls.autoRotate=false;controls.enabled=true;setDoorAngle(0);overview(false);publish(true);return true;
  }
  function stop(){
    if(!active)return false;active=false;phase='inactive';controls.enabled=false;controls.autoRotate=false;steps=[];flight=glide=null;lastPointer=null;clearInput();dirty=false;lastTime=null;setDoorAngle(0);publish(true);return true;
  }
  function keyboard(event){
    if(!active||event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||isHomeRoamInputTarget(event.target)||isHomeRoamInputTarget(element.ownerDocument?.activeElement))return;
    const code=event.code;
    // Buttons keep native Space activation, while W/A/S/D remain usable after
    // choosing the viewing dock without requiring an extra canvas click.
    if(code==='Space'&&[event.target,element.ownerDocument?.activeElement].some(target=>String(target?.tagName).toUpperCase()==='BUTTON'||target?.closest?.('button,[role="button"]')))return;
    if(phase!=='orbit'&&phase!=='free')return;
    if(code==='Escape'){event.preventDefault();if(phase==='free')leave();else{stop();onExit();}return;}
    if(phase==='orbit'&&code==='KeyR'){if(!event.repeat){event.preventDefault();overview();}return;}
    if(phase==='orbit'&&code==='Space'){event.preventDefault();if(!event.repeat)setAutoRotate(!controls.autoRotate);return;}
    if(!MOVEMENT_CODES.has(code))return;
    keys.add(code);event.preventDefault();if(flight){flight=null;controls.enabled=true;}invalidate();
  }
  function moveOrbit(dt){
    const has=code=>keys.has(code)?1:0,forward=has('KeyW')+has('ArrowUp')-has('KeyS')-has('ArrowDown'),side=has('KeyD')+has('ArrowRight')-has('KeyA')-has('ArrowLeft'),turn=has('KeyQ')-has('KeyE');
    if(!forward&&!side&&!turn)return false;
    const fwd=camera.getWorldDirection(new THREE.Vector3());fwd.y=0;fwd.normalize();
    const right=new THREE.Vector3().crossVectors(fwd,UP).normalize(),move=fwd.multiplyScalar(forward).addScaledVector(right,side);
    if(move.lengthSq()){move.normalize().multiplyScalar(Math.max(2,camera.position.distanceTo(controls.target)*.9)*dt);camera.position.add(move);controls.target.add(move);}
    if(turn)camera.position.sub(controls.target).applyAxisAngle(UP,turn*dt*1.2).add(controls.target);
    return true;
  }
  function moveFree(dt,time){
    const has=code=>keys.has(code)?1:0,forward=(has('KeyW')||has('ArrowUp'))-(has('KeyS')||has('ArrowDown')),side=has('KeyD')-has('KeyA'),up=(has('KeyE')||has('Space'))-has('KeyQ'),turn=has('ArrowLeft')-has('ArrowRight');
    let moved=false;
    if(turn){yaw+=turn*dt*1.8;moved=true;glide=null;}
    if(forward||side||up){
      glide=null;const speed=(keys.has('ShiftLeft')||keys.has('ShiftRight')?6:2.6)*dt;
      const direction=new THREE.Vector3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
      camera.position.addScaledVector(direction,forward*speed).addScaledVector(new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw)),side*speed);camera.position.y+=up*speed;moved=true;
    }
    if(glide){const progress=clamp((time-glide.start)/glide.duration,0,1),ease=smooth(progress);camera.position.lerpVectors(glide.from,glide.to,ease);yaw=glide.yaw0+(glide.yaw1-glide.yaw0)*Math.min(1,ease*1.6);pitch=glide.pitch0*(1-ease)-.05*ease;if(progress===1)glide=null;moved=true;}
    if(moved){camera.position.y=clamp(camera.position.y,.25,30);applyLook();updateDisplay();}
    return moved;
  }
  function tick(time=now()){
    if(!active||disposed)return false;
    const dt=clamp(lastTime===null?0:(time-lastTime)/1000,0,.1);lastTime=time;let changed=dirty;dirty=false;
    if(steps.length){
      while(steps.length){const step=steps[0],progress=clamp((time-stepStart)/step.duration,0,1);step.apply(smooth(progress));changed=true;if(progress<1)break;stepStart+=step.duration;steps.shift();if(steps.length){phase=steps[0].name;steps[0].begin?.();publish();}else{const done=steps.onComplete;steps=[];done?.();}}
    }else if(phase==='free')changed=moveFree(dt,time)||changed;
    else if(phase==='orbit'){
      if(flight){const progress=clamp((time-flight.start)/flight.duration,0,1),ease=smooth(progress);camera.position.lerpVectors(flight.from,flight.to,ease);controls.target.lerpVectors(flight.fromTarget,flight.toTarget,ease);camera.lookAt(controls.target);setFov(flight.fromFov+(38-flight.fromFov)*ease);if(progress===1){flight=null;controls.enabled=true;}changed=true;}
      else changed=moveOrbit(dt)||changed;
      if(!flight)changed=!!controls.update(dt)||changed;
      updateDisplay();
    }
    // The caller uses this result to keep its one render loop alive. No frame is
    // scheduled here, and an idle, undamped camera returns false.
    return changed||steps.length>0||!!flight||!!glide||!!controls.autoRotate;
  }
  add(eventTarget,'keydown',keyboard);add(eventTarget,'keyup',event=>keys.delete(event.code));add(eventTarget,'blur',clearInput);
  add(element,'pointerdown',event=>{if(!active||!['orbit','free'].includes(phase))return;lastPointer={id:event.pointerId,x:event.clientX,y:event.clientY,button:event.button};if(phase!=='free'||event.button!==0)return;glide=null;drag={id:event.pointerId,x:event.clientX,y:event.clientY};try{element.setPointerCapture?.(event.pointerId);}catch{/* Capture is optional in test/embed surfaces. */}});
  add(element,'pointermove',event=>{if(!active||phase!=='free'||!drag||event.pointerId!==drag.id)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;drag.x=event.clientX;drag.y=event.clientY;if(!dx&&!dy)return;yaw-=dx*.0045;pitch=clamp(pitch-dy*.0035,-1.45,1.45);applyLook();invalidate();});
  add(element,'pointerup',event=>{if(event.pointerId===drag?.id)releaseDrag();});add(element,'pointercancel',()=>{clearInput();lastPointer=null;});add(element,'lostpointercapture',()=>{drag=null;});
  add(element,'wheel',event=>{if(!active||phase!=='free'||!event.deltaY)return;event.preventDefault();glide=null;camera.position.addScaledVector(camera.getWorldDirection(new THREE.Vector3()),-Math.sign(event.deltaY)*.45);camera.position.y=clamp(camera.position.y,.25,30);updateDisplay();invalidate();},{passive:false});
  const controlsChanged=()=>{if(active&&phase==='orbit')invalidate();};controls.addEventListener?.('change',controlsChanged);
  return {camera,controls,start,stop,tick,overview,enterDoor,leave,moveTo,setDisplayMode,setAutoRotate,toggleAutoRotate:()=>setAutoRotate(!controls.autoRotate),getState:state,getCameraPose:()=>({position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),fov:camera.fov,target:controls.target.toArray()}),isPointerClick:event=>!!(active&&lastPointer&&lastPointer.button===0&&event.button===0&&event.pointerId===lastPointer.id&&Math.hypot(event.clientX-lastPointer.x,event.clientY-lastPointer.y)<6),get active(){return active;},resize(width,height){if(width>0&&height>0){camera.aspect=width/height;camera.updateProjectionMatrix();invalidate();}},dispose(){if(disposed)return;stop();disposed=true;for(const remove of listeners)remove();controls.removeEventListener?.('change',controlsChanged);controls.dispose();}};
}
