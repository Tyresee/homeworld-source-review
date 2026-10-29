import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createStudentHomeRobotController} from '../public/js/student-home-robot-controller.js';
import {createHomeState,applyChange} from '../public/js/home-engine.js';
import {isAvatarPositionWalkable} from '../public/js/home-avatar-navigation.js';
import {normalizeRobotActivity} from '../public/js/student-home-robot-state.js';
import {isOutdoorRobotPositionWalkable} from '../public/js/student-home-robot-swimming.js';

let source,oldDocument,oldRaf,oldCancel,frames,serial=0;
before(async()=>{
  const bytes=await readFile(new URL('../public/assets/asset-lab/robot-v1/models/v4/robot.glb',import.meta.url));
  source=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  oldDocument=globalThis.document;oldRaf=globalThis.requestAnimationFrame;oldCancel=globalThis.cancelAnimationFrame;
  globalThis.document=new EventTarget();document.hidden=false;frames=new Map();
  globalThis.requestAnimationFrame=callback=>{frames.set(++serial,callback);return serial;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
});
after(()=>{globalThis.document=oldDocument;globalThis.requestAnimationFrame=oldRaf;globalThis.cancelAnimationFrame=oldCancel;});
const distance=(a,b)=>Math.hypot(a.x-b.x,(a.y??0)-(b.y??0),a.z-b.z);
function actor(t,options={}){const c=createStudentHomeRobotController({source,parent:new THREE.Group(),requestRender(){},...options});t.after(()=>c.dispose());return c;}
function advance(count=1){for(let n=0;n<count&&frames.size;n++){const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback(performance.now()+50);}}
function until(c,condition,limit=2200){for(let n=0;n<limit;n++){if(condition(c.getState()))return;advance();}assert.fail(`Unsettled robot: ${JSON.stringify(c.getState())}`);}
function furnished(kind,rotation=0,x=0,z=0){const result=applyChange(createHomeState({profile:'account'}),{type:'furniture',id:'owned',kind,x,z,rotation});assert.equal(result.ok,true,result.error);return result.state;}
function pose(c){const r=c.group.getObjectByName('robot-avatar');return {state:c.getState(),rotation:r.rotation.y,joints:Object.fromEntries(['robot-runtime-pose','HipRoot','HipL','KneeL','ShoulderR'].map(name=>[name,r.getObjectByName(name).quaternion.clone()]))};}
function samePose(a,b){assert.ok(distance(a.state.point,b.state.point)<1e-7,`Position ${JSON.stringify(a.state.point)} vs ${JSON.stringify(b.state.point)}`);assert.ok(Math.abs(Math.atan2(Math.sin(a.rotation-b.rotation),Math.cos(a.rotation-b.rotation)))<1e-7);assert.equal(b.state.action,a.state.action);assert.equal(b.state.phase,a.state.phase);for(const name of Object.keys(a.joints))assert.ok(a.joints[name].angleTo(b.joints[name])<1e-6,`${name} restored at ${a.state.phase}`);}
function restore(t,home,activity,options={}){const c=actor(t,options);c.setWorld(home,activity?.storey??0,options.floors?{floors:options.floors}:{});if(options.outdoor)c.setOutdoorWorld(options.outdoor);c.setAvatar({activity,equipped:{}});return c;}

test('fresh v4 controller restores the exact free-floor point and yaw; blocked coordinates use a real safe spawn',t=>{
  const home=createHomeState({profile:'account'}),value={kind:'stand',environment:'interior',storey:0,point:{x:.6,z:.8},rotation:-1.217};
  const c=restore(t,home,value);assert.deepEqual(c.captureActivity({emit:false}),value);assert.equal(c.getState().point.y,.08);assert.equal(c.group.getObjectByName('robot-avatar').rotation.y,value.rotation);
  const blocked=furnished('cabinet');c.setWorld(blocked);c.setAvatar({activity:{...value,point:{x:0,z:0}}});assert.equal(isAvatarPositionWalkable(blocked,c.getState().point,c.getState().navigation),true);assert.notDeepEqual(c.getState().point,{x:0,y:.08,z:0});
});

test('walking departure captures its current position and heading before hide/reset, then resumes at that exact floor point',t=>{
  const events=[],home=createHomeState({profile:'account'}),c=restore(t,home,null,{onActivityChange:a=>events.push(a)});
  assert.equal(c.walk({x:1,z:.8}).ok,true);advance(5);const before=pose(c);assert.equal(before.state.action,'walk');
  c.setVisible(false);assert.equal(c.getState().scheduled,false);const saved=events.at(-1);assert.equal(saved.kind,'stand');assert.equal(saved.point.x,before.state.point.x);assert.equal(saved.point.z,before.state.point.z);assert.equal(saved.rotation,before.rotation);
  assert.deepEqual(c.captureActivity({emit:false}),saved,'hidden safe reset never overwrites departure');
  c.setVisible(true);assert.ok(distance(c.getState().point,before.state.point)<1e-8);assert.equal(c.group.getObjectByName('robot-avatar').rotation.y,before.rotation);
  const fresh=restore(t,home,saved);assert.deepEqual(fresh.getState().point,c.getState().point);
});

for(const[kind,id,action]of[['sofa','sit','sit'],['bdSmartToilet','toilet','sit'],['bedTimber','lie','lie'],['bookcase','read','read'],['rangeCooker','cook','cook'],['kitchenSink','wash','wash'],['mkDishwasher','dishwash','dishwash']])test(`${kind} restores its actual contact/action and timer in a fresh v4 controller`,t=>{
  const home=furnished(kind,90),c=restore(t,home,null);assert.equal(c.interact('furniture:owned',id).ok,true);until(c,s=>s.action===action&&!s.inTransition);if(!['sit','lie'].includes(action))advance(11);
  const initial=pose(c),saved=c.captureActivity({emit:false}),fresh=restore(t,home,saved);samePose(initial,pose(fresh));assert.equal(saved.kind,action==='lie'?'sleep':'furniture');
  if(['read','cook','wash','dishwash'].includes(action)){assert.ok(saved.remaining<5&&saved.remaining>0);until(fresh,s=>s.action==='idle');assert.equal(fresh.getState().scheduled,false);}
  else{assert.equal(fresh.getState().scheduled,false);fresh.stand();until(fresh,s=>s.action==='idle'&&!s.scheduled);assert.equal(isAvatarPositionWalkable(home,fresh.getState().point,fresh.getState().navigation),true);}
});

for(const phase of ['sit-down','leg-lift','bed-turn','lie-down'])test(`mid-bed ${phase} restores exact semantic progress and rig instead of becoming asleep`,t=>{
  const home=furnished('bedTimber',90),c=restore(t,home,null);c.interact('furniture:owned','lie');until(c,s=>s.phase===phase&&s.transitionProgress>.18);const before=pose(c),saved=c.captureActivity({emit:false});assert.equal(saved.kind,'furniture');assert.equal(saved.phase,'enter');
  const fresh=restore(t,home,saved);samePose(before,pose(fresh));const progress=fresh.getState().transitionProgress;fresh.setAvatar({activity:saved,equipped:{}});assert.equal(fresh.getState().transitionProgress,progress,'same ack does not restart alignment');
  c.setVisible(false);c.setVisible(true);samePose(before,pose(c));until(fresh,s=>s.action==='lie');
});

test('bed exit resumes exact reverse step and an older acknowledged checkpoint cannot reset its live progress',t=>{
  const events=[],home=furnished('bedTimber'),c=restore(t,home,{kind:'sleep',itemId:'owned',storey:0},{onActivityChange:a=>events.push(a)});c.stand();advance(4);const checkpoint=c.captureActivity();advance(5);const before=pose(c);c.setAvatar({activity:checkpoint});samePose(before,pose(c));
  const saved=c.captureActivity({emit:false}),fresh=restore(t,home,saved);assert.equal(saved.phase,'exit');samePose(before,pose(fresh));until(fresh,s=>s.action==='idle');assert.equal(fresh.getState().scheduled,false);assert.ok(events.every(a=>a!==null),'exit saves the reverse phase, never a fake clear');
});

function outdoorState(){return{home:createHomeState({profile:'account'}),owned:[{id:'pool',skuId:'outdoor-pool-1',status:'placed',item:{kind:'outdoor-pool-1',x:9,z:0,rotation:90}}]};}
for(const phase of ['pool-wade','swimming','pool-rise'])test(`outdoor ${phase} reloads at its semantic pool contact and continues`,t=>{
  const state=outdoorState(),c=restore(t,state.home,{kind:'stand',environment:'estate',storey:0,point:{x:0,z:4.6},rotation:.2},{outdoor:state});assert.equal(c.interact('outdoor:pool','swim').ok,true);
  until(c,s=>s.phase===(phase==='pool-rise'?'swimming':phase));advance(7);if(phase==='pool-rise'){c.stand();until(c,s=>s.phase==='pool-rise'&&s.transitionProgress>.2);}
  const before=pose(c),saved=c.captureActivity({emit:false}),fresh=restore(t,state.home,saved,{outdoor:state});samePose(before,pose(fresh));assert.equal(fresh.getState().environment,'estate');
  if(phase==='pool-rise'){until(fresh,s=>s.action==='idle');assert.equal(isOutdoorRobotPositionWalkable(state,fresh.getState().point,fresh.getState().navigation),true);}else{until(fresh,s=>s.action==='swim');advance(4);assert.equal(fresh.getState().scheduled,true);}
});

test('cancelling partial pool entry and reloading its exit never detours back into deep water',t=>{
  const state=outdoorState(),c=restore(t,state.home,{kind:'stand',environment:'estate',storey:0,point:{x:0,z:4.6},rotation:.2},{outdoor:state});c.interact('outdoor:pool','swim');until(c,s=>s.phase==='pool-edge'&&s.transitionProgress>.3);c.stand();advance(3);const saved=c.captureActivity({emit:false}),before=pose(c),fresh=restore(t,state.home,saved,{outdoor:state});assert.equal(saved.exitFrom.phase,'enter');samePose(before,pose(fresh));until(fresh,s=>s.action==='idle');assert.equal(fresh.getState().swimBlend,0);
});

function floorsFor(type='stairs'){const slab={rects:[{minX:-5,minZ:-5,width:10,depth:10}]},floors=[createHomeState({profile:'upper',slab}),createHomeState({profile:'upper',slab})];for(const [i,home]of floors.entries())home.stairs={id:'connection',x:0,z:0,rotation:90,direction:i?'down':'up',...(type==='elevator'?{type}: {})};return floors;}
for(const kind of ['stairs','elevator'])test(`${kind} resumes real intermediate height, feet/cabin phase and completes the original floor journey`,t=>{
  const floors=floorsFor(kind),c=restore(t,floors[0],null,{floors});c.useStairs('connection');until(c,s=>kind==='stairs'?s.stairStep?.treadIndex>=3:s.phase==='elevator-ride'&&s.transitionProgress>.35);
  const before=pose(c),saved=c.captureActivity({emit:false}),events=[];let fresh;fresh=restore(t,floors[0],saved,{floors,onStoreyChange:e=>{events.push(e);fresh.setWorld(floors[e.index],e.index,{floors,arrivalPoint:e.point});}});samePose(before,pose(fresh));assert.equal(saved.kind,kind);if(kind==='elevator')assert.deepEqual(fresh.getState().elevatorFrame,before.state.elevatorFrame);else assert.deepEqual(fresh.getState().stairStep,before.state.stairStep);
  until(fresh,s=>s.floor===1);assert.equal(events.length,1);assert.equal(fresh.getState().scheduled,false);assert.equal(fresh.getState().point.y,.08);
});

test('background, disposal and A/B binding capture departing semantics, clear account caches and never adopt another student pose',t=>{
  const events=[],home=furnished('sofa'),c=restore(t,home,null,{onActivityChange:a=>events.push(a)});c.interact('furniture:owned','sit');until(c,s=>s.action==='sit');const savedA=c.captureActivity({emit:false});
  document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert.equal(c.getState().scheduled,false);assert.deepEqual(events.at(-1),savedA);document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));assert.equal(c.getState().action,'sit');
  c.clearAccountBinding();assert.equal(c.getState().point,null);assert.equal(c.getState().activity,null);const homeB=createHomeState({profile:'account'});c.setWorld(homeB);c.setAvatar({activity:null});assert.equal(c.getState().action,'idle');assert.equal(c.getState().activity,null);
  c.walk({x:1,z:1});until(c,s=>s.action==='idle');const savedB=c.captureActivity({emit:false});c.clearAccountBinding();c.setWorld(home);c.setAvatar({activity:savedA});assert.equal(c.getState().action,'sit');assert.notDeepEqual(c.captureActivity({emit:false}),savedB);c.setAvatar({activity:null});assert.equal(c.getState().action,'idle','explicit legacy null clears resting contact');
  c.setAvatar({activity:savedA});c.dispose();assert.deepEqual(c.getState().activity,savedA);assert.equal(c.getState().scheduled,false);
});

test('moved/rotated furniture rebuilds contacts; removed furniture, unavailable floor connections and removed pools fall back safely',t=>{
  const home=furnished('sofa'),saved={kind:'furniture',action:'sit',itemId:'owned',storey:0},c=restore(t,home,saved),initial=c.getState().point,moved=furnished('sofa',90,.4,.2);c.setWorld(moved);assert.equal(c.getState().action,'sit');assert.ok(distance(initial,c.getState().point)>.2);assert.equal(c.group.getObjectByName('robot-avatar').rotation.y,Math.PI/2);
  const empty=createHomeState({profile:'account'});c.setWorld(empty);assert.equal(c.getState().action,'idle');assert.equal(isAvatarPositionWalkable(empty,c.getState().point,c.getState().navigation),true);
  const floors=floorsFor('elevator'),lift=restore(t,floors[0],null,{floors});lift.useStairs('connection');until(lift,s=>s.phase==='elevator-ride');const transit=lift.captureActivity({emit:false});const fallback=restore(t,empty,transit,{floors:[empty]});assert.equal(fallback.getState().action,'idle');assert.equal(fallback.getState().scheduled,false);
  const outdoors=outdoorState(),pool=restore(t,outdoors.home,{kind:'swim',itemId:'pool',storey:0,phase:'loop',time:3},{outdoor:outdoors});assert.equal(pool.getState().action,'swim');pool.setOutdoorWorld({...outdoors,owned:[]});assert.equal(pool.getState().action,'idle');assert.equal(pool.getState().scheduled,false);assert.equal(isOutdoorRobotPositionWalkable({...outdoors,owned:[]},pool.getState().point,pool.getState().navigation),true);
});

for(const [kind,id]of [['bookcase','read'],['rangeCooker','cook'],['kitchenSink','wash'],['mkDishwasher','dishwash']])test(`${id} preserves an alternate approach station and facing when loading a fresh scene`,t=>{
  const home=furnished(kind),c=restore(t,home,{kind:'stand',environment:'interior',storey:0,point:{x:-1.8,z:0},rotation:1.5});c.interact('furniture:owned',id);until(c,s=>s.action===id);advance(2);const saved=c.captureActivity({emit:false});assert.ok(Number.isSafeInteger(saved.approachIndex));assert.notEqual(saved.approachIndex,0);const fresh=restore(t,home,saved);samePose(pose(c),pose(fresh));
});

test('a cancelled bed entry remains a queued reverse action after reload',t=>{
  const home=furnished('bedTimber',90),c=restore(t,home,null);c.interact('furniture:owned','lie');until(c,s=>s.phase==='leg-lift');c.stand();const saved=c.captureActivity({emit:false});assert.equal(saved.exitRequested,true);const fresh=restore(t,home,saved);until(fresh,s=>s.action==='idle'&&!s.scheduled);assert.equal(fresh.getState().activity.kind,'stand');
});

test('an authoritative activity survives world and outdoor assets arriving after avatar hydration',t=>{
  const state=outdoorState(),saved={kind:'swim',itemId:'pool',storey:0,phase:'loop',time:12,loopTime:3},c=actor(t);c.setAvatar({activity:saved,equipped:{}});c.setWorld(state.home);assert.equal(c.getState().scheduled,false);c.setOutdoorWorld(state);assert.equal(c.getState().action,'swim');assert.equal(c.getState().environment,'estate');const reference=restore(t,state.home,saved,{outdoor:state});samePose(pose(reference),pose(c));
});

test('a greeting restores its remaining animation time and stops the same controller clock when finished',t=>{
  const home=createHomeState({profile:'account'}),c=restore(t,home,null);c.wave();advance(6);const before=pose(c),saved=c.captureActivity({emit:false}),fresh=restore(t,home,saved);assert.equal(saved.kind,'stand');assert.equal(saved.action,'wave');assert.ok(saved.remaining>0&&saved.remaining<1.9);samePose(before,pose(fresh));until(fresh,s=>s.action==='idle'&&!s.scheduled);assert.equal(fresh.getState().activity.kind,'stand');
});

test('many normalized acknowledgement copies never cancel a live walk or its pending furniture action',t=>{
  const home=furnished('sofa'),events=[];let c;
  c=restore(t,home,{kind:'stand',environment:'interior',storey:0,point:{x:0,z:1.65},rotation:-0.07162831250184709},{onActivityChange:value=>{
    events.push(value);let acknowledgement=value;for(let n=0;n<15;n++)acknowledgement=normalizeRobotActivity(acknowledgement);c.setAvatar({activity:acknowledgement,equipped:{}});
  }});
  assert.equal(c.interact('furniture:owned','sit').ok,true);assert.equal(c.getState().action,'walk');advance(3);assert.equal(c.getState().action,'walk');
  c.captureActivity();assert.equal(c.getState().action,'walk','an automatic checkpoint acknowledgement retains the route');until(c,s=>s.action==='sit');assert.equal(events.at(-1).action,'sit');
});

test('a swim running past a day preserves its pose and lap position using bounded periodic clocks',t=>{
  const state=outdoorState(),long={kind:'swim',itemId:'pool',storey:0,phase:'loop',time:86399.98,loopTime:86399.98},c=restore(t,state.home,long,{outdoor:state});
  const duration=c.interactions('outdoor:pool')[0].pool.loop.duration,saved=c.captureActivity({emit:false});assert.equal(saved.kind,'swim');assert.ok(saved.time<100);assert.ok(saved.loopTime<duration);
  const initial=pose(c);advance(2);const after=pose(c);assert.ok(distance(initial.state.point,after.state.point)<.2);for(const name of Object.keys(initial.joints))assert.ok(initial.joints[name].angleTo(after.joints[name])<.7);
  const continued=c.captureActivity({emit:false});assert.equal(continued.kind,'swim');assert.ok(continued.time<100&&continued.loopTime<duration);const fresh=restore(t,state.home,continued,{outdoor:state});samePose(after,pose(fresh));
  c.stand();advance(2);const exit=c.captureActivity({emit:false});assert.equal(exit.kind,'swim');assert.equal(exit.phase,'exit');assert.ok(exit.time<86400&&exit.exitFrom.time<duration);
});

test('swim rig and lap clocks wrap without a visible jump or a null checkpoint',t=>{
  const state=outdoorState(),probe=restore(t,state.home,{kind:'swim',itemId:'pool',storey:0,phase:'loop'},{outdoor:state}),duration=probe.interactions('outdoor:pool')[0].pool.loop.duration;probe.setVisible(false);
  const c=restore(t,state.home,{kind:'swim',itemId:'pool',storey:0,phase:'loop',time:99.98,loopTime:duration-.02},{outdoor:state}),before=pose(c);advance();const after=pose(c),saved=c.captureActivity({emit:false});assert.equal(saved.kind,'swim');assert.ok(saved.time<.1&&saved.loopTime<.1);assert.ok(distance(before.state.point,after.state.point)<.1);for(const name of Object.keys(before.joints))assert.ok(before.joints[name].angleTo(after.joints[name])<.7);samePose(after,pose(restore(t,state.home,saved,{outdoor:state})));
});
