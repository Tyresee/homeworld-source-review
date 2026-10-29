import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createHomeElevator} from '../public/js/home-elevator-model.js';
import {createStaircase} from '../public/js/home-staircase.js';
import {createFloorStaircaseGroup,applyFloorElevatorFrame} from '../public/js/home-scene.js';
import {captureHomeFloor} from '../public/js/home-house-overview.js';
import {FLOOR_Y,STOREY_HEIGHT,ELEVATOR_DOOR_CLEAR_WIDTH,ELEVATOR_CABIN_CLEAR_HEIGHT,getStaircaseVolume} from '../public/js/home-staircase-shape.js';
const shape=(direction='up',rotation=0)=>({id:'elevator-fixture',type:'elevator',x:1.2,z:-.7,rotation,direction});
const close=(a,b,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const bounds=node=>{node.updateWorldMatrix(true,true);return new THREE.Box3().setFromObject(node);};

test('elevator dispatch retains the staircase surface identity, entry footprints and floor-local cabin datum',()=>{
 for(const direction of['up','down']){
  const stairs=shape(direction),model=createStaircase(stairs),frame=model.userData.elevatorFrame;
  assert.equal(model.name,'home-elevator');assert.equal(model.userData.stairId,stairs.id);assert.equal(model.userData.transportType,'elevator');
  close(frame.cabinY,FLOOR_Y);
  model.traverse(mesh=>{if(mesh.isMesh){assert.equal(mesh.userData.stairId,stairs.id);assert.equal(mesh.userData.stairDirection,direction);assert.equal(mesh.userData.transportType,'elevator');}});
  const floor=model.getObjectByName('elevator-cabin-floor');close(bounds(floor).max.y,FLOOR_Y);
  model.dispose();
 }
});

test('both parked heights and every moving sample stay in the dedicated elevator collision volume for all four directions',()=>{
 for(const direction of['up','down'])for(const rotation of[0,90,180,270]){
  const stairs=shape(direction,rotation),model=createHomeElevator(stairs),volume=getStaircaseVolume(stairs),base=direction==='down'?-STOREY_HEIGHT:0;
  assert.ok(volume);
  for(let n=0;n<=12;n++)for(const open of[0,.5,1]){
   model.userData.setElevatorFrame({cabinY:base+FLOOR_Y+STOREY_HEIGHT*n/12,doors:{lower:open,upper:open}});
   const b=bounds(model);
   for(const[axis,key]of[['x','X'],['y','Y'],['z','Z']]){assert.ok(b.min[axis]>=volume[`min${key}`]-1e-6,`${direction}/${rotation}/${n} min${key} ${b.min[axis]} < ${volume[`min${key}`]}`);assert.ok(b.max[axis]<=volume[`max${key}`]+1e-6,`${direction}/${rotation}/${n} max${key} ${b.max[axis]} > ${volume[`max${key}`]}`);}
  }model.dispose();
 }
});

test('sliding landing gates clear a real passenger-width opening and car gates stay closed between floors',()=>{
 const model=createHomeElevator(shape()),set=model.userData.setElevatorFrame;
 const left=model.getObjectByName('elevator-lower-landing-door-left'),right=model.getObjectByName('elevator-lower-landing-door-right');
 const carLeft=model.getObjectByName('elevator-cabin-front-door-left'),carRight=model.getObjectByName('elevator-cabin-front-door-right');
 set({cabinY:FLOOR_Y,doors:{lower:0,upper:0}});close(left.position.x,-.275);close(right.position.x,.275);
 set({cabinY:FLOOR_Y,doors:{lower:1,upper:0},phase:'boarding'});close(left.position.x,-.81);close(right.position.x,.81);close(carLeft.position.x,-.81);close(carRight.position.x,.81);
 // Leaf width is .54: 1.08 clear space remains between fully retracted leaves.
 close(right.position.x-.27-(left.position.x+.27),ELEVATOR_DOOR_CLEAR_WIDTH);
 set({cabinY:FLOOR_Y+STOREY_HEIGHT*.45,doors:{lower:1,upper:1},phase:'riding'});close(carLeft.position.x,-.275);close(carRight.position.x,.275);
 const cabinet=model.getObjectByName('elevator-cabin');close(cabinet.position.y,FLOOR_Y+STOREY_HEIGHT*.45);
 const canopy=model.getObjectByName('elevator-cabin-canopy-cross');assert.ok(bounds(canopy).min.y-cabinet.position.y>=ELEVATOR_CABIN_CLEAR_HEIGHT);
 const rearLeft=model.getObjectByName('elevator-cabin-rear-door-left');set({cabinY:FLOOR_Y+STOREY_HEIGHT,doors:{lower:0,upper:1},phase:'arriving'});close(rearLeft.position.x,-.81);
 model.dispose();
});

test('frame sampling clamps invalid heights, keeps controls readable and adds no clock, opaque roof or downloaded texture',()=>{
 const model=createHomeElevator(shape('down')),set=model.userData.setElevatorFrame,base=-STOREY_HEIGHT;
 set({cabinY:Infinity,doors:{lower:-5,upper:8}});close(model.userData.elevatorFrame.cabinY,FLOOR_Y);assert.deepEqual(model.userData.elevatorFrame.doors,{lower:0,upper:1});
 set({cabinY:-100});close(model.userData.elevatorFrame.cabinY,base+FLOOR_Y);set({cabinY:100});close(model.userData.elevatorFrame.cabinY,FLOOR_Y);
 let meshes=0,triangles=0,transparent=0;model.traverse(node=>{if(!node.isMesh)return;meshes++;triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;if(node.material.transparent){transparent++;assert.ok(node.material.opacity<=.12);assert.equal(node.material.depthWrite,false);}assert.equal(node.material.map,null);assert.notEqual(node.userData.elevatorPart,'opaque-roof');});
 assert.ok(meshes<150,`bounded meshes ${meshes}`);assert.ok(triangles<10_000,`bounded triangles ${triangles}`);assert.ok(transparent>0&&transparent<16,`bounded transparent panes ${transparent}`);model.dispose();
});

test('instances own resources and can be released once without affecting another elevator',()=>{
 const first=createHomeElevator(shape()),second=createHomeElevator(shape());
 const a=new Set(),b=new Set(),materials=new Set();first.traverse(n=>{if(n.isMesh){a.add(n.geometry);materials.add(n.material);}});second.traverse(n=>{if(n.isMesh)b.add(n.geometry);});
 for(const geo of a)assert.ok(!b.has(geo));let geometriesFreed=0,materialsFreed=0;
 for(const geo of a)geo.addEventListener('dispose',()=>geometriesFreed++);for(const mat of materials)mat.addEventListener('dispose',()=>materialsFreed++);
 first.dispose();first.dispose();assert.equal(geometriesFreed,a.size);assert.equal(materialsFreed,materials.size);assert.equal(first.children.length,0);
 assert.equal(second.userData.setElevatorFrame({cabinY:1.5}),true);assert.ok(second.children.length);second.dispose();
});

test('floor scene routing preserves model setters and only moves the matching live connection; null and reset park all cars',()=>{
 const first={...shape('down'),id:'floor-1-2'},second={...shape('up',90),id:'floor-2-3',x:6};
 const group=createFloorStaircaseGroup({staircases:[first,second]},1),[down,up]=group.children;
 assert.equal(typeof down.userData.setElevatorFrame,'function');assert.equal(typeof up.userData.setElevatorFrame,'function');
 assert.equal(down.userData.storeyTarget,0);assert.equal(up.userData.storeyTarget,2);
 assert.equal(applyFloorElevatorFrame(group,{stairId:first.id,cabinY:-1.6,doors:{lower:0,upper:0},phase:'riding'}),true);
 close(down.userData.elevatorFrame.cabinY,-1.6);close(up.userData.elevatorFrame.cabinY,FLOOR_Y);
 assert.equal(applyFloorElevatorFrame(group,{stairId:'different-connection',cabinY:2.4}),false);
 close(up.userData.elevatorFrame.cabinY,FLOOR_Y);
 applyFloorElevatorFrame(group,{stairId:second.id,cabinY:FLOOR_Y+STOREY_HEIGHT,doors:{lower:0,upper:1}});
 assert.deepEqual(up.userData.elevatorFrame.doors,{lower:0,upper:1});
 applyFloorElevatorFrame(group,{stairId:first.id,reset:true});
 for(const model of group.children){close(model.userData.elevatorFrame.cabinY,FLOOR_Y);assert.deepEqual(model.userData.elevatorFrame.doors,{lower:0,upper:0});}
 applyFloorElevatorFrame(group,{stairId:second.id,cabinY:2});applyFloorElevatorFrame(group,null);close(up.userData.elevatorFrame.cabinY,FLOOR_Y);
 for(const model of [...group.children])model.dispose();
 assert.equal(applyFloorElevatorFrame(group,{stairId:second.id,cabinY:2.9}),false);
 assert.equal(up.userData.setElevatorFrame({cabinY:2.9}),false,'retired models reject later robot frames');
 assert.equal(applyFloorElevatorFrame(null,null),false);
});

test('owned-resource retirement reports inactive cached lamp materials once and releases an animated cabin',()=>{
 const model=createHomeElevator(shape()),before=new Set();model.traverse(node=>{if(node.isMesh)before.add(node.material);});
 model.userData.setElevatorFrame({cabinY:FLOOR_Y+STOREY_HEIGHT,doors:{upper:1}});
 const released=new Set(),counts=new Map();
 model.dispose(resource=>{assert.ok(!released.has(resource));released.add(resource);resource.addEventListener('dispose',()=>counts.set(resource,(counts.get(resource)??0)+1));});
 for(const material of before)assert.ok(released.has(material),'including cached lower-floor lamps that are no longer mounted');
 assert.ok([...counts.values()].every(value=>value===1));const count=released.size;
 model.dispose(resource=>released.add(resource));assert.equal(released.size,count);assert.equal(model.children.length,0);
});

test('a three-storey overview captures each complete elevator connection once without hiding upstairs single-floor access',()=>{
 const a={...shape('up'),id:'floor-1-2'},b={...shape('up',90),id:'floor-2-3',x:6};
 const homes=[{staircases:[a]},{staircases:[{...a,direction:'down'},b]},{staircases:[{...b,direction:'down'}]}];
 const groups=homes.map((home,index)=>createFloorStaircaseGroup(home,index)),snapshots=groups.map((group,index)=>captureHomeFloor(group,{floorIndex:index,home:homes[index]}));
 const count=group=>{let value=0;group.traverse(node=>{if(node.isMesh)value++;});return value;};
 assert.equal(snapshots[0].userData.captureStats.sourceMeshes,count(groups[0]));
 assert.equal(snapshots[1].userData.captureStats.sourceMeshes,count(groups[1].children[1]),'middle floor only adds its upward connection');
 assert.equal(snapshots[2].userData.captureStats.sourceMeshes,0,'top floor does not add another complete copy of the lower shaft');
 const upstairs=groups[1].children[0];assert.equal(upstairs.visible,true);assert.ok(upstairs.children.every(child=>child.visible));
 assert.equal(applyFloorElevatorFrame(groups[1],{stairId:a.id,cabinY:-1.5,doors:{lower:0,upper:0}}),true);close(upstairs.userData.elevatorFrame.cabinY,-1.5);
 for(const snapshot of snapshots)snapshot.userData.dispose();for(const group of groups)for(const model of [...group.children])model.dispose();
});
