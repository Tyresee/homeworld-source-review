import * as THREE from 'three';
import {FLOOR_Y,STOREY_HEIGHT,STAIR_STEP_COUNT,STAIR_FLIGHT_START,STAIR_FLIGHT_END,getStaircaseVolume} from './home-staircase-shape.js';
const eye=1.45;
const smooth=p=>{p=THREE.MathUtils.clamp(p,0,1);return p*p*(3-2*p);};
const upVector=new THREE.Vector3(0,1,0);
const unit=(value,fallback)=>{const result=value.clone();return result.lengthSq()>1e-10?result.normalize():fallback.clone();};
const horizontal=(value,fallback)=>unit(value.clone().setY(0),fallback);
function gazeBetween(a,b,t){
  const yaw0=Math.atan2(a.x,a.z),yaw1=Math.atan2(b.x,b.z),yaw=yaw0+Math.atan2(Math.sin(yaw1-yaw0),Math.cos(yaw1-yaw0))*t;
  const pitch0=Math.atan2(a.y,Math.hypot(a.x,a.z)),pitch1=Math.atan2(b.y,Math.hypot(b.x,b.z)),pitch=THREE.MathUtils.lerp(pitch0,pitch1,t);
  return new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
}

/** The model's physical door station owns its front waiting point. Staircase
 * reservation-edge contacts remain a backwards-compatible fallback for stairs. */
export function getHomeRoamLandingEyePoint(transport,storey,{arrival=false}={}){
  const side=storey===transport?.from?'lower':storey===transport?.to?'upper':null;
  const station=side&&transport.landings?.[side];if(!station)return null;
  const floor=station.waitingPosition?.clone()??station.position.clone().addScaledVector(station.normal,arrival ? .7 : .65);
  return floor.addScaledVector(upVector,eye);
}

// Temporary viewer travel. The caller provides a collision-checked approach;
// passenger movement then follows the chosen floor's real doorway and car.
export function createHomeRoamJourney(transport,fromStorey,position,{arrivalLookAt,initialLookAt,approachPath}={}){
  if(!transport||![transport.from,transport.to].includes(fromStorey))return null;
  const up=fromStorey===transport.from,departure=up?'lower':'upper',arrival=up?'upper':'lower';
  const source=transport.landings[departure],destination=transport.landings[arrival];
  const start=getHomeRoamLandingEyePoint(transport,fromStorey),end=getHomeRoamLandingEyePoint(transport,destination.storey,{arrival:true});
  const inward=horizontal(source.normal.clone().negate(),new THREE.Vector3(0,0,-1));
  const travelDirection=horizontal(destination.position.clone().sub(source.position),inward);
  let facing=initialLookAt?unit(initialLookAt.clone().sub(position),inward):(transport.type==='elevator'?inward:travelDirection);
  const steps=[];
  const add=(name,duration,from,to,{direction,...extra}={})=>{
    const next=direction?unit(direction,facing):facing.clone();
    steps.push({name,duration,from:from.clone(),to:to.clone(),facingFrom:facing.clone(),facingTo:next.clone(),...extra});facing=next;
  };
  const route=Array.isArray(approachPath)&&approachPath.length?approachPath.map(point=>point.clone()):[position.clone(),start.clone()];
  if(route[0].distanceTo(position)>1e-6||route.at(-1).distanceTo(start)>1e-6||route.some(point=>!point.toArray().every(Number.isFinite)))return null;
  if(route.length===1)route.push(start.clone());
  for(let i=1;i<route.length;i++){
    const from=route[i-1],to=route[i],direction=horizontal(to.clone().sub(from),facing);
    // A short walk may still need a half-turn. Walking distance alone makes
    // a nearby passenger spin sharply despite mathematically continuous gaze.
    const turnTime=Math.acos(THREE.MathUtils.clamp(facing.dot(direction),-1,1))/Math.PI*1000;
    add('travel-approach',THREE.MathUtils.clamp(Math.max(from.distanceTo(to)/1.8*1000,turnTime),180,12000),from,to,{direction});
  }
  if(transport.type==='elevator'){
    // Turning happens while stationary in front of the real landing doors.
    // The camera never reaches the car diagonally through a side panel.
    const turnAngle=Math.acos(THREE.MathUtils.clamp(facing.dot(inward),-1,1));
    add('elevator-face-door',THREE.MathUtils.clamp(turnAngle/Math.PI*750,180,750),start,start,{direction:inward});
    const y0=source.position.y,y1=destination.position.y;
    const centre=(source.cabinCentre?.clone()??new THREE.Vector3(transport.stairs.x,y0,transport.stairs.z)).addScaledVector(upVector,eye);
    const top=(destination.cabinCentre?.clone()??new THREE.Vector3(transport.stairs.x,y1,transport.stairs.z)).addScaledVector(upVector,eye);
    const closed={lower:0,upper:0},a={...closed,[departure]:1},b={...closed,[arrival]:1};
    const car=transport.getElevatorFrame?.()?.cabinY??FLOOR_Y+transport.baseY;
    const frame=(cabinFrom,cabinTo,doorsFrom,doorsTo)=>({cabinFrom,cabinTo,doorsFrom,doorsTo});
    add('elevator-call',Math.abs(car-y0)>.1?1800:200,start,start,frame(car,y0,closed,closed));
    add('elevator-open',700,start,start,frame(y0,y0,closed,a));
    add('elevator-board',1400,start,centre,frame(y0,y0,a,a));
    add('elevator-close',650,centre,centre,frame(y0,y0,a,closed));
    add('elevator-ride',3200,centre,top,frame(y0,y1,closed,closed));
    const out=horizontal(destination.normal,inward);
    // A through-car exit is ahead; a same-side exit is behind, so back out
    // without a forced180-degree camera flip. An angled future station may
    // turn inside the closed car before backing toward its actual opening.
    if(Math.abs(facing.dot(out))<.95)add('elevator-turn-to-exit',650,top,top,{...frame(y1,y1,closed,closed),direction:out.clone().negate()});
    add('elevator-arrive',700,top,top,frame(y1,y1,closed,b));
    add('elevator-exit',1400,top,end,frame(y1,y1,b,b));
    add('elevator-finish',650,end,end,frame(y1,y1,b,closed));
  }else{
    const angle=THREE.MathUtils.degToRad(transport.stairs.rotation);
    const at=(z,y)=>new THREE.Vector3(transport.stairs.x+Math.sin(angle)*z,y+eye+transport.baseY,transport.stairs.z+Math.cos(angle)*z);
    const points=[at(STAIR_FLIGHT_START,FLOOR_Y)];
    for(let i=1;i<=STAIR_STEP_COUNT;i++)points.push(at(STAIR_FLIGHT_START+(STAIR_FLIGHT_END-STAIR_FLIGHT_START)*i/STAIR_STEP_COUNT,FLOOR_Y+STOREY_HEIGHT*i/STAIR_STEP_COUNT));
    if(!up)points.reverse();
    add('stairs-board',500,start,points[0],{direction:travelDirection});
    for(let i=1;i<points.length;i++)add('stairs-step',240,points[i-1],points[i],{step:true});
    add('stairs-exit',600,points.at(-1),end);
  }
  const exitDirection=facing.clone();
  if(arrivalLookAt){const target=arrivalLookAt.clone().setY(end.y),next=unit(target.sub(end),facing);add('travel-look',650,end,end,{direction:next});}
  const finalLook=end.clone().addScaledVector(facing,2);
  return {transportId:transport.id,targetStorey:destination.storey,steps,position:end,lookAt:finalLook,exitBackwards:transport.type==='elevator'&&exitDirection.dot(destination.normal)<0,sample(step,progress){
    const t=smooth(progress),point=new THREE.Vector3().lerpVectors(step.from,step.to,t);
    if(step.step)point.y+=Math.sin(Math.PI*progress)*.025;
    const result={position:point,lookAt:point.clone().addScaledVector(gazeBetween(step.facingFrom,step.facingTo,t),2)};
    if(step.doorsFrom)result.elevatorFrame={phase:step.name,cabinY:THREE.MathUtils.lerp(step.cabinFrom,step.cabinTo,t),doors:{lower:THREE.MathUtils.lerp(step.doorsFrom.lower,step.doorsTo.lower,t),upper:THREE.MathUtils.lerp(step.doorsFrom.upper,step.doorsTo.upper,t)}};
    return result;
  }};
}

export function isHomeRoamInterior(model,point){
  if(model.floorModels.some(row=>point.y>=row.baseY&&point.y<row.baseY+2.91&&row.rects.some(rect=>point.x>=rect.minX&&point.x<=rect.maxX&&point.z>=rect.minZ&&point.z<=rect.maxZ)))return true;
  // The real shaft/open flight joins the floor volumes across the slab gap.
  return model.transports.some(row=>{const box=getStaircaseVolume(row.stairs);return box&&point.x>=box.minX&&point.x<=box.maxX&&point.z>=box.minZ&&point.z<=box.maxZ&&point.y>=row.baseY+box.minY&&point.y<=row.baseY+box.maxY;});
}
