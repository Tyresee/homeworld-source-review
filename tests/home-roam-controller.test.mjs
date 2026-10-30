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
