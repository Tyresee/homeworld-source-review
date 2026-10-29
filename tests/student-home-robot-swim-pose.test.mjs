import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createRobotAvatar,poseRobotAvatar,disposeRobotAvatar} from '../public/js/robot-avatar.js';

let source;
before(async()=>{
  const bytes=await readFile(new URL('../public/assets/asset-lab/robot-v1/models/v4/robot.glb',import.meta.url));
  source=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
});
function actor(t){const robot=createRobotAvatar(source);t.after(()=>disposeRobotAvatar(robot));return robot;}
function point(robot,name){robot.updateWorldMatrix(true,true);return robot.getObjectByName(name).getWorldPosition(new THREE.Vector3());}
const joints=['robot-runtime-pose','HipRoot','Torso','Head','ShoulderL','ShoulderR','ElbowL','ElbowR','HipL','HipR','KneeL','KneeR','AnkleL','AnkleR'];
function pose(robot){return joints.map(name=>{const part=robot.getObjectByName(name);return{position:part.position.clone(),quaternion:part.quaternion.clone()};});}

test('real robot swims prone around its torso waterline and keeps its face above the surface',t=>{
  const robot=actor(t);
  for(let frame=0;frame<40;frame++){
    poseRobotAvatar(robot,{action:'swim',time:frame/20});
    const head=point(robot,'Head'),hip=point(robot,'HipRoot'),ankle=point(robot,'AnkleL');
    const torso=new THREE.Box3().setFromObject(robot.getObjectByName('TorsoShell'));
    assert.ok(head.z>hip.z+.5&&ankle.z<hip.z-.35,'head leads and feet trail along local +Z');
    assert.ok(Math.abs(torso.getCenter(new THREE.Vector3()).y)<.04,'torso centre remains on the waterline');
    assert.ok(torso.min.y<-.10&&torso.max.y>.10,'body crosses the water rather than floating fully above it');
    assert.ok(point(robot,'EyeL').y>.07,'eyes stay above the water for a readable face');
    assert.ok(point(robot,'Mouth').y>0,'raised head keeps its face out of the water');
  }
});

test('alternating swim strokes move both real wrists and kick both legs in a seamless cycle',t=>{
  const robot=actor(t),samples=[];
  for(let frame=0;frame<=40;frame++){
    poseRobotAvatar(robot,{action:'swim',time:frame/20});
    samples.push(Object.fromEntries(['WristL','WristR','AnkleL','AnkleR'].map(name=>[name,point(robot,name)])));
  }
  for(const side of['L','R']){
    const hand=samples.map(sample=>sample[`Wrist${side}`]),foot=samples.map(sample=>sample[`Ankle${side}`]);
    assert.ok(Math.min(...hand.map(p=>p.y))<-.2,'submerged arm pull');
    assert.ok(Math.max(...hand.map(p=>p.y))>.15,'arm recovers clearly above water');
    assert.ok(Math.max(...hand.map(p=>p.z))-Math.min(...hand.map(p=>p.z))>.55,'stroke reaches ahead then behind');
    assert.ok(Math.max(...foot.map(p=>p.y))-Math.min(...foot.map(p=>p.y))>.08,'ankle really kicks');
  }
  const first=samples[0],last=samples.at(-1);
  for(const name of Object.keys(first))assert.ok(first[name].distanceTo(last[name])<1e-6,`${name} loops without a seam`);
  assert.ok(samples.some(sample=>sample.WristL.y>.03&&sample.WristR.y<-.03||sample.WristR.y>.03&&sample.WristL.y<-.03),'one arm recovers while the other pulls');
});

test('immersion can blend continuously from standing to swimming while preserving external position and heading',t=>{
  const robot=actor(t);
  poseRobotAvatar(robot,{action:'swim',time:0,swimBlend:0});
  robot.updateWorldMatrix(true,true);
  const sole=new THREE.Box3().setFromObject(robot.getObjectByName('FootSoleL'));
  assert.ok(Math.abs(sole.min.y)<1e-6,'blend zero is standing on the caller ground');
  let previous=pose(robot);
  for(let frame=1;frame<=100;frame++){
    poseRobotAvatar(robot,{action:'swim',time:frame/150,swimBlend:frame/100});
    const next=pose(robot);
    next.forEach((part,index)=>{
      assert.ok(part.position.distanceTo(previous[index].position)<.04,'immersion has no translation jump');
      assert.ok(part.quaternion.angleTo(previous[index].quaternion)<.12,'immersion has no joint rotation jump');
    });previous=next;
  }
  robot.position.set(5,.3,-2);robot.rotation.set(0,1.2,0);
  const position=robot.position.clone(),heading=robot.quaternion.clone();
  for(const swimBlend of[0,.25,.75,1]){
    poseRobotAvatar(robot,{action:'swim',time:1.25,swimBlend});
    assert.ok(robot.position.equals(position));assert.ok(robot.quaternion.equals(heading));
  }
});

test('leaving after a long swim never unwinds accumulated arm revolutions',t=>{
  const robot=actor(t);
  for(const elapsed of[40,78.5,1024.75]){
    poseRobotAvatar(robot,{action:'swim',time:elapsed,swimBlend:1});let previous=pose(robot);
    for(let frame=1;frame<=80;frame++){
      poseRobotAvatar(robot,{action:'swim',time:elapsed+frame/80,swimBlend:1-frame/80});
      const next=pose(robot);
      next.forEach((part,index)=>assert.ok(part.quaternion.angleTo(previous[index].quaternion)<.15,'exit blend has no accumulated rotation spin'));
      previous=next;
    }
  }
});

test('swimming changes are isolated to the instance and the original idle pose can be restored exactly',t=>{
  const robot=actor(t),other=actor(t);poseRobotAvatar(robot);poseRobotAvatar(other);
  const original=pose(robot),untouched=pose(other);
  poseRobotAvatar(robot,{action:'swim',time:21.37});poseRobotAvatar(robot);
  const restored=pose(robot),stillUntouched=pose(other);
  restored.forEach((part,index)=>{
    assert.ok(part.position.distanceTo(original[index].position)<1e-8);
    assert.ok(part.quaternion.angleTo(original[index].quaternion)<1e-7);
    assert.ok(stillUntouched[index].position.equals(untouched[index].position));
    assert.ok(stillUntouched[index].quaternion.equals(untouched[index].quaternion));
  });
});
