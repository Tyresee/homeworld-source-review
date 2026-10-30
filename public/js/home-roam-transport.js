import * as THREE from 'three';
import {FLOOR_Y,STOREY_HEIGHT,STAIR_STEP_COUNT,STAIR_FLIGHT_START,STAIR_FLIGHT_END,getStaircaseVolume} from './home-staircase-shape.js';
const eye=1.45;
const smooth=p=>{p=THREE.MathUtils.clamp(p,0,1);return p*p*(3-2*p);};

// Temporary viewer travel, using the purchased connection's real world-space
// landings. No robot action, home state or saved floor selection is changed.
export function createHomeRoamJourney(transport,fromStorey,position,{arrivalLookAt}={}){
  if(!transport||![transport.from,transport.to].includes(fromStorey))return null;
  const up=fromStorey===transport.from,departure=up?'lower':'upper',arrival=up?'upper':'lower';
  const source=transport.landings[departure],destination=transport.landings[arrival];
  const start=source.position.clone().addScaledVector(source.normal,.65).add(new THREE.Vector3(0,eye,0));
  const end=destination.position.clone().addScaledVector(destination.normal,.7).add(new THREE.Vector3(0,eye,0));
  const direction=destination.position.clone().sub(source.position);direction.y=0;direction.normalize();
  const look=point=>point.clone().addScaledVector(direction,2);
  const steps=[];
  const add=(name,duration,from,to,extra={})=>steps.push({name,duration,from:from.clone(),to:to.clone(),...extra});
  add('travel-approach',THREE.MathUtils.clamp(position.distanceTo(start)/2.4*1000,500,2200),position,start);
  if(transport.type==='elevator'){
    const y0=source.position.y,y1=destination.position.y;
    const centre=new THREE.Vector3(transport.stairs.x,y0+eye,transport.stairs.z),top=centre.clone().setY(y1+eye);
    const closed={lower:0,upper:0},a={...closed,[departure]:1},b={...closed,[arrival]:1};
    const car=transport.getElevatorFrame?.()?.cabinY??FLOOR_Y+transport.baseY;
    const frame=(cabinFrom,cabinTo,doorsFrom,doorsTo)=>({cabinFrom,cabinTo,doorsFrom,doorsTo});
    add('elevator-call',Math.abs(car-y0)>.1?1800:200,start,start,frame(car,y0,closed,closed));
    add('elevator-open',700,start,start,frame(y0,y0,closed,a));
    add('elevator-board',1400,start,centre,frame(y0,y0,a,a));
    add('elevator-close',650,centre,centre,frame(y0,y0,a,closed));
    add('elevator-ride',3200,centre,top,frame(y0,y1,closed,closed));
    add('elevator-arrive',700,top,top,frame(y1,y1,closed,b));
    add('elevator-exit',1400,top,end,frame(y1,y1,b,b));
    add('elevator-finish',650,end,end,frame(y1,y1,b,closed));
  }else{
    const angle=THREE.MathUtils.degToRad(transport.stairs.rotation);
    const at=(z,y)=>new THREE.Vector3(transport.stairs.x+Math.sin(angle)*z,y+eye+transport.baseY,transport.stairs.z+Math.cos(angle)*z);
    const points=[at(STAIR_FLIGHT_START,FLOOR_Y)];
    for(let i=1;i<=STAIR_STEP_COUNT;i++)points.push(at(STAIR_FLIGHT_START+(STAIR_FLIGHT_END-STAIR_FLIGHT_START)*i/STAIR_STEP_COUNT,FLOOR_Y+STOREY_HEIGHT*i/STAIR_STEP_COUNT));
    if(!up)points.reverse();
    add('stairs-board',500,start,points[0]);
    for(let i=1;i<points.length;i++)add('stairs-step',240,points[i-1],points[i],{step:true});
    add('stairs-exit',600,points.at(-1),end);
  }
  if(arrivalLookAt)add('travel-look',650,end,end,{lookFrom:look(end),lookTo:arrivalLookAt.clone().setY(end.y)});
  return {transportId:transport.id,targetStorey:destination.storey,steps,position:end,lookAt:arrivalLookAt?arrivalLookAt.clone().setY(end.y):look(end),sample(step,progress){
    const t=smooth(progress),point=new THREE.Vector3().lerpVectors(step.from,step.to,t);
    if(step.step)point.y+=Math.sin(Math.PI*progress)*.025;
    const result={position:point,lookAt:look(point)};
    if(step.lookTo){const from=step.lookFrom.clone().sub(point),to=step.lookTo.clone().sub(point),yaw0=Math.atan2(from.x,from.z),yaw1=Math.atan2(to.x,to.z),yaw=yaw0+Math.atan2(Math.sin(yaw1-yaw0),Math.cos(yaw1-yaw0))*t;result.lookAt=point.clone().add(new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw)).multiplyScalar(2));}
    if(step.doorsFrom)result.elevatorFrame={phase:step.name,cabinY:THREE.MathUtils.lerp(step.cabinFrom,step.cabinTo,t),doors:{lower:THREE.MathUtils.lerp(step.doorsFrom.lower,step.doorsTo.lower,t),upper:THREE.MathUtils.lerp(step.doorsFrom.upper,step.doorsTo.upper,t)}};
    return result;
  }};
}


export function isHomeRoamInterior(model,point){
  if(model.floorModels.some(row=>point.y>=row.baseY&&point.y<row.baseY+2.91&&row.rects.some(rect=>point.x>=rect.minX&&point.x<=rect.maxX&&point.z>=rect.minZ&&point.z<=rect.maxZ)))return true;
  // The real shaft/open flight joins the floor volumes across the slab gap.
  return model.transports.some(row=>{const box=getStaircaseVolume(row.stairs);return box&&point.x>=box.minX&&point.x<=box.maxX&&point.z>=box.minZ&&point.z<=box.maxZ&&point.y>=row.baseY+box.minY&&point.y<=row.baseY+box.maxY;});
}
