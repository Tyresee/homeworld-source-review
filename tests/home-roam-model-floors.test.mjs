import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createHomeRoamModel} from '../public/js/home-roam-model.js';
import {HOME_THEMES} from '../public/js/home-theme.js';
import {createAccountCommerce,prepareCommerceCommand,validateAccountCommerce} from '../server/student-homes/commerce.mjs';
import {getFloorHomes,getStoreyRoomSlots} from '../public/js/home-commerce.js';
import {applyChange,getFurniturePose,roomRect} from '../public/js/home-engine.js';
import {getHomeStairs,STOREY_HEIGHT,FLOOR_Y} from '../public/js/home-staircase-shape.js';
import {WALL_HEIGHT} from '../public/js/home-room-expansion.js';
import {ROAM_FLOOR_Y} from '../public/js/home-roam-geometry.js';
import {getFloorTextureCacheStats} from '../public/js/home-floor-textures.js';
import {getWallTextureCacheStats} from '../public/js/home-wall-textures.js';

let previousDocument;
before(()=>{previousDocument=globalThis.document;globalThis.document={createElement(){const context=new Proxy({},{get:(target,key)=>target[key]??(()=>{}),set:(target,key,value)=>(target[key]=value,true)});return {width:0,height:0,getContext:()=>context};}};});
after(()=>{globalThis.document=previousDocument;});
const nodes=root=>{const rows=[];root.traverse(node=>rows.push(node));return rows;};
const near=(a,b)=>assert.ok(Math.abs(a-b)<3e-5,`${a} != ${b}`);
const area={minX:-5.6,minZ:-3.8,width:11.2,depth:7.8};
function account({count=2,elevator=null,decorated=false}={}){
  let state=createAccountCommerce(),serial=0;
  const run=command=>{state=prepareCommerceCommand(state,command,`roam-floor-fixture-${++serial}`).commerce;};
  for(let storey=0;storey<count;storey++)run({type:'constructFloor',selection:{storey,rects:[area]}});
  if(elevator!==null){
    const stair=getHomeStairs(getFloorHomes(state)[elevator]).find(row=>row.direction==='up');
    // Give the two real middle-floor connections separate clear landings in
    // this isolated fixture, using the same engine checks as existing stairs.
    if(count>2)for(const index of [elevator,elevator+1]){
      const home=getFloorHomes(state)[index],peer=getHomeStairs(home).find(row=>row.id===stair.id),moved=applyChange(home,{type:'stairs',stairs:{...peer,x:3.4,z:0}});assert.equal(moved.ok,true,moved.error);
      if(index===0)state.home=moved.state;else state.upperFloors[index-1]=moved.state;
    }
    run({type:'upgradeStaircase',id:stair.id,storey:elevator});
  }
  if(decorated){
    run({type:'checkout',lines:[{skuId:'room-kitchen-compact',quantity:1},{skuId:'room-bedroom-compact',quantity:1},{skuId:'plant-classic',quantity:2}]});
    for(const [skuId,storey]of [['room-kitchen-compact',0],['room-bedroom-compact',1]]){
      const owned=state.owned.find(row=>row.skuId===skuId),slot=getStoreyRoomSlots(state,owned.item.kind,storey)[0];assert.ok(slot);
      run({type:'placeRoom',id:owned.id,pose:{cx:slot.cx,cz:slot.cz,...slot.bounds?{bounds:slot.bounds}:{}},storey});
    }
    const plants=state.owned.filter(row=>row.skuId==='plant-classic'),upper=getFloorHomes(state)[1],bedroom=roomRect(upper.rooms[0]);
    run({type:'placeItem',id:plants[0].id,pose:{x:2,z:2,rotation:0},storey:0});
    run({type:'placeItem',id:plants[1].id,pose:{x:bedroom.x,z:bedroom.z,rotation:90},storey:1});
  }
  assert.equal(validateAccountCommerce(state),true);return state;
}
function modelFor(state,options={}){const floors=getFloorHomes(state);return createHomeRoamModel({home:floors[0],floors,theme:HOME_THEMES.warm,...options});}
function visibleMeshes(root){return nodes(root).filter(node=>node.isMesh&&(()=>{for(let p=node;p;p=p.parent)if(!p.visible)return false;return true;})());}

test('the visitor builds every real floor layout and furnishing at its actual storey height',()=>{
  const state=account({elevator:0,decorated:true}),before=JSON.stringify(state),floors=getFloorHomes(state),model=modelFor(state);
  try{
    assert.equal(model.floorCount,2);assert.equal(model.floorModels.length,2);assert.equal(model.manor.userData.manorFloors.length,2);
    assert.equal(model.architecture,model.floorModels[0].architecture);assert.notDeepEqual(floors[0].rooms.map(room=>room.kind),floors[1].rooms.map(room=>room.kind));
    assert.equal(model.furniture.length,2);assert.equal(model.floorModels[0].furniture.length,1);assert.equal(model.floorModels[1].furniture.length,1);
    model.scene.updateMatrixWorld(true);
    for(const row of model.floorModels){
      near(row.group.position.y,row.storey*STOREY_HEIGHT);assert.deepEqual(row.architecture.userData.rooms,row.home.rooms);
      assert.ok(row.architecture.getRoamWalls().length);assert.ok(row.ceilings.length);assert.ok(row.ceilingLights.length);
      for(const furniture of row.furniture){const expected=getFurniturePose(row.home,furniture.item),world=furniture.group.getWorldPosition(new THREE.Vector3());near(world.x,expected.x);near(world.y,expected.y+row.baseY);near(world.z,expected.z);assert.equal(furniture.storey,row.storey);}
      for(const light of row.ceilingLights){near(light.light.getWorldPosition(new THREE.Vector3()).y,light.worldPoint.y);assert.equal(light.storey,row.storey);assert.equal(light.light.castShadow,false);}
      assert.ok(nodes(row.group).filter(node=>node.isMesh).every(node=>node.userData.roamStorey===row.storey));
    }
    assert.equal(new Set(model.ceilingLights.map(light=>light.id)).size,model.ceilingLights.length);
    assert.ok(model.floorModels[1].ceilingLights.every(light=>light.id.startsWith('ceiling:1:')));
    near(model.interiorBounds.max.y,STOREY_HEIGHT+ROAM_FLOOR_Y+WALL_HEIGHT);
    assert.ok(model.buildingBounds.max.y>STOREY_HEIGHT+WALL_HEIGHT);
    assert.ok(nodes(model.scene).filter(node=>node.isMesh).every(node=>Number.isInteger(node.userData.roamStorey)));
    assert.equal(model.floorModels[1].architecture.getRoamWalls().filter(wall=>wall.userData.roamWall.entrance).length,0,'upper floors have no invented exterior entry');
    assert.equal(JSON.stringify(state),before);
  }finally{model.dispose();}
});

test('one real straight staircase includes its upstairs guards and genuinely open floor and ceiling geometry',()=>{
  const state=account(),model=modelFor(state);
  try{
    assert.equal(model.transports.length,1);const transport=model.transports[0];assert.equal(transport.type,'stairs');
    assert.equal(model.floorModels[0].transports[0],model.floorModels[1].transports[0]);
    const pieces=nodes(transport.model);assert.equal(pieces.filter(node=>node.name==='stairs-straight-tread').length,16);assert.ok(pieces.some(node=>node.name==='stairs-opening-side'));
    assert.equal(nodes(model.scene).filter(node=>node.name==='main-staircase').length,1);
    near(transport.landings.lower.position.y,FLOOR_Y);near(transport.landings.upper.position.y,FLOOR_Y+STOREY_HEIGHT);
    const point=new THREE.Vector3(transport.stairs.x,STOREY_HEIGHT-.6,transport.stairs.z),up=new THREE.Vector3(0,1,0);
    const surfaces=visibleMeshes(model.scene).filter(mesh=>mesh.userData.roomPart==='floor'||mesh.userData.roamCeiling||mesh.userData.buildingPart==='floor-slab');
    assert.equal(new THREE.Raycaster(point,up,0,1).intersectObjects(surfaces,false).length,0,'the downstairs ceiling and upstairs slab do not cap the actual shaft');
    point.x+=1.5;assert.ok(new THREE.Raycaster(point,up,0,1).intersectObjects(surfaces,false).length,'floor and ceiling remain solid beside the reserved opening');
    assert.equal(transport.setElevatorFrame({cabinY:1}),false);
  }finally{model.dispose();}
});

test('a paid elevator is modeled once with its real transparent cabin, movable car and both matching landings',()=>{
  const state=account({elevator:0}),before=JSON.stringify(state),model=modelFor(state);
  try{
    assert.equal(state.constructionLedger.at(-1).type,'elevator-upgrade');assert.equal(model.transports.length,1);
    const transport=model.transports[0];assert.equal(transport.type,'elevator');assert.equal(nodes(model.scene).filter(node=>node.name==='home-elevator').length,1);
    assert.equal(nodes(model.scene).filter(node=>node.name==='elevator-shaft').length,1);
    assert.ok(nodes(transport.model).filter(node=>node.isMesh&&node.material.transparent).every(node=>node.material.opacity===.12&&node.material.depthWrite===false));
    assert.deepEqual(transport.landings.lower.normal.toArray(),[0,0,1]);assert.deepEqual(transport.landings.upper.normal.toArray().map(v=>v||0),[0,0,-1]);
    const mid=FLOOR_Y+STOREY_HEIGHT*.5;assert.equal(transport.setElevatorFrame({cabinY:mid,doors:{lower:0,upper:0}}),true);model.scene.updateMatrixWorld(true);
    near(transport.model.getObjectByName('elevator-cabin').getWorldPosition(new THREE.Vector3()).y,mid);near(transport.getElevatorFrame().cabinY,mid);
    transport.setElevatorFrame({cabinY:FLOOR_Y+STOREY_HEIGHT,doors:{upper:1}});assert.equal(transport.getElevatorFrame().doors.upper,1);
    const surfaces=visibleMeshes(model.scene).filter(mesh=>mesh.userData.roomPart==='floor'||mesh.userData.roamCeiling||mesh.userData.buildingPart==='floor-slab');
    assert.equal(new THREE.Raycaster(new THREE.Vector3(transport.stairs.x,STOREY_HEIGHT-.6,transport.stairs.z),new THREE.Vector3(0,1,0),0,1).intersectObjects(surfaces,false).length,0);
    assert.ok(nodes(transport.model).filter(node=>node.isMesh).every(node=>node.userData.roamTransportId===transport.id));
    assert.equal(JSON.stringify(state),before);
  }finally{model.dispose();}
});

test('middle-floor transport frames and cutaway planes use world heights without duplicating either connection',()=>{
  const state=account({count:3,elevator:1}),model=modelFor(state);
  try{
    assert.equal(model.transports.length,2);const transport=model.transports.find(row=>row.type==='elevator');assert.equal(transport.from,1);assert.equal(transport.to,2);
    const y=STOREY_HEIGHT+FLOOR_Y+STOREY_HEIGHT*.7;transport.setElevatorFrame({cabinY:y});model.scene.updateMatrixWorld(true);
    near(transport.model.getObjectByName('elevator-cabin').getWorldPosition(new THREE.Vector3()).y,y);near(transport.getElevatorFrame().cabinY,y);
    near(transport.landings.lower.position.y,STOREY_HEIGHT+FLOOR_Y);near(transport.landings.upper.position.y,2*STOREY_HEIGHT+FLOOR_Y);
    const camera=new THREE.PerspectiveCamera();camera.position.set(-9,STOREY_HEIGHT+1.45,-9);model.setOrbitCut(camera,new THREE.Vector3(0,STOREY_HEIGHT+1.45,0),true);
    assert.equal(new Set(model.getWallState().map(row=>row.id)).size,model.getWallState().length);
    for(const row of model.floorModels)for(const wall of row.architecture.getRoamWalls())for(const material of[].concat(wall.material))if(material.clippingPlanes[0].constant!==1e6)near(material.clippingPlanes[0].constant,ROAM_FLOOR_Y+row.baseY+.5);
    near(model.interiorBounds.max.y,2*STOREY_HEIGHT+ROAM_FLOOR_Y+WALL_HEIGHT);
  }finally{model.dispose();}
});

test('model teardown frees every visible owned resource once, keeps borrowed maps and isolates the live robot',()=>{
  const state=account({elevator:0,decorated:true}),map=new THREE.Texture(),robot=new THREE.Mesh(new THREE.BoxGeometry(.5,1,.5),new THREE.MeshStandardMaterial({color:'#abcdef'}));robot.position.set(1,1,1);
  const before=robot.matrixWorld.clone(),model=modelFor(state,{maps:{oak:map},robot,robotStorey:1}),transport=model.transports[0];let borrowed=0;map.addEventListener('dispose',()=>borrowed++);
  transport.setElevatorFrame({cabinY:FLOOR_Y+STOREY_HEIGHT,doors:{upper:1}});
  const geometries=new Set(),materials=new Set();model.scene.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const material of[].concat(node.material??[]))materials.add(material);});
  const released=new Map();for(const resource of [...geometries,...materials])resource.addEventListener('dispose',()=>released.set(resource,(released.get(resource)??0)+1));
  model.scene.updateMatrixWorld(true);near(model.robot.getWorldPosition(new THREE.Vector3()).y,robot.position.y+STOREY_HEIGHT);
  assert.notEqual(model.robot.geometry,robot.geometry);assert.notEqual(model.robot.material,robot.material);assert.deepEqual(robot.matrixWorld.toArray(),before.toArray());
  model.dispose();model.dispose();
  assert.equal(model.scene.children.length,0);assert.ok([...geometries,...materials].every(resource=>released.get(resource)===1));
  assert.equal(transport.setElevatorFrame({cabinY:1}),false);assert.equal(borrowed,0);assert.equal(getFloorTextureCacheStats().clones,0);assert.equal(getWallTextureCacheStats().clones,0);
  assert.equal(robot.children.length,0);assert.equal(robot.material.color.getHexString(),'abcdef');robot.geometry.dispose();robot.material.dispose();map.dispose();
});
