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
  assert.ok(listOutdoorRobotInteractions(state,'outdoor:owned-pool').some(row=>row.id==='swim'&&row.pool.entryIndex!==d.pool.entryIndex),'a blocked former entrance uses another clear edge');
  state.owned.pop();state.owned[0].status='stored';assert.equal(getRobotPoolDescriptor(state,'owned-pool'),null);
  state.owned[0].status='placed';assert.deepEqual(listOutdoorRobotInteractions(state,'outdoor:not-owned'),[]);
  state.owned[0].item.kind='outdoor-lounger';assert.deepEqual(listOutdoorRobotInteractions(state,'owned-pool'),[]);
});

for(const level of[1,2,3])test(`pool ${level} chooses the near accessible side rather than routing to a fixed gate`,()=>{
  const state=fixture(level),item=state.owned[0].item;
  for(const[dx,dz]of[[0,-5],[5,0],[0,5],[-5,0]]){
    const from={x:item.x+dx,z:item.z+dz},d=getRobotPoolDescriptor(state,'owned-pool',{from});assert.ok(d);
    const local=localPoint(d.pool,d.approach);
    assert.ok(dx===0?local.z*dz>0:local.x*dx>0,'entry stays on the side facing the robot');
    assertClearPath(state,planOutdoorRobotWalk(state,from,d.approach));
    const restored=getRobotPoolDescriptor(state,'owned-pool',{entryIndex:d.pool.entryIndex});assert.deepEqual(restored,d,'entry index restores the same contacts without persisting coordinates');
  }
});
test('ring is available on every pool; soaking is measured from the luxury round spa and remains inside it',()=>{
  for(const level of[1,2,3]){
    const state=fixture(level,90),choices=listOutdoorRobotInteractions(state,'owned-pool');
    assert.ok(choices.some(row=>row.id==='swim-ring'&&row.variant==='ring'));
    const spa=choices.find(row=>row.id==='soak');assert.equal(!!spa,level===3);
    if(spa){
      const model=createOutdoorProductModel(state.owned[0].item.kind,state.owned[0].item),water=new THREE.Box3();model.updateMatrixWorld(true);model.traverse(n=>{if(n.name==='pool-spa-water')water.union(new THREE.Box3().setFromObject(n));});
      for(const t of[0,1,4,8]){const sample=sampleRobotPoolLoop(spa,t),p=localPoint(spa.pool,sample.point);assert.ok(p.x>water.min.x&&p.x<water.max.x&&p.z>water.min.z&&p.z<water.max.z);assert.ok(Math.abs(sample.point.y-water.max.y)<.02);assert.equal(sample.phase,'soaking');}
      const entry=createRobotPoolEntry(spa);assertFrameSame(sampleRobotPoolMotionStep(entry.at(-1),1),sampleRobotPoolLoop(spa,0));model.dispose();
    }
  }
});

test('every reachable perimeter contact has continuous entry, loop and partial cancellation in all rotations',()=>{
  let checked=0;
  for(const level of[1,2,3])for(const rotation of[0,90,180,270])for(let entryIndex=0;entryIndex<12;entryIndex++){
    const descriptor=getRobotPoolDescriptor(fixture(level,rotation),'owned-pool',{entryIndex});if(!descriptor)continue;checked++;
    const entry=createRobotPoolEntry(descriptor),loop=sampleRobotPoolLoop(descriptor,0);assertFrameSame(sampleRobotPoolMotionStep(entry.at(-1),1),loop);
    for(const step of entry){
      const current=sampleRobotPoolMotionStep(step,.5),exit=createRobotPoolExit(descriptor,current);assertFrameSame(sampleRobotPoolMotionStep(exit[0],0),current);
      for(let i=1;i<exit.length;i++)assertFrameSame(sampleRobotPoolMotionStep(exit[i-1],1),sampleRobotPoolMotionStep(exit[i],0));
      assert.ok(pointDistance(sampleRobotPoolMotionStep(exit.at(-1),1).point,descriptor.approach)<1e-7);
    }
  }
  assert.ok(checked>=100,'test all reachable contacts rather than only the legacy ladder');
});

test('measured pool entry body cannot cross the pool handrails or the other basin outer coping',()=>{
  const navigation={radius:.4485902240491439,height:1.581010576605681};let checked=0;
  for(const level of[1,2,3]){
    const state=fixture(level),item=state.owned[0].item,model=createOutdoorProductModel(item.kind,item),rails=[],basins={main:new THREE.Box3(),spa:new THREE.Box3()};model.updateMatrixWorld(true);
    model.traverse(mesh=>{if(!mesh.isMesh)return;const b=new THREE.Box3().setFromObject(mesh);if(mesh.name==='pool-handrail')rails.push(b);if(mesh.name==='pool-coping')basins.main.union(b);if(mesh.name==='pool-spa-coping')basins.spa.union(b);});
    for(const variant of['swim','ring','spa'])for(let entryIndex=0;entryIndex<12;entryIndex++){
      const d=getRobotPoolDescriptor(state,'owned-pool',{navigation,variant,entryIndex});if(!d)continue;checked++;
      for(const step of createRobotPoolEntry(d))for(let n=0;n<=40;n++){
        const f=sampleRobotPoolMotionStep(step,n/40),p={...localPoint(d.pool,f.point),y:f.point.y};
        const occupied=b=>p.x>b.min.x-navigation.radius&&p.x<b.max.x+navigation.radius&&p.z>b.min.z-navigation.radius&&p.z<b.max.z+navigation.radius;
        assert.equal(rails.some(b=>occupied(b)&&b.max.y>p.y+.08&&b.min.y<p.y+navigation.height),false,'body crosses a real handrail');
        const other=basins[variant==='spa'?'main':'spa'];if(!other.isEmpty())assert.equal(occupied(other),false,'body crosses the unselected basin outer wall');
      }
    }
    model.dispose();
  }
  assert.ok(checked>30,'covers multiple safe contacts and both luxury basins');
});
