import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createStudentHomeRobotController} from '../public/js/student-home-robot-controller.js';
import {createHomeState,applyChange} from '../public/js/home-engine.js';
import {isAvatarPositionWalkable} from '../public/js/home-avatar-navigation.js';
import {FLOOR_Y,STOREY_HEIGHT,ELEVATOR_DOOR_CLEAR_WIDTH,ELEVATOR_CABIN_CLEAR_HEIGHT} from '../public/js/home-staircase-shape.js';
import {ROBOT_CLOTHING_PRODUCTS} from '../public/js/robot-wardrobe-catalog.js';
import {createHomeElevator} from '../public/js/home-elevator-model.js';

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
function runUntil(controller,predicate,limit=1800){for(let i=0;i<limit;i++){if(predicate(controller.getState()))return;advance();}assert.fail(`Robot did not finish: ${JSON.stringify(controller.getState())}`);}
function floorsFor(rotation=0){
  const slab={rects:[{minX:-5,minZ:-5,width:10,depth:10}]},lift={id:'main-lift',type:'elevator',x:.55,z:-.35,rotation};
  const floors=[createHomeState({profile:'upper',slab}),createHomeState({profile:'upper',slab})];
  floors[0].stairs={...lift,direction:'up'};floors[1].stairs={...lift,direction:'down'};return floors;
}
function fixture(t,rotation=0,{handled=true,frameCallback=true}={}){
  const floors=floorsFor(rotation),events=[],statuses=[],modelFrames=[],floorRoot=new THREE.Group();let c;
  const options={source,parent:floorRoot,requestRender(){},onStatus:value=>statuses.push(value),onStoreyChange:event=>{
    events.push({event,frameReset:modelFrames.at(-1)?.reset,state:c.getState()});
    if(handled){floorRoot.position.y=event.index*STOREY_HEIGHT;c.setWorld(floors[event.index],event.index,{floors,arrivalPoint:event.point});}
  }};
  if(frameCallback)options.onElevatorFrame=value=>modelFrames.push(value===null?null:structuredClone(value));
  c=createStudentHomeRobotController(options);t.after(()=>c.dispose());c.setWorld(floors[0],0,{floors});return{c,floors,events,statuses,modelFrames,floorRoot};
}
function capture(c){
  const state=c.getState(),robot=c.group.getObjectByName('robot-avatar');robot.updateWorldMatrix(true,true);
  return {...state,globalRoot:robot.getWorldPosition(new THREE.Vector3()),rotation:robot.getWorldQuaternion(new THREE.Quaternion()),
    joints:Object.fromEntries(['HipL','HipR','KneeL','KneeR'].map(name=>[name,robot.getObjectByName(name).quaternion.clone()])),
    soles:['FootSoleL','FootSoleR'].map(name=>new THREE.Box3().setFromObject(robot.getObjectByName(name)).min.y)};
}
for(const rotation of[0,90,180,270])test(`actual v4 continuously boards, rides and leaves the elevator in both directions at ${rotation} degrees`,t=>{
  const {c,floors,events,modelFrames}=fixture(t,rotation);
  assert.ok(Math.abs(c.getState().navigation.radius-.4485902240491439)<1e-6,'test uses measured runtime v4 walk clearance');
  assert.deepEqual(c.listStairs(),[{id:'main-lift',type:'elevator',direction:'up',label:"DisplayText4026"}]);
  for(const direction of['up','down']){
    const start=c.getState().floor,target=1-start,phases=new Set(),walkJoints=new Set();let rideFrames=0,prior=capture(c),guarded=false;
    assert.equal(c.useStairs('main-lift').ok,true);assert.equal(events.length,start===0?0:1);
    for(let n=0;n<1400&&c.getState().floor===start;n++){
      advance();const state=capture(c);
      if(prior.action==='elevator'||state.action==='elevator'){
        assert.ok(prior.globalRoot.distanceTo(state.globalRoot)<.24,`${direction}: root jumps at ${prior.phase} -> ${state.phase}`);
        assert.ok(prior.rotation.angleTo(state.rotation)<.7,`${direction}: facing must remain continuous`);
        for(const joint of Object.keys(state.joints))assert.ok(prior.joints[joint].angleTo(state.joints[joint])<.7,`${direction}: actual ${joint} snaps at ${prior.phase} -> ${state.phase}`);
      }
      if(state.action==='elevator'){
        assert.equal(state.inTransition,true);assert.ok(state.transitionProgress>=0&&state.transitionProgress<=1);phases.add(state.phase);
        const emitted=modelFrames.at(-1);assert.equal(emitted.stairId,'main-lift');assert.equal(emitted.phase,state.phase);assert.deepEqual(emitted.doors,state.elevatorFrame.doors);
        assert.ok(!(emitted.doors.lower>1e-6&&emitted.doors.upper>1e-6),'only the stopped floor door may open');
        if(/board|leave/.test(state.phase))walkJoints.add(state.joints.HipL.toArray().map(n=>n.toFixed(3)).join(','));
        if(state.phase==='elevator-ride'){
          rideFrames++;assert.equal(emitted.doors.lower,0);assert.equal(emitted.doors.upper,0);
          assert.ok(Math.abs(state.point.x-floors[start].stairs.x)<1e-8&&Math.abs(state.point.z-floors[start].stairs.z)<1e-8,'cabin rises vertically at fixed x/z');
          for(const sole of state.soles)assert.ok(Math.abs(sole-(emitted.cabinY+start*STOREY_HEIGHT))<.006,'actual v4 sole rests on the moving cabin');
          if(!guarded){
            const before=capture(c);assert.equal(c.stand().ok,false);assert.equal(c.walk({x:3,z:3}).ok,false);assert.equal(c.interact('no-furniture','lie').ok,false);assert.equal(c.useStairs('main-lift').ok,false);assert.equal(c.wave(),false);
            const after=capture(c);assert.ok(before.globalRoot.distanceTo(after.globalRoot)<1e-9,'commands cannot teleport out during ride');assert.equal(after.phase,before.phase);guarded=true;
          }
        }
        if(['elevator-open','elevator-close','elevator-arrive','elevator-finish'].includes(state.phase)&&state.phase===prior.phase)assert.ok(prior.globalRoot.distanceTo(state.globalRoot)<1e-9,'waiting for doors cannot slide');
      }
      prior=state;
    }
    for(const phase of['align','turn','open','board','close','ride','arrive','leave','finish'])assert.ok(phases.has(`elevator-${phase}`),`missing ${phase}`);
    assert.ok(walkJoints.size>20,'the actual v4 walking rig articulates through doorway steps');assert.ok(rideFrames>40);assert.equal(c.getState().floor,target);assert.equal(c.getState().scheduled,false);
    assert.equal(c.getState().action,'idle');assert.equal(c.getState().elevatorFrame,null);assert.equal(modelFrames.at(-1).reset,true);assert.ok(events.at(-1).frameReset,'model is reset before floor callback');
    assert.equal(c.getState().point.y,FLOOR_Y);assert.ok(isAvatarPositionWalkable(floors[target],c.getState().point,c.getState().navigation));
  }
  assert.equal(events.length,2);assert.equal(c.getState().floor,0);
});

test('hiding, backgrounding, replacing a world and disposing reset cabin state and cancel every future floor callback',t=>{
  for(const mode of['hide','background','world','dispose']){
    const {c,floors,events,modelFrames}=fixture(t);document.hidden=false;
    assert.equal(c.useStairs('main-lift').ok,true);runUntil(c,state=>state.phase==='elevator-ride'&&state.transitionProgress>.3);
    const doorOutside={...c.getState().safePoint},empty=createHomeState({profile:'upper',slab:floors[0].slab});
    if(mode==='hide')c.setVisible(false);
    if(mode==='background'){document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));}
    if(mode==='world')c.setWorld(empty,0,{floors:[empty]});
    if(mode==='dispose')c.dispose();
    assert.equal(c.getState().scheduled,false);assert.equal(c.getState().elevatorFrame,null);assert.equal(c.getState().elevatorDirection,null);assert.equal(modelFrames.at(-1).reset,true);assert.equal(frames.size,0);
    for(let n=0;n<80;n++)advance();assert.equal(events.length,0,'cancelled connection must never change the next account or floor');
    if(mode!=='dispose'){
      assert.equal(c.getState().action,'idle');assert.equal(c.getState().point.y,FLOOR_Y);assert.ok(isAvatarPositionWalkable(mode==='world'?empty:floors[0],c.getState().point,c.getState().navigation));
      if(mode!=='world')assert.deepEqual(c.getState().safePoint,doorOutside);
    }
    c.dispose();document.hidden=false;
  }
});

test('missing paired lifts and blocked destination doors are rejected before approach or frame callbacks',t=>{
  const {c,floors,events,modelFrames}=fixture(t),mismatch=structuredClone(floors[1]);delete mismatch.stairs;
  c.setWorld(floors[0],0,{floors:[floors[0],mismatch]});assert.equal(c.useStairs('main-lift').ok,false);assert.equal(c.getState().scheduled,false);assert.equal(modelFrames.length,0);
  const blocked=applyChange(floors[1],{type:'furniture',id:'door-blocker',kind:'cabinet',x:.55,z:-2.50,rotation:0});assert.equal(blocked.ok,true,blocked.error);
  c.setWorld(floors[0],0,{floors:[floors[0],blocked.state]});assert.equal(c.useStairs('main-lift').ok,false);assert.equal(c.getState().scheduled,false);assert.equal(events.length,0);assert.equal(modelFrames.length,0);
});

test('optional frame callback does not prevent a complete ride, and an unhandled floor callback returns safely to the source door',t=>{
  const plain=fixture(t,90,{frameCallback:false});assert.equal(plain.c.useStairs('main-lift').ok,true);runUntil(plain.c,state=>state.floor===1);assert.equal(plain.events.length,1);assert.equal(plain.c.getState().elevatorFrame,null);plain.c.dispose();
  const unhandled=fixture(t,270,{handled:false});assert.equal(unhandled.c.useStairs('main-lift').ok,true);runUntil(unhandled.c,state=>unhandled.events.length===1);
  assert.equal(unhandled.c.getState().floor,0);assert.equal(unhandled.c.getState().action,'idle');assert.equal(unhandled.c.getState().scheduled,false);assert.equal(unhandled.c.getState().point.y,FLOOR_Y);assert.equal(unhandled.c.getState().elevatorFrame,null);
  assert.ok(isAvatarPositionWalkable(unhandled.floors[0],unhandled.c.getState().point,unhandled.c.getState().navigation));assert.equal(unhandled.statuses.at(-1).error,true);assert.match(unhandled.statuses.at(-1).message,/DisplayText4626/);assert.equal(unhandled.modelFrames.at(-1).reset,true);
});

test('all sold robot clothes fit the real open doors and the tallest equipped robot completes a round trip without hitting the model',t=>{
  const floors=floorsFor(),root=new THREE.Group(),models=floors.map(home=>createHomeElevator(home.stairs));
  let c;
  c=createStudentHomeRobotController({source,parent:root,requestRender(){},onElevatorFrame:frame=>{
    if(frame?.reset)models[c.getState().floor].userData.setElevatorFrame({});
    else models[c.getState().floor].userData.setElevatorFrame(frame);
  },onStoreyChange:event=>c.setWorld(floors[event.index],event.index,{floors,arrivalPoint:event.point})});
  t.after(()=>{c.dispose();models.forEach(model=>model.userData.dispose?.());});
  c.setWorld(floors[0],0,{floors});
  const maxima={radius:0,height:0},tallest={};
  for(const product of ROBOT_CLOTHING_PRODUCTS){
    c.setAvatar({equipped:{[product.slot]:product.skuId}});const navigation=c.getState().navigation;
    assert.ok(navigation.radius*2<ELEVATOR_DOOR_CLEAR_WIDTH,`${product.skuId}: equipped walk envelope exceeds real open doorway`);
    assert.ok(navigation.height<ELEVATOR_CABIN_CLEAR_HEIGHT,`${product.skuId}: equipment exceeds actual cabin headroom`);
    maxima.radius=Math.max(maxima.radius,navigation.radius);
    if(navigation.height>maxima.height){maxima.height=navigation.height;tallest[product.slot]=product.skuId;}
  }
  c.setAvatar({equipped:{outfit:'wear-storybook-knight',footwear:'wear-bear-slippers',...tallest}});
  const robot=c.group.getObjectByName('robot-avatar'),meshes=[];robot.traverse(mesh=>{if(mesh.isMesh&&!mesh.userData.robotActionProp)meshes.push(mesh);});
  const overlaps=(a,b)=>a.min.x<b.max.x-.003&&a.max.x>b.min.x+.003&&a.min.y<b.max.y-.003&&a.max.y>b.min.y+.003&&a.min.z<b.max.z-.003&&a.max.z>b.min.z+.003;
  for(const target of[1,0]){
    const start=c.getState().floor,model=models[start],solids=[];
    model.traverse(mesh=>{if(mesh.isMesh&&/(?:door-(?:kick|cap|stile|window)|portal-(?:jamb|header)|canopy|cabin-post|shaft-post)$/.test(mesh.userData.elevatorPart??''))solids.push(mesh);});
    assert.ok(solids.length>20);assert.equal(c.useStairs('main-lift').ok,true);let checked=0;
    for(let i=0;i<1400&&c.getState().floor===start;i++){
      advance();const state=c.getState();if(state.action!=='elevator')continue;robot.updateWorldMatrix(true,true);model.updateWorldMatrix(true,true);
      const boxes=solids.map(mesh=>({mesh,box:new THREE.Box3().setFromObject(mesh)}));
      for(const mesh of meshes){const bounds=new THREE.Box3().setFromObject(mesh);for(const solid of boxes)assert.equal(overlaps(bounds,solid.box),false,`${mesh.name} intersects ${solid.mesh.name} during ${state.phase}`);}
      checked++;
    }
    assert.ok(checked>100);assert.equal(c.getState().floor,target);
  }
});

test('a missing floor callback is safe and never leaves a robot suspended at the wrong floor height',t=>{
  const floors=floorsFor(),c=createStudentHomeRobotController({source,parent:new THREE.Group(),requestRender(){}});t.after(()=>c.dispose());
  c.setWorld(floors[0],0,{floors});assert.equal(c.useStairs('main-lift').ok,true);runUntil(c,state=>state.phase==='elevator-ride');runUntil(c,state=>state.action==='idle');
  assert.equal(c.getState().floor,0);assert.equal(c.getState().point.y,FLOOR_Y);assert.equal(c.getState().elevatorFrame,null);assert.equal(c.getState().scheduled,false);assert.ok(isAvatarPositionWalkable(floors[0],c.getState().point,c.getState().navigation));
});
