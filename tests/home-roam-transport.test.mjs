import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createHomeRoamJourney,isHomeRoamInterior,getHomeRoamLandingEyePoint} from '../public/js/home-roam-transport.js';
import {createStaircase} from '../public/js/home-staircase.js';
import {FLOOR_Y,STOREY_HEIGHT,STAIR_STEP_COUNT,STAIR_FLIGHT_START,STAIR_FLIGHT_END,getStaircaseEntrances,getStaircaseVolume,getElevatorStationContacts} from '../public/js/home-staircase-shape.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
const vectorNear=(actual,expected)=>assert.ok(actual.distanceTo(expected)<1e-8,`${actual.toArray()} != ${expected.toArray()}`);
function connection(type,{from=0,rotation=0,carAtUpper=false}={}){
  const stairs={id:`stairs-${from}-${from+1}`,x:2,z:-3,rotation,direction:'up',...type==='elevator'?{type}:{}},baseY=from*STOREY_HEIGHT,points=getStaircaseEntrances(stairs),angle=rotation*Math.PI/180,normal=new THREE.Vector3(Math.sin(angle),0,Math.cos(angle));
  return {id:`transport:${from}:${stairs.id}`,type,from,to:from+1,baseY,stairs,landings:{lower:{storey:from,position:new THREE.Vector3(points.lower.x,points.lower.y+baseY,points.lower.z),normal},upper:{storey:from+1,position:new THREE.Vector3(points.upper.x,points.upper.y+baseY,points.upper.z),normal:type==='elevator'?normal.clone():normal.clone().negate()}},getElevatorFrame:()=>({cabinY:baseY+FLOOR_Y+(carAtUpper?STOREY_HEIGHT:0)})};
}
function assertContinuous(journey,position,{horizontal=true}={}){
  assert.ok(journey.steps.length);vectorNear(journey.sample(journey.steps[0],0).position,position);
  for(let i=0;i<journey.steps.length;i++){
    const step=journey.steps[i];assert.ok(step.duration>0&&Number.isFinite(step.duration));
    for(const progress of [0,.25,.5,.75,1]){const sample=journey.sample(step,progress);assert.ok(sample.position.toArray().every(Number.isFinite));if(horizontal)near(sample.lookAt.y,sample.position.y);near(sample.lookAt.distanceTo(sample.position),2);}
    const end=journey.sample(step,1);if(i+1<journey.steps.length){const next=journey.sample(journey.steps[i+1],0);vectorNear(end.position,next.position);vectorNear(end.lookAt,next.lookAt);if(end.elevatorFrame&&next.elevatorFrame){near(end.elevatorFrame.cabinY,next.elevatorFrame.cabinY);near(end.elevatorFrame.doors.lower,next.elevatorFrame.doors.lower);near(end.elevatorFrame.doors.upper,next.elevatorFrame.doors.upper);}}
  }
  vectorNear(journey.sample(journey.steps.at(-1),1).position,journey.position);
}

test('up and down elevator journeys are continuous at every phase and synchronize the eye with the real world cabin height',()=>{
  for(const from of [0,2])for(const rotation of [0,90,180,270])for(const upwards of [true,false]){
    const transport=connection('elevator',{from,rotation,carAtUpper:upwards}),before=JSON.stringify(transport),storey=upwards?from:from+1,departure=transport.landings[upwards?'lower':'upper'],arrival=transport.landings[upwards?'upper':'lower'],position=departure.position.clone().add(new THREE.Vector3(2,1.45,3));
    const journey=createHomeRoamJourney(transport,storey,position);assert.equal(journey.targetStorey,arrival.storey);assert.equal(journey.transportId,transport.id);assertContinuous(journey,position);
    assert.deepEqual(journey.steps.map(step=>step.name),['travel-approach','elevator-face-door','elevator-call','elevator-open','elevator-board','elevator-close','elevator-ride','elevator-arrive','elevator-exit','elevator-finish']);
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


function physicalConnection(options={}){
  const transport=connection('elevator',options),contacts=getElevatorStationContacts(transport.stairs);
  for(const side of ['lower','upper']){const old=transport.landings[side],contact=contacts[side];transport.landings[side]={...old,...Object.fromEntries(['position','doorPosition','waitingPosition','cabinDoorPosition','cabinCentre','normal'].map(key=>[key,new THREE.Vector3(contact[key].x,contact[key].y+(key==='normal'?0:transport.baseY),contact[key].z)]))};}
  return transport;
}
const directionOf=sample=>sample.lookAt.clone().sub(sample.position).normalize();

test('physical elevator routes honor every provided approach waypoint and preserve initial yaw and pitch without a first-frame snap',()=>{
  for(const from of [0,2])for(const rotation of [0,90,180,270])for(const upwards of [true,false]){
    const transport=physicalConnection({from,rotation}),storey=upwards?from:from+1,wait=getHomeRoamLandingEyePoint(transport,storey),position=wait.clone().add(new THREE.Vector3(-2,.0,2));position.y-=.02;
    const settle=position.clone().setY(wait.y),corner=wait.clone().add(new THREE.Vector3(-2,0,0)),route=[position.clone(),settle,corner,wait.clone()];
    const initialDirection=new THREE.Vector3(.28,.36,-.89).normalize().applyAxisAngle(new THREE.Vector3(0,1,0),rotation*Math.PI/180),initialLookAt=position.clone().addScaledVector(initialDirection,7),before=JSON.stringify({route,initialLookAt,transport});
    const journey=createHomeRoamJourney(transport,storey,position,{approachPath:route,initialLookAt});assert.ok(journey);assertContinuous(journey,position,{horizontal:false});
    vectorNear(directionOf(journey.sample(journey.steps[0],0)),initialDirection);
    const approaches=journey.steps.filter(step=>step.name==='travel-approach');assert.equal(approaches.length,route.length-1);
    for(let i=0;i<approaches.length;i++){vectorNear(approaches[i].from,route[i]);vectorNear(approaches[i].to,route[i+1]);vectorNear(journey.sample(approaches[i],1).position,route[i+1]);}
    const first=approaches.find(step=>Math.hypot(step.to.x-step.from.x,step.to.z-step.from.z)>1e-8),quarter=journey.sample(first,.25),pitch=vector=>Math.atan2(vector.y,Math.hypot(vector.x,vector.z));
    near(pitch(directionOf(quarter)),pitch(initialDirection)*(1-(.25*.25*(3-2*.25))));
    const facing=journey.steps.find(step=>step.name==='elevator-face-door');vectorNear(facing.from,wait);vectorNear(facing.to,wait);
    vectorNear(directionOf(journey.sample(facing,1)),transport.landings[upwards?'lower':'upper'].normal.clone().negate());
    assert.equal(JSON.stringify({route,initialLookAt,transport}),before,'planning must not rewrite the caller camera or routed points');
    assert.equal(createHomeRoamJourney(transport,storey,position,{approachPath:[position.clone().add(new THREE.Vector3(.1,0,0)),wait]}),null,'a route cannot silently omit the current position');
    assert.equal(createHomeRoamJourney(transport,storey,position,{approachPath:[position,wait.clone().add(new THREE.Vector3(.1,0,0))]}),null,'the fixed front waiting point cannot be replaced by an arbitrary side endpoint');
    assert.equal(createHomeRoamJourney(transport,storey,position,{approachPath:[position,new THREE.Vector3(NaN,wait.y,wait.z),wait]}),null);
  }
});

test('actual single-front elevators board and back out through the same front without forcing a camera half-turn',()=>{
  for(const rotation of [0,90,180,270])for(const upwards of [true,false]){
    const transport=physicalConnection({from:1,rotation});
    const source=transport.landings[upwards?'lower':'upper'],destination=transport.landings[upwards?'upper':'lower'],start=getHomeRoamLandingEyePoint(transport,source.storey),journey=createHomeRoamJourney(transport,source.storey,start,{initialLookAt:start.clone().sub(source.normal)});assertContinuous(journey,start);
    vectorNear(source.normal,destination.normal);assert.equal(journey.exitBackwards,true);assert.equal(journey.steps.some(step=>step.name==='elevator-turn-to-exit'),false,'one front entrance needs no artificial half-turn inside the cabin');
    const board=journey.steps.find(step=>step.name==='elevator-board'),exit=journey.steps.find(step=>step.name==='elevator-exit'),ride=journey.steps.find(step=>step.name==='elevator-ride');
    const intoCar=source.normal.clone().negate(),outOfCar=destination.normal;
    near(board.to.clone().sub(board.from).normalize().dot(intoCar),1);near(exit.to.clone().sub(exit.from).normalize().dot(outOfCar),1);
    for(const phase of [board,ride,exit])for(let i=0;i<=20;i++){const sample=journey.sample(phase,i/20);near(directionOf(sample).dot(intoCar),1);}
    near(directionOf(journey.sample(exit,.5)).dot(exit.to.clone().sub(exit.from).normalize()),-1);
    const transverse=new THREE.Vector3(intoCar.z,0,-intoCar.x);for(let i=0;i<=20;i++){const sample=journey.sample(board,i/20);near(sample.position.clone().sub(source.cabinCentre).dot(transverse),0);near(sample.position.y,source.position.y+1.45);}
    vectorNear(journey.position,getHomeRoamLandingEyePoint(transport,destination.storey,{arrival:true}));
  }
});

test('a short approach starting with the camera looking away cannot compress a half-turn into a tiny walking interval',()=>{
  const transport=physicalConnection(),station=transport.landings.lower,wait=getHomeRoamLandingEyePoint(transport,transport.from),position=wait.clone().addScaledVector(station.normal,.39);
  const journey=createHomeRoamJourney(transport,transport.from,position,{initialLookAt:position.clone().add(station.normal),approachPath:[position,wait]});
  const step=journey.steps[0];assert.ok(step.duration>=1000,'the half-turn gets a full second even when only39cm from the waiting point');
  let previous=directionOf(journey.sample(step,0)),maxTurn=0;
  for(let time=25;time<=step.duration+25;time+=25){const direction=directionOf(journey.sample(step,Math.min(time/step.duration,1)));maxTurn=Math.max(maxTurn,Math.acos(THREE.MathUtils.clamp(previous.dot(direction),-1,1)));previous=direction;}
  assert.ok(maxTurn<.125,`25ms heading increment was ${maxTurn} radians`);vectorNear(previous,station.normal.clone().negate());
});
