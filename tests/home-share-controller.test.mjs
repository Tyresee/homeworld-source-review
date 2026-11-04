import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createHomeShareController,shareEase} from '../public/js/home-share-controller.js';

class Surface {
  constructor(){this.events=new Map();this.style={touchAction:'auto'};this.captures=new Set();}
  addEventListener(type,listener){if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(listener);}
  removeEventListener(type,listener){this.events.get(type)?.delete(listener);}
  setPointerCapture(id){this.captures.add(id);}
  releasePointerCapture(id){this.captures.delete(id);}
  dispatch(type,event={}){event.preventDefault??=()=>{event.defaultPrevented=true;};for(const listener of [...this.events.get(type)??[]])listener(event);return event;}
  get listenerCount(){return [...this.events.values()].reduce((sum,list)=>sum+list.size,0);}
}
const near=(actual,expected,epsilon=1e-7)=>assert.ok(Math.abs(actual-expected)<epsilon,`${actual} ≈ ${expected}`);
function fixture(options={}) {
  const element=new Surface(),eventTarget=new Surface(),states=[],layouts=[],elevators=[],taps=[],toasts=[];
  const floors=Array.from({length:3},(_,index)=>({index,baseY:index*3,rooms:[
    {id:`room-${index}`,name:"Living room",center:{x:2,z:2},adjacent:[{roomId:`bed-${index}`,door:{x:4,z:2}}]},
    {id:`bed-${index}`,name:"Bedroom",center:{x:6,z:2},adjacent:[{roomId:`room-${index}`,door:{x:4,z:2}}]},
  ]}));
  const model={bounds:new THREE.Box3(new THREE.Vector3(-10,-.4,-10),new THREE.Vector3(20,9,20)),houseBounds:new THREE.Box3(new THREE.Vector3(0,0,0),new THREE.Vector3(8,9,4)),storeyHeight:3,floors,
    spots:[{id:'house',name:"My home",house:true,center:new THREE.Vector3(4,0,2)},{id:'pool',name:"Pool",center:new THREE.Vector3(13,0,14),dist:17},{id:'garden',name:"Garden",center:new THREE.Vector3(14,0,1),dist:20}],
    elevator:{served:[0,1,2],landings:floors.map(row=>({floor:row.index,roomId:`room-${row.index}`,door:new THREE.Vector3(0,row.baseY,2),cabin:new THREE.Vector3(-1.2,row.baseY,2)}))}};
  const before=JSON.stringify(model);
  const c=createHomeShareController({element,eventTarget,model,onStateChange:s=>states.push(s),onLayout:s=>layouts.push(s),onElevator:s=>elevators.push(s),onTap:e=>taps.push(e),onToast:t=>toasts.push(t),...options});
  c.resize(1440,900);
  const tick=seconds=>{for(let time=0;time<seconds-1e-8;time+=.01)c.tick(Math.min(.01,seconds-time));};
  const settle=()=>tick(3);
  const pointer=(type,id,x,y)=>element.dispatch(type,{pointerId:id,clientX:x,clientY:y,button:0});
  return {c,model,before,element,eventTarget,states,layouts,elevators,taps,toasts,tick,settle,pointer,start(){c.start();settle();}};
}

test('intro uses an independent perspective camera and keeps all navigation locked until 2.2 seconds',()=>{
  const f=fixture(),c=f.c;assert.equal(c.getState().active,false);assert.equal(c.tick(.05),false);assert.equal(c.start(),true);assert.equal(c.start(),false);
  assert.equal(c.camera.isPerspectiveCamera,true);assert.equal(c.getState().locked,true);assert.equal(c.goExploded(),false);assert.equal(c.goFocus(0),false);
  const initial=c.getCameraPose();f.tick(1.1);assert.notDeepEqual(c.getCameraPose().position,initial.position);assert.equal(c.getState().locked,true);
  f.tick(1.11);assert.equal(c.getState().locked,false);assert.equal(c.getState().controller,'orbit');near(c.orbit.yaw,-.78);near(c.orbit.pitch,.55);near(c.camera.fov,42);
  assert.equal(JSON.stringify(f.model),f.before);assert.ok(c.camera.position.x<c.orbit.target.x,'Camera finishes at the approved front-left angle');c.dispose();
});

test('overview, outdoor, exploded and floor navigation stay in orbit and preserve yaw',()=>{
  const f=fixture(),c=f.c;f.start();c.look(70,-10);const yaw=c.orbit.yaw;
  assert.equal(c.goSpot('missing'),false);assert.equal(c.goSpot('pool'),true);assert.equal(c.getState().name,'SPOT');assert.equal(c.getState().spotId,'pool');f.settle();near(c.orbit.dist,17);near(c.orbit.yaw,yaw);
  assert.equal(c.goSpot('garden'),true);f.settle();assert.equal(c.getState().spotId,'garden');assert.equal(c.back(),true);f.settle();assert.equal(c.getState().name,'ORBIT');
  assert.equal(c.goSpot('house'),true);const from=c.getCameraPose();assert.equal(c.getState().name,'EXPLODED');c.tick(.05);assert.notDeepEqual(c.getCameraPose().position,from.position);assert.equal(c.getState().locked,true);f.settle();near(c.orbit.yaw,yaw);
  assert.equal(c.goFocus(2),true);f.settle();assert.equal(c.getState().floor,2);near(c.orbit.target.y,7);near(c.orbit.pitch,.9);assert.equal(c.goFocus(9),false);
  const pose=c.getCameraPose();assert.equal(c.goRoom(2,'bed-2'),true);assert.deepEqual(c.getCameraPose(),pose,'Selecting a room on the focused floor keeps its exact exterior view');assert.equal(c.getState().locked,false);assert.equal(c.getState().name,'FOCUS');assert.equal(c.getState().roomId,null);
  assert.equal(c.goRoom(1,'room-1'),true);f.settle();assert.equal(c.getState().name,'FOCUS');assert.equal(c.getState().floor,1);assert.equal(c.getState().controller,'orbit');near(c.orbit.yaw,yaw);near(c.camera.fov,42);
  for(const expected of ['EXPLODED','ORBIT']){assert.equal(c.back(),true);f.settle();assert.equal(c.getState().name,expected);}
  assert.equal(c.back(),false);assert.equal(JSON.stringify(f.model),f.before);c.dispose();
});

test('drag and zoom remain exterior orbit controls; movement keys never move the camera',()=>{
  const f=fixture(),c=f.c;f.start();c.goFocus(1);f.settle();const position=c.camera.position.clone(),yaw=c.orbit.yaw,pitch=c.orbit.pitch,distance=c.orbit.dist;
  f.pointer('pointerdown',1,100,100);f.pointer('pointermove',1,200,150);f.pointer('pointerup',1,200,150);near(c.orbit.yaw,yaw-.6);near(c.orbit.pitch,pitch+.25);assert.equal(f.taps.length,0);assert.ok(c.camera.position.distanceTo(position)>1);
  c.look(0,10000);near(c.orbit.pitch,1.35);c.look(0,-10000);near(c.orbit.pitch,.35);
  const event=f.element.dispatch('wheel',{deltaY:1000});assert.equal(event.defaultPrevented,true);assert.ok(c.orbit.dist>distance);c.zoom(.001);near(c.orbit.dist,9);near(c.camera.fov,42);
  const afterOrbit=c.getCameraPose();for(const key of ['w','a','s','d','ArrowUp','ArrowDown',' '])f.eventTarget.dispatch('keydown',{key,code:key});f.tick(2);assert.deepEqual(c.getCameraPose(),afterOrbit);assert.equal(c.getState().controller,'orbit');c.dispose();
});

test('pointer thresholds, two-finger pinch, cancellation and reversal have no accidental taps',()=>{
  const f=fixture(),c=f.c;f.start();const yaw=c.orbit.yaw;
  f.pointer('pointerdown',1,10,10);f.pointer('pointermove',1,12,10);f.pointer('pointerup',1,12,10);assert.equal(f.taps.length,1);near(c.orbit.yaw,yaw);
  f.pointer('pointerdown',1,10,10);f.pointer('pointermove',1,17,10);f.pointer('pointerup',1,17,10);assert.equal(f.taps.length,1);assert.ok(c.orbit.yaw<yaw);
  const before=c.orbit.dist,pitch=c.orbit.pitch,rot=c.orbit.yaw;
  f.pointer('pointerdown',1,100,100);f.pointer('pointerdown',2,200,100);f.pointer('pointermove',2,300,100);near(c.orbit.dist,before/2);near(c.orbit.pitch,pitch);near(c.orbit.yaw,rot);
  f.pointer('pointerup',2,300,100);f.pointer('pointermove',1,120,100);f.pointer('pointerup',1,120,100);assert.equal(f.taps.length,1);
  c.zoom(.0001);near(c.orbit.dist,20);f.pointer('pointerdown',1,100,100);f.pointer('pointerdown',2,300,100);f.pointer('pointermove',2,400,100);near(c.orbit.dist,20);f.pointer('pointermove',2,350,100);assert.ok(c.orbit.dist>20,'Pinch reversal responds immediately at the boundary');
  f.pointer('pointercancel',2,350,100);f.pointer('pointerup',1,100,100);assert.equal(f.taps.length,1);assert.equal(f.element.captures.size,0);
  f.pointer('pointerdown',1,10,10);f.eventTarget.dispatch('blur');f.pointer('pointerup',1,10,10);assert.equal(f.taps.length,1);c.dispose();
});

test('legacy room and elevator APIs cannot enter first person or animate a cabin in any allowed state',()=>{
  const f=fixture(),c=f.c,allowed=new Set(['ORBIT','SPOT','EXPLODED','FOCUS']);
  assert.equal(c.goRoom(0,'room-0'),false);assert.equal(c.goElevator(),false);f.start();
  for(const navigate of [()=>true,()=>c.goSpot('pool'),()=>c.goExploded(),()=>c.goFocus(2)]){
    assert.equal(navigate(),true);f.settle();const before=c.getCameraPose(),state=c.getState();
    for(const call of [()=>c.goElevator(),()=>c.ride(0),()=>c.ride(2),()=>c.leaveElevator(),()=>c.goRoom(99,'room-0'),()=>c.goRoom(0,'missing')])assert.equal(call(),false);
    assert.deepEqual(c.getCameraPose(),before);assert.equal(c.getState().name,state.name);assert.equal(c.fp,undefined);assert.equal(Object.hasOwn(c.getState(),'fp'),false);assert.equal(Object.hasOwn(c.getState(),'elevator'),false);near(c.camera.fov,42);
  }
  for(const floor of [0,1,2]){assert.equal(c.goRoom(floor,`room-${floor}`),true);f.settle();assert.equal(c.getState().name,'FOCUS');assert.equal(c.getState().controller,'orbit');assert.ok(c.camera.position.y>floor*3+3,'The focused camera stays above the room walls');}
  assert.ok(f.states.every(state=>allowed.has(state.name)&&state.controller!=='fp'));assert.equal(f.elevators.length,0,'No elevator frame callback may run');assert.equal(f.toasts.length,0);assert.equal(JSON.stringify(f.model),f.before);c.dispose();
});

test('all inputs remain locked during exterior camera transitions',()=>{
  const f=fixture(),c=f.c;f.start();c.goFocus(1);const state=c.getState(),pose=c.getCameraPose();
  for(const call of [()=>c.goOrbit(),()=>c.goSpot('pool'),()=>c.goExploded(),()=>c.goFocus(2),()=>c.goRoom(0,'room-0'),()=>c.goElevator(),()=>c.ride(2),()=>c.leaveElevator(),()=>c.look(100,100),()=>c.zoom(.5),()=>c.back()])assert.equal(call(),false);
  f.pointer('pointerdown',1,10,10);f.pointer('pointerup',1,10,10);f.eventTarget.dispatch('keydown',{key:'Escape'});assert.equal(f.taps.length,0);assert.equal(c.getState().name,state.name);assert.deepEqual(c.getCameraPose(),pose);f.settle();assert.equal(c.getState().locked,false);c.dispose();
});

test('Esc ignores active transitions and typing targets, then returns through exterior views',()=>{
  const f=fixture(),c=f.c;f.start();c.goFocus(0);f.eventTarget.dispatch('keydown',{key:'Escape'});assert.equal(c.getState().name,'FOCUS');f.settle();
  f.eventTarget.dispatch('keydown',{key:'Escape',target:{tagName:'INPUT'}});assert.equal(c.getState().name,'FOCUS');
  const event=f.eventTarget.dispatch('keydown',{key:'Escape'});assert.equal(event.defaultPrevented,true);assert.equal(c.getState().name,'EXPLODED');f.settle();f.eventTarget.dispatch('keydown',{key:'Escape'});assert.equal(c.getState().name,'ORBIT');c.dispose();
});

test('reduced motion completes exterior transitions in 10ms and disposal releases input listeners',()=>{
  const f=fixture({reducedMotion:true}),c=f.c;c.start();assert.equal(c.getState().locked,true);c.tick(.01);assert.equal(c.getState().locked,false);
  c.goExploded();c.tick(.01);assert.equal(c.getState().name,'EXPLODED');assert.equal(c.getState().locked,false);c.goFocus(1);c.tick(.01);assert.equal(c.getState().name,'FOCUS');assert.equal(c.getState().controller,'orbit');assert.equal(c.goElevator(),false);
  f.pointer('pointerdown',1,10,10);assert.equal(f.element.captures.size,1);assert.equal(f.element.style.touchAction,'none');c.dispose();assert.equal(f.element.captures.size,0);assert.equal(f.element.listenerCount,0);assert.equal(f.eventTarget.listenerCount,0);assert.equal(f.element.style.touchAction,'auto');assert.equal(c.start(),false);assert.equal(c.tick(.05),false);assert.equal(c.goOrbit(),false);c.dispose();
});

test('portrait framing includes all real estate corners and diagnostics cannot mutate the controller',()=>{
  const f=fixture(),c=f.c;f.start();c.resize(390,844);
  for(const x of [f.model.bounds.min.x,f.model.bounds.max.x])for(const y of [f.model.bounds.min.y,f.model.bounds.max.y])for(const z of [f.model.bounds.min.z,f.model.bounds.max.z]){
    const point=new THREE.Vector3(x,y,z).project(c.camera);assert.ok(Math.abs(point.x)<1&&Math.abs(point.y)<1,`Estate corner must fit: ${point.toArray()}`);
  }
  const yaw=c.orbit.yaw,state=c.getState();state.orbit.yaw=999;state.orbit.target.x=999;near(c.orbit.yaw,yaw);assert.notEqual(c.orbit.target.x,999);near(shareEase(.5),.5);near(shareEase(-1),0);near(shareEase(2),1);assert.equal(JSON.stringify(f.model),f.before);c.dispose();
});


test('room eye-height and cabin metadata do not affect exterior floor framing',()=>{
  const f=fixture({reducedMotion:true}),c=f.c;f.model.floors.forEach(row=>row.floorY=row.baseY+100);f.model.elevator.landings.forEach(row=>row.cabin.y-=100);
  c.start();c.tick(.01);c.goRoom(1,'room-1');c.tick(.01);near(c.orbit.target.y,4);near(c.orbit.pitch,.9);near(c.camera.fov,42);assert.equal(c.getState().name,'FOCUS');assert.equal(f.elevators.length,0);c.dispose();
});
