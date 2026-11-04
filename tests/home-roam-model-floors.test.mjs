import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createHomeRoamModel} from '../public/js/home-roam-model.js';
import {HOME_THEMES} from '../public/js/home-theme.js';
import {createAccountCommerce,prepareCommerceCommand,validateAccountCommerce} from '../server/student-homes/commerce.mjs';
import {getFloorHomes,getStoreyRoomSlots} from '../public/js/home-commerce.js';
import {applyChange,getFurniturePose,roomRect} from '../public/js/home-engine.js';
import {getHomeStairs,STOREY_HEIGHT,FLOOR_Y,getElevatorStationContacts,getStaircaseEntrances,STAIR_DEPTH} from '../public/js/home-staircase-shape.js';
import {WALL_HEIGHT} from '../public/js/home-room-expansion.js';
import {ROAM_FLOOR_Y} from '../public/js/home-roam-geometry.js';
import {getFloorTextureCacheStats} from '../public/js/home-floor-textures.js';
import {getWallTextureCacheStats} from '../public/js/home-wall-textures.js';
import {getFloorBounds,getFloorBoundarySegments,resolveRooms} from '../public/js/home-layout.js';

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

test('inter-storey slab skins never compete when a walk shows exterior and interior together',()=>{
  const state=account({count:3}),before=JSON.stringify(state),model=modelFor(state);
  const sideHits=row=>{
    const bounds=getFloorBounds(row.home),origin=new THREE.Vector3(bounds.minX+bounds.width*.37,row.baseY-.15,bounds.minZ-1);
    const candidates=visibleMeshes(model.scene).filter(mesh=>mesh.userData.buildingPart==='floor-slab'||mesh.userData.roomPart==='border');
    return [...new Set(new THREE.Raycaster(origin,new THREE.Vector3(0,0,1),0,1.2).intersectObjects(candidates,false).map(hit=>hit.object))];
  };
  try{
    model.scene.updateMatrixWorld(true);
    for(const row of model.floorModels){
      const hits=sideHits(row);assert.equal(hits.length,1,'the initial combined scene has one solid side face, without overlapping cream and brown slabs');
      assert.equal(hits[0].material.color.getHexString(),new THREE.Color(HOME_THEMES.warm.shell.plinth).getHexString());
    }
    for(const mode of ['ext','ext+in','in','orbit-in','ext+in','ext']){
      model.setFloorSlabMode(mode);model.manor.visible=mode==='ext'||mode==='ext+in';model.interior.visible=mode!=='ext';
      for(const row of model.floorModels)row.group.visible=mode!=='orbit-in'||row.storey===1;
      model.scene.updateMatrixWorld(true);
      for(const row of model.floorModels)assert.equal(sideHits(row).length,mode==='orbit-in'&&row.storey!==1?0:1,`${mode}: floor ${row.storey} retains exactly its intended solid slab`);
    }
    assert.equal(JSON.stringify(state),before);
  }finally{model.dispose();}
});

test('legacy floor outlines and clipped stairwell slabs stay solid in exterior-only and combined modes',()=>{
  const legacy={rooms:resolveRooms('starter'),furniture:[]},legacyModel=createHomeRoamModel({home:legacy,floors:[legacy],theme:HOME_THEMES.warm});
  try{
    for(const mode of ['ext','ext+in','in']){
      legacyModel.setFloorSlabMode(mode);legacyModel.manor.visible=mode==='ext'||mode==='ext+in';legacyModel.interior.visible=mode!=='ext';legacyModel.scene.updateMatrixWorld(true);
      const bounds=getFloorBounds(legacy),ray=new THREE.Raycaster(new THREE.Vector3(bounds.minX+bounds.width*.37,-.15,bounds.minZ-1),new THREE.Vector3(0,0,1),0,1.2);
      const hits=ray.intersectObjects(visibleMeshes(legacyModel.scene).filter(mesh=>mesh.userData.buildingPart==='floor-slab'||mesh.userData.roomPart==='border'),false);
      assert.equal(new Set(hits.map(hit=>hit.object)).size,1,`${mode}: legacy slab remains present once`);
    }
  }finally{legacyModel.dispose();}
  const model=modelFor(account()),transport=model.transports[0],upper=model.floorModels[1],down=new THREE.Vector3(0,-1,0);
  try{
    for(const mode of ['ext','ext+in','in']){
      model.setFloorSlabMode(mode);model.manor.visible=mode==='ext'||mode==='ext+in';model.interior.visible=mode!=='ext';model.scene.updateMatrixWorld(true);
      const slabs=visibleMeshes(model.scene).filter(mesh=>mesh.userData.buildingPart==='floor-slab'||mesh.userData.roomPart==='border');
      const hole=new THREE.Vector3(transport.stairs.x,upper.baseY+.01,transport.stairs.z);
      assert.equal(new THREE.Raycaster(hole,down,0,.35).intersectObjects(slabs,false).length,0,`${mode}: the real upstairs shaft stays open`);
      const solid=hole.clone().add(new THREE.Vector3(1.5,0,0)),top=new THREE.Raycaster(solid,down,0,.35).intersectObjects(slabs,false);
      assert.equal(new Set(top.map(hit=>hit.object)).size,1,`${mode}: a single slab remains solid beside the shaft`);
      const bottom=new THREE.Raycaster(solid.clone().setY(upper.baseY-.4),new THREE.Vector3(0,1,0),0,.45).intersectObjects(slabs,false);
      assert.equal(new Set(bottom.map(hit=>hit.object)).size,1,`${mode}: the slab underside remains solid`);
    }
  }finally{model.dispose();}
});

test('combined-view exterior and interior wall finishes stay separated on every side and storey',()=>{
  const state=account(),before=JSON.stringify(state),model=modelFor(state);
  const uniqueHits=ray=>{
    const candidates=visibleMeshes(model.scene).filter(mesh=>mesh.userData.buildingPart==='roam-wall'||mesh.userData.roamWall?.exterior),seen=new Set();
    return ray.intersectObjects(candidates,false).filter(hit=>{if(seen.has(hit.object))return false;seen.add(hit.object);return true;});
  };
  try{
    model.scene.updateMatrixWorld(true);
    for(const row of model.floorModels)for(const edge of getFloorBoundarySegments(row.home)){
      const alongX=['front','back'].includes(edge.side),sign=['front','right'].includes(edge.side)?1:-1,along=edge.from+(edge.to-edge.from)*.23;
      const outward=alongX?new THREE.Vector3(0,0,sign):new THREE.Vector3(sign,0,0);
      const point=alongX?new THREE.Vector3(along,row.baseY+2.4,edge.at):new THREE.Vector3(edge.at,row.baseY+2.4,along);
      const outside=uniqueHits(new THREE.Raycaster(point.clone().addScaledVector(outward,1),outward.clone().negate(),0,1.4));
      assert.equal(outside.length,2,`${edge.side}: the exterior and interior walls remain physically present`);
      assert.equal(outside[0].object.userData.buildingPart,'roam-wall','outside sees the exterior finish first');
      near(outside[1].distance-outside[0].distance,.01);
      assert.equal(outside[0].object.material.color.getHexString(),new THREE.Color(HOME_THEMES.warm.manor.wall).getHexString());
      assert.notEqual(outside[0].object.material.color.getHexString(),outside[1].object.material.color.getHexString(),'the distinct interior finish is preserved');
      near(outside[0].object.userData.roamWall.plane,edge.at+sign*.01);
      const inside=uniqueHits(new THREE.Raycaster(point.clone().addScaledVector(outward,-.6),outward,0,.8));
      assert.equal(inside.length,2);assert.equal(inside[0].object.userData.roomPart,'walls','inside sees the actual interior finish first');
      near(inside[1].distance-inside[0].distance,.01);
    }
    const entry=model.entrance,ray=new THREE.Raycaster(entry.center.clone().addScaledVector(entry.outward,1),entry.outward.clone().negate(),0,1.6);
    assert.equal(uniqueHits(ray).length,0,'separating wall skins never fills or blocks the real arched entry');
    assert.equal(JSON.stringify(state),before);
  }finally{model.dispose();}
});

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
    near(transport.landings.lower.normal.distanceTo(new THREE.Vector3(1,0,0)),0);near(transport.landings.upper.normal.distanceTo(new THREE.Vector3(1,0,0)),0);
    const mid=FLOOR_Y+STOREY_HEIGHT*.5;assert.equal(transport.setElevatorFrame({cabinY:mid,doors:{lower:0,upper:0}}),true);model.scene.updateMatrixWorld(true);
    near(transport.model.getObjectByName('elevator-cabin').getWorldPosition(new THREE.Vector3()).y,mid);near(transport.getElevatorFrame().cabinY,mid);
    transport.setElevatorFrame({cabinY:FLOOR_Y+STOREY_HEIGHT,doors:{upper:1}});assert.equal(transport.getElevatorFrame().doors.upper,1);
    const surfaces=visibleMeshes(model.scene).filter(mesh=>mesh.userData.roomPart==='floor'||mesh.userData.roamCeiling||mesh.userData.buildingPart==='floor-slab');
    assert.equal(transport.stairs.placement,'exterior-left-v1');
    assert.ok(new THREE.Raycaster(new THREE.Vector3(0,STOREY_HEIGHT-.6,0),new THREE.Vector3(0,1,0),0,1).intersectObjects(surfaces,false).length>0,'the former indoor well is restored to solid usable floor');
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

test('an outdoor frozen robot keeps its real pool height despite an upstairs editor selection and hidden interior',()=>{
  const state=account({count:2,elevator:0}),source=new THREE.Group(),geometry=new THREE.BoxGeometry(.32,.8,.3),material=new THREE.MeshStandardMaterial({color:'#eedcb4'}),body=new THREE.Mesh(geometry,material);
  source.name='student-home-robot';body.name='review-pool-robot';body.position.set(14,.77,2.68);source.add(body);source.visible=false;source.updateMatrixWorld(true);
  const saved=body.getWorldPosition(new THREE.Vector3()),sourcePose=source.matrixWorld.clone();
  const outside=modelFor(state,{robot:source,robotStorey:1,robotEnvironment:'estate'}),inside=modelFor(state,{robot:source,robotStorey:1,robotEnvironment:'interior'});
  try{
    outside.scene.updateMatrixWorld(true);inside.scene.updateMatrixWorld(true);
    const outdoorBody=outside.robot.getObjectByName('review-pool-robot'),indoorBody=inside.robot.getObjectByName('review-pool-robot');
    near(outdoorBody.getWorldPosition(new THREE.Vector3()).y,saved.y);near(outside.robot.getWorldPosition(new THREE.Vector3()).y,0);
    near(indoorBody.getWorldPosition(new THREE.Vector3()).y,saved.y+STOREY_HEIGHT);
    assert.equal(outside.robot.parent,outside.scene,'outside companion is not owned by the hideable floor layer');assert.equal(outside.robot.userData.roamStorey,0);assert.equal(outside.robot.visible,true);
    outside.interior.visible=false;for(const row of outside.floorModels)row.group.visible=false;
    const visible=[];outside.scene.traverseVisible(node=>visible.push(node));assert.ok(visible.includes(outdoorBody),'the frozen outside companion remains visible during exterior/other-floor viewing');
    assert.equal(source.visible,false);assert.deepEqual(source.matrixWorld.toArray(),sourcePose.toArray());assert.notEqual(outdoorBody.geometry,geometry);assert.notEqual(outdoorBody.material,material);
  }finally{outside.dispose();inside.dispose();geometry.dispose();material.dispose();}
});

for(const rotation of[0,90,180,270])for(const baseStorey of[0,1])test(`elevator actual door and cabin contacts match triangles at ${rotation} degrees from storey ${baseStorey}`,()=>{
  const state=account({count:baseStorey+2,elevator:baseStorey}),floors=getFloorHomes(state),connection=getHomeStairs(floors[baseStorey]).find(stair=>stair.type==='elevator');
  // This rotation matrix deliberately retains an old indoor lift fixture; E1
  // has one fixed left-wall orientation and is covered by its own geometry tests.
  for(const floor of floors)for(const stair of getHomeStairs(floor))if(stair.id===connection.id){delete stair.placement;stair.rotation=rotation;stair.x=3.4;stair.z=0;}
  const model=modelFor(state),transport=model.transports.find(row=>row.type==='elevator');
  try{
    for(const side of['lower','upper']){
      const station=transport.landings[side],floorY=FLOOR_Y+(baseStorey+(side==='upper'?1:0))*STOREY_HEIGHT;
      transport.setElevatorFrame({cabinY:floorY,doors:{lower:0,upper:0}});model.scene.updateMatrixWorld(true);
      const authored=transport.model.getObjectByName(`elevator-${side}-landing-doors`).getWorldPosition(new THREE.Vector3());
      near(station.position.distanceTo(authored),0);near(station.doorPosition.distanceTo(authored),0);near(station.position.y,floorY);
      near(station.cabinCentre.x,connection.x);near(station.cabinCentre.z,connection.z);near(station.cabinCentre.y,floorY);
      const carGate=transport.model.getObjectByName('elevator-cabin-front-doors').getWorldPosition(new THREE.Vector3());
      near(station.cabinDoorPosition.distanceTo(carGate),0);
      const expectedNormal=new THREE.Vector3(Math.sin(rotation*Math.PI/180),0,Math.cos(rotation*Math.PI/180));near(station.normal.distanceTo(expectedNormal),0);
      near(station.waitingPosition.clone().sub(station.position).dot(station.normal),.51);
      near(station.waitingPosition.clone().sub(station.cabinCentre).dot(station.normal),STAIR_DEPTH/2+.35);
      const cabinFloor=new THREE.Box3().setFromObject(transport.model.getObjectByName('elevator-cabin-floor'));near(cabinFloor.max.y,station.cabinCentre.y);
      // A real triangle ray crosses the closed landing/car leaf; after opening
      // the correct floor's leaves, the same path reaches the cabin without
      // crossing a side window, shaft post, frame or fixed cabin rear wall.
      const right=new THREE.Vector3(station.normal.z,0,-station.normal.x),start=station.waitingPosition.clone().addScaledVector(right,.18).add(new THREE.Vector3(0,1.45,0)),end=station.cabinCentre.clone().addScaledVector(right,.18).add(new THREE.Vector3(0,1.45,0));
      const direction=end.clone().sub(start),length=direction.length(),ray=new THREE.Raycaster(start,direction.normalize(),0,length);
      const closed=ray.intersectObjects(visibleMeshes(transport.model),false);assert.ok(closed.some(hit=>/door/.test(hit.object.name)),'closed real doors block the board path');
      transport.setElevatorFrame({cabinY:floorY,doors:{[side]:1}});model.scene.updateMatrixWorld(true);
      assert.deepEqual(ray.intersectObjects(visibleMeshes(transport.model),false).map(hit=>hit.object.name),[],'open doorway path must be free in actual triangles, not merely an aggregate AABB');
      const other=side==='lower'?'upper':'lower';assert.equal(transport.getElevatorFrame().doors[other],0);
    }
  }finally{model.dispose();}
});
test('elevator contacts respect down-record local coordinates, are independent copies and leave legacy stair entrances unchanged',()=>{
  const up={id:'contact-fixture',x:2,z:3,rotation:90,direction:'up',type:'elevator'},down={...up,direction:'down'},a=getElevatorStationContacts(up),b=getElevatorStationContacts(down);
  for(const side of['lower','upper'])for(const key of['position','doorPosition','waitingPosition','cabinDoorPosition','cabinCentre']){near(a[side][key].x,b[side][key].x);near(a[side][key].z,b[side][key].z);near(a[side][key].y-b[side][key].y,STOREY_HEIGHT);}
  const legacy=getStaircaseEntrances(up);near(Math.abs(legacy.lower.x-up.x),1.6);near(Math.abs(legacy.upper.x-up.x),1.6);
  a.lower.cabinCentre.y=999;a.lower.doorPosition.x=999;assert.notEqual(getElevatorStationContacts(up).lower.cabinCentre.y,999);assert.notEqual(getElevatorStationContacts(up).lower.doorPosition.x,999);
  assert.equal(getElevatorStationContacts({...up,type:undefined}),null);
});
