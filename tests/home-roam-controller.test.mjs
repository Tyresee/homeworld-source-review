import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createHomeRoamController,isHomeRoamInputTarget,HOME_ROAM_CAMERA} from '../public/js/home-roam-controller.js';

class Surface{
  constructor(){this.events=new Map();this.style={};this.clientWidth=1440;this.clientHeight=900;this.activeElement=null;this.ownerDocument=this;this.captures=new Set();}
  addEventListener(name,fn){if(!this.events.has(name))this.events.set(name,new Set());this.events.get(name).add(fn);}
  removeEventListener(name,fn){this.events.get(name)?.delete(fn);}
  getRootNode(){return this.ownerDocument;}
  getBoundingClientRect(){return {left:0,top:0,width:1440,height:900};}
  setPointerCapture(id){this.captures.add(id);}
  releasePointerCapture(id){this.captures.delete(id);}
  dispatch(name,event={}){event.preventDefault??=()=>{event.defaultPrevented=true;};event.stopPropagation??=()=>{};event.type=name;for(const fn of [...(this.events.get(name)??[])])fn(event);return event;}
  count(){return [...this.events.values()].reduce((sum,list)=>sum+list.size,0);}
}
const close=(value,expected,epsilon=1e-8)=>assert.ok(Math.abs(value-expected)<epsilon,`${value} should equal ${expected}`);
function fixture(options={}){
  let time=0,changes=0,exits=0;const element=new Surface(),events=new Surface(),modes=[],angles=[];
  element.ownerDocument=events;
  const controller=createHomeRoamController({element,eventTarget:events,bounds:{min:{x:-4,y:0,z:-5},max:{x:4,y:2.85,z:5}},entrance:{center:{x:1,y:0,z:5},outward:{x:0,y:0,z:1}},now:()=>time,onChange:()=>changes++,onExit:()=>exits++,onMode:s=>modes.push(s),onDoorAngle:a=>angles.push(a),...options});
  return {element,events,controller,modes,angles,changes:()=>changes,exits:()=>exits,tick(t){time=t;return controller.tick(t);},key(code,extra={}){return events.dispatch('keydown',{code,key:'Process',...extra});},release(code){events.dispatch('keyup',{code});},start(){controller.start();controller.tick(time);},enter(){controller.enterDoor();time+=4750;controller.tick(time);assert.equal(controller.getState().phase,'free');},time:()=>time};
}

test('a separate perspective camera uses real OrbitControls with the specified limits and restores no editor state',()=>{
  const editor=new THREE.OrthographicCamera(-7,7,4,-4,.1,100);editor.position.set(8,9,10);const original=JSON.stringify(editor.toJSON());
  const f=fixture(),c=f.controller;assert.equal(c.active,false);assert.equal(c.tick(0),false);f.start();
  assert.equal(c.camera.isPerspectiveCamera,true);assert.notEqual(c.camera,editor);assert.equal(c.camera.fov,38);assert.equal(c.controls.constructor.name,'OrbitControls');
  for(const[key,value]of Object.entries({enableDamping:true,dampingFactor:.08,zoomToCursor:true,minDistance:1.6,maxDistance:45,rotateSpeed:.7,autoRotateSpeed:.6}))assert.equal(c.controls[key],value);
  close(c.controls.maxPolarAngle,86*Math.PI/180);assert.equal(c.getState().view,'exterior');
  close(c.camera.position.x,9.5);close(c.camera.position.z,12.5);close(c.camera.position.y,1.425+10.5);
  c.resize(1920,1080);close(c.camera.aspect,16/9);assert.equal(c.tick(0),true);assert.equal(c.tick(0),false,'Idle controls do not request another frame');
  const pose=c.getCameraPose();assert.equal(pose.fov,38);pose.position[0]=1000;pose.target[0]=1000;assert.notEqual(c.camera.position.x,1000);assert.notEqual(c.controls.target.x,1000);
  c.stop();assert.equal(JSON.stringify(editor.toJSON()),original);assert.equal(c.active,false);assert.equal(c.controls.enabled,false);c.dispose();assert.equal(f.element.count(),0);assert.equal(f.events.count(),0);
});

test('orbit display is distance based unless explicitly pinned and slow orbit is reversible',()=>{
  const f=fixture(),c=f.controller;f.start();c.camera.position.copy(c.controls.target).add(new THREE.Vector3(0,4,10));f.tick(16);assert.equal(c.getState().sceneMode,'orbit-in');
  c.setDisplayMode('exterior');assert.equal(c.getState().sceneMode,'ext');c.setDisplayMode('interior');assert.equal(c.getState().sceneMode,'orbit-in');
  c.setDisplayMode('auto');c.overview(false);assert.equal(c.getState().sceneMode,'ext');const initial=c.camera.position.clone();
  f.key('Space');assert.equal(c.getState().autoRotate,true);f.tick(116);assert.ok(c.camera.position.distanceTo(initial)>0);f.key('Space',{repeat:true});assert.equal(c.getState().autoRotate,true);f.key('Space');assert.equal(c.getState().autoRotate,false);c.dispose();
});

test('door entry uses actual entrance coordinates, all four smoothstep stages, and disables input until free',()=>{
  const f=fixture(),c=f.controller;f.start();const from=c.camera.position.clone();assert.equal(c.enterDoor(),true);assert.equal(c.enterDoor(),false);
  f.tick(750);assert.equal(c.getState().phase,'approaching');close(c.camera.position.x,(from.x+1)/2);close(c.camera.position.z,(from.z+7.8)/2);close(c.camera.fov,44);
  f.key('KeyW');const frozen=c.camera.position.clone();f.tick(750);assert.deepEqual(c.camera.position.toArray(),frozen.toArray());assert.equal(c.controls.enabled,false);
  f.tick(1500);assert.equal(c.getState().phase,'pausing');assert.equal(c.getState().sceneMode,'ext+in');close(c.camera.fov,50);
  f.tick(1750);assert.equal(c.getState().phase,'opening');f.tick(2350);close(f.angles.at(-1),.9);
  f.tick(2950);assert.equal(c.getState().phase,'entering');f.tick(4750);assert.equal(c.getState().phase,'free');close(c.camera.position.x,1);close(c.camera.position.z,3);close(c.camera.position.y,1.45);close(c.camera.fov,68);close(f.angles.at(-1),1.8);assert.equal(c.getState().sceneMode,'in');assert.equal(c.controls.enabled,false);
  assert.equal(c.setDisplayMode('exterior'),false);c.dispose();
});

test('door normal and threshold work for a side entrance instead of a hardcoded front-facing house',()=>{
  const f=fixture({entrance:{center:{x:-4,y:.2,z:-1},outward:{x:-1,y:0,z:0},thresholdY:.2}}),c=f.controller;f.start();assert.equal(c.enterDoor(),true);f.tick(1500);close(c.camera.position.x,-6.8);close(c.camera.position.y,1.65);close(c.camera.position.z,-1);f.tick(4750);close(c.camera.position.x,-2);close(c.camera.position.z,-1);assert.ok(c.camera.getWorldDirection(new THREE.Vector3()).x>.99);c.dispose();
});

test('physical Process keys move freely through walls, cap long frame deltas, clear on blur and respect editing focus',()=>{
  const f=fixture(),c=f.controller;f.start();f.enter();const from=c.camera.position.clone();f.key('KeyW');f.tick(4850);close(c.camera.position.distanceTo(from),2.6*.1);
  const previous=c.camera.position.clone();f.tick(9850);close(c.camera.position.distanceTo(previous),.26);f.key('ShiftLeft');const fast=c.camera.position.clone();f.tick(9950);close(c.camera.position.distanceTo(fast),.6);
  f.events.dispatch('blur');const stopped=c.camera.position.clone();f.tick(10050);assert.deepEqual(c.camera.position.toArray(),stopped.toArray());
  f.key('KeyW',{target:{tagName:'INPUT'}});f.tick(10150);assert.deepEqual(c.camera.position.toArray(),stopped.toArray());
  f.events.activeElement={isContentEditable:true};f.key('KeyW');f.tick(10250);assert.deepEqual(c.camera.position.toArray(),stopped.toArray());f.events.activeElement=null;
  c.camera.position.set(50,29.9,50);f.key('KeyE');f.tick(10350);close(c.camera.position.y,30);assert.equal(c.getState().sceneMode,'ext+in','Flying outside the body switches the shell without blocking motion');f.release('KeyE');c.camera.position.y=.3;f.key('KeyQ');f.tick(10450);close(c.camera.position.y,.25);c.dispose();
});

test('free look, wheel and click glide preserve camera height, reject non-click drags and stop in front of an object',()=>{
  const f=fixture(),c=f.controller;f.start();f.enter();
  f.element.dispatch('pointerdown',{button:0,pointerId:7,clientX:20,clientY:30});f.element.dispatch('pointermove',{pointerId:7,clientX:120,clientY:-10000});close(c.camera.rotation.x,1.45);const end={button:0,pointerId:7,clientX:120,clientY:30};assert.equal(c.isPointerClick(end),false);f.element.dispatch('pointerup',end);assert.equal(f.element.captures.size,0);
  f.element.dispatch('pointerdown',{button:0,pointerId:8,clientX:10,clientY:10});assert.equal(c.isPointerClick({button:0,pointerId:8,clientX:15,clientY:10}),true);assert.equal(c.isPointerClick({button:0,pointerId:8,clientX:16,clientY:10}),false);f.element.dispatch('pointercancel',{pointerId:8});assert.equal(c.isPointerClick({button:0,pointerId:8,clientX:10,clientY:10}),false);
  const wheelFrom=c.camera.position.clone(),wheel=f.element.dispatch('wheel',{deltaY:-1});close(c.camera.position.distanceTo(wheelFrom),.45);assert.equal(wheel.defaultPrevented,true);
  const y=c.camera.position.y;c.moveTo({x:4,y:0,z:4},{floor:true});f.tick(7350);close(c.camera.position.x,4);close(c.camera.position.z,4);close(c.camera.position.y,y);
  c.moveTo({x:4,y:1,z:0},{direction:{x:0,y:0,z:-1}});f.tick(9950);close(c.camera.position.z,.9);close(c.camera.position.y,y);assert.equal(c.tick(9950),false);c.dispose();
});

test('Escape leaves through the door, closes it, returns to the overview, then exits the temporary camera',()=>{
  const f=fixture(),c=f.controller;f.start();f.enter();f.key('Escape');assert.equal(c.getState().phase,'leaving');f.tick(5950);assert.equal(c.getState().phase,'closing');close(c.camera.fov,38);close(c.camera.position.z,7.8);f.tick(6350);close(f.angles.at(-1),.9);f.tick(6750);assert.equal(c.getState().phase,'orbit');close(f.angles.at(-1),0);f.tick(7450);close(c.camera.position.x,9.5);close(c.camera.position.z,12.5);assert.equal(c.getState().view,'exterior');f.key('Escape');assert.equal(c.active,false);assert.equal(f.exits(),1);c.dispose();
});

test('stopping mid-transition prevents stale updates and restarting resets transient view state',()=>{
  const f=fixture(),c=f.controller;f.start();c.enterDoor();f.tick(2350);assert.ok(f.angles.at(-1)>0);c.stop();const frozen=c.camera.position.clone();assert.equal(f.tick(9000),false);assert.deepEqual(c.camera.position.toArray(),frozen.toArray());close(f.angles.at(-1),0);c.start();assert.equal(c.getState().phase,'orbit');assert.equal(c.getState().autoRotate,false);close(c.camera.fov,HOME_ROAM_CAMERA.fov);c.dispose();assert.equal(c.start(),false);
  for(const tagName of ['INPUT','TEXTAREA','SELECT','OPTION'])assert.equal(isHomeRoamInputTarget({tagName}),true);assert.equal(isHomeRoamInputTarget({tagName:'CANVAS'}),false);assert.equal(isHomeRoamInputTarget({tagName:'BUTTON'}),false,'Choosing the viewing dock must not disable physical movement keys');
});

test('an optional slab-union classifier keeps an empty corner outdoors without restricting free flight',()=>{
  const f=fixture({containsInterior:point=>point.x<0||point.z<0}),c=f.controller;f.start();f.enter();assert.equal(c.getState().sceneMode,'ext+in');
  c.camera.position.set(-1,1.45,3);f.key('KeyW');f.tick(4850);assert.equal(c.getState().sceneMode,'in');f.release('KeyW');
  c.camera.position.set(-1,10,3);f.key('KeyW');f.tick(4950);assert.equal(c.getState().sceneMode,'ext+in','Roof/height bounds are still checked even when the horizontal slab callback accepts');c.dispose();
});

test('outdoor eye-level visit enters at any chosen ground point without a doorway sequence or home mutation',()=>{
  const f=fixture(),c=f.controller;f.start();const picked={x:12,y:-.02,z:-8},before=structuredClone(picked);
  assert.equal(c.enterOutdoor(picked),true);assert.equal(c.getState().phase,'approaching-outdoor');assert.equal(c.enterOutdoor(picked),false);
  f.tick(450);assert.equal(c.getState().transition,true);f.tick(900);assert.equal(c.getState().phase,'free');assert.equal(c.getState().sceneMode,'ext+in');
  close(c.camera.position.x,12);close(c.camera.position.z,-8);close(c.camera.position.y,picked.y+HOME_ROAM_CAMERA.eye);close(c.camera.fov,68);assert.deepEqual(picked,before);assert.equal(f.angles.at(-1),0);
  const from=c.camera.position.clone();f.key('KeyW');f.tick(1000);assert.ok(c.camera.position.distanceTo(from)>.25);f.release('KeyW');c.dispose();
});

test('a large estate can frame its land without mistaking distance from the house for an interior close-up',()=>{
  const bounds=new THREE.Box3(new THREE.Vector3(-18,-.3,-12),new THREE.Vector3(24,7,28));
  const displayBounds=new THREE.Box3(new THREE.Vector3(-3,0,-3),new THREE.Vector3(9,7,9));
  const f=fixture({bounds,displayBounds,interiorBounds:displayBounds,orbitMaxDistance:120}),c=f.controller;f.start();
  assert.equal(c.getState().sceneMode,'ext');assert.equal(c.controls.maxDistance,120);assert.ok(c.camera.position.distanceTo(c.controls.target)>45);
  assert.equal(c.enterOutdoor({x:14,y:0,z:2}),true);f.tick(900);assert.equal(c.getState().phase,'free');assert.equal(c.leaveOutdoor(),true);assert.equal(c.getState().phase,'orbit');f.tick(1600);assert.equal(c.getState().view,'exterior');c.dispose();
});

test('an indoor visitor can switch to the real garden ground without a visible wall-crossing flight or held movement leaking through',()=>{
  const opacity=[],f=fixture({onViewOpacity:value=>opacity.push(value)}),c=f.controller;f.start();f.enter();
  const source=c.getCameraPose(),point={x:12,y:-.02,z:-8},before=structuredClone(point),start=f.time();
  f.key('KeyW');f.element.dispatch('pointerdown',{button:0,pointerId:19,clientX:100,clientY:100});assert.equal(f.element.captures.size,1);
  c.moveTo({x:3,y:0,z:2},{floor:true});
  assert.equal(c.enterOutdoor(point),true);assert.equal(c.getState().phase,'entering-garden-out');assert.equal(c.getState().transition,true);assert.equal(c.controls.enabled,false);assert.equal(f.element.captures.size,0);
  assert.equal(c.enterOutdoor(point),false,'a second request cannot replace the running region switch');assert.equal(c.enterDoor(),false);
  f.key('KeyD');f.tick(start+100);close(opacity.at(-1),.5);assert.deepEqual(c.getCameraPose(),source,'fade-out holds the exact existing pose');
  f.tick(start+199);assert.ok(opacity.at(-1)>0);assert.deepEqual(c.getCameraPose(),source,'even the final visible fade-out sample stays in the old region');
  f.tick(start+200);close(opacity.at(-1),0);assert.equal(c.getState().phase,'entering-garden-in');close(c.camera.position.x,point.x);close(c.camera.position.z,point.z);close(c.camera.position.y,point.y+HOME_ROAM_CAMERA.eye);close(c.camera.fov,68);
  const garden=c.camera.position.clone();f.tick(start+300);close(opacity.at(-1),.5);assert.deepEqual(c.camera.position.toArray(),garden.toArray());
  f.tick(start+400);close(opacity.at(-1),1);assert.equal(c.getState().phase,'free');assert.equal(c.getState().sceneMode,'ext+in');assert.equal(c.controls.enabled,false);
  f.tick(start+500);assert.deepEqual(c.camera.position.toArray(),garden.toArray(),'held keys and the old click glide were canceled');assert.deepEqual(point,before,'the caller ground contact is not rewritten');
  f.key('KeyW');f.tick(start+600);assert.ok(c.camera.position.distanceTo(garden)>.25,'ordinary movement is usable after the switch');f.release('KeyW');c.dispose();
});

test('upper-floor garden navigation changes coordinates only at the fully hidden midpoint and restores ground-level free viewing',()=>{
  const opacity=[],f=fixture({bounds:{min:{x:-4,y:0,z:-5},max:{x:4,y:6.1,z:5}},onViewOpacity:value=>opacity.push(value)}),c=f.controller;f.start();f.enter();
  c.camera.position.set(-1,4.60,2);const source=c.camera.position.clone(),target={x:-12,y:-.07,z:8},start=f.time(),destination=new THREE.Vector3(target.x,target.y+HOME_ROAM_CAMERA.eye,target.z);
  assert.equal(c.enterOutdoor(target),true);
  for(const elapsed of[0,40,80,120,160,199]){f.tick(start+elapsed);assert.deepEqual(c.camera.position.toArray(),source.toArray(),'the old upper-floor position is held while fading');}
  f.tick(start+200);close(opacity.at(-1),0);assert.deepEqual(c.camera.position.toArray(),destination.toArray());
  for(const elapsed of[220,260,300,340,380,400]){f.tick(start+elapsed);assert.deepEqual(c.camera.position.toArray(),destination.toArray(),'fade-in never flies diagonally through lower floors or walls');}
  assert.equal(c.getState().phase,'free');assert.equal(c.getState().walking,true);assert.equal(c.getState().view,'exterior');close(c.camera.fov,HOME_ROAM_CAMERA.freeFov);close(opacity.at(-1),1);c.dispose();
});

test('a garden visitor returns through the configured front door after a hidden approach, then becomes free inside the house',()=>{
  const opacity=[],f=fixture({onViewOpacity:value=>opacity.push(value)}),c=f.controller;f.start();c.enterOutdoor({x:14,y:-.02,z:-8});f.tick(900);
  const garden=c.getCameraPose(),start=f.time();assert.equal(c.getState().view,'exterior');assert.equal(c.enterDoor(),true);assert.equal(c.getState().phase,'approaching-door-out');
  f.tick(start+100);assert.deepEqual(c.getCameraPose(),garden);close(opacity.at(-1),.5);
  f.tick(start+200);assert.equal(c.getState().phase,'approaching-door-in');close(opacity.at(-1),0);close(c.camera.position.x,1);close(c.camera.position.y,1.45);close(c.camera.position.z,7.8);close(c.camera.fov,50);
  f.tick(start+400);assert.equal(c.getState().phase,'pausing');close(opacity.at(-1),1);close(f.angles.at(-1),0);
  f.tick(start+650);assert.equal(c.getState().phase,'opening');close(f.angles.at(-1),0);
  f.tick(start+1250);close(f.angles.at(-1),.9);close(c.camera.position.z,7.8);
  f.tick(start+1850);assert.equal(c.getState().phase,'entering');close(f.angles.at(-1),1.8);close(c.camera.fov,50);
  f.tick(start+3650);assert.equal(c.getState().phase,'free');assert.equal(c.getState().sceneMode,'in');close(c.camera.position.x,1);close(c.camera.position.y,1.45);close(c.camera.position.z,3);close(c.camera.fov,68);assert.equal(c.controls.enabled,false);
  const inside=c.getCameraPose();assert.equal(c.enterDoor(),false,'an indoor visitor cannot repeat the outdoor entry path');assert.deepEqual(c.getCameraPose(),inside);c.dispose();
});

test('stopping or disposing either garden fade restores visibility and cancels every later region update',()=>{
  for(const action of['stop','dispose'])for(const elapsed of[100,300]){
    const opacity=[],f=fixture({onViewOpacity:value=>opacity.push(value)}),c=f.controller;f.start();f.enter();const start=f.time();c.enterOutdoor({x:12,y:0,z:12});f.tick(start+elapsed);
    assert.ok(opacity.at(-1)>0&&opacity.at(-1)<1);assert.equal(c.getState().transition,true);
    c[action]();close(opacity.at(-1),1);assert.equal(c.active,false);assert.equal(c.getState().phase,'inactive');const frozen=c.getCameraPose(),callbacks=opacity.length;
    assert.equal(f.tick(start+10000),false);assert.deepEqual(c.getCameraPose(),frozen);assert.equal(opacity.length,callbacks,'the canceled fade has no stale opacity callback');
    if(action==='stop'){c.start();close(opacity.at(-1),1);assert.equal(c.getState().phase,'orbit');c.dispose();}else{assert.equal(c.start(),false);c.dispose();}
    assert.equal(f.element.count(),0);assert.equal(f.events.count(),0);assert.equal(f.element.captures.size,0);
  }
});

test('an explicit garden look target is copied and honored through both orbit entry and a hidden indoor switch',()=>{
  for(const fromInside of[false,true]){
    const f=fixture(),c=f.controller;f.start();if(fromInside)f.enter();const start=f.time(),source=c.getCameraPose(),initialTarget=c.controls.target.clone();
    const point=Object.freeze({x:12,y:-.04,z:11}),lookAt=new THREE.Vector3(20,1.15,14),requestedLook=lookAt.clone();
    assert.equal(c.enterOutdoor(point,{lookAt}),true);assert.deepEqual(lookAt.toArray(),requestedLook.toArray(),'requesting a region does not rewrite the caller look point');assert.deepEqual(c.getCameraPose(),source);
    lookAt.set(-99,30,99);const callerEdit=lookAt.toArray();
    if(fromInside){f.tick(start+100);assert.deepEqual(c.getCameraPose(),source,'the custom gaze does not snap before the scene is veiled');f.tick(start+400);}
    else{
      f.tick(start+450);const middleLook=initialTarget.lerp(requestedLook,.5),middleDirection=middleLook.sub(c.camera.position).normalize();
      assert.ok(c.camera.getWorldDirection(new THREE.Vector3()).distanceTo(middleDirection)<1e-8,'orbit entry interpolates the actual target rather than snapping at arrival');f.tick(start+900);
    }
    assert.equal(c.getState().phase,'free');assert.equal(c.getState().view,'exterior');close(c.camera.fov,HOME_ROAM_CAMERA.freeFov);
    const expected=requestedLook.clone().sub(c.camera.position).normalize();assert.ok(c.camera.getWorldDirection(new THREE.Vector3()).distanceTo(expected)<1e-8,'the final view faces the requested garden instead of the house door');
    assert.deepEqual(lookAt.toArray(),callerEdit,'the controller does not subsequently alter the caller target');assert.deepEqual(point,{x:12,y:-.04,z:11});c.dispose();
  }
});

test('coincident or invalid garden look targets have a finite fallback while absolute world origin remains a valid target',()=>{
  for(const fromInside of[false,true])for(const targetKind of['coincident','invalid','origin']){
    const f=fixture(),c=f.controller;f.start();if(fromInside)f.enter();const start=f.time(),point={x:12,y:-.04,z:11},eye=new THREE.Vector3(point.x,point.y+HOME_ROAM_CAMERA.eye,point.z);
    const lookAt=targetKind==='coincident'?eye.clone():targetKind==='invalid'?new THREE.Vector3(NaN,0,0):new THREE.Vector3(0,0,0),before=lookAt.toArray();
    assert.equal(c.enterOutdoor(point,{lookAt}),true);f.tick(start+(fromInside?400:900));const direction=c.camera.getWorldDirection(new THREE.Vector3());
    assert.equal(c.getState().phase,'free');assert.ok(c.camera.position.toArray().every(Number.isFinite));assert.ok(c.camera.quaternion.toArray().every(Number.isFinite));assert.ok(direction.toArray().every(Number.isFinite));close(direction.length(),1);
    const expected=(targetKind==='origin'?new THREE.Vector3():new THREE.Vector3(1,eye.y-.05,5)).sub(eye).normalize();assert.ok(direction.distanceTo(expected)<1e-8,`${targetKind} target must follow its documented fallback contract`);
    assert.deepEqual(lookAt.toArray(),before);c.dispose();
  }
});

test('shared-model floor framing changes only camera under the veil and preserves all door state',()=>{
  let opacity=1,focused=false;const f=fixture({onViewOpacity:value=>{opacity=value;}}),c=f.controller;f.start();const angles=f.angles.slice(),before=c.camera.position.clone(),bounds=new THREE.Box3(new THREE.Vector3(-2,3.15,-3),new THREE.Vector3(6,6.06,5)),original=bounds.clone();
  assert.equal(c.frameView(bounds,{displayMode:'interior',onFocus(){assert.equal(opacity,0);focused=true;}}),true);f.tick(199);assert.equal(focused,false);assert.ok(c.camera.position.equals(before));f.tick(200);assert.equal(focused,true);assert.equal(opacity,0);assert.ok(c.controls.target.equals(bounds.getCenter(new THREE.Vector3())));assert.equal(c.getState().sceneMode,'orbit-in');f.tick(400);assert.equal(opacity,1);assert.equal(c.getState().phase,'orbit');assert.equal(c.getState().displayMode,'interior');assert.deepEqual(f.angles,angles);assert.ok(bounds.equals(original));assert.equal(c.frameView(new THREE.Box3()),false);c.dispose();
});

test('a public model retains its viewer session when Escape or R requests the full creation',()=>{
  let requested=0;const f=fixture({exitOnEscape:false,onRequestLeave:()=>{requested++;return true;},onRequestOverview:()=>{requested++;return true;}});f.start();f.key('Escape');assert.equal(f.controller.active,true);assert.equal(f.exits(),0);f.key('KeyR');assert.equal(requested,2);assert.equal(f.controller.active,true);f.controller.dispose();
});

test('read-only interior entry restores a nearby first-person camera only while hidden and never opens a door',()=>{
  let opacity=1,entered=0;const f=fixture({onViewOpacity:value=>{opacity=value;}}),c=f.controller;f.start();
  const before=c.getCameraPose(),doorFrames=f.angles.slice(),position=new THREE.Vector3(-1,.08+HOME_ROAM_CAMERA.eye,1.2),lookAt=new THREE.Vector3(1.2,1.3,-1),target=position.clone(),direction=lookAt.clone().sub(position).normalize();
  assert.equal(c.enterInterior({position,lookAt,onEnter(){assert.equal(opacity,0);entered++;}}),true);
  assert.equal(c.getState().phase,'entering-interior-out');assert.equal(c.controls.enabled,false);assert.equal(c.getState().transition,true);
  position.set(999,999,999);lookAt.set(-999,-999,-999);
  f.key('KeyW');f.tick(100);close(opacity,.5);assert.deepEqual(c.getCameraPose(),before);assert.equal(entered,0);
  f.tick(199);assert.deepEqual(c.getCameraPose(),before);assert.ok(opacity>0);assert.equal(entered,0);
  f.tick(200);close(opacity,0);assert.equal(entered,1);assert.equal(c.getState().phase,'entering-interior-in');assert.ok(c.camera.position.equals(target));close(c.camera.fov,68);assert.equal(c.getState().sceneMode,'in');
  f.tick(400);close(opacity,1);assert.equal(c.getState().phase,'free');assert.equal(c.getState().walking,true);assert.equal(c.controls.enabled,false);assert.ok(c.camera.position.equals(target));assert.ok(c.camera.getWorldDirection(new THREE.Vector3()).distanceTo(direction)<1e-8);assert.deepEqual(f.angles,doorFrames,'the camera-only entry does not open or close the physical door');
  f.tick(500);assert.ok(c.camera.position.equals(target),'input received during the transition does not become an unexpected walk');assert.equal(entered,1);c.dispose();
});

test('switching a walking viewer to an upper interior preserves world floor height, clears held input and remains in first-person mode',()=>{
  let opacity=1,entered=0;const box=new THREE.Box3(new THREE.Vector3(-4,0,-5),new THREE.Vector3(4,6.06,5));
  const f=fixture({bounds:box,interiorBounds:box,containsInterior:p=>(p.y>=.08&&p.y<2.91)||(p.y>=3.23&&p.y<6.06),onViewOpacity:value=>{opacity=value;}}),c=f.controller;f.start();f.enter();const start=f.time(),before=c.camera.position.clone(),doorFrames=f.angles.slice();
  const position=new THREE.Vector3(-1.6,3.15+.08+HOME_ROAM_CAMERA.eye,-1),lookAt=position.clone().add(new THREE.Vector3(2,0,1));
  f.key('KeyW');f.element.dispatch('pointerdown',{button:0,pointerId:37,clientX:120,clientY:100});assert.equal(f.element.captures.size,1);assert.equal(c.moveTo({x:3,y:0,z:0},{floor:true}),true);
  assert.equal(c.enterInterior({position,lookAt,onEnter(){assert.equal(opacity,0);entered++;}}),true);assert.equal(f.element.captures.size,0);
  assert.equal(c.enterInterior({position,lookAt}),false,'a second floor selection cannot replace the active fade');
  f.tick(start+199);assert.ok(c.camera.position.equals(before));assert.equal(entered,0);
  f.tick(start+200);assert.ok(c.camera.position.equals(position));assert.equal(entered,1);close(opacity,0);
  f.tick(start+400);assert.equal(c.getState().phase,'free');assert.equal(c.getState().sceneMode,'in');close(c.camera.position.y,4.68);close(c.camera.fov,68);assert.deepEqual(f.angles,doorFrames);
  f.tick(start+500);assert.ok(c.camera.position.equals(position),'the prior held key and click glide were both cleared');
  f.key('KeyW');f.tick(start+600);assert.ok(c.camera.position.distanceTo(position)>.25);f.release('KeyW');const walked=c.camera.position.clone();close(walked.y,4.68);
  assert.equal(c.moveTo({x:2.5,y:0,z:1},{floor:true}),true);f.tick(start+3200);close(c.camera.position.x,2.5);close(c.camera.position.z,1);close(c.camera.position.y,walked.y);c.dispose();
});

test('invalid or unavailable interior contacts fail without a camera move, hidden scene or arbitrary fallback',()=>{
  let entered=0;const opacity=[],box=new THREE.Box3(new THREE.Vector3(-4,0,-5),new THREE.Vector3(4,6.06,5)),f=fixture({bounds:box,interiorBounds:box,containsInterior:p=>p.y<2.91||p.y>=3.23,onViewOpacity:value=>opacity.push(value)}),c=f.controller;
  const valid={position:new THREE.Vector3(0,1.53,0),lookAt:new THREE.Vector3(1,1.53,0),onEnter:()=>entered++};assert.equal(c.enterInterior(valid),false);f.start();const before=c.getCameraPose(),previousOpacity=opacity.slice(),angles=f.angles.slice();
  for(const request of [undefined,{}, {...valid,position:new THREE.Vector3(0,NaN,0)}, {...valid,lookAt:new THREE.Vector3(Infinity,1,0)}, {...valid,lookAt:valid.position.clone()}, {...valid,position:new THREE.Vector3(30,1.53,0)}, {...valid,position:new THREE.Vector3(0,3.1,0)}, {...valid,position:new THREE.Vector3(0,-1,0)}]){
    assert.equal(c.enterInterior(request),false);assert.deepEqual(c.getCameraPose(),before);assert.deepEqual(opacity,previousOpacity);assert.equal(c.getState().phase,'orbit');assert.equal(entered,0);assert.deepEqual(f.angles,angles);
  }
  c.stop();assert.equal(c.enterInterior(valid),false);c.dispose();
});

test('stopping or disposing either half of an interior switch restores visibility and cancels future callbacks and movement',()=>{
  for(const elapsed of[100,300])for(const cancel of['stop','dispose']){
    let opacity=1,entered=0;const f=fixture({onViewOpacity:value=>{opacity=value;}}),c=f.controller;f.start();const target={position:new THREE.Vector3(0,1.53,1),lookAt:new THREE.Vector3(1,1.53,-1),onEnter:()=>entered++};assert.equal(c.enterInterior(target),true);f.tick(elapsed);assert.ok(opacity<1);const pose=c.getCameraPose(),calls=entered;
    c[cancel]();assert.equal(opacity,1);assert.equal(c.active,false);f.tick(10000);assert.deepEqual(c.getCameraPose(),pose);assert.equal(entered,calls);assert.equal(c.tick(10000),false);assert.equal(c.enterInterior(target),false);c.dispose();
  }
});
