import {planHomeRoamApproach,checkHomeRoamDoorwayPassage,HOME_ROAM_ACCESS} from './home-roam-access.js';
import {createHomeRoamJourney,getHomeRoamLandingEyePoint} from './home-roam-transport.js';
import {FLOOR_Y,areElevatorsAligned} from './home-staircase-shape.js';

const finite=point=>point&&[point.x,point.y,point.z].every(Number.isFinite);
const failure=(reason)=>({ok:false,reason,journeys:[]});

/** Plan the whole temporary viewing trip before moving a camera or opening a
 * door. A blocked later landing must not strand the visitor partway upstairs. */
export function planHomeRoamTrip({model,fromStorey,targetStorey,position,lookAt,arrivalLookAt}={}){
  if(!Array.isArray(model?.floorModels)||!Array.isArray(model.transports)||![fromStorey,targetStorey].every(index=>Number.isInteger(index)&&model.floorModels.some(row=>row.storey===index))||fromStorey===targetStorey||!finite(position)||!finite(lookAt)||typeof position.clone!=='function'||typeof lookAt.clone!=='function')return failure('invalid');
  let index=fromStorey,point=position.clone(),gaze=lookAt.clone();const journeys=[],cabins=new Map();
  while(index!==targetStorey){
    const next=index+(targetStorey>index?1:-1),transport=model.transports.find(row=>row.from===Math.min(index,next)&&row.to===Math.max(index,next));
    if(!transport)return failure('no-transport');
    const target=getHomeRoamLandingEyePoint(transport,index),exit=getHomeRoamLandingEyePoint(transport,next,{arrival:true});
    if(!target||!exit)return failure('invalid');
    const approach=planHomeRoamApproach({model,transport,fromStorey:index,position:point,target});
    if(!approach.ok)return failure(approach.reason);
    const landing=planHomeRoamApproach({model,transport,fromStorey:next,position:exit,target:exit});
    if(!landing.ok)return failure('destination-blocked');
    if(transport.type==='elevator'){
      if(!checkHomeRoamDoorwayPassage({model,transport,storey:index}).ok)return failure('departure-blocked');
      if(!checkHomeRoamDoorwayPassage({model,transport,storey:next}).ok)return failure('destination-blocked');
    }
    // Several adjacent links can own one real cabin. Carry its planned arrival
    // forward instead of rereading the unmoved live model for every leg; that
    // would make the next call visibly jump back to its pre-trip position.
    const cabinKey=transport.type==='elevator'?(transport.model??transport):null,prior=cabinKey&&cabins.get(cabinKey);
    const plannedTransport=prior&&areElevatorsAligned(prior.stairs,transport.stairs)?{...transport,getElevatorFrame:()=>({...prior.frame,doors:{...prior.frame.doors}})}:transport;
    const journey=createHomeRoamJourney(plannedTransport,index,point,{initialLookAt:gaze,approachPath:approach.points,arrivalLookAt:arrivalLookAt?.(next)});
    if(!journey)return failure('invalid');
    if(cabinKey)cabins.set(cabinKey,{stairs:transport.stairs,frame:{cabinY:next===transport.from?transport.landings.lower.position.y:transport.landings.upper.position.y,doors:{lower:0,upper:0}}});
    journeys.push(journey);point=journey.position.clone();gaze=journey.lookAt.clone();index=next;
  }
  return{ok:true,journeys};
}

/** An explicit floor command owns camera preparation. The low-level walking
 * planner remains strict, but a zoomed/flying or otherwise unusable viewpoint
 * need not be manually repaired by the visitor. Preparation is a camera-only
 * relocation under the controller's veil, never a visible route through walls.
 * The complete departure, transfer and arrival route is still preflighted. */
export function planHomeRoamCommandTrip({forcePreparation=false,...options}={}){
  const first=planHomeRoamTrip(options);
  if(first.ok)return{...first,preparation:forcePreparation?{kind:'eye-level',position:options.position.clone(),lookAt:options.lookAt.clone()}:null};
  if(!['height-outside-floor','blocked-start','no-path','budget'].includes(first.reason))return{...first,preparation:null};
  const {model,fromStorey,targetStorey,position,lookAt}=options,row=model.floorModels.find(row=>row.storey===fromStorey);
  const next=fromStorey+(targetStorey>fromStorey?1:-1),transport=model.transports.find(row=>row.from===Math.min(fromStorey,next)&&row.to===Math.max(fromStorey,next));
  const waiting=getHomeRoamLandingEyePoint(transport,fromStorey);
  if(!row||!transport||!finite(waiting))return{...failure('invalid'),preparation:null};
  const eyePosition=position.clone().setY(row.baseY+FLOOR_Y+HOME_ROAM_ACCESS.eye),direction=lookAt.clone().sub(position);
  // A saved or imported viewpoint can have a degenerate gaze. The real gate
  // provides a finite facing direction without changing any model transform.
  const side=fromStorey===transport.from?'lower':'upper',station=transport.landings[side];
  const faceGate=waiting.clone().addScaledVector(station.normal,-1);
  if(!finite(direction)||!Number.isFinite(direction.length())||direction.lengthSq()<1e-10)direction.copy(faceGate).sub(waiting);
  const eyeLook=eyePosition.clone().add(direction.normalize());
  if(Math.abs(eyePosition.y-position.y)>1e-7){
    const normalized=planHomeRoamTrip({...options,position:eyePosition,lookAt:eyeLook});
    if(normalized.ok)return{...normalized,preparation:{kind:'eye-level',position:eyePosition,lookAt:eyeLook}};
    // A real exit or gate failure cannot be fixed by moving the camera closer.
    if(['destination-blocked','departure-blocked','no-transport','invalid'].includes(normalized.reason))return{...normalized,preparation:null};
  }
  const prepared=planHomeRoamTrip({...options,position:waiting,lookAt:faceGate});
  if(!prepared.ok)return{...prepared,reason:['height-outside-floor','blocked-start','blocked-target'].includes(prepared.reason)?'departure-blocked':prepared.reason,preparation:null};
  return{...prepared,preparation:{kind:transport.type==='elevator'?'elevator-entry':'stairs-entry',position:waiting,lookAt:faceGate}};
}
