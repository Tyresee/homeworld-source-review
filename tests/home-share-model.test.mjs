import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createHomeShareModel,getShareRooms} from '../public/js/home-share-model.js';
import {createLookDevFixture} from '../scripts/qa/look-dev-fixtures.mjs';
import {HOME_THEMES} from '../public/js/home-theme.js';
import {createHomeState} from '../public/js/home-engine.js';
import {createRoom} from '../public/js/home-layout.js';
import {getOutdoorProduct} from '../public/js/home-outdoor-catalog.js';
import {STOREY_HEIGHT,getExteriorElevatorPose} from '../public/js/home-staircase-shape.js';
let previousDocument;
before(()=>{previousDocument=globalThis.document;globalThis.document={createElement(){const context=new Proxy({},{get:(target,key)=>target[key]??(()=>{}),set:(target,key,value)=>(target[key]=value,true)});return {width:0,height:0,getContext:()=>context};}};});
after(()=>{globalThis.document=previousDocument;});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-3,`${a} != ${b}`);
const settle=(model,state,camera={position:new THREE.Vector3(-30,20,30)},options={})=>{for(let i=0;i<50;i++)model.update(state,camera,.05,options);};
const nodes=root=>{const result=[];root.traverse(node=>result.push(node));return result;};
function twoStoreys(){const fixture=createLookDevFixture('exterior');return fixture.floors??[fixture.home,fixture.upper];}

test('saved precise room rectangles produce symmetric neighbours and correct shared door positions',()=>{
  const home={rooms:[createRoom('living',undefined,undefined,'a',{minX:-2.8,minZ:-2.6,width:5.6,depth:5.2}),createRoom('kitchen-compact',undefined,undefined,'b',{minX:2.8,minZ:-2.6,width:2.8,depth:5.2}),createRoom('bedroom-compact',undefined,undefined,'remote',{minX:20,minZ:20,width:2.8,depth:5.2})]};
  const rooms=getShareRooms(home);assert.deepEqual(rooms[0].adjacent,[{roomId:'b',door:{x:2.8,z:0}}]);assert.deepEqual(rooms[1].adjacent,[{roomId:'living',door:{x:2.8,z:0}}]);assert.deepEqual(rooms[2].adjacent,[]);
});

test('real floors and uncovered roof patches separate, settle and restore without changing the snapshot',()=>{
  const floors=twoStoreys(),before=JSON.stringify(floors),model=createHomeShareModel({home:floors[0],floors,theme:HOME_THEMES.warm});
  try{
    assert.equal(model.floors.length,2);assert.ok(model.roofs.length);settle(model,{name:'EXPLODED',floor:0});
    near(model.floors[0].group.position.y,0);near(model.floors[1].group.position.y,STOREY_HEIGHT*2.2);
    for(const roof of model.roofs)near(roof.offset,roof.top*STOREY_HEIGHT*1.2+2.6);
    assert.ok(model.getDiagnostics().elevatorOpacity<.001);
    settle(model,{name:'FOCUS',floor:0});assert.equal(model.floors[1].group.visible,false);near(model.floors[1].offset,10);assert.ok(model.roofs.every(roof=>!roof.group.visible));
    settle(model,{name:'ORBIT',floor:0});assert.ok(model.floors.every(row=>row.group.visible));near(model.floors[1].offset,0);assert.ok(model.roofs.every(roof=>roof.group.visible));assert.equal(JSON.stringify(floors),before);
    const sets=model.floors.map(row=>new Set(nodes(row.group).flatMap(node=>[].concat(node.material??[]))));assert.ok([...sets[0]].every(m=>!sets[1].has(m)),'floors must not share fadeable materials');
  }finally{model.dispose();model.dispose();}
});

test('rotating FOCUS changes front/back exterior wall ratios, restores attachment height and keeps the wall foot fixed',()=>{
  const home=createLookDevFixture('house').home,model=createHomeShareModel({home,theme:HOME_THEMES.warm});
  try{
    const wall=model.walls.find(wall=>wall.normal?.z===1),inner=model.walls.find(wall=>!wall.normal);assert.ok(wall);assert.ok(inner);
    const base=new THREE.Box3().setFromObject(wall.mesh).min.y;
    settle(model,{name:'FOCUS',floor:0},{position:new THREE.Vector3(0,10,40)});
    near(wall.ratio,.1);near(inner.ratio,.42);near(new THREE.Box3().setFromObject(wall.mesh).min.y,base);assert.ok(wall.extras.every(node=>!node.visible));
    const frontMaterials=[].concat(wall.mesh.material);assert.ok(frontMaterials.every(m=>m.opacity===1));
    settle(model,{name:'FOCUS',floor:0},{position:new THREE.Vector3(0,10,-40)});near(wall.ratio,1);assert.ok(wall.extras.every(node=>node.visible));
    for(const name of ['ORBIT','SPOT','EXPLODED','FOCUS']){settle(model,{name,floor:0});assert.ok(model.floors.every(row=>row.ceilings.every(mesh=>!mesh.visible)),'Exterior viewing never adds an interior ceiling');}
    settle(model,{name:'ORBIT',floor:0});near(wall.ratio,1);
  }finally{model.dispose();}
});

test('hidden ancestors, faded materials and plot base are excluded from picking; real outdoor ownership drives spots',()=>{
  const home=createLookDevFixture('living').home,product=getOutdoorProduct('outdoor-pool-1'),owned={id:'pool',status:'placed',item:{kind:product.kind,x:9,z:9,rotation:0,color:product.color,level:1,material:product.material}},commerce={home,owned:[owned]},before=JSON.stringify(commerce),model=createHomeShareModel({commerce,theme:HOME_THEMES.warm});
  try{
    assert.ok(model.spots.some(spot=>spot.id==='pool'&&spot.name===(product.familyLabel??product.name)));
    const pool=nodes(model.scene).find(node=>node.userData.shareSpot==='pool');assert.equal(model.pickInfo(pool).type,'spot');assert.equal(model.pickInfo(pool).spotId,'pool');
    pool.parent.visible=false;assert.equal(model.pickInfo(pool),null);pool.parent.visible=true;
    const base=nodes(model.scene).find(node=>node.userData.shareIgnorePick);assert.equal(model.pickInfo(base),null);
    const floorMesh=nodes(model.floors[0].group).find(node=>node.isMesh&&node.visible&&node.userData.shareFloor===0);assert.equal(model.pickInfo(floorMesh,new THREE.Vector3(0,0,0)).floor,0);
    const material=[].concat(floorMesh.material)[0];material.opacity=.3;assert.equal(model.pickInfo(floorMesh),null);assert.equal(JSON.stringify(commerce),before);
  }finally{model.dispose();}
});

test('a real purchased exterior lift keeps its cabin parked through every exterior share view',()=>{
  const floors=twoStoreys().map(home=>structuredClone(home)),pose=getExteriorElevatorPose();
  floors[0].staircases=[{id:'lift',...pose,type:'elevator',direction:'up'}];delete floors[0].stairs;
  floors[1].staircases=[{id:'lift',...pose,type:'elevator',direction:'down'}];delete floors[1].stairs;
  const before=JSON.stringify(floors),model=createHomeShareModel({home:floors[0],floors,theme:HOME_THEMES.warm});
  try{
    assert.ok(model.elevator);assert.deepEqual(model.elevator.served,[0,1]);assert.equal(model.elevator.landings.length,2);assert.ok(model.elevator.landings.every(row=>row.roomId));
    const parked=model.elevator.cabinGroup.getWorldPosition(new THREE.Vector3());for(const name of ['ORBIT','SPOT','EXPLODED','FOCUS']){settle(model,{name,floor:0});near(model.elevator.cabinGroup.getWorldPosition(new THREE.Vector3()).distanceTo(parked),0);}
    assert.equal(JSON.stringify(floors),before);
  }finally{model.dispose();}
});

test('spectator robot only breathes in place; its input model, materials and snapshot remain unchanged',()=>{
  const home=createLookDevFixture('living').home,source=new THREE.Group(),body=new THREE.Mesh(new THREE.BoxGeometry(.5,.6,.3),new THREE.MeshStandardMaterial({color:'#6699bb'})),head=new THREE.Group();head.name='Head';source.add(body,head);source.position.set(.5,.08,.5);const pose=source.toJSON(),model=createHomeShareModel({home,theme:HOME_THEMES.warm,robot:source});
  try{
    const start=model.robot.position.clone(),scale=model.robot.scale.clone();settle(model,{name:'FOCUS',floor:0});assert.deepEqual(model.robot.position.toArray(),start.toArray());assert.ok(Math.abs(model.robot.scale.y-scale.y)<=.0031);assert.notEqual(model.robot.scale.y,scale.y);assert.deepEqual(source.toJSON(),pose);
    assert.ok(model.floors.every(row=>row.rooms.every(room=>room.floorY===row.floorY)));near(model.floors[0].floorY,.067);
  }finally{model.dispose();body.geometry.dispose();body.material.dispose();}
});
