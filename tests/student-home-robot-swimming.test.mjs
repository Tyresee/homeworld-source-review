import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createHomeState} from '../public/js/home-engine.js';
import {createOutdoorProductModel} from '../public/js/home-outdoor-models.js';
import {getOutdoorLandBounds} from '../public/js/home-outdoor-placement.js';
import {findOutdoorRobotSpawn,planOutdoorRobotWalk,isOutdoorRobotPositionWalkable,getRobotPoolDescriptor,listOutdoorRobotInteractions,
  createRobotPoolEntry,createRobotPoolExit,sampleRobotPoolMotionStep,sampleRobotPoolLoop} from '../public/js/student-home-robot-swimming.js';

const pointDistance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const angleDistance=(a,b)=>Math.abs(((a-b+540)%360)-180);
function fixture(level=1,rotation=0,legacy=false){return{home:createHomeState(),owned:[{id:'owned-pool',status:'placed',item:{id:'owned-pool',kind:`outdoor-pool-${level}`,x:10,z:5,rotation,...(legacy?{legacyIncludedExtras:true,legacyFootprint:{width:6.6,depth:8.6}}:{})}}]};}
function assertClearPath(state,result){
  assert.equal(result.ok,true,result.error);for(let index=1;index<result.path.length;index++){
    const a=result.path[index-1],b=result.path[index],n=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.04);
    for(let i=0;i<=n;i++)assert.equal(isOutdoorRobotPositionWalkable(state,{x:a.x+(b.x-a.x)*i/n,z:a.z+(b.z-a.z)*i/n}),true,'path crosses outdoor building or facility');
  }
}
function localPoint(pool,p){const a=pool.rotation*Math.PI/180,dx=p.x-pool.transform.x,dz=p.z-pool.transform.z;return{x:dx*Math.cos(a)-dz*Math.sin(a),z:dx*Math.sin(a)+dz*Math.cos(a)};}
function assertFrameSame(a,b){assert.ok(pointDistance(a.point,b.point)<1e-7);assert.ok(angleDistance(a.rotation,b.rotation)<1e-7);assert.ok(Math.abs(a.swimBlend-b.swimBlend)<1e-7);}

for(const level of[1,2,3])for(const rotation of[0,90,180,270])test(`pool ${level} at ${rotation} degrees uses actual scaled water and continuous entry/lap/exit`,()=>{
  const state=fixture(level,rotation),original=JSON.stringify(state),item=state.owned[0].item,spawn=findOutdoorRobotSpawn(state),descriptor=getRobotPoolDescriptor(state,'outdoor:owned-pool',{from:spawn});
  assert.ok(descriptor,'placed pool has reachable clear grass entrance');assert.equal(descriptor.kind,'swim');assert.equal(descriptor.id,'swim');
  assertClearPath(state,planOutdoorRobotWalk(state,spawn,descriptor.approach));
  const model=createOutdoorProductModel(item.kind,item);model.position.set(item.x,0,item.z);model.rotation.y=rotation*Math.PI/180;model.updateMatrixWorld(true);
  const water=new THREE.Box3();model.traverse(mesh=>{if(mesh.isMesh&&mesh.name==='pool-water')water.union(new THREE.Box3().setFromObject(mesh));});
  assert.ok(Math.abs(water.max.y-descriptor.pool.waterY)<1e-7,'water contact must follow model fit and centering');
  const entry=createRobotPoolEntry(descriptor,{point:descriptor.approach,rotation:27});
  assert.equal(sampleRobotPoolMotionStep(entry[0],0).rotation,27);assert.ok(entry.every(s=>s.duration>0&&s.phase&&s.label));
  for(let i=1;i<entry.length;i++)assertFrameSame(sampleRobotPoolMotionStep(entry[i-1],1),sampleRobotPoolMotionStep(entry[i],0));
  const first=sampleRobotPoolLoop(descriptor.pool,0),last=sampleRobotPoolLoop(descriptor.pool,descriptor.pool.loop.duration);
  assertFrameSame(sampleRobotPoolMotionStep(entry.at(-1),1),first);assertFrameSame(first,last);
  for(let i=0;i<80;i++){
    const swim=sampleRobotPoolLoop(descriptor.pool,descriptor.pool.loop.duration*i/80),p=localPoint(descriptor.pool,swim.point),w=descriptor.pool.water;
    assert.ok(p.x>w.minX&&p.x<w.maxX&&p.z>w.minZ&&p.z<w.maxZ);assert.equal(swim.swimBlend,1);assert.equal(swim.point.y,water.max.y);
    // The torso length and arm span fit inside the water, not just its pivot.
    const a=(swim.rotation-rotation)*Math.PI/180;
    for(const ahead of[-.7,.7])for(const across of[-.25,.25]){
      const x=p.x+Math.sin(a)*ahead+Math.cos(a)*across,z=p.z+Math.cos(a)*ahead-Math.sin(a)*across;
      if(descriptor.pool.shape==='ellipse')assert.ok(((x-w.x)/(w.width/2))**2+((z-w.z)/(w.depth/2))**2<1.01,'swimming body crosses oval coping');
      else assert.ok(x>w.minX&&x<w.maxX&&z>w.minZ&&z<w.maxZ,'swimming body crosses rectangular coping');
    }
  }
  const current=sampleRobotPoolLoop(descriptor.pool,2.7),exit=createRobotPoolExit(descriptor.pool,current);
  assertFrameSame(sampleRobotPoolMotionStep(exit[0],0),current);for(let i=1;i<exit.length;i++)assertFrameSame(sampleRobotPoolMotionStep(exit[i-1],1),sampleRobotPoolMotionStep(exit[i],0));
  const ground=sampleRobotPoolMotionStep(exit.at(-1),1);assert.ok(pointDistance(ground.point,descriptor.approach)<1e-7);assert.equal(ground.swimBlend,0);
  assert.equal(JSON.stringify(state),original,'query and animation planning must not mutate a student save');model.dispose();
});

test('legacy gifted pool contacts use its fitted legacy water, not new-product dimensions',()=>{
  const state=fixture(3,90,true),descriptor=getRobotPoolDescriptor(state,'outdoor:owned-pool');assert.ok(descriptor);
  const item=state.owned[0].item,model=createOutdoorProductModel(item.kind,item);model.updateMatrixWorld(true);const box=new THREE.Box3();model.traverse(n=>{if(n.name==='pool-water')box.union(new THREE.Box3().setFromObject(n));});
  assert.ok(Math.abs(descriptor.pool.water.width-(box.max.x-box.min.x))<1e-7);assert.ok(Math.abs(descriptor.pool.waterY-box.max.y)<1e-7);model.dispose();
});

test('cancelling entrance reverses actual contacts and does not drag a dry robot into the water',()=>{
  const descriptor=getRobotPoolDescriptor(fixture(),'owned-pool'),entry=createRobotPoolEntry(descriptor);
  for(const step of entry)for(const progress of[.1,.5,.9]){
    const current=sampleRobotPoolMotionStep(step,progress),exit=createRobotPoolExit(descriptor.pool,current);
    assertFrameSame(sampleRobotPoolMotionStep(exit[0],0),current);
    const currentZ=localPoint(descriptor.pool,current.point).z;
    for(const s of exit)for(const p of[0,.25,.5,.75,1])assert.ok(localPoint(descriptor.pool,sampleRobotPoolMotionStep(s,p).point).z<=currentZ+1e-7,'exit detours farther into pool');
    assert.ok(pointDistance(sampleRobotPoolMotionStep(exit.at(-1),1).point,descriptor.approach)<1e-7);
  }
});

test('outdoor paths detour around the actual house and respect a bounded search budget',()=>{
  const state=fixture(),start={x:-5,z:0},end={x:5,z:0},result=planOutdoorRobotWalk(state,start,end);
  assertClearPath(state,result);assert.ok(result.path.length>2);assert.ok(result.visited>0&&result.visited<=8000);
  const bounded=planOutdoorRobotWalk(state,start,end,{maxVisited:1});assert.equal(bounded.ok,false);assert.equal(bounded.reason,'budget');assert.equal(bounded.visited,1);
});

test('walking refuses pool water, occupied targets, house and land exterior',()=>{
  const state=fixture(),spawn=findOutdoorRobotSpawn(state),land=getOutdoorLandBounds(state);
  assert.ok(spawn&&isOutdoorRobotPositionWalkable(state,spawn));
  for(const target of[{x:10,z:5},{x:0,z:0},{x:land.maxX+1,z:0}])assert.equal(planOutdoorRobotWalk(state,spawn,target).ok,false);
  assert.equal(isOutdoorRobotPositionWalkable(state,{x:NaN,z:0}),false);
});

test('only a currently placed owned pool with a reachable entry offers swimming',()=>{
  const state=fixture(),d=getRobotPoolDescriptor(state,'owned-pool');assert.ok(d);
  state.owned.push({id:'blocker',status:'placed',item:{kind:'outdoor-storage',x:d.approach.x,z:d.approach.z,rotation:0}});
  assert.deepEqual(listOutdoorRobotInteractions(state,'outdoor:owned-pool'),[]);
  state.owned.pop();state.owned[0].status='stored';assert.equal(getRobotPoolDescriptor(state,'owned-pool'),null);
  state.owned[0].status='placed';assert.deepEqual(listOutdoorRobotInteractions(state,'outdoor:not-owned'),[]);
  state.owned[0].item.kind='outdoor-lounger';assert.deepEqual(listOutdoorRobotInteractions(state,'owned-pool'),[]);
});
