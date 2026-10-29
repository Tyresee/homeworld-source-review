import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createHomeState,validateHomeState,applyChange,getFloorArea} from '../public/js/home-engine.js';
import {hasStarterRoom} from '../public/js/home-layout.js';
import {getHomeBuildingVolumes} from '../public/js/home-building-collision.js';
import {getFurnitureTableSupport} from '../public/js/home-item-placement.js';
import {createRoomExpansion} from '../public/js/home-room-expansion.js';
import {commitHomePlacement} from '../public/js/home-placement-commit.js';

test('an account starts with the same small room but no invisible sample-furniture collision',()=>{
  const home=createHomeState({profile:'account',sandbox:false});
  assert.equal(validateHomeState(home),true);assert.equal(hasStarterRoom(home),false);
  assert.equal(home.rooms.length,1);assert.equal(home.rooms[0].kind,'living');assert.equal(getFloorArea(home),29.12);
  assert.equal(home.furniture.length,0);assert.equal(getFurnitureTableSupport(home),null);
  const result=applyChange(home,{type:'furniture',id:'purchased-bed',kind:'bed',x:0,z:0,rotation:0});
  assert.equal(result.ok,true,result.error);
  assert.equal(applyChange(home,{type:'placement',objectId:'toy',x:0,z:0}).ok,false);
  assert.equal(applyChange(home,{type:'paint',surfaceId:'table.top',color:'#123456'}).ok,false);
  assert.equal(hasStarterRoom(createHomeState()),true,'legacy demo retains its existing fixtures');
});

test('account floor actually fills the living-room footprint and its collisions match the new shell',()=>{
  const home=createHomeState({profile:'account'}),model=createRoomExpansion({...home,includeGrid:false});
  try{
    model.updateMatrixWorld(true);const ray=new THREE.Raycaster(new THREE.Vector3(0,2,0),new THREE.Vector3(0,-1,0));
    const floor=ray.intersectObject(model,true).find(hit=>hit.object.userData.roomPart==='floor');
    assert.ok(floor,'no invisible hole where the old hand-built room used to be');
    assert.equal(floor.object.userData.surfaceId,'floor.main');
    const volumes=getHomeBuildingVolumes(home);
    assert.ok(volumes.length>0);assert.ok(!volumes.some(row=>row.id.startsWith('building:')&&row.objectId==='shelf'));
    assert.equal(applyChange(home,{type:'furniture',id:'wall-bed',kind:'bed',x:-2.6,z:-2.4,rotation:0}).ok,false);
    assert.equal(applyChange(home,{type:'paint',surfaceId:'wall.inner',color:'#123456'}).ok,true);
  }finally{model.dispose();}
});

test('placement awaits server acknowledgement and a double click sends exactly one request',async()=>{
  const ghost={};let resolve,calls=0,accepted=0,rejected=0;
  const options={commit:()=>{calls++;return new Promise(done=>resolve=done);},isCurrent:value=>value===ghost,accept:()=>accepted++,reject:()=>rejected++};
  assert.equal(commitHomePlacement(ghost,options),true);assert.equal(commitHomePlacement(ghost,options),false);
  assert.equal(calls,1);assert.equal(accepted,0);assert.equal(ghost.committing,true);
  resolve({ok:true});await Promise.resolve();assert.equal(accepted,1);assert.equal(rejected,0);assert.equal(ghost.committing,false);
});

test('network rejection preserves placement, while stale success cannot remove a newer ghost',async()=>{
  const ghost={};let reject,failures=[],accepts=0,current=ghost;
  commitHomePlacement(ghost,{commit:()=>new Promise((_,no)=>reject=no),isCurrent:value=>current===value,accept:()=>accepts++,reject:result=>failures.push(result)});
  reject(new Error("DisplayText4580"));await Promise.resolve();assert.equal(failures[0].error,"DisplayText4580");assert.equal(ghost.committing,false);
  let resolve;commitHomePlacement(ghost,{commit:()=>new Promise(ok=>resolve=ok),isCurrent:value=>current===value,accept:()=>accepts++,reject:()=>assert.fail('stale failure')});
  current={};resolve({ok:true});await Promise.resolve();assert.equal(accepts,0);
});

test('legacy synchronous placement keeps immediate acknowledgement semantics',()=>{
  let applied=false;commitHomePlacement({}, {commit:()=>({ok:true}),isCurrent:()=>true,accept:()=>applied=true,reject:()=>assert.fail()});assert.equal(applied,true);
});
