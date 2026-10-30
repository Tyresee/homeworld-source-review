import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createStudentHomeRobotController} from '../public/js/student-home-robot-controller.js';
import {createHomeState,applyChange} from '../public/js/home-engine.js';

let source,priorDocument,priorRaf,priorCancel,priorPerformance,now=1000,serial=0;
const frames=new Map();
before(async()=>{
  const bytes=await readFile(new URL('../public/assets/asset-lab/robot-v1/models/v4/robot.glb',import.meta.url));
  source=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  priorDocument=globalThis.document;priorRaf=globalThis.requestAnimationFrame;priorCancel=globalThis.cancelAnimationFrame;priorPerformance=globalThis.performance;
  globalThis.document=new EventTarget();document.hidden=false;globalThis.performance={now:()=>now};
  globalThis.requestAnimationFrame=callback=>{frames.set(++serial,callback);return serial;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
});
after(()=>{globalThis.document=priorDocument;globalThis.requestAnimationFrame=priorRaf;globalThis.cancelAnimationFrame=priorCancel;globalThis.performance=priorPerformance;});
function advance(count=1,ms=50){for(let i=0;i<count;i++){now+=ms;const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback(now);}}
function until(controller,predicate,limit=1000){for(let i=0;i<limit;i++){if(predicate(controller.getState()))return;advance();}assert.fail(JSON.stringify(controller.getState()));}
function furnished(kind){const result=applyChange(createHomeState({profile:'account'}),{type:'furniture',id:'owned',kind,x:0,z:0,rotation:0});assert.equal(result.ok,true,result.error);return result.state;}
function actor(t,{home=createHomeState({profile:'account'}),activity=null}={}) {
  document.hidden=false;frames.clear();const events={activity:[],objects:[],presentation:[],storey:[],render:0};
  const controller=createStudentHomeRobotController({source,parent:new THREE.Group(),requestRender:()=>events.render++,onActivityChange:value=>events.activity.push(value),onObjectAction:value=>events.objects.push(value),onObjectPresentation:value=>events.presentation.push(value),onStoreyChange:value=>events.storey.push(value)});
  t.after(()=>controller.dispose());controller.setWorld(home);controller.setAvatar({activity,equipped:{}});
  const clear=()=>{events.activity.length=events.objects.length=events.presentation.length=events.storey.length=0;events.render=0;};clear();return {controller,events,clear};
}
function pose(controller) {const result=[];controller.group.getObjectByName('robot-avatar').traverse(node=>result.push([node.name,node.position.toArray(),node.quaternion.toArray(),node.scale.toArray(),node.visible]));return result;}
function semantic(controller) {return controller.captureActivity({emit:false});}
function noCallbacks(events){assert.deepEqual(events.activity,[]);assert.deepEqual(events.objects,[]);assert.deepEqual(events.presentation,[]);assert.deepEqual(events.storey,[]);assert.equal(events.render,0);}

for(const[kind,activity,action]of[
  ['bedTimber',{kind:'sleep',itemId:'owned',storey:0},'lie'],
  ['sofa',{kind:'furniture',action:'sit',itemId:'owned',storey:0},'sit'],
])test(`presentation freeze preserves a resting ${action} rig and semantic contact without checkpointing`,t=>{
  const {controller:c,events}=actor(t,{home:furnished(kind),activity}),before=pose(c),saved=semantic(c),point=c.getState().point;
  assert.equal(c.getState().action,action);assert.equal(c.getState().presentationPaused,false);assert.equal(c.getState().scheduled,false);
  c.setPresentationPaused(true);now+=600000;document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));advance(4);
  assert.equal(c.getState().presentationPaused,true);assert.deepEqual(pose(c),before);assert.deepEqual(semantic(c),saved);assert.deepEqual(c.getState().point,point);noCallbacks(events);
  c.setPresentationPaused(false);assert.equal(c.getState().scheduled,false,'a resting pose does not acquire a new RAF loop');assert.deepEqual(pose(c),before);assert.deepEqual(semantic(c),saved);noCallbacks(events);
});

test('a mid-entry bed sequence survives freeze, stale RAF and background events and resumes from its exact step',t=>{
  const {controller:c,events,clear}=actor(t,{home:furnished('bedTimber')});assert.equal(c.interact('furniture:owned','lie').ok,true);
  until(c,state=>state.inTransition&&state.transitionProgress>.18&&state.transitionProgress<.7);
  const before=pose(c),saved=semantic(c),state=c.getState(),stale=[...frames.values()][0];clear();assert.ok(stale);
  c.setPresentationPaused(true);c.setPresentationPaused(true);assert.equal(frames.size,0);now+=900000;stale(now);
  document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));advance(3);
  assert.deepEqual(pose(c),before);assert.deepEqual(semantic(c),saved);assert.equal(c.getState().phase,state.phase);assert.equal(c.getState().transitionProgress,state.transitionProgress);noCallbacks(events);
  c.setPresentationPaused(false);assert.equal(c.getState().scheduled,true);assert.deepEqual(pose(c),before);assert.deepEqual(semantic(c),saved);noCallbacks(events);
  advance(1,0);assert.deepEqual(pose(c),before,'resuming at the same clock instant consumes no hidden elapsed time');
  advance();assert.equal(c.getState().phase,state.phase);assert.ok(c.getState().transitionProgress>state.transitionProgress);until(c,value=>value.action==='lie'&&!value.inTransition);assert.equal(c.getState().scheduled,false);
});

test('dance freezes exact choreography and blend, then continues instead of restarting or cancelling',t=>{
  const activity={kind:'dance',storey:0,point:{x:0,z:0},rotation:.4,time:2.15,blend:1}, {controller:c,events,clear}=actor(t,{activity});advance(7);
  const before=pose(c),saved=semantic(c),dance=c.getState().dance;clear();c.setPresentationPaused(true);now+=300000;advance(10);
  assert.deepEqual(c.getState().dance,dance);assert.deepEqual(pose(c),before);assert.deepEqual(semantic(c),saved);assert.equal(c.getStageState().active,true);noCallbacks(events);
  c.setPresentationPaused(false);assert.deepEqual(c.getState().dance,dance);assert.deepEqual(pose(c),before);noCallbacks(events);advance(1,0);assert.deepEqual(c.getState().dance,dance);advance();
  assert.ok(c.getState().dance.time>dance.time);assert.equal(c.getState().dance.blend,dance.blend);assert.equal(c.getState().action,'dance');
});

test('presentation-only visibility changes cannot reset a live surface action or publish object commands',t=>{
  const {controller:c,events,clear}=actor(t,{home:furnished('sofa')});assert.equal(c.interact('furniture:owned','tidy').ok,true);until(c,state=>state.action==='tidy');advance(3);
  const before=pose(c),saved=semantic(c);clear();c.setPresentationPaused(true);c.setVisible(false);c.setVisible(true);
  assert.equal(c.getState().action,'tidy');assert.deepEqual(pose(c),before);assert.deepEqual(semantic(c),saved);noCallbacks(events);
  c.setPresentationPaused(false);assert.equal(c.getState().scheduled,true);noCallbacks(events);advance();assert.equal(c.getState().action,'tidy');assert.ok(events.presentation.length>0,'normal object presentation continues only after motion resumes');
});

test('resuming while hidden defers RAF without discarding the exact action, then schedules on return',t=>{
  const {controller:c,events,clear}=actor(t);assert.equal(c.wave(),true);advance(4);const before=pose(c),saved=semantic(c);clear();c.setPresentationPaused(true);
  document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));c.setPresentationPaused(false);assert.equal(c.getState().scheduled,false);assert.deepEqual(semantic(c),saved);assert.deepEqual(pose(c),before);noCallbacks(events);
  document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));assert.equal(c.getState().scheduled,true);assert.deepEqual(semantic(c),saved);assert.deepEqual(pose(c),before);noCallbacks(events);advance(1,0);assert.deepEqual(pose(c),before);advance();assert.notDeepEqual(pose(c),before);
});

test('ordinary account visibility pause still checkpoints and safely rebuilds the resting activity',t=>{
  const {controller:c,events}=actor(t,{home:furnished('bedTimber'),activity:{kind:'sleep',itemId:'owned',storey:0}});assert.equal(c.getState().presentationPaused,false);c.setVisible(false);
  assert.equal(c.getState().action,'idle');assert.equal(c.getState().scheduled,false);c.setVisible(true);assert.equal(c.getState().action,'lie');assert.equal(c.getState().presentationPaused,false);assert.equal(c.getState().scheduled,false);assert.ok(events.render>0);
});
