import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createAccountCommerce} from '../server/student-homes/commerce.mjs';
import {getOutdoorItemBounds} from '../public/js/home-outdoor-placement.js';
import {createOutdoorProductModel} from '../public/js/home-outdoor-models.js';
import {isOutdoorRobotPositionWalkable,findOutdoorRobotSpawn,planOutdoorRobotWalk} from '../public/js/student-home-robot-swimming.js';
import {getRobotFootballDescriptor,sampleRobotFootballMotion,FOOTBALL_PERIOD,FOOTBALL_BALL_RADIUS} from '../public/js/student-home-robot-football.js';

function fixture(level=1,rotation=0){const state=createAccountCommerce();state.owned=[{id:'field',status:'placed',item:{kind:`outdoor-football-${level}`,x:10,z:10,rotation}}];return state;}
const local=(item,p)=>{const a=item.rotation*Math.PI/180,dx=p.x-item.x,dz=p.z-item.z;return{x:dx*Math.cos(a)-dz*Math.sin(a),y:p.y,z:dx*Math.sin(a)+dz*Math.cos(a)};};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const angleDistance=(a,b)=>Math.abs((a-b+540)%360-180);

for(const level of[1,2,3])for(const rotation of[0,90,180,270])test(`football ${level} at ${rotation} has a reachable safe entry and continuous measured practice loop`,()=>{
  const state=fixture(level,rotation),before=JSON.stringify(state),item=state.owned[0].item,nav={radius:.46,height:1.7};
  const spawn=findOutdoorRobotSpawn(state,null,nav),descriptor=getRobotFootballDescriptor(state,'outdoor:field',{navigation:nav,from:spawn});
  assert.ok(descriptor);assert.equal(descriptor.kind,'football');
  assert.equal(planOutdoorRobotWalk(state,spawn,descriptor.approach,nav).ok,true);
  const a=sampleRobotFootballMotion(descriptor,0),b=sampleRobotFootballMotion(descriptor,FOOTBALL_PERIOD);
  assert.ok(distance(a.point,descriptor.approach)<1e-7);assert.ok(distance(a.point,b.point)<1e-7);assert.ok(distance(a.ball,b.ball)<1e-7);assert.ok(angleDistance(a.rotation,b.rotation)<1e-7);
  assert.equal(isOutdoorRobotPositionWalkable(state,a.point,nav),true,'stop returns to a normal walkable point outside the solid field');
  const model=createOutdoorProductModel(item.kind,item),pitch=new THREE.Box3(),obstacles=[];model.updateMatrixWorld(true);
  model.traverse(mesh=>{if(!mesh.isMesh)return;const box=new THREE.Box3().setFromObject(mesh);if(mesh.name==='football-playing-surface')pitch.union(box);if(/football-(?:goal-|backstop-|perimeter-board|light-)/.test(mesh.name))obstacles.push(box);});
  assert.ok(Math.abs(descriptor.field.surfaceY-(pitch.max.y+.022))<1e-7,'foot contact derives from the scaled playing surface');
  let previous=a,kicks=0;const positions=[];
  for(let n=0;n<=1000;n++){
    const current=sampleRobotFootballMotion(descriptor,FOOTBALL_PERIOD*n/1000),p=local(item,current.point),ball=local(item,current.ball);
    if(p.z<descriptor.field.foundationMinZ-.10)assert.equal(p.y,.08,'robot stays on grass until the actual platform edge');
    assert.ok(distance(previous.point,current.point)<.06,'no position teleport');assert.ok(distance(previous.ball,current.ball)<.06,'no ball teleport');assert.ok(angleDistance(previous.rotation,current.rotation)<9,'no orientation snap');
    assert.ok(ball.x-FOOTBALL_BALL_RADIUS>pitch.min.x&&ball.x+FOOTBALL_BALL_RADIUS<pitch.max.x);assert.ok(ball.z-FOOTBALL_BALL_RADIUS>pitch.min.z&&ball.z+FOOTBALL_BALL_RADIUS<pitch.max.z);
    assert.equal(obstacles.some(box=>p.x>box.min.x-nav.radius-.02&&p.x<box.max.x+nav.radius+.02&&p.z>box.min.z-nav.radius-.02&&p.z<box.max.z+nav.radius+.02&&box.max.y>p.y+.04&&box.min.y<p.y+nav.height),false,'body never walks through boards, posts or nets');
    if(current.kick>.9)kicks++;positions.push(current.ball.x);previous=current;
  }
  assert.ok(kicks>0);assert.ok(Math.max(...positions)-Math.min(...positions)>2||rotation%180===90);
  assert.equal(JSON.stringify(state),before,'queries and samples never mutate a save');model.dispose();
});

test('ball moves only after a forward kicking contact and rolls back continuously',()=>{
  const descriptor=getRobotFootballDescriptor(fixture(),'outdoor:field'),steps=descriptor.field.steps;
  for(const step of steps.filter(row=>row.phase.startsWith('kick-'))){
    const before=sampleRobotFootballMotion(descriptor,step.start+step.duration*.37),contact=sampleRobotFootballMotion(descriptor,step.start+step.duration*.38),after=sampleRobotFootballMotion(descriptor,step.start+step.duration*.72);
    assert.ok(distance(before.ball,contact.ball)<1e-7);assert.ok(contact.kick>.99,'contact occurs at forward swing peak');assert.ok(distance(after.ball,contact.ball)>.25,'the struck ball travels visibly');
    assert.ok(distance(contact.point,contact.ball)<.8,'the ball is in reach of the kicking foot');
  }
});

test('blocked, unowned, non-football, overlapping and removed fields cannot start football',()=>{
  const state=fixture();assert.equal(getRobotFootballDescriptor(state,'outdoor:missing'),null);
  state.owned[0].status='stored';assert.equal(getRobotFootballDescriptor(state,'outdoor:field'),null);state.owned[0].status='placed';
  state.owned[0].item.kind='outdoor-tennis-1';assert.equal(getRobotFootballDescriptor(state,'outdoor:field'),null);state.owned[0].item.kind='outdoor-football-1';
  const descriptor=getRobotFootballDescriptor(state,'outdoor:field');
  state.owned.push({id:'blocked',status:'placed',item:{kind:'outdoor-storage',x:descriptor.approach.x,z:descriptor.approach.z,rotation:0}});
  assert.equal(getRobotFootballDescriptor(state,'outdoor:field'),null,'a blocked grass entry is unavailable');state.owned.pop();
  state.owned.push({id:'intruder',status:'placed',item:{kind:'outdoor-storage',x:10,z:10,rotation:0}});assert.equal(getRobotFootballDescriptor(state,'outdoor:field'),null,'old invalid overlaps are not traversable');
  state.owned.pop();state.owned[0].item.x=0;state.owned[0].item.z=0;assert.equal(getRobotFootballDescriptor(state,'outdoor:field'),null,'a field overlapping the house is refused');
  state.owned[0].item.x=10;state.owned[0].item.z=10;state.owned[0].item.legacyFootprint={width:3,depth:2};
  assert.equal(getRobotFootballDescriptor(state,'outdoor:field'),null,'a legacy shrunken field must not put the player or ball outside its surface');
});

test('semantic time sampling is deterministic over pauses, repeated cycles and moved fields',()=>{
  const state=fixture(3,90),descriptor=getRobotFootballDescriptor(state,'outdoor:field');
  const one=sampleRobotFootballMotion(descriptor,6.2),again=sampleRobotFootballMotion(getRobotFootballDescriptor(state,'outdoor:field'),6.2+FOOTBALL_PERIOD*5);
  assert.ok(distance(one.point,again.point)<1e-7);assert.ok(distance(one.ball,again.ball)<1e-7);assert.ok(angleDistance(one.rotation,again.rotation)<1e-7);
  state.owned[0].item.x+=.5;const moved=sampleRobotFootballMotion(getRobotFootballDescriptor(state,'outdoor:field'),6.2);
  assert.ok(Math.abs(moved.point.x-one.point.x-.5)<1e-7,'restoration reconstructs from current owned placement');
  assert.ok(getOutdoorItemBounds(state.owned[0].item));
});
