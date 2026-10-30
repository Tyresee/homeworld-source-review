import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createHomeRoamJourney,isHomeRoamInterior} from '../public/js/home-roam-transport.js';
import {createStaircase} from '../public/js/home-staircase.js';
import {FLOOR_Y,STOREY_HEIGHT,STAIR_STEP_COUNT,STAIR_FLIGHT_START,STAIR_FLIGHT_END,getStaircaseEntrances,getStaircaseVolume} from '../public/js/home-staircase-shape.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
const vectorNear=(actual,expected)=>assert.ok(actual.distanceTo(expected)<1e-8,`${actual.toArray()} != ${expected.toArray()}`);
function connection(type,{from=0,rotation=0,carAtUpper=false}={}){
  const stairs={id:`stairs-${from}-${from+1}`,x:2,z:-3,rotation,direction:'up',...type==='elevator'?{type}:{}},baseY=from*STOREY_HEIGHT,points=getStaircaseEntrances(stairs),angle=rotation*Math.PI/180,normal=new THREE.Vector3(Math.sin(angle),0,Math.cos(angle));
  return {id:`transport:${from}:${stairs.id}`,type,from,to:from+1,baseY,stairs,landings:{lower:{storey:from,position:new THREE.Vector3(points.lower.x,points.lower.y+baseY,points.lower.z),normal},upper:{storey:from+1,position:new THREE.Vector3(points.upper.x,points.upper.y+baseY,points.upper.z),normal:normal.clone().negate()}},getElevatorFrame:()=>({cabinY:baseY+FLOOR_Y+(carAtUpper?STOREY_HEIGHT:0)})};
}
function assertContinuous(journey,position){
  assert.ok(journey.steps.length);vectorNear(journey.sample(journey.steps[0],0).position,position);
  for(let i=0;i<journey.steps.length;i++){
    const step=journey.steps[i];assert.ok(step.duration>0&&Number.isFinite(step.duration));
    for(const progress of [0,.25,.5,.75,1]){const sample=journey.sample(step,progress);assert.ok(sample.position.toArray().every(Number.isFinite));near(sample.lookAt.y,sample.position.y);if(step.name!=='travel-look')near(sample.lookAt.distanceTo(sample.position),2);}
    const end=journey.sample(step,1);if(i+1<journey.steps.length){const next=journey.sample(journey.steps[i+1],0);vectorNear(end.position,next.position);vectorNear(end.lookAt,next.lookAt);if(end.elevatorFrame&&next.elevatorFrame){near(end.elevatorFrame.cabinY,next.elevatorFrame.cabinY);near(end.elevatorFrame.doors.lower,next.elevatorFrame.doors.lower);near(end.elevatorFrame.doors.upper,next.elevatorFrame.doors.upper);}}
  }
  vectorNear(journey.sample(journey.steps.at(-1),1).position,journey.position);
}

test('up and down elevator journeys are continuous at every phase and synchronize the eye with the real world cabin height',()=>{
  for(const from of [0,2])for(const rotation of [0,90,180,270])for(const upwards of [true,false]){
    const transport=connection('elevator',{from,rotation,carAtUpper:upwards}),before=JSON.stringify(transport),storey=upwards?from:from+1,departure=transport.landings[upwards?'lower':'upper'],arrival=transport.landings[upwards?'upper':'lower'],position=departure.position.clone().add(new THREE.Vector3(2,1.45,3));
    const journey=createHomeRoamJourney(transport,storey,position);assert.equal(journey.targetStorey,arrival.storey);assert.equal(journey.transportId,transport.id);assertContinuous(journey,position);
    assert.deepEqual(journey.steps.map(step=>step.name),['travel-approach','elevator-call','elevator-open','elevator-board','elevator-close','elevator-ride','elevator-arrive','elevator-exit','elevator-finish']);
    assert.equal(journey.steps.find(step=>step.name==='elevator-call').duration,1800,'a car parked at the other landing is called before boarding');
    const ride=journey.steps.find(step=>step.name==='elevator-ride');
    for(const progress of [0,.1,.25,.5,.75,.9,1]){const sample=journey.sample(ride,progress);near(sample.position.y,sample.elevatorFrame.cabinY+1.45);assert.deepEqual(sample.elevatorFrame.doors,{lower:0,upper:0});assert.ok(sample.elevatorFrame.cabinY>=from*STOREY_HEIGHT+FLOOR_Y-1e-8&&sample.elevatorFrame.cabinY<=(from+1)*STOREY_HEIGHT+FLOOR_Y+1e-8);}
    const open=journey.sample(journey.steps.find(step=>step.name==='elevator-open'),1).elevatorFrame;assert.equal(open.doors[upwards?'lower':'upper'],1);assert.equal(open.doors[upwards?'upper':'lower'],0);
    const final=journey.sample(journey.steps.at(-1),1);near(final.position.y,arrival.position.y+1.45);assert.deepEqual(final.elevatorFrame.doors,{lower:0,upper:0});near(final.elevatorFrame.cabinY,arrival.position.y);vectorNear(journey.position,arrival.position.clone().addScaledVector(arrival.normal,.7).add(new THREE.Vector3(0,1.45,0)));
    assert.equal(JSON.stringify(transport),before,'a journey cannot change the model descriptor or saved staircase');
  }
});

test('a parked car opens locally without inventing a long call and rejects a floor outside its actual connection',()=>{
  const transport=connection('elevator',{from:1}),start=transport.landings.lower.position.clone().add(new THREE.Vector3(0,1.45,2));
  assert.equal(createHomeRoamJourney(transport,1,start).steps.find(step=>step.name==='elevator-call').duration,200);
  assert.equal(createHomeRoamJourney(transport,0,start),null);assert.equal(createHomeRoamJourney(transport,3,start),null);assert.equal(createHomeRoamJourney(null,1,start),null);
});

test('stair journeys visit all sixteen authored tread heights in either direction and preserve rotated world coordinates',()=>{
  for(const from of [0,2])for(const rotation of [0,90,180,270])for(const upwards of [true,false]){
    const transport=connection('stairs',{from,rotation}),source=transport.landings[upwards?'lower':'upper'],destination=transport.landings[upwards?'upper':'lower'],start=source.position.clone().add(new THREE.Vector3(1,1.45,1)),journey=createHomeRoamJourney(transport,source.storey,start),stairs=createStaircase(transport.stairs);
    try{
      assertContinuous(journey,start);const steps=journey.steps.filter(step=>step.name==='stairs-step');assert.equal(steps.length,STAIR_STEP_COUNT);
      const treads=stairs.children.filter(mesh=>mesh.name==='stairs-straight-tread');assert.equal(treads.length,STAIR_STEP_COUNT);const treadLevels=treads.map(mesh=>mesh.position.y+mesh.geometry.parameters.height/2+transport.baseY).sort((a,b)=>a-b);
      const angle=rotation*Math.PI/180,along=point=>(point.x-transport.stairs.x)*Math.sin(angle)+(point.z-transport.stairs.z)*Math.cos(angle);
      for(let i=0;i<steps.length;i++){
        const step=steps[i],sample=journey.sample(step,1),level=upwards?i+1:STAIR_STEP_COUNT-i-1;
        near(sample.position.y-1.45,FLOOR_Y+transport.baseY+STOREY_HEIGHT*level/STAIR_STEP_COUNT);
        if(level>0)near(sample.position.y-1.45,treadLevels[level-1]);
        near(along(sample.position),STAIR_FLIGHT_START+(STAIR_FLIGHT_END-STAIR_FLIGHT_START)*level/STAIR_STEP_COUNT);
        near(Math.abs(step.to.y-step.from.y),STOREY_HEIGHT/STAIR_STEP_COUNT);
        const midpoint=journey.sample(step,.5);near(midpoint.position.y-(step.from.y+step.to.y)/2,.025);assert.equal(midpoint.elevatorFrame,undefined);
      }
      near(journey.position.y,destination.position.y+1.45);assert.equal(journey.targetStorey,destination.storey);
    }finally{for(const mesh of stairs.children){mesh.geometry.dispose();mesh.material.dispose();}}
  }
});

test('only real transport shafts join the indoor volumes across slab gaps, including rotated and raised connections',()=>{
  for(const type of ['stairs','elevator'])for(const from of [0,2])for(const rotation of [0,90,180,270]){
    const transport=connection(type,{from,rotation}),model={transports:[transport],floorModels:[from,from+1].map(index=>({baseY:index*STOREY_HEIGHT,rects:[{minX:-6,maxX:8,minZ:-8,maxZ:4}]}))},box=getStaircaseVolume(transport.stairs);
    for(const offset of [2.91,3,STOREY_HEIGHT-.0001])assert.equal(isHomeRoamInterior(model,new THREE.Vector3(transport.stairs.x,transport.baseY+offset,transport.stairs.z)),true);
    const gapY=transport.baseY+(2.91+STOREY_HEIGHT)/2;
    assert.equal(isHomeRoamInterior(model,new THREE.Vector3(box.maxX+.01,gapY,transport.stairs.z)),false,'the rest of the ceiling gap is not made into a fictitious room');
    assert.equal(isHomeRoamInterior({...model,transports:[]},new THREE.Vector3(transport.stairs.x,gapY,transport.stairs.z)),false);
    assert.equal(isHomeRoamInterior(model,new THREE.Vector3(transport.stairs.x,transport.baseY-.1,transport.stairs.z)),false);
    assert.equal(isHomeRoamInterior(model,new THREE.Vector3(transport.stairs.x,(from+1)*STOREY_HEIGHT+3.1,transport.stairs.z)),false);
    const source=transport.landings.lower.position.clone().addScaledVector(transport.landings.lower.normal,.7).add(new THREE.Vector3(0,1.45,0)),journey=createHomeRoamJourney(transport,from,source);
    for(const step of journey.steps)for(let p=0;p<=1;p+=.025)assert.equal(isHomeRoamInterior(model,journey.sample(step,p).position),true,'every real stairs/lift journey sample remains inside');
  }
});

test('the optional arrival look turns continuously toward the house without moving the landing or changing eye height',()=>{
  for(const type of ['stairs','elevator'])for(const from of [0,2])for(const rotation of [0,90,180,270])for(const upwards of [true,false]){
    const transport=connection(type,{from,rotation}),departure=transport.landings[upwards?'lower':'upper'],start=departure.position.clone().addScaledVector(departure.normal,1).add(new THREE.Vector3(0,1.45,0));
    const arrivalLookAt=new THREE.Vector3(transport.stairs.x,999,transport.stairs.z),original=arrivalLookAt.clone(),plain=createHomeRoamJourney(transport,departure.storey,start),journey=createHomeRoamJourney(transport,departure.storey,start,{arrivalLookAt});
    const turn=journey.steps.at(-1);assert.equal(turn.name,'travel-look');assert.equal(turn.duration,650);assert.equal(journey.steps.length,plain.steps.length+1);assert.deepEqual(journey.steps.slice(0,-1),plain.steps);vectorNear(journey.position,plain.position);vectorNear(turn.from,plain.position);vectorNear(turn.to,plain.position);assertContinuous(journey,start);
    let previous=null;for(let index=0;index<=100;index++){
      const sample=journey.sample(turn,index/100);vectorNear(sample.position,plain.position);near(sample.lookAt.y,sample.position.y);const direction=sample.lookAt.clone().sub(sample.position);assert.ok(direction.lengthSq()>1e-10,'a look target cannot pass through the camera during a turn');direction.normalize();
      if(previous)assert.ok(direction.dot(previous)>.99,'even an exactly opposite house centre must rotate smoothly instead of snapping 180 degrees');previous=direction;
    }
    const expected=arrivalLookAt.clone().setY(journey.position.y).sub(journey.position).normalize(),final=journey.sample(turn,1);
    vectorNear(final.lookAt.clone().sub(final.position).normalize(),expected);vectorNear(journey.lookAt.clone().sub(journey.position).normalize(),expected);vectorNear(arrivalLookAt,original);
  }
});
