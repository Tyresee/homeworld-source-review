import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createStudentHomeRobotController} from '../public/js/student-home-robot-controller.js';
import {createHomeState,applyChange} from '../public/js/home-engine.js';
import {isOutdoorRobotPositionWalkable,getRobotPoolDescriptor} from '../public/js/student-home-robot-swimming.js';

let source,oldDocument,oldRaf,oldCancel,frames,sequence=0;
before(async()=>{
  const bytes=await readFile(new URL('../public/assets/asset-lab/robot-v1/models/v4/robot.glb',import.meta.url));
  source=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  oldDocument=globalThis.document;oldRaf=globalThis.requestAnimationFrame;oldCancel=globalThis.cancelAnimationFrame;
  globalThis.document=new EventTarget();document.hidden=false;frames=new Map();
  globalThis.requestAnimationFrame=callback=>{frames.set(++sequence,callback);return sequence;};
  globalThis.cancelAnimationFrame=id=>frames.delete(id);
});
after(()=>{globalThis.document=oldDocument;globalThis.requestAnimationFrame=oldRaf;globalThis.cancelAnimationFrame=oldCancel;});
const distance=(a,b)=>Math.hypot(a.x-b.x,(a.y??0)-(b.y??0),a.z-b.z);
function poolState(level=1,rotation=0){return{home:createHomeState({profile:'account'}),owned:[{id:'owned-pool',skuId:`outdoor-pool-${level}`,status:'placed',item:{kind:`outdoor-pool-${level}`,x:9,z:0,rotation}}]};}
function actor(t,state=poolState(),options={}){
  const c=createStudentHomeRobotController({source,parent:new THREE.Group(),requestRender(){},...options});t.after(()=>c.dispose());
  c.setWorld(state.home);c.setOutdoorWorld(state);c.setEnvironment('estate');return c;
}
function advance(count=1){for(let n=0;n<count&&frames.size;n++){const pending=[...frames.values()];frames.clear();for(const callback of pending)callback(performance.now()+50);}}
function until(c,condition,limit=1600,check=()=>{}){for(let n=0;n<limit;n++){if(condition(c.getState()))return;advance();check(c.getState());}assert.fail(`Robot state did not settle: ${JSON.stringify(c.getState())}`);}
function sample(c){const robot=c.group.getObjectByName('robot-avatar');robot.updateWorldMatrix(true,true);return{...c.getState(),joints:Object.fromEntries(['robot-runtime-pose','ShoulderL','ShoulderR','KneeL','KneeR'].map(name=>[name,robot.getObjectByName(name).quaternion.clone()]))};}
function continuous(a,b,label){assert.ok(distance(a.point,b.point)<.18,`${label}: root jumps ${distance(a.point,b.point).toFixed(3)} m at ${a.phase} → ${b.phase}`);for(const name of Object.keys(a.joints))assert.ok(a.joints[name].angleTo(b.joints[name])<.75,`${label}: ${name} snaps at ${a.phase} → ${b.phase}`);}
function invalidPoint(point){return !point||!Number.isFinite(point.x)||!Number.isFinite(point.y)||!Number.isFinite(point.z);}

test('all three real pool models in four orientations support walk, continuous entry, animated swimming and continuous exit',t=>{
  const c=actor(t);
  for(const level of[1,2,3])for(const rotation of[0,90,180,270]){
    const state=poolState(level,rotation);c.setWorld(state.home);c.setOutdoorWorld(state);c.setEnvironment('estate');
    const choice=c.interactions('outdoor:owned-pool').find(row=>row.id==='swim');assert.ok(choice,`pool ${level}/${rotation} offers swimming`);
    assert.equal(c.interact('outdoor:owned-pool','swim').ok,true);assert.equal(c.getState().action,'walk');
    const phases=new Set();let previous=sample(c),walkFrames=0;
    until(c,s=>s.action==='swim'&&!s.inTransition,1800,s=>{
      assert.equal(invalidPoint(s.point),false,'all root samples are finite');
      if(s.action==='walk'){walkFrames++;assert.equal(isOutdoorRobotPositionWalkable(state,s.point,s.navigation),true,'the approach cannot cut through the house or a pool');}
      phases.add(s.phase);const next=sample(c);continuous(previous,next,`pool ${level}/${rotation} entry`);previous=next;
    });
    assert.ok(walkFrames>5);for(const phase of['pool-align','pool-deck','pool-edge','pool-wade','pool-push'])assert.ok(phases.has(phase),phase);
    const start=sample(c),positions=[];for(let n=0;n<110;n++){advance();positions.push(sample(c));}
    assert.equal(c.getState().action,'swim');assert.equal(c.getState().scheduled,true,'swimming keeps the one controller clock active');
    assert.ok(positions.some(value=>distance(start.point,value.point)>.4),'robot actually swims around the water');
    for(const name of['ShoulderL','ShoulderR','KneeL','KneeR'])assert.ok(positions.some(value=>start.joints[name].angleTo(value.joints[name])>.12),`${name} visibly strokes or kicks`);
    const pool=choice.pool,angle=-rotation*Math.PI/180;
    for(const value of positions){
      const dx=value.point.x-state.owned[0].item.x,dz=value.point.z-state.owned[0].item.z;
      const x=dx*Math.cos(angle)+dz*Math.sin(angle),z=-dx*Math.sin(angle)+dz*Math.cos(angle);
      assert.ok(x>pool.water.minX&&x<pool.water.maxX&&z>pool.water.minZ&&z<pool.water.maxZ,'swimming roots remain inside the rotated measured water');
      assert.ok(Math.abs(value.point.y-pool.waterY)<.04,'swimming follows the real water height');
    }
    const before=sample(c);c.stand();const after=sample(c);assert.ok(distance(before.point,after.point)<1e-7,'stop does not teleport');
    const exitPhases=new Set();previous=after;
    until(c,s=>s.action==='idle'&&!s.scheduled,1600,s=>{exitPhases.add(s.phase);const next=sample(c);continuous(previous,next,`pool ${level}/${rotation} exit`);previous=next;});
    for(const phase of['pool-return','pool-shallow','pool-rise','pool-step-out','pool-ground'])assert.ok(exitPhases.has(phase),phase);
    assert.ok(distance(c.getState().point,choice.approach)<1e-6);assert.equal(isOutdoorRobotPositionWalkable(state,c.getState().point,c.getState().navigation),true);
    assert.equal(c.group.getObjectByName('robot-swim-water').visible,false,'wake disappears after leaving');
  }
});

test('a real outdoor obstacle blocks its own footprint and walking to a pool routes around it',t=>{
  const state=poolState(2);state.owned.push({id:'blocker',skuId:'outdoor-storage',status:'placed',item:{kind:'outdoor-storage',x:5.5,z:-4.8,rotation:0}});
  const c=actor(t,state);assert.equal(c.walk({x:5.5,z:-4.8}).ok,false);assert.equal(c.walk({x:0,z:0}).ok,false,'outdoor robot cannot walk through its house');
  assert.equal(c.interact('outdoor:owned-pool','swim').ok,true);
  until(c,s=>s.action==='swim',1800,s=>{if(s.action==='walk')assert.equal(isOutdoorRobotPositionWalkable(state,s.point,s.navigation),true);});
  c.stand();until(c,s=>s.action==='idle'&&!s.scheduled);
  assert.deepEqual(c.interactions('outdoor:blocker'),[]);assert.deepEqual(c.interactions('outdoor:missing'),[]);
});

test('swimming publishes semantic contacts and a departure checkpoint without persisting raw animation frames',t=>{
  const state=poolState(1),bed=applyChange(state.home,{type:'furniture',id:'bed-owned',kind:'bedTimber',x:0,z:0,rotation:90});assert.equal(bed.ok,true,bed.error);state.home=bed.state;
  const changes=[],c=actor(t,state,{onActivityChange:value=>changes.push(value)}),sleep={kind:'sleep',itemId:'bed-owned',storey:0};
  c.setEnvironment('interior');c.setAvatar({activity:sleep});assert.equal(c.getState().action,'lie');c.setEnvironment('estate');assert.equal(c.getState().activity.kind,'stand');
  assert.equal(c.interact('outdoor:owned-pool','swim').ok,true);until(c,s=>s.action==='swim');advance(30);const checkpoint=c.captureActivity();assert.equal(checkpoint.kind,'swim');assert.equal(checkpoint.phase,'loop');assert.ok(checkpoint.time>0);
  assert.ok(changes.every(value=>value===null||!('steps'in value)&&!('mesh'in value)&&!('path'in value)),'only semantic activity reaches persistence');
  const count=changes.length;advance(1);assert.equal(changes.length,count,'swimming is throttled rather than publishing per frame');
  c.stand();until(c,s=>s.action==='idle'&&!s.scheduled);assert.equal(changes.at(-1).kind,'stand');assert.equal(changes.at(-1).environment,'estate');
});

test('hiding, backgrounding, account replacement, removing a pool and disposal cancel swimming without stranded RAF or water effects',t=>{
  const state=poolState(1),c=actor(t,state),start=()=>{c.setVisible(true);c.setOutdoorWorld(state);c.setEnvironment('estate');assert.equal(c.interact('outdoor:owned-pool','swim').ok,true);until(c,s=>s.action==='swim');};
  const stopped=()=>{assert.equal(c.getState().scheduled,false);assert.equal(c.getState().action,'idle');assert.equal(c.getState().swimPool,null);assert.equal(c.group.getObjectByName('robot-swim-water').visible,false);const point=c.getState().point;advance(100);assert.deepEqual(c.getState().point,point);};
  start();c.setVisible(false);stopped();
  start();document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));stopped();document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));assert.equal(c.getState().action,'swim');assert.equal(c.getState().scheduled,true);c.stand();until(c,s=>s.action==='idle'&&!s.scheduled);
  start();c.clearAccountBinding();c.setWorld(createHomeState({profile:'account'}));stopped();
  start();c.setOutdoorWorld({...state,owned:[]});stopped();
  start();c.dispose();assert.equal(c.getState().scheduled,false);assert.equal(c.group.parent,null);assert.equal(frames.size,0);
});

test('stopping while entering the pool preserves root continuity and returns to clear grass',t=>{
  const c=actor(t);
  for(const phase of['pool-align','pool-edge','pool-wade','pool-push']){
    const state=poolState(1);c.setWorld(state.home);c.setOutdoorWorld(state);c.setEnvironment('estate');assert.equal(c.interact('outdoor:owned-pool','swim').ok,true);until(c,s=>s.phase===phase);advance(2);
    const before=sample(c);c.stand();let previous=sample(c);assert.ok(distance(before.point,previous.point)<1e-7,`cancel ${phase} cannot teleport`);
    until(c,s=>s.action==='idle'&&!s.scheduled,1600,()=>{const next=sample(c);continuous(previous,next,`cancel ${phase}`);previous=next;});
    assert.equal(isOutdoorRobotPositionWalkable(state,c.getState().point,c.getState().navigation),true);
  }
});

test('visible real robot mesh envelopes stay inside the small oval water throughout a complete swimming lap',t=>{
  for(const rotation of[0,90]){
    const state=poolState(1,rotation),c=actor(t,state),descriptor=getRobotPoolDescriptor(state,'outdoor:owned-pool',{navigation:c.getState().navigation,from:c.getState().point});
    assert.ok(descriptor);assert.equal(c.interact('outdoor:owned-pool','swim').ok,true);until(c,s=>s.action==='swim');
    const robot=c.group.getObjectByName('robot-avatar'),item=state.owned[0].item,water=descriptor.pool.water;
    const inverse=new THREE.Matrix4().makeRotationY(rotation*Math.PI/180).setPosition(item.x,0,item.z).invert();
    const rx=water.width/2,rz=water.depth/2,p=new THREE.Vector3();let maximum={ratio:0,mesh:'',phase:0,x:0,z:0};
    const duration=descriptor.pool.loop.duration,steps=Math.ceil(duration/.045)+2;
    for(let frame=0;frame<steps;frame++){
      robot.updateWorldMatrix(true,true);
      robot.traverseVisible(mesh=>{
        if(!mesh.isMesh)return;mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox;
        for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z]){
          p.set(x,y,z).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
          const ratio=((p.x-water.x)/rx)**2+((p.z-water.z)/rz)**2;
          if(ratio>maximum.ratio)maximum={ratio,mesh:mesh.name,phase:frame,x:p.x,z:p.z};
        }
      });
      advance();
    }
    assert.ok(maximum.ratio<=1.02,`pool ${rotation}: real mesh crosses oval water boundary: ${JSON.stringify(maximum)}`);
    c.stand();until(c,s=>s.action==='idle'&&!s.scheduled);
  }
});
