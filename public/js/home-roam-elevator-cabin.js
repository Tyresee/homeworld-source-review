import * as THREE from 'three';
import {FLOOR_Y,areElevatorsAligned,isExteriorElevator} from './home-staircase-shape.js';
import {HOME_ROAM_ACCESS,planHomeRoamApproach,checkHomeRoamDoorwayPassage} from './home-roam-access.js';
import {getHomeRoamLandingEyePoint} from './home-roam-transport.js';
import {getHomeRoamElevatorTargets} from './home-roam-elevator-menu.js';
import {elevatorRideSeconds} from './student-home-robot-elevator.js';

// These are cabin-local viewing contacts, not a new doorway or a saved pose.
export const HOME_ROAM_ELEVATOR_PANEL_TARGET=Object.freeze({x:.75,y:1.20,z:.10});
export const HOME_ROAM_ELEVATOR_CABIN_VIEW=Object.freeze({x:-.22,y:HOME_ROAM_ACCESS.eye,z:.10});
const UP=new THREE.Vector3(0,1,0),closed=()=>({lower:0,upper:0});
const finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)&&typeof p.clone==='function';
const failed=reason=>({ok:false,reason,journeys:[],preparation:null});
const smooth=p=>{const t=THREE.MathUtils.clamp(p,0,1);return t*t*(3-2*t);};
const unit=(value,fallback)=>value.lengthSq()>1e-10?value.normalize():fallback.clone();
const sideFor=(transport,storey)=>storey===transport?.from?'lower':storey===transport?.to?'upper':null;
const atStation=(transport,storey)=>transport?.landings?.[sideFor(transport,storey)];
function shaftFor(model,transport,storey){
  const targets=getHomeRoamElevatorTargets({model,transport,storey});
  if(!targets.length)return null;
  const served=[storey,...targets.map(row=>row.storey)].sort((a,b)=>a-b),set=new Set(served);
  const links=model.transports.filter(row=>row.type==='elevator'&&set.has(row.from)&&set.has(row.to)&&areElevatorsAligned(row.stairs,transport.stairs)).sort((a,b)=>a.from-b.from);
  return{served,links};
}
function localLink(shaft,storey,direction=1){return shaft.links.find(row=>direction>0?row.from===storey:row.to===storey)??shaft.links.find(row=>sideFor(row,storey));}
function cabinCentre(transport,storey){const station=atStation(transport,storey);return station?.cabinCentre?.clone()??(station?new THREE.Vector3(transport.stairs.x,station.position.y,transport.stairs.z):null);}
function localPoint(transport,point,deckY){const a=transport.stairs.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return new THREE.Vector3(transport.stairs.x+point.x*c+point.z*s,deckY+point.y,transport.stairs.z-point.x*s+point.z*c);}

/** Read the real panel/cabin transform where available. Planning can occur
 * while the car is on another floor, so only its current vertical datum is
 * translated to the requested station. No mesh/frame is changed here. */
export function getHomeRoamElevatorCabinView({model,transport,storey}={}){
  const shaft=shaftFor(model,transport,storey),link=shaft&&localLink(shaft,storey),centre=link&&cabinCentre(link,storey);
  if(!centre)return null;
  const entry=model.elevatorPanels?.find(row=>row.model===transport.model),pose=entry?.panel?.getViewPose?.(),currentY=transport.getElevatorFrame?.()?.cabinY;
  if(finite(pose?.position)&&finite(pose?.lookAt)&&Number.isFinite(currentY)){
    const delta=centre.y-currentY;
    return{position:pose.position.clone().addScaledVector(UP,delta),lookAt:pose.lookAt.clone().addScaledVector(UP,delta)};
  }
  return{position:localPoint(link,HOME_ROAM_ELEVATOR_CABIN_VIEW,centre.y),lookAt:localPoint(link,HOME_ROAM_ELEVATOR_PANEL_TARGET,centre.y)};
}
export function getHomeRoamElevatorPanelLookAt(options){return getHomeRoamElevatorCabinView(options)?.lookAt??null;}

function gazeBetween(a,b,t){
  const yaw0=Math.atan2(a.x,a.z),yaw1=Math.atan2(b.x,b.z),yaw=yaw0+Math.atan2(Math.sin(yaw1-yaw0),Math.cos(yaw1-yaw0))*t;
  const pitch0=Math.atan2(a.y,Math.hypot(a.x,a.z)),pitch1=Math.atan2(b.y,Math.hypot(b.x,b.z)),pitch=THREE.MathUtils.lerp(pitch0,pitch1,t);
  return new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
}
function builder({transportId,sourceLink,targetStorey,position,lookAt,direction='up'}){
  let facing=unit(lookAt.clone().sub(position),new THREE.Vector3(0,0,-1));const steps=[];
  const add=(name,duration,from,to,{gaze,doorLink=sourceLink,cabinFrom,cabinTo=cabinFrom,doorsFrom,doorsTo=doorsFrom}={})=>{
    const next=gaze?unit(gaze.clone(),facing):facing.clone();
    steps.push({name,duration,from:from.clone(),to:to.clone(),facingFrom:facing.clone(),facingTo:next.clone(),doorStairId:doorLink.stairId??doorLink.stairs.id,cabinFrom,cabinTo,doorsFrom:doorsFrom?{...doorsFrom}:null,doorsTo:doorsTo?{...doorsTo}:null});facing=next;
  };
  return{add,get facing(){return facing.clone();},finish(){
    const last=steps.at(-1),end=last.to.clone(),finalLook=end.clone().addScaledVector(facing,2);
    return{transportId,targetStorey,steps,position:end,lookAt:finalLook,sample(step,progress){
      const t=smooth(progress),point=step.from.clone().lerp(step.to,t),result={position:point,lookAt:point.clone().addScaledVector(gazeBetween(step.facingFrom,step.facingTo,t),2)};
      if(step.doorsFrom)result.elevatorFrame={stairId:sourceLink.stairId??sourceLink.stairs.id,doorStairId:step.doorStairId,phase:step.name,direction,cabinY:THREE.MathUtils.lerp(step.cabinFrom,step.cabinTo,t),doors:{lower:THREE.MathUtils.lerp(step.doorsFrom.lower,step.doorsTo.lower,t),upper:THREE.MathUtils.lerp(step.doorsFrom.upper,step.doorsTo.upper,t)}};
      return result;
    }};
  }};
}
function approachFor({model,transport,storey,position,lookAt,forcePreparation}){
  const target=getHomeRoamLandingEyePoint(transport,storey),direct=planHomeRoamApproach({model,transport,fromStorey:storey,position,target});
  if(direct.ok)return{...direct,position:position.clone(),lookAt:lookAt.clone(),preparation:forcePreparation?{kind:'eye-level',position:position.clone(),lookAt:lookAt.clone()}:null};
  if(!['height-outside-floor','blocked-start','no-path','budget'].includes(direct.reason))return direct;
  const row=model.floorModels.find(row=>row.storey===storey),normal=atStation(transport,storey).normal,eyePosition=position.clone().setY(row.baseY+FLOOR_Y+HOME_ROAM_ACCESS.eye),gaze=unit(lookAt.clone().sub(position),normal.clone().negate()),eyeLook=eyePosition.clone().add(gaze);
  if(Math.abs(eyePosition.y-position.y)>1e-7){
    const normalized=planHomeRoamApproach({model,transport,fromStorey:storey,position:eyePosition,target});
    if(normalized.ok)return{...normalized,position:eyePosition,lookAt:eyeLook,preparation:{kind:'eye-level',position:eyePosition.clone(),lookAt:eyeLook.clone()}};
    if(['blocked-target','invalid','no-floor'].includes(normalized.reason))return normalized;
  }
  const prepared=planHomeRoamApproach({model,transport,fromStorey:storey,position:target,target}),faceGate=target.clone().sub(normal);
  return prepared.ok?{...prepared,position:target.clone(),lookAt:faceGate,preparation:{kind:'elevator-entry',position:target.clone(),lookAt:faceGate.clone()}}:prepared;
}

/** First explicit intent is boarding only. The passenger walks through the
 * single authored front gate, moves a short distance inside, and turns to the
 * real wall panel. Destination choice happens only after this journey ends. */
export function planHomeRoamElevatorBoarding({model,transport,storey,position,lookAt,forcePreparation=false}={}){
  const shaft=shaftFor(model,transport,storey),link=shaft&&localLink(shaft,storey);
  if(!link||!finite(position)||!finite(lookAt))return failed('invalid');
  if(!checkHomeRoamDoorwayPassage({model,transport:link,storey}).ok)return failed('departure-blocked');
  const approach=approachFor({model,transport:link,storey,position,lookAt,forcePreparation});if(!approach.ok)return failed(approach.reason);
  const station=atStation(link,storey),side=sideFor(link,storey),deck=cabinCentre(link,storey),centre=deck.clone().addScaledVector(UP,HOME_ROAM_ACCESS.eye),view=getHomeRoamElevatorCabinView({model,transport,storey}),start=getHomeRoamLandingEyePoint(link,storey),inward=station.normal.clone().negate(),open={...closed(),[side]:1};
  const b=builder({transportId:transport.id,sourceLink:link,targetStorey:storey,position:approach.position,lookAt:approach.lookAt});
  for(let i=1;i<approach.points.length;i++){
    // A small eye-height correction is movement, not a request to look at the
    // ceiling/floor. Keep the current gaze until a horizontal route leg turns.
    const from=approach.points[i-1],to=approach.points[i],gaze=unit(to.clone().sub(from).setY(0),b.facing),turn=Math.acos(THREE.MathUtils.clamp(b.facing.dot(gaze),-1,1))/Math.PI*1000;
    b.add('travel-approach',THREE.MathUtils.clamp(Math.max(from.distanceTo(to)/1.8*1000,turn),180,12000),from,to,{gaze});
  }
  b.add('elevator-face-door',650,start,start,{gaze:inward});
  const car=transport.getElevatorFrame?.()?.cabinY??deck.y;
  b.add('elevator-call',Math.abs(car-deck.y)>.1?1800:200,start,start,{cabinFrom:car,cabinTo:deck.y,doorsFrom:closed()});
  b.add('elevator-open',700,start,start,{cabinFrom:deck.y,doorsFrom:closed(),doorsTo:open});
  b.add('elevator-board',1400,start,centre,{cabinFrom:deck.y,doorsFrom:open});
  b.add('elevator-panel-position',360,centre,view.position,{cabinFrom:deck.y,doorsFrom:open});
  b.add('elevator-face-panel',700,view.position,view.position,{gaze:view.lookAt.clone().sub(view.position),cabinFrom:deck.y,doorsFrom:open});
  const journey=b.finish();
  return{ok:true,journeys:[journey],preparation:approach.preparation,session:{transportId:transport.id,fromStorey:storey,storey,served:[...shaft.served],position:journey.position.clone(),lookAt:journey.lookAt.clone()}};
}
function insideCabin(transport,storey,position){
  const centre=cabinCentre(transport,storey);if(!centre||!finite(position)||Math.abs(position.y-centre.y-HOME_ROAM_ACCESS.eye)>.04)return false;
  const a=transport.stairs.rotation*Math.PI/180,delta=position.clone().sub(centre),x=delta.x*Math.cos(a)-delta.z*Math.sin(a),z=delta.x*Math.sin(a)+delta.z*Math.cos(a);
  return Math.abs(x)<=(isExteriorElevator(transport.stairs)?.48:.61)&&Math.abs(z)<=(isExteriorElevator(transport.stairs)?.48:1.04);
}
function exitSteps(b,{link,storey,position,lookAt,arrivalLookAt,doorsAlreadyOpen=false}){
  const station=atStation(link,storey),deck=cabinCentre(link,storey),centre=deck.clone().addScaledVector(UP,HOME_ROAM_ACCESS.eye),exit=getHomeRoamLandingEyePoint(link,storey,{arrival:true}),side=sideFor(link,storey),open={...closed(),[side]:1},doors=doorsAlreadyOpen?open:closed();
  b.add('elevator-face-exit',700,position,position,{gaze:station.normal,doorLink:link,cabinFrom:deck.y,doorsFrom:doors});
  b.add('elevator-exit-position',360,position,centre,{doorLink:link,cabinFrom:deck.y,doorsFrom:doors});
  if(!doorsAlreadyOpen)b.add('elevator-arrive',700,centre,centre,{doorLink:link,cabinFrom:deck.y,doorsFrom:closed(),doorsTo:open});
  b.add('elevator-exit',1400,centre,exit,{doorLink:link,cabinFrom:deck.y,doorsFrom:open});
  b.add('elevator-finish',650,exit,exit,{doorLink:link,cabinFrom:deck.y,doorsFrom:open,doorsTo:closed()});
  if(finite(arrivalLookAt)){const gaze=arrivalLookAt.clone().setY(exit.y).sub(exit);b.add('travel-look',650,exit,exit,{gaze,doorLink:link,cabinFrom:deck.y,doorsFrom:closed()});}
}
function exitClear(model,link,storey){
  if(!checkHomeRoamDoorwayPassage({model,transport:link,storey}).ok)return false;
  const exit=getHomeRoamLandingEyePoint(link,storey,{arrival:true});
  return planHomeRoamApproach({model,transport:link,fromStorey:storey,position:exit,target:exit}).ok;
}

/** A panel selection produces exactly one car ride, even when it passes many
 * intermediate landings. Door frames name the departure/final link while the
 * journey transport ID keeps referring to the one physical cabin. */
export function planHomeRoamElevatorCabinTrip({model,transport,fromStorey,targetStorey,position,lookAt,arrivalLookAt}={}){
  const shaft=shaftFor(model,transport,fromStorey),delta=targetStorey-fromStorey;
  if(!shaft||!Number.isInteger(targetStorey)||!shaft.served.includes(targetStorey)||!delta||!finite(lookAt))return failed('invalid');
  const source=localLink(shaft,fromStorey,Math.sign(delta)),destination=localLink(shaft,targetStorey,-Math.sign(delta));
  if(!source||!destination||!insideCabin(source,fromStorey,position))return failed('invalid-cabin');
  if(!exitClear(model,destination,targetStorey))return failed('destination-blocked');
  const from=cabinCentre(source,fromStorey),to=cabinCentre(destination,targetStorey),top=position.clone().addScaledVector(UP,to.y-from.y),open={...closed(),[sideFor(source,fromStorey)]:1};
  const b=builder({transportId:transport.id,sourceLink:source,targetStorey,position,lookAt,direction:delta>0?'up':'down'});
  b.add('elevator-close',650,position,position,{cabinFrom:from.y,doorsFrom:open,doorsTo:closed()});
  b.add('elevator-ride',elevatorRideSeconds(delta)*1000,position,top,{cabinFrom:from.y,cabinTo:to.y,doorsFrom:closed()});
  exitSteps(b,{link:destination,storey:targetStorey,position:top,lookAt,arrivalLookAt});
  return{ok:true,journeys:[b.finish()],preparation:null,transportId:transport.id,fromStorey,targetStorey};
}

/** Cancel a waiting selection by walking back out of the same open front
 * doorway. This does not travel floors or alter the saved robot/home. */
export function planHomeRoamElevatorCabinExit({model,transport,storey,position,lookAt,arrivalLookAt}={}){
  const shaft=shaftFor(model,transport,storey),link=shaft&&localLink(shaft,storey);
  if(!link||!finite(lookAt)||!insideCabin(link,storey,position))return failed('invalid-cabin');
  if(!exitClear(model,link,storey))return failed('destination-blocked');
  const b=builder({transportId:transport.id,sourceLink:link,targetStorey:storey,position,lookAt});
  exitSteps(b,{link,storey,position,lookAt,arrivalLookAt,doorsAlreadyOpen:true});
  return{ok:true,journeys:[b.finish()],preparation:null,transportId:transport.id,fromStorey:storey,targetStorey:storey};
}
