import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createStudentHomeRobotController} from '../public/js/student-home-robot-controller.js';
import {createHomeState,applyChange} from '../public/js/home-engine.js';
import {isAvatarPositionWalkable} from '../public/js/home-avatar-navigation.js';
import {createStaircase} from '../public/js/home-staircase.js';
import {STAIR_STEP_COUNT,STOREY_HEIGHT,FLOOR_Y} from '../public/js/home-staircase-shape.js';

let source,old,frames,serial=0;
before(async()=>{
  const bytes=await readFile(new URL('../public/assets/asset-lab/robot-v1/models/v4/robot.glb',import.meta.url));
  source=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  old={document:globalThis.document,raf:globalThis.requestAnimationFrame,cancel:globalThis.cancelAnimationFrame};
  globalThis.document=new EventTarget();document.hidden=false;frames=new Map();
  globalThis.requestAnimationFrame=callback=>{frames.set(++serial,callback);return serial;};
  globalThis.cancelAnimationFrame=id=>frames.delete(id);
});
after(()=>{globalThis.document=old.document;globalThis.requestAnimationFrame=old.raf;globalThis.cancelAnimationFrame=old.cancel;});
function advance(){const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback(performance.now()+50));}
function floorsFor(rotation=0){
  const slab={rects:[{minX:-5,minZ:-5,width:10,depth:10}]},stairs={id:'main-stairs',x:.55,z:-.35,rotation};
  const floors=[createHomeState({profile:'upper',slab}),createHomeState({profile:'upper',slab})];
  floors[0].stairs={...stairs,direction:'up'};floors[1].stairs={...stairs,direction:'down'};return floors;
}
function geometryFor(stairs,parent=null){
  const model=createStaircase(stairs);parent?.add(model);model.updateWorldMatrix(true,true);
  const inverse=model.matrixWorld.clone().invert(),treads=[],solids=[],landings=[];
  for(const mesh of model.children){
    if(!mesh.isMesh)continue;
    const box=new THREE.Box3().setFromObject(mesh).applyMatrix4(inverse),row={name:mesh.name,box};
    if(mesh.name==='stairs-straight-tread')treads.push(row);
    if(/stairs-straight-(tread|riser)$/.test(mesh.name))solids.push(row);
    if(/stairs-(lower|upper)-landing$/.test(mesh.name))landings.push(row);
  }
  const dispose=()=>{model.removeFromParent();model.traverse(mesh=>{mesh.geometry?.dispose();for(const material of[].concat(mesh.material??[]))material.dispose();});};
  return {model,inverse,treads,solids,landings,dispose};
}
const JOINTS=['HipL','HipR','KneeL','KneeR','AnkleL','AnkleR'];
function capture(controller){
  const state=controller.getState(),robot=controller.group.getObjectByName('robot-avatar');robot.updateWorldMatrix(true,true);
  const feet=Object.fromEntries(['L','R'].map(side=>{
    const sole=robot.getObjectByName(`FootSole${side}`),box=new THREE.Box3().setFromObject(sole),centre=box.getCenter(new THREE.Vector3());centre.y=box.min.y;
    return [side,{box,centre,orientation:sole.getWorldQuaternion(new THREE.Quaternion())}];
  }));
  return {...state,root:robot.position.clone(),rotation:robot.quaternion.clone(),feet,joints:Object.fromEntries(JOINTS.map(name=>[name,robot.getObjectByName(name).quaternion.clone()]))};
}
function overlapping(a,b,epsilon=.002){return a.min.x<b.max.x-epsilon&&a.max.x>b.min.x+epsilon&&a.min.y<b.max.y-epsilon&&a.max.y>b.min.y+epsilon&&a.min.z<b.max.z-epsilon&&a.max.z>b.min.z+epsilon;}
function onSurface(foot,surface,tolerance=.006){
  const c=foot.getCenter(new THREE.Vector3());
  return Math.abs(foot.min.y-surface.max.y)<=tolerance&&c.x>=surface.min.x-tolerance&&c.x<=surface.max.x+tolerance&&c.z>=surface.min.z-tolerance&&c.z<=surface.max.z+tolerance;
}
function assertContinuous(a,b,label){
  const globalRoot=sample=>sample.root.clone().add(new THREE.Vector3(0,sample.floor*STOREY_HEIGHT,0));
  assert.ok(globalRoot(a).distanceTo(globalRoot(b))<.22,`${label}: body teleports between ${a.phase} and ${b.phase}`);
  assert.ok(a.rotation.angleTo(b.rotation)<.7,`${label}: body facing snaps`);
  for(const name of JOINTS){const jump=a.joints[name].angleTo(b.joints[name]);assert.ok(jump<.7,`${label}: ${name} jumps ${jump.toFixed(3)} rad at step ${b.stairStep?.index} between ${a.phase} and ${b.phase}`);}
  for(const side of ['L','R']){
    const p=a.feet[side].centre.clone().add(new THREE.Vector3(0,a.floor*STOREY_HEIGHT,0)),q=b.feet[side].centre.clone().add(new THREE.Vector3(0,b.floor*STOREY_HEIGHT,0));
    assert.ok(p.distanceTo(q)<.24,`${label}: actual ${side} sole teleports ${p.distanceTo(q).toFixed(3)} m`);
  }
}
function fixture(t,rotation=0,{handleChange=true}={}){
  const floors=floorsFor(rotation),changes=[],statuses=[];let controller;
  controller=createStudentHomeRobotController({source,parent:new THREE.Group(),requestRender(){},onStatus:value=>statuses.push(value),onStoreyChange:event=>{
    changes.push({event,before:capture(controller)});
    if(handleChange)controller.setWorld(floors[event.index],event.index,{floors,arrivalPoint:event.point});
  }});t.after(()=>controller.dispose());controller.setWorld(floors[0],0,{floors});return {controller,floors,changes,statuses};
}

for(const rotation of[0,90,180,270])test(`actual v4 soles climb and descend every real tread with alternating support at ${rotation} degrees`,t=>{
  const {controller:c,floors,changes}=fixture(t,rotation),tripSamples=[];
  for(const direction of ['up','down']){
    const start=c.getState().floor,target=1-start,geometry=geometryFor(floors[start].stairs);t.after(geometry.dispose);
    const touches=geometry.treads.map(()=>new Set()),phases=new Set(),steps=new Map(),jointAngles=Object.fromEntries(JOINTS.map(name=>[name,new Set()]));
    assert.equal(geometry.treads.length,STAIR_STEP_COUNT);assert.equal(c.useStairs('main-stairs').ok,true);
    let previous=capture(c),supportPairs=0,swingFrames=0,stairFrames=0;
    for(let n=0;n<1800&&c.getState().floor===start;n++){
      advance();const sample=capture(c);tripSamples.push(sample);
      if(previous.action==='stairs'||sample.action==='stairs')assertContinuous(previous,sample,`${direction}/${rotation}`);
      if(sample.action==='stairs'){
        stairFrames++;const step=sample.stairStep;
        if(!step){assert.ok(['stair-align','stair-turn'].includes(sample.phase),`${direction}: real footstep state must be exposed after entry alignment`);previous=sample;continue;}
        assert.ok(Number.isInteger(step.index)&&Number.isFinite(step.progress)&&step.progress>=0&&step.progress<=1);
        if(step.index>=0){assert.ok(['L','R'].includes(step.swingFoot));assert.equal(step.supportFoot,step.swingFoot==='L'?'R':'L');steps.set(step.index,{tread:step.treadIndex,swing:step.swingFoot});}
        else assert.ok(['stair-ready','stair-finish'].includes(step.phase));
        phases.add(step.phase);
        for(const name of JOINTS)jointAngles[name].add(sample.joints[name].toArray().map(value=>value.toFixed(3)).join(','));
        for(const side of ['L','R']){
          const foot=sample.feet[side],goal=step.feet[side],local=foot.box.clone().applyMatrix4(geometry.inverse);
          assert.ok(foot.centre.distanceTo(new THREE.Vector3(goal.x,goal.y,goal.z))<.005,`${direction} step ${step.index}: actual ${side} sole does not follow its contact target`);
          for(const solid of geometry.solids)assert.equal(overlapping(local,solid.box),false,`${direction} step ${step.index}/${step.phase}: actual ${side} sole intersects ${solid.name}`);
          if(step.planted[side]){
            assert.ok(local.max.y-local.min.y<.045,`${direction}: planted sole must rest flat, not pivot through the tread`);
            geometry.treads.forEach((tread,index)=>{if(onSurface(local,tread.box))touches[index].add(side);});
            if(previous.action==='stairs'&&previous.stairStep?.index===step.index&&previous.stairStep.planted[side]){
              const drift=previous.feet[side].centre.distanceTo(foot.centre);assert.ok(drift<.002,`${direction} step ${step.index}: planted ${side} foot slides ${drift.toFixed(4)} m`);supportPairs++;
            }
            const anySurface=[...geometry.treads,...geometry.landings].some(row=>onSurface(local,row.box));
            const floorHeight=direction==='up'?FLOOR_Y:FLOOR_Y-STOREY_HEIGHT;
            const upperHeight=floorHeight+STOREY_HEIGHT;
            assert.ok(anySurface||Math.abs(local.min.y-floorHeight)<.006||Math.abs(local.min.y-upperHeight)<.006,`${direction}: planted ${side} foot floats between physical steps`);
          }else if(side===step.swingFoot)swingFrames++;
        }
      }
      previous=sample;
    }
    assert.equal(c.getState().floor,target,`${direction}: only completed steps may change the floor`);assert.equal(c.getState().scheduled,false);
    assert.ok(stairFrames>100&&supportPairs>100&&swingFrames>50,'steps must contain visible supported intermediate frames');
    for(const phase of ['weight-shift','foot-lift','foot-travel','foot-land','settle'])assert.ok(phases.has(phase),`missing ${phase}`);
    touches.forEach((feet,index)=>assert.deepEqual([...feet].sort(),['L','R'],`${direction}: both real feet must arrive on physical tread ${index+1}`));
    const leaders=[];for(const value of steps.values())if(Number.isInteger(value.tread)&&value.tread>=0&&value.tread<STAIR_STEP_COUNT&&!leaders.some(row=>row.tread===value.tread))leaders.push(value);
    assert.equal(leaders.length,STAIR_STEP_COUNT);for(let index=1;index<leaders.length;index++)assert.notEqual(leaders[index].swing,leaders[index-1].swing,'the leading foot alternates on successive treads');
    for(const name of JOINTS)assert.ok(jointAngles[name].size>12,`${name} must articulate through intermediate stair poses`);
    const arrival=changes.at(-1),last=arrival.before;
    assert.equal(arrival.event.index,target);assert.equal(last.action,'idle');assert.ok(isAvatarPositionWalkable(floors[target],c.getState().point,c.getState().navigation));
    assert.ok(Math.abs(last.feet.L.centre.y-last.feet.R.centre.y)<.006,'both feet settle on the exit before changing floors');
  }
  assert.equal(changes.length,2);assert.ok(tripSamples.length>250);
});

test('hiding, backgrounding, replacing a home, and disposal cancel a mid-step without a delayed floor change',t=>{
  const {controller:c,floors,changes}=fixture(t),empty=createHomeState({profile:'upper',slab:floors[0].slab});
  for(const cancel of ['hide','background','world','dispose']){
    document.hidden=false;c.setVisible(true);c.setWorld(floors[0],0,{floors});assert.equal(c.useStairs('main-stairs').ok,true);
    for(let n=0;n<1000;n++){advance();const step=c.getState().stairStep;if(c.getState().action==='stairs'&&step?.treadIndex>=4&&step.phase==='foot-travel')break;}
    assert.equal(c.getState().action,'stairs');assert.ok(c.getState().stairStep?.treadIndex>=4,'cancel a real raised-foot phase, not the approach walk');
    if(cancel==='hide')c.setVisible(false);
    if(cancel==='background'){document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));}
    if(cancel==='world')c.setWorld(empty,0,{floors:[empty]});
    if(cancel==='dispose')c.dispose();
    assert.equal(c.getState().scheduled,false);assert.equal(c.getState().stairDirection,null);assert.equal(c.getState().stairStep,null);assert.equal(frames.size,0);
    for(let n=0;n<50;n++)advance();assert.equal(changes.length,0,'an obsolete stair journey cannot change the next student/floor');
    if(cancel!=='dispose'){assert.equal(c.getState().action,'idle');assert.ok(isAvatarPositionWalkable(cancel==='world'?empty:floors[0],c.getState().point,c.getState().navigation));}
  }
  document.hidden=false;
});

test('blocked exits reject a stair journey and an unhandled completed switch still returns to the safe entrance',t=>{
  const blocked=fixture(t,90),c=blocked.controller;
  const exit={x:blocked.floors[1].stairs.x-2.2,z:blocked.floors[1].stairs.z};
  const placement=applyChange(blocked.floors[1],{type:'furniture',id:'exit-blocker',kind:'cabinet',...exit,rotation:90});assert.equal(placement.ok,true,placement.error);
  c.setWorld(blocked.floors[0],0,{floors:[blocked.floors[0],placement.state]});assert.equal(c.useStairs('main-stairs').ok,false);assert.equal(c.getState().scheduled,false);
  c.dispose();
  const unhandled=fixture(t,270,{handleChange:false}),actor=unhandled.controller;assert.equal(actor.useStairs('main-stairs').ok,true);
  for(let n=0;n<1800&&!unhandled.changes.length;n++)advance();
  assert.equal(unhandled.changes.length,1);assert.equal(actor.getState().floor,0);assert.equal(actor.getState().action,'idle');assert.equal(actor.getState().scheduled,false);assert.equal(actor.getState().stairStep,null);
  assert.ok(isAvatarPositionWalkable(unhandled.floors[0],actor.getState().point,actor.getState().navigation));assert.equal(unhandled.statuses.at(-1).error,true);
});

test('all four sold footwear variants keep their actual shoe meshes clear of the stairs in both directions',t=>{
  const {controller:c,floors}=fixture(t,90),robot=c.group.getObjectByName('robot-avatar');
  for(const sku of ['wear-canvas-sneakers','wear-puddle-boots','wear-bear-slippers','wear-ankle-boots']){
    c.setAvatar({equipped:{outfit:'wear-forest-explorer',headwear:'wear-baseball-cap',footwear:sku}});
    const shoes=[];robot.traverse(mesh=>{if(mesh.isMesh&&mesh.userData.slot==='footwear')shoes.push(mesh);});assert.ok(shoes.length>=4,`${sku}: inspect the equipped shoe geometry`);
    for(const direction of ['up','down']){
      const start=c.getState().floor,geometry=geometryFor(floors[start].stairs);t.after(geometry.dispose);assert.equal(c.useStairs('main-stairs').ok,true);let checked=0;
      for(let n=0;n<1800&&c.getState().floor===start;n++){
        advance();const state=c.getState();if(state.action!=='stairs')continue;
        robot.updateWorldMatrix(true,true);
        for(const mesh of shoes){const box=new THREE.Box3().setFromObject(mesh).applyMatrix4(geometry.inverse);
          for(const solid of geometry.solids)assert.equal(overlapping(box,solid.box),false,`${sku}/${direction}/${state.phase}: ${mesh.name} penetrates ${solid.name}`);
        }
        checked++;
      }
      assert.ok(checked>100);assert.equal(c.getState().floor,1-start);assert.equal(c.getState().scheduled,false);
    }
  }
});

test('a complete upstairs and downstairs trip preserves physical tread contact under floor offsets and transformed parents',t=>{
  for(const transform of [{label:'floor offset',position:[0,0,0],rotation:0,scale:1},{label:'translated rotated scaled estate',position:[7,1.25,-4],rotation:Math.PI/2,scale:1.4}]){
    const estate=new THREE.Group(),floorRoot=new THREE.Group();estate.add(floorRoot);
    const floors=floorsFor(90),changes=[];let controller;
    controller=createStudentHomeRobotController({source,parent:floorRoot,requestRender(){},onStoreyChange:event=>{
      changes.push(event);floorRoot.position.y=event.index*STOREY_HEIGHT;
      controller.setWorld(floors[event.index],event.index,{floors,arrivalPoint:event.point});
    }});t.after(()=>controller.dispose());
    // Clothing calibration remains in its supported normal scene. Only the
    // subsequent stair runtime and its renderer ancestry are transformed.
    controller.setAvatar({equipped:{footwear:'wear-puddle-boots'}});
    estate.position.fromArray(transform.position);estate.rotation.y=transform.rotation;estate.scale.setScalar(transform.scale);
    controller.setWorld(floors[0],0,{floors});
    const robot=controller.group.getObjectByName('robot-avatar'),shoes=[];
    robot.traverse(mesh=>{if(mesh.isMesh&&mesh.userData.slot==='footwear')shoes.push(mesh);});assert.ok(shoes.length>=4);
    for(const direction of ['up','down']){
      const start=controller.getState().floor,target=1-start,geometry=geometryFor(floors[start].stairs,floorRoot),touches=geometry.treads.map(()=>new Set());t.after(geometry.dispose);
      assert.equal(floorRoot.position.y,start*STOREY_HEIGHT);assert.equal(controller.useStairs('main-stairs').ok,true);let checked=0,previous=null;
      for(let n=0;n<1800&&controller.getState().floor===start;n++){
        advance();const sample=capture(controller),step=sample.stairStep;if(sample.action!=='stairs'||!step)continue;
        assert.equal(step.coordinateSpace,'floor-local');controller.group.updateWorldMatrix(true,false);
        for(const side of ['L','R']){
          const foot=sample.feet[side],goal=step.feet[side],worldGoal=new THREE.Vector3(goal.x,goal.y,goal.z).applyMatrix4(controller.group.matrixWorld),local=foot.box.clone().applyMatrix4(geometry.inverse);
          assert.ok(foot.centre.distanceTo(worldGoal)<.005*transform.scale,`${transform.label}/${direction}: actual ${side} sole was solved in the wrong coordinate space`);
          for(const solid of geometry.solids)assert.equal(overlapping(local,solid.box),false,`${transform.label}/${direction}/${step.phase}: real ${side} sole penetrates ${solid.name}`);
          if(step.planted[side]){
            geometry.treads.forEach((tread,index)=>{if(onSurface(local,tread.box))touches[index].add(side);});
            if(previous?.stairStep.index===step.index&&previous.stairStep.planted[side])assert.ok(foot.centre.distanceTo(previous.feet[side].centre)<.002*transform.scale,`${transform.label}/${direction}: support foot slides in world space`);
          }
        }
        for(const mesh of shoes){const local=new THREE.Box3().setFromObject(mesh).applyMatrix4(geometry.inverse);
          for(const solid of geometry.solids)assert.equal(overlapping(local,solid.box),false,`${transform.label}/${direction}/${step.phase}: ${mesh.name} penetrates ${solid.name}`);
        }
        checked++;previous=sample;
      }
      assert.ok(checked>100);assert.equal(controller.getState().floor,target);assert.equal(controller.getState().scheduled,false);assert.equal(floorRoot.position.y,target*STOREY_HEIGHT);
      touches.forEach((feet,index)=>assert.deepEqual([...feet].sort(),['L','R'],`${transform.label}/${direction}: both actual soles must contact real tread ${index+1}`));
      geometry.model.removeFromParent();
    }
    assert.equal(changes.length,2);assert.equal(floorRoot.position.y,0);
  }
});
