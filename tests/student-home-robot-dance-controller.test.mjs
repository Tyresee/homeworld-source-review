import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createStudentHomeRobotController} from '../public/js/student-home-robot-controller.js';
import {createHomeState,applyChange} from '../public/js/home-engine.js';
import {DANCE_PERIOD,DANCE_CLEARANCE_RADIUS} from '../public/js/student-home-robot-dance.js';
import {isAvatarPositionWalkable} from '../public/js/home-avatar-navigation.js';
import {isRobotActivityShape,normalizeRobotActivity} from '../public/js/student-home-robot-state.js';
import {isRobotActivityTargetValid,prepareRobotActivityCommand,reconcileRobotActivityDetail} from '../server/student-homes/robot-activity.mjs';

let source,priorDocument,priorRaf,priorCancel,frames,serial=0;
before(async()=>{
  const bytes=await readFile(new URL('../public/assets/asset-lab/robot-v1/models/v4/robot.glb',import.meta.url));
  source=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  priorDocument=globalThis.document;priorRaf=globalThis.requestAnimationFrame;priorCancel=globalThis.cancelAnimationFrame;
  globalThis.document=new EventTarget();document.hidden=false;frames=new Map();
  globalThis.requestAnimationFrame=fn=>{frames.set(++serial,fn);return serial;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
});
after(()=>{globalThis.document=priorDocument;globalThis.requestAnimationFrame=priorRaf;globalThis.cancelAnimationFrame=priorCancel;});
const empty=()=>createHomeState({profile:'account'});
const record=home=>({home:{commerce:{home,upperFloors:[],owned:[]}},operations:[]});
const dance=(point={x:0,z:0},extra={})=>({kind:'dance',storey:0,point,rotation:.4,time:2.15,blend:1,...extra});
function actor(t,home=empty(),activity=null,options={}){const c=createStudentHomeRobotController({source,parent:new THREE.Group(),requestRender(){},...options});t.after(()=>c.dispose());c.setWorld(home);c.setAvatar({activity,equipped:{}});return c;}
function advance(n=1){for(let i=0;i<n&&frames.size;i++){const callbacks=[...frames.values()];frames.clear();for(const fn of callbacks)fn(performance.now()+50);}}
function until(c,condition,limit=1200){for(let n=0;n<limit;n++){if(condition(c.getState()))return;advance();}assert.fail(JSON.stringify(c.getState()));}
const joints=c=>['HipRoot','HipL','KneeL','ShoulderR','ElbowR'].map(name=>c.group.getObjectByName(name).quaternion.clone());

test('stage dance stays at the current clear position, loops on one clock and stops with a smooth return',t=>{
  const c=actor(t),start={...c.getState().point};assert.equal(c.dance().ok,true);
  assert.deepEqual(c.getState().point,start,'a valid current position never searches for a different stage');
  until(c,s=>s.action==='dance');advance(18);
  const stage=c.getStageState();assert.equal(stage.active,true);assert.equal(stage.intensity,1);
  assert.equal(isAvatarPositionWalkable(empty(),stage.point,{...c.getState().navigation,radius:DANCE_CLEARANCE_RADIUS}),true);
  const root={...c.getState().point},before=joints(c);advance(20);assert.deepEqual(c.getState().point,root);
  assert.ok(before.some((q,i)=>q.angleTo(joints(c)[i])>.1),'dance moves the rig, not just the spotlight');
  c.stand();assert.equal(c.getStageState().active,true);assert.equal(c.captureActivity({emit:false}).exitRequested,true);
  advance(3);assert.ok(c.getStageState().intensity>0&&c.getStageState().intensity<1);
  until(c,s=>s.action==='idle'&&!s.scheduled);assert.equal(c.getStageState().active,false);assert.equal(c.captureActivity({emit:false}).kind,'stand');
});

test('refresh and returning from another student restore exact dance pose and stage phase without crossing identities',t=>{
  const events=[],c=actor(t,empty(),dance(),{onActivityChange:a=>events.push(a)});advance(6);
  const saved=c.captureActivity({emit:false}),pose=joints(c),fresh=actor(t,empty(),saved);
  assert.deepEqual(fresh.captureActivity({emit:false}),saved);for(let i=0;i<pose.length;i++)assert.ok(pose[i].angleTo(joints(fresh)[i])<1e-6);
  c.setVisible(false);assert.equal(c.getStageState().active,false);assert.equal(c.getState().scheduled,false);assert.deepEqual(c.captureActivity({emit:false}),saved);
  c.setVisible(true);assert.equal(c.getStageState().active,true);assert.deepEqual(c.captureActivity({emit:false}),saved);
  c.clearAccountBinding();assert.equal(c.getStageState().active,false);assert.equal(c.getState().activity,null);c.setWorld(empty());c.setAvatar({activity:null});assert.equal(c.getState().action,'idle');
  c.clearAccountBinding();c.setWorld(empty());c.setAvatar({activity:saved});assert.equal(c.getState().action,'dance');
  document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert.equal(c.getStageState().active,false);assert.equal(c.getState().scheduled,false);
  document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));assert.equal(c.getStageState().active,true);
});

test('the second half of the longer choreography restores its pose and keeps the teacher-selected stage point',t=>{
  const selected={x:.3,z:-.2},checkpoint=dance(selected,{time:12.35}),c=actor(t,empty(),checkpoint);
  assert.ok(DANCE_PERIOD>checkpoint.time,'the complete choreography must remain available beyond eight seconds');
  assert.deepEqual(c.captureActivity({emit:false}),checkpoint);
  const before=joints(c),fresh=actor(t,empty(),c.captureActivity({emit:false}));
  for(let i=0;i<before.length;i++)assert.ok(before[i].angleTo(joints(fresh)[i])<1e-6);
  advance(10);assert.deepEqual(c.captureActivity({emit:false}).point,selected);assert.ok(c.captureActivity({emit:false}).time>12.35);
});

test('stopping mid-spin freezes that pose phase while blending gently back to standing',t=>{
  const c=actor(t,empty(),dance(undefined,{time:12.15}));c.stopDance();advance(4);
  const checkpoint=c.captureActivity({emit:false});assert.equal(checkpoint.time,12.15);
  assert.equal(checkpoint.exitRequested,true);assert.ok(checkpoint.blend>0&&checkpoint.blend<1);
  const fresh=actor(t,empty(),checkpoint);assert.deepEqual(fresh.captureActivity({emit:false}),checkpoint);
  until(c,s=>s.action==='idle'&&!s.scheduled);assert.equal(c.getStageState().active,false);
});

test('changing views, ordinary actions and explicit cleared state remove the stage and release its clock',t=>{
  const c=actor(t,empty(),dance());c.wave();assert.equal(c.getState().action,'dance');until(c,s=>s.action==='wave');assert.equal(c.getStageState().active,false);until(c,s=>!s.scheduled);
  c.setAvatar({activity:dance()});c.walk({x:.7,z:.7});until(c,s=>s.action==='walk');assert.equal(c.getStageState().active,false);until(c,s=>!s.scheduled);
  c.setAvatar({activity:dance()});c.setAvatar({activity:null});assert.equal(c.getStageState().active,false);assert.equal(c.getState().scheduled,false);
  c.setAvatar({activity:dance()});c.setOutdoorWorld({home:empty(),owned:[]});c.setEnvironment('estate');assert.equal(c.getStageState().active,false);assert.equal(c.getState().scheduled,false);assert.equal(c.dance().ok,false);
  c.setEnvironment('interior');c.setAvatar({activity:dance()});c.dispose();assert.equal(c.getStageState().active,false);assert.equal(c.getState().scheduled,false);
});

test('an in-progress fade out and loop boundary restore exactly and never serialize an invalid timer',t=>{
  const c=actor(t,empty(),dance(undefined,{time:DANCE_PERIOD-.02}));advance();const saved=c.captureActivity({emit:false});assert.ok(saved.time<.1);assert.equal(isRobotActivityShape(saved),true);
  c.stand();advance(3);const exit=c.captureActivity({emit:false}),fresh=actor(t,empty(),exit);assert.equal(exit.exitRequested,true);assert.deepEqual(fresh.captureActivity({emit:false}),exit);until(fresh,s=>!s.scheduled);assert.equal(fresh.getStageState().active,false);
});

test('pending stage requests toggle off while walking and rapid re-requests do not reset or revive the route',t=>{
  const c=actor(t,empty(),{kind:'stand',environment:'interior',storey:0,point:{x:0,z:2},rotation:0});
  assert.equal(c.dance({point:{x:0,z:0}}).ok,true);assert.equal(c.getState().action,'walk');assert.equal(c.getStageState().requested,true);assert.equal(c.getStageState().active,false);
  advance(2);const walked={...c.getState().point};assert.equal(c.dance().ok,true);assert.deepEqual(c.getState().point,walked);
  c.stopDance();assert.equal(c.getStageState().requested,false);assert.equal(c.getState().action,'idle');assert.equal(c.getState().scheduled,false);advance(20);assert.equal(c.getState().action,'idle');
  c.dance({point:{x:0,z:0}});c.wave();assert.equal(c.getStageState().requested,false);assert.equal(c.getState().action,'wave');until(c,s=>!s.scheduled);assert.equal(c.getState().action,'idle');
});

test('cancel queued dance preserves an existing sofa exit and removes only its deferred stage callback',t=>{
  const home=applyChange(empty(),{type:'furniture',id:'sofa',kind:'sofa',x:0,z:0,rotation:0});assert.equal(home.ok,true);const c=actor(t,home.state);
  c.interact('furniture:sofa','sit');until(c,s=>s.action==='sit');assert.equal(c.dance({point:{x:0,z:1.5}}).ok,true);assert.equal(c.getStageState().requested,true);assert.equal(c.getState().action,'exiting');
  advance(3);const before=joints(c);c.stopDance();assert.equal(c.getStageState().requested,false);assert.equal(c.getState().action,'exiting');for(let i=0;i<before.length;i++)assert.ok(before[i].angleTo(joints(c)[i])<1e-6);
  until(c,s=>!s.scheduled);assert.equal(c.getState().action,'idle');assert.equal(c.getStageState().requested,false);
  // A non-stage stop call must not cancel unrelated ordinary walking.
  c.walk({x:1.7,z:1.7});assert.equal(c.getState().action,'walk');c.stopDance();assert.equal(c.getState().action,'walk');until(c,s=>!s.scheduled);
});

test('a stage queued after cushion work survives its completion reset, while cancelling preserves the original task',t=>{
  const built=applyChange(empty(),{type:'furniture',id:'sofa',kind:'sofa',x:0,z:0,rotation:0});assert.equal(built.ok,true);const c=actor(t,built.state);
  c.interact('furniture:sofa','tidy');until(c,s=>s.action==='tidy');advance(5);c.dance({point:{x:0,z:1.5}});assert.equal(c.getStageState().requested,true);assert.equal(c.getState().action,'tidy');until(c,s=>s.action==='dance');assert.equal(c.getStageState().requested,true);
  c.stopDance();until(c,s=>!s.scheduled);c.interact('furniture:sofa','tidy');until(c,s=>s.action==='tidy');c.dance({point:{x:0,z:1.5}});c.stopDance();assert.equal(c.getState().action,'tidy');until(c,s=>!s.scheduled);assert.equal(c.getState().action,'idle');assert.equal(c.getStageState().requested,false);
});

test('an invalid current or selected dance location reports an error without moving or searching for another place',t=>{
  const c=actor(t,empty(),{kind:'stand',environment:'interior',storey:0,point:{x:0,z:2},rotation:0}),before=c.getState();
  for(const options of[undefined,{point:{x:100,z:0}},{point:{x:NaN,z:0}}]){
    const result=c.dance(options);assert.equal(result.ok,false);assert.match(result.error,/[A-Za-z]/);
    assert.deepEqual(c.getState().point,before.point);assert.equal(c.getState().action,'idle');assert.equal(c.getStageState().requested,false);assert.equal(c.getState().scheduled,false);
  }
});

test('a clear but unreachable selected point is rejected without changing the robot position',t=>{
  const home=createHomeState({profile:'upper',slab:{rects:[{minX:-4,minZ:-4,width:8,depth:8}]}});
  home.slab={rects:[{minX:-3,minZ:-2,width:2,depth:4},{minX:-.98,minZ:-2,width:3.98,depth:4}]};
  const c=actor(t,home,{kind:'stand',environment:'interior',storey:0,point:{x:-2,z:0},rotation:0}),before={...c.getState().point};
  assert.ok(isAvatarPositionWalkable(home,{x:2,z:0},{...c.getState().navigation,radius:DANCE_CLEARANCE_RADIUS}));
  const result=c.dance({point:{x:2,z:0},facing:.7});assert.equal(result.ok,false);assert.equal(result.reason,'no-path');assert.deepEqual(c.getState().point,before);assert.equal(c.getStageState().requested,false);
});

test('dance preserves the destination of ordinary clicked walking and faces the camera only after arrival',t=>{
  const c=actor(t,empty(),{kind:'stand',environment:'interior',storey:0,point:{x:-1,z:1},rotation:0}),target={x:1,z:-1},facing=.7;
  assert.equal(c.walk(target).ok,true);advance(3);const moving={...c.getState().point};assert.equal(c.dance({facing}).ok,true);assert.deepEqual(c.getState().point,moving);
  until(c,s=>s.action==='dance-turn');const arrived=c.getState().point;assert.ok(Math.hypot(arrived.x-target.x,arrived.z-target.z)<1e-9);
  assert.equal(c.getStageState().active,false);assert.equal(c.getStageState().requested,true);
  const before=c.captureActivity({emit:false}).rotation;advance(3);const after=c.captureActivity({emit:false}).rotation;
  assert.ok(Math.abs(after-before)>.01&&Math.abs(after-before)<1,'turning is gradual, not an instantaneous reversal');
  until(c,s=>s.action==='dance');assert.ok(Math.abs(c.captureActivity({emit:false}).rotation-facing)<1e-9);assert.deepEqual(c.getState().point,arrived);assert.equal(c.getStageState().active,true);
});

test('an unstarted saved dance waits for its initial facing without changing its phase',t=>{
  const c=actor(t,empty(),dance(undefined,{rotation:-2.4,blend:0})),saved=c.captureActivity({emit:false});
  assert.equal(c.setDanceFacing(.7),true);assert.equal(c.getStageState().active,false);assert.equal(c.getState().action,'dance-turn');
  assert.equal(c.captureActivity({emit:false}).rotation,saved.rotation);advance(3);
  assert.equal(c.captureActivity({emit:false}).time,saved.time);const partial=c.captureActivity({emit:false}).rotation;assert.notEqual(partial,saved.rotation);
  for(let i=0;i<30&&c.getState().action!=='dance';i++){c.setDanceFacing(.7);advance();}
  assert.equal(c.getState().action,'dance','same-facing requests cannot restart the turn indefinitely');assert.equal(c.captureActivity({emit:false}).time,saved.time);assert.deepEqual(c.captureActivity({emit:false}).point,saved.point);assert.ok(Math.abs(c.captureActivity({emit:false}).rotation-.7)<1e-9);
});

test('following a changed camera keeps an established dance moving and its stage continuously illuminated',t=>{
  const c=actor(t,empty(),dance(undefined,{rotation:-2.4})),saved=c.captureActivity({emit:false}),before=joints(c);
  assert.equal(c.setDanceFacing(.7),true);assert.equal(c.captureActivity({emit:false}).rotation,saved.rotation);
  let previous=saved.time;
  for(let i=0;i<25;i++){
    c.setDanceFacing(.7);advance();const stage=c.getStageState(),activity=c.captureActivity({emit:false});
    assert.equal(stage.active,true,'camera-facing correction must never restore the room daylight');
    assert.equal(stage.intensity,1);assert.equal(stage.requested,true);assert.deepEqual(stage.point,{...saved.point,y:.08});
    assert.ok(activity.time>previous,'the established choreography keeps advancing during the turn');previous=activity.time;
    assert.equal(c.getState().action,'dance');
  }
  assert.ok(Math.abs(c.captureActivity({emit:false}).rotation-.7)<1e-9,'same-facing calls must not delay the smooth correction');
  assert.ok(before.some((q,i)=>q.angleTo(joints(c)[i])>.1),'the actual rig, not just the saved timer, keeps dancing');
  assert.deepEqual(c.captureActivity({emit:false}).point,saved.point);
});

test('facing correction during fade-in keeps lighting continuous and holds the pose until fully blended',t=>{
  const c=actor(t,empty(),dance(undefined,{rotation:-1.7,blend:.35})),time=c.captureActivity({emit:false}).time;
  c.setDanceFacing(.7);advance(3);const stage=c.getStageState();
  assert.equal(stage.active,true);assert.ok(stage.intensity>.35);assert.equal(stage.time,time);assert.deepEqual(stage.point,{x:0,y:.08,z:0});
  advance(20);assert.ok(c.getStageState().time>time);
});

test('a partially blended spin resumes across its half-turn without reversing the real torso',t=>{
  const c=actor(t,empty(),dance(undefined,{time:12.22,blend:.5})),torso=c.group.getObjectByName('Torso');
  let previous=null;
  for(let i=0;i<26;i++){
    c.group.updateWorldMatrix(true,true);const rotation=torso.getWorldQuaternion(new THREE.Quaternion());
    if(previous)assert.ok(previous.angleTo(rotation)<.8,'restoring a partial spin must not snap half a circle');
    previous=rotation;const checkpoint=c.captureActivity({emit:false});
    if(checkpoint.blend<1)assert.equal(checkpoint.time,12.22);
    advance();
  }
  assert.ok(c.captureActivity({emit:false}).time>12.22);
});

test('retargeting a live dance finishes its pose before walking to the exact new point',t=>{
  const c=actor(t,empty(),dance()),target={x:1,z:1},before={...c.getState().point};
  assert.equal(c.dance({point:target,facing:.6}).ok,true);assert.equal(c.getState().action,'dance');assert.deepEqual(c.getState().point,before);assert.equal(c.getState().dance.exitRequested,true);
  advance(3);assert.deepEqual(c.getState().point,before);assert.ok(c.getState().dance.blend<1&&c.getState().dance.blend>0);
  until(c,s=>s.action==='walk');until(c,s=>s.action==='dance');const final=c.captureActivity({emit:false});assert.ok(Math.hypot(final.point.x-target.x,final.point.z-target.z)<1e-9);assert.ok(Math.abs(final.rotation-.6)<1e-9);
});

test('cancel, furniture actions and account replacement cannot resurrect a pending turn or retarget',t=>{
  const built=applyChange(empty(),{type:'furniture',id:'sofa',kind:'sofa',x:0,z:0,rotation:0});assert.equal(built.ok,true);
  const c=actor(t,built.state,dance({x:0,z:1.5},{rotation:-2}));c.setDanceFacing(.7);c.stopDance();until(c,s=>!s.scheduled);assert.equal(c.getStageState().requested,false);
  assert.equal(c.dance({facing:-2}).ok,true);assert.equal(c.interact('furniture:sofa','sit').ok,true);until(c,s=>s.action==='sit');advance(30);assert.equal(c.getStageState().requested,false);
  c.setAvatar({activity:dance({x:0,z:1.5})});c.dance({point:{x:1.5,z:1.5},facing:.7});c.clearAccountBinding();c.setWorld(empty());c.setAvatar({activity:null});advance(60);assert.equal(c.getState().action,'idle');assert.equal(c.getStageState().requested,false);assert.equal(c.setDanceFacing(.7),false);
});

test('server validates clear dance footprint, closed shape and zero-cost ownership-scoped checkpoints',()=>{
  const a=dance(),r=record(empty());assert.equal(isRobotActivityShape(a),true);assert.deepEqual(normalizeRobotActivity(a),a);assert.equal(isRobotActivityTargetValid(r.home,a),true);
  const prepared=prepareRobotActivityCommand(r,{type:'setRobotActivity',activity:a});assert.equal(prepared.amount,0);assert.deepEqual(prepared.detail.robotActivity,a);assert.deepEqual(prepared.commerce,r.home.commerce);
  for(const bad of [{...a,time:DANCE_PERIOD+.01},{...a,blend:1.01},{...a,point:{x:0,z:0,y:2}},{...a,environment:'estate'},{...a,studentId:'someone-else'},{...a,exitRequested:false}])assert.equal(isRobotActivityShape(bad),false);
  for(const bad of [{...a,storey:1},{...a,point:{x:100,z:0}},{...a,point:{x:0,z:2.3}}])assert.equal(isRobotActivityTargetValid(r.home,bad),false);
  r.operations=[{receipt:{detail:{robotActivity:a}}}];const blocked=applyChange(empty(),{type:'furniture',id:'cabinet',kind:'cabinet',x:0,z:0,rotation:0});assert.equal(blocked.ok,true);const next=record(blocked.state).home;
  assert.equal(isRobotActivityTargetValid(next,a),false);assert.equal(reconcileRobotActivityDetail(r,next).robotActivity,null);
});
