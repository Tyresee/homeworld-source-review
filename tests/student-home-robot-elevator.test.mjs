import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createHomeState,createFurnitureItem,applyChange} from '../public/js/home-engine.js';
import {FLOOR_Y,STOREY_HEIGHT,STAIR_DEPTH,ELEVATOR_DOOR_CLEAR_WIDTH,ELEVATOR_CABIN_CLEAR_HEIGHT} from '../public/js/home-staircase-shape.js';
import {isAvatarPositionWalkable} from '../public/js/home-avatar-navigation.js';
import {createRobotAvatar,poseRobotTransition,disposeRobotAvatar} from '../public/js/robot-avatar.js';
import {planRobotElevator,createRobotElevatorMotion,sampleRobotElevatorMotion} from '../public/js/student-home-robot-elevator.js';

const navigation={radius:.48,height:1.62},slab={rects:[{minX:-6,minZ:-6,width:12,depth:12}]};
const newFloor=()=>createHomeState({profile:'upper',slab});
function floorsFor(rotation=0){
  const floors=[newFloor(),newFloor()],stair={id:'main-stairs',x:.45,z:-.35,rotation,type:'elevator'};
  floors[0].stairs={...stair,direction:'up'};floors[1].stairs={...stair,direction:'down'};return floors;
}
const near=(actual,expected,epsilon=1e-7)=>assert.ok(Math.abs(actual-expected)<=epsilon,`${actual} vs ${expected}`);
const deltaAngle=(a,b)=>Math.abs(Math.atan2(Math.sin(b-a),Math.cos(b-a)));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
function frames(motion,samples=32){return motion.steps.flatMap((step,index)=>Array.from({length:samples+1},(_,n)=>sampleRobotElevatorMotion(motion,index,n/samples)));}
function assertContinuous(a,b,label='motion'){
  assert.ok(distance(a.point,b.point)<.20,`${label}: point jumps ${distance(a.point,b.point)}`);
  assert.ok(deltaAngle(a.rotation,b.rotation)<.35,`${label}: facing jumps`);
  assert.ok(Math.abs(a.cabinY-b.cabinY)<.20,`${label}: cabin jumps`);
  for(const side of ['lower','upper'])assert.ok(Math.abs(a.doors[side]-b.doors[side])<.10,`${label}: ${side} door jumps`);
}

for(const rotation of [0,90,180,270])test(`paired elevator plans both directions and samples a continuous ride at ${rotation} degrees`,()=>{
  const floors=floorsFor(rotation);
  for(const index of [0,1]){
    const stair=floors[index].stairs,a=rotation*Math.PI/180,sign=index===0?1:-1;
    const from={x:stair.x+Math.sin(a)*3*sign,z:stair.z+Math.cos(a)*3*sign};
    const journey=planRobotElevator(floors[index],floors,index,stair.id,from,navigation);assert.ok(journey.ok,journey.error);
    assert.equal(journey.target,1-index);assert.equal(journey.direction,index===0?'up':'down');
    assert.ok(isAvatarPositionWalkable(floors[index],journey.approach,navigation));assert.ok(isAvatarPositionWalkable(floors[1-index],journey.arrival,navigation));
    near(journey.approach.y,FLOOR_Y);near(journey.arrival.y,FLOOR_Y);
    const motion=createRobotElevatorMotion(journey,{point:journey.approach,rotation:.27,time:1.4}),samples=frames(motion);
    assert.ok(motion.duration>8&&motion.duration<15);const phases=new Set(samples.map(sample=>sample.phase));
    for(const phase of ['elevator-align','elevator-turn','elevator-open','elevator-board','elevator-close','elevator-ride','elevator-arrive','elevator-leave','elevator-finish'])assert.ok(phases.has(phase),phase);
    for(let n=1;n<samples.length;n++)assertContinuous(samples[n-1],samples[n],`${index}/${rotation}`);
    const first=samples[0],last=samples.at(-1);near(distance(first.point,journey.approach),0);near(last.point.x,journey.arrival.x);near(last.point.z,journey.arrival.z);
    near(last.point.y,FLOOR_Y+(index===0?STOREY_HEIGHT:-STOREY_HEIGHT));near(last.cabinY,last.point.y);
    for(const sample of samples.filter(sample=>sample.phase==='elevator-ride')){
      near(sample.point.x,stair.x);near(sample.point.z,stair.z);near(sample.point.y,sample.cabinY);
      assert.deepEqual(sample.doors,{lower:0,upper:0});assert.equal(sample.visual.to.action,'idle');
    }
    for(const phase of ['elevator-open','elevator-close','elevator-arrive','elevator-finish']){
      const waiting=samples.filter(sample=>sample.phase===phase);assert.ok(waiting.every(sample=>distance(sample.point,waiting[0].point)<1e-9),`${phase} cannot slide while waiting`);
    }
    const boarding=samples.filter(sample=>sample.phase==='elevator-board');assert.ok(boarding.some(sample=>sample.visual.to.action==='walk'&&sample.visual.progress===1));
    const arrivalDoor=index===0?'upper':'lower',departureDoor=index===0?'lower':'upper';
    assert.ok(boarding.every(sample=>sample.doors[departureDoor]===1&&sample.doors[arrivalDoor]===0));
    assert.deepEqual(last.doors,{lower:0,upper:0});
  }
});

test('three-storey connections retain their own identities, heights and clear exit approaches',()=>{
  const floors=[newFloor(),newFloor(),newFloor()],a={id:'lift-a',x:-2,z:0,rotation:0,type:'elevator'},b={id:'lift-b',x:2,z:0,rotation:90,type:'elevator'};
  floors[0].stairs={...a,direction:'up'};floors[1].staircases=[{...a,direction:'down'},{...b,direction:'up'}];floors[2].stairs={...b,direction:'down'};
  let from={x:-2,z:3};
  for(const [floor,id,target] of [[0,'lift-a',1],[1,'lift-b',2],[2,'lift-b',1],[1,'lift-a',0]]){
    const journey=planRobotElevator(floors[floor],floors,floor,id,from,navigation);assert.ok(journey.ok,journey.error);assert.equal(journey.target,target);
    const motion=createRobotElevatorMotion(journey,{point:journey.approach,rotation:0}),last=sampleRobotElevatorMotion(motion,motion.steps.length-1,1);
    near(last.point.y+floor*STOREY_HEIGHT,journey.arrival.y+target*STOREY_HEIGHT);from=journey.arrival;
  }
});

test('missing, ordinary, misaligned and blocked elevator peers reject before any motion',()=>{
  const clean=floorsFor(),from={x:0,z:3};
  assert.equal(planRobotElevator(clean[0],clean,0,'missing',from,navigation).ok,false);
  for(const patch of [{type:undefined},{x:1},{z:1},{rotation:90},{direction:'up'}]){
    const floors=floorsFor();Object.assign(floors[1].stairs,patch);assert.equal(planRobotElevator(floors[0],floors,0,'main-stairs',from,navigation).ok,false,JSON.stringify(patch));
  }
  const journey=planRobotElevator(clean[0],clean,0,'main-stairs',from,navigation);assert.ok(journey.ok,journey.error);
  const block=applyChange(clean[1],{type:'furniture',kind:'cabinet',id:'blocked-exit',x:journey.arrival.x,z:journey.arrival.z,rotation:0});assert.ok(block.ok,block.error);clean[1]=block.state;
  const rejected=planRobotElevator(clean[0],clean,0,'main-stairs',from,navigation);assert.equal(rejected.ok,false);assert.match(rejected.error,/DisplayText4627/);
  const inside=floorsFor();inside[0].furniture.push(createFurnitureItem({kind:'cabinet',id:'invalid-shaft-obstruction',x:inside[0].stairs.x,z:inside[0].stairs.z,rotation:0}));
  const shaft=planRobotElevator(inside[0],inside,0,'main-stairs',from,navigation);assert.equal(shaft.ok,false);assert.match(shaft.error,/DisplayText4628/);
});

test('door state is sequenced before crossing the doorway and cabin movement is monotonic with doors shut',()=>{
  const floors=floorsFor(),journey=planRobotElevator(floors[0],floors,0,'main-stairs',{x:0,z:3},navigation);assert.ok(journey.ok,journey.error);
  const motion=createRobotElevatorMotion(journey),samples=frames(motion,60),ride=samples.filter(sample=>sample.phase==='elevator-ride');
  for(let n=1;n<ride.length;n++)assert.ok(ride[n].cabinY>=ride[n-1].cabinY);
  assert.ok(ride.slice(1,-1).every(sample=>sample.cabinY>FLOOR_Y&&sample.cabinY<FLOOR_Y+STOREY_HEIGHT));
  for(const sample of samples){
    assert.ok(sample.doors.lower>=0&&sample.doors.lower<=1&&sample.doors.upper>=0&&sample.doors.upper<=1);
    assert.ok(!(sample.doors.lower>0&&sample.doors.upper>0),'both landings cannot be open across floors');
  }
  const inputs=JSON.stringify(journey);frames(motion);assert.equal(JSON.stringify(journey),inputs,'sampling must not mutate the stored connection or plan');
  const first=sampleRobotElevatorMotion(motion,0,-1),last=sampleRobotElevatorMotion(motion,0,2);near(distance(first.point,motion.steps[0].from),0);near(distance(last.point,motion.steps[0].to),0);
  assert.throws(()=>sampleRobotElevatorMotion(motion,999,0),RangeError);
});

test('the authored door and cabin clearances reject oversized future clothes before walking',()=>{
  const floors=floorsFor(),from={x:0,z:3};
  const wide=planRobotElevator(floors[0],floors,0,'main-stairs',from,{...navigation,radius:ELEVATOR_DOOR_CLEAR_WIDTH/2+.01});assert.equal(wide.ok,false);assert.match(wide.error,/DisplayText4629/);
  const tall=planRobotElevator(floors[0],floors,0,'main-stairs',from,{...navigation,height:ELEVATOR_CABIN_CLEAR_HEIGHT+.01});assert.equal(tall.ok,false);assert.match(tall.error,/DisplayText4630/);
  const fits=planRobotElevator(floors[0],floors,0,'main-stairs',from,{...navigation,radius:ELEVATOR_DOOR_CLEAR_WIDTH/2,height:ELEVATOR_CABIN_CLEAR_HEIGHT});assert.equal(fits.ok,true,fits.error);
});

test('actual v4 legs walk through open doors then remain planted on the moving cabin',async t=>{
  const bytes=await readFile(new URL('../public/assets/asset-lab/robot-v1/models/v4/robot.glb',import.meta.url));
  const source=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene,robot=createRobotAvatar(source);t.after(()=>disposeRobotAvatar(robot));
  const floors=floorsFor(),journey=planRobotElevator(floors[0],floors,0,'main-stairs',{x:0,z:3},navigation);assert.ok(journey.ok,journey.error);
  const motion=createRobotElevatorMotion(journey),joints=['HipL','HipR','KneeL','KneeR'],seen=new Map(joints.map(name=>[name,new Set()]));
  let previous=null;
  for(const sample of frames(motion,70)){
    robot.position.set(sample.point.x,sample.point.y,sample.point.z);robot.rotation.y=sample.rotation;poseRobotTransition(robot,sample.visual);robot.updateWorldMatrix(true,true);
    const current=joints.map(name=>robot.getObjectByName(name).quaternion.clone());
    if(previous)current.forEach((part,index)=>assert.ok(part.angleTo(previous[index])<.30,'real joint changes continuously'));
    if(sample.phase==='elevator-board'||sample.phase==='elevator-leave')for(const name of joints)seen.get(name).add(robot.getObjectByName(name).rotation.x.toFixed(2));
    if(sample.phase==='elevator-ride')for(const side of ['L','R']){
      const sole=new THREE.Box3().setFromObject(robot.getObjectByName(`FootSole${side}`));near(sole.min.y,sample.cabinY,.006);
    }
    previous=current;
  }
  for(const [name,values]of seen)assert.ok(values.size>12,`${name} really moves during door crossing`);
  assert.equal(STAIR_DEPTH,3.2,'upgrading preserves the reserved stair footprint');
});
