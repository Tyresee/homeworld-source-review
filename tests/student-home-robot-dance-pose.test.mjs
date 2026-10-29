import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createRobotAvatar,poseRobotAvatar,poseRobotDance,measureRobotStairRig,disposeRobotAvatar} from '../public/js/robot-avatar.js';
import {sampleRobotDance,DANCE_PERIOD,DANCE_CLEARANCE_RADIUS} from '../public/js/student-home-robot-dance.js';

let source;
before(async()=>{const bytes=await readFile(new URL('../public/assets/asset-lab/robot-v1/models/v4/robot.glb',import.meta.url));source=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;});
const joints=['robot-runtime-pose','HipRoot','Torso','Head','ShoulderL','ShoulderR','ElbowL','ElbowR','HipL','HipR','KneeL','KneeR','AnkleL','AnkleR'];
function measured(robot){
  robot.updateWorldMatrix(true,true);const inverse=robot.matrixWorld.clone().invert(),point=new THREE.Vector3(),matrix=new THREE.Matrix4(),soles={L:new THREE.Box3(),R:new THREE.Box3()};let radius=0;
  robot.traverseVisible(mesh=>{if(!mesh.isMesh)return;const positions=mesh.geometry.getAttribute('position');matrix.multiplyMatrices(inverse,mesh.matrixWorld);const side=mesh.name==='FootSoleL'?'L':mesh.name==='FootSoleR'?'R':null;for(let i=0;i<positions.count;i++){point.fromBufferAttribute(positions,i).applyMatrix4(matrix);radius=Math.max(radius,Math.hypot(point.x,point.z));if(side)soles[side].expandByPoint(point);}});return {radius,soles};
}
function transformSnapshot(robot){return joints.map(name=>robot.getObjectByName(name)).map(n=>[...n.position.toArray(),...n.quaternion.toArray(),...n.scale.toArray()]);}
const quaternions=robot=>Object.fromEntries(joints.map(name=>[name,robot.getObjectByName(name).quaternion.clone()]));

test('dance has a deterministic sixteen-second phrase cycle and bounded inputs',()=>{
  assert.equal(DANCE_PERIOD,16);assert.deepEqual(sampleRobotDance(0),sampleRobotDance(DANCE_PERIOD));
  for(const time of [NaN,Infinity,-Infinity,-12,1e7]){const pose=sampleRobotDance(time);assert.ok(pose.time>=0&&pose.time<DANCE_PERIOD);assert.ok(!JSON.stringify(pose).includes('null'));}
  assert.equal(sampleRobotDance(2,-1).blend,0);assert.equal(sampleRobotDance(2,5).blend,1);
  assert.deepEqual([.5,3,7,10,12,14].map(t=>sampleRobotDance(t).phase),['opening','moonwalk','side-glide','accents','spin','finish']);
});

test('moonwalk alternates toe support and flat backward slides with real body travel',()=>{
  const a=sampleRobotDance(2.3),b=sampleRobotDance(2.7),c=sampleRobotDance(3.3),d=sampleRobotDance(3.7);
  assert.ok(a.feet.L.pitch>.5&&b.feet.L.pitch>.5);assert.equal(a.feet.L.z,b.feet.L.z);
  assert.equal(a.feet.R.pitch,0);assert.equal(b.feet.R.y,0);assert.ok(b.feet.R.z<a.feet.R.z-.04);
  assert.ok(c.feet.R.pitch>.5&&d.feet.R.pitch>.5);assert.equal(c.feet.R.z,d.feet.R.z);
  assert.equal(c.feet.L.pitch,0);assert.ok(d.feet.L.z<c.feet.L.z-.08);
  assert.ok(sampleRobotDance(5.9).motion.z<-.29,'the body must actually travel backwards, not march in place');
  const sideA=sampleRobotDance(7.4),sideB=sampleRobotDance(7.6);
  assert.equal(sideA.feet.R.x,sideB.feet.R.x,'side glide keeps a separate support foot');
  assert.ok(Math.abs(sideA.feet.L.x-sideB.feet.L.x)>.06);
  assert.equal(sampleRobotDance(9).motion.x,0);assert.equal(sampleRobotDance(9).motion.z,0,'glides return to the chosen stage anchor');
});

test('real GLB contacts stay on the floor throughout all phrases without moving the outer navigation transform',t=>{
  const robot=createRobotAvatar(source);t.after(()=>disposeRobotAvatar(robot));measureRobotStairRig(robot);
  const parent=new THREE.Group();parent.position.set(4,3,-2);parent.rotation.y=.72;parent.add(robot);robot.position.set(-1,.08,2);robot.rotation.y=-.4;
  const rootPosition=robot.position.clone(),rootQuaternion=robot.quaternion.clone(),angles=new Map(joints.map(n=>[n,new Set()]));
  let previous=null,supportFrames=0,raisedFrames=0,maxRadius=0,maxSoleError=0;
  for(let index=0;index<=960;index++){
    const time=index/60,frame=sampleRobotDance(time);poseRobotDance(robot,{time});const actual=measured(robot);
    assert.ok(robot.position.distanceTo(rootPosition)<1e-12);assert.ok(robot.quaternion.angleTo(rootQuaternion)<1e-7);
    for(const side of ['L','R']){
      const offset=frame.feet[side],sole=actual.soles[side],error=Math.abs(sole.min.y-offset.y);maxSoleError=Math.max(maxSoleError,error);
      assert.ok(error<.002,`${side} rendered rubber-sole contact must follow floor height at ${time}: ${error}`);
      assert.ok(sole.min.y>=-.00001,'rubber soles never cut through the floor');
      if(offset.planted){supportFrames++;const before=previous?.frame.feet[side];if(before?.planted&&Math.abs(before.pitch-offset.pitch)<1e-6&&Math.abs(previous.frame.motion.yaw-frame.motion.yaw)<1e-6&&Math.abs(before.x-offset.x)+Math.abs(before.z-offset.z)<1e-6){assert.ok(sole.getCenter(new THREE.Vector3()).distanceTo(previous.actual.soles[side].getCenter(new THREE.Vector3()))<.002,'the supporting foot stays fixed while the pelvis/other foot moves');}}
      if(offset.y>.01)raisedFrames++;
    }
    const qs=quaternions(robot);
    for(const name of joints){angles.get(name).add(qs[name].toArray().map(n=>n.toFixed(3)).join(','));if(previous)assert.ok(qs[name].angleTo(previous.qs[name])<.23,`${name} snaps at ${time}`);}
    maxRadius=Math.max(maxRadius,actual.radius);previous={frame,actual,qs};
  }
  assert.ok(supportFrames>800&&raisedFrames>20);for(const name of ['KneeL','KneeR','ShoulderL','ShoulderR','Torso'])assert.ok(angles.get(name).size>25,`${name} needs distinct articulation`);
  assert.ok(maxRadius<DANCE_CLEARANCE_RADIUS-.025,`dance envelope ${maxRadius} must fit clearance ${DANCE_CLEARANCE_RADIUS}`);t.diagnostic(`960-frame real geometry: radius ${maxRadius.toFixed(4)} m, sole error ${maxSoleError.toFixed(6)} m`);
});

test('moonwalk visibly raises one heel while the flat foot slides and the toe support remains fixed',t=>{
  const robot=createRobotAvatar(source);t.after(()=>disposeRobotAvatar(robot));
  poseRobotDance(robot,{time:2.3});const a=measured(robot),ankle=robot.getObjectByName('AnkleL').getWorldQuaternion(new THREE.Quaternion());
  const normal=new THREE.Vector3(0,1,0).applyQuaternion(ankle);assert.ok(normal.y<.87,'the ankle must actually tilt the foot, not just label it raised');
  assert.ok(a.soles.L.max.y-a.soles.L.min.y>.14,'the raised heel is visible in the rendered foot geometry');
  poseRobotDance(robot,{time:2.7});const b=measured(robot);
  assert.ok(a.soles.L.getCenter(new THREE.Vector3()).distanceTo(b.soles.L.getCenter(new THREE.Vector3()))<.002);
  assert.ok(a.soles.R.getCenter(new THREE.Vector3()).distanceTo(b.soles.R.getCenter(new THREE.Vector3()))>.04);
});

test('freeze-and-fade exits at every phrase keep soles grounded and do not unwind a completed spin',t=>{
  const robot=createRobotAvatar(source);t.after(()=>disposeRobotAvatar(robot));
  for(const time of [.7,2.5,5.3,7.7,10.5,12.1,12.3,12.8,14]){
    let prior=null,totalTurn=0;
    for(let i=0;i<=40;i++){poseRobotDance(robot,{time,blend:1-i/40});const actual=measured(robot),q=quaternions(robot);
      assert.ok(actual.soles.L.min.y>=-.001&&actual.soles.R.min.y>=-.001,`exit at ${time} must stay above floor`);
      assert.ok(actual.radius<DANCE_CLEARANCE_RADIUS-.025);
      if(prior){for(const name of joints)assert.ok(q[name].angleTo(prior[name])<.12,`${name} snaps while fading at ${time}`);totalTurn+=q['robot-runtime-pose'].angleTo(prior['robot-runtime-pose']);}prior=q;
    }
    assert.ok(totalTurn<=Math.PI+.001,'leaving any spin pose must take the short way back');
    if(time>12.7)assert.ok(totalTurn<.001,'completed spin must not unwind during exit');
  }
});

test('blend zero exactly restores idle and the last dance frame loops without a joint jump',t=>{
  const robot=createRobotAvatar(source);t.after(()=>disposeRobotAvatar(robot));poseRobotAvatar(robot);const idle=transformSnapshot(robot);
  poseRobotDance(robot,{time:3.7});poseRobotDance(robot,{time:3.7,blend:0});assert.deepEqual(transformSnapshot(robot),idle);
  poseRobotDance(robot,{time:0});const start=transformSnapshot(robot);poseRobotDance(robot,{time:DANCE_PERIOD});assert.deepEqual(transformSnapshot(robot),start);
  poseRobotDance(robot,{time:DANCE_PERIOD-1/60});const prior=quaternions(robot);poseRobotDance(robot,{time:0});
  for(const name of joints)assert.ok(robot.getObjectByName(name).quaternion.angleTo(prior[name])<.03,`${name} jumps at the loop boundary`);
});
