import {FLOOR_Y,STOREY_HEIGHT,STAIR_DEPTH,ELEVATOR_DOOR_CLEAR_WIDTH,ELEVATOR_CABIN_CLEAR_HEIGHT,getHomeStairs,getStaircaseEntrances,isStaircaseValid,isElevatorShaftContinuation,isExteriorElevator,getElevatorStationContacts} from './home-staircase-shape.js';
import {planAvatarWalk,isAvatarPositionWalkable,isAvatarElevatorPassageClear} from './home-avatar-navigation.js';
import {getHomeElevatorStacks} from './home-elevator-stack.js';

/** One adjacent floor keeps its original ride time; longer express trips are
 * bounded so the classroom does not wait through every intermediate landing. */
export function elevatorRideSeconds(floorsTravelled){
  const count=Math.max(1,Math.abs(Math.trunc(Number(floorsTravelled)||1)));
  return Math.min(9,3.6+1.2*(count-1));
}

/** Read the paired records of one continuous aligned shaft. A clicked link
 * must touch floorIndex; separate or broken shafts cannot grant destinations. */
export function getElevatorServedFloors(floors,stairId,floorIndex){
  if(!Array.isArray(floors)||!Number.isInteger(floorIndex)||floorIndex<0||floorIndex>=floors.length)return null;
  for(const links of getHomeElevatorStacks(floors)){
    if(!links.some(link=>link.stairs.id===stairId&&(link.from===floorIndex||link.to===floorIndex)))continue;
    const served=[];for(let i=links[0].from;i<=links.at(-1).to;i++)served.push(i);
    return {served,links:links.map(link=>({from:link.from,to:link.to,id:link.stairs.id}))};
  }
  return null;
}

const smooth=value=>{const p=Math.max(0,Math.min(1,Number(value)||0));return p*p*(3-2*p);};
const mix=(a,b,t)=>a+(b-a)*t;
const copy=point=>({x:point.x,y:point.y??FLOOR_Y,z:point.z});
const finitePoint=point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.z);
const failure=error=>({ok:false,error});
function withoutConnection(home,id){
  const selected=getHomeStairs(home).find(row=>row.id===id);
  const next={...home};delete next.stairs;delete next.staircases;
  const rest=getHomeStairs(home).filter(row=>row.id!==id&&!isElevatorShaftContinuation(row,selected));if(rest.length)next.staircases=rest;
  return next;
}
function clearStraight(home,from,to,navigation){
  const count=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.12));
  for(let i=0;i<=count;i++)if(!isAvatarPositionWalkable(home,{x:mix(from.x,to.x,i/count),z:mix(from.z,to.z,i/count)},navigation))return false;
  return true;
}

/** Every floor uses the same authored front door. Only the cabin can cross
 * the reserved shaft; ordinary walking still treats it as solid. Both endpoints
 * and the real straight doorway paths are checked before any motion. */
export function planRobotElevator(home,floors,index,stairId,from,navigation={},targetFloor=null){
  let stair=getHomeStairs(home).find(row=>row.id===stairId);
  if(!stair||stair.type!=='elevator'||!isStaircaseValid(stair))return failure("DisplayText4041, DisplayText4042.");
  let target=index+(stair.direction==='up'?1:-1),arrivalStairId=stairId;
  if(targetFloor!==null&&targetFloor!==undefined){
    const shaft=getElevatorServedFloors(floors,stairId,index);
    if(!Number.isInteger(targetFloor)||targetFloor===index||!shaft||!shaft.served.includes(targetFloor))
      return failure("DisplayText4859, DisplayText4925.");
    const up=targetFloor>index,first=shaft.links.find(link=>up?link.from===index:link.to===index),last=shaft.links.find(link=>up?link.to===targetFloor:link.from===targetFloor);
    stair=getHomeStairs(home).find(row=>row.id===first?.id&&row.direction===(up?'up':'down'));
    if(!first||!last||!stair||stair.type!=='elevator'||!isStaircaseValid(stair))return failure("DisplayText4043, DisplayText4044.");
    stairId=first.id;arrivalStairId=last.id;target=targetFloor;
  }
  const delta=target-index,other=floors?.[target];
  const peer=getHomeStairs(other).find(row=>row.id===arrivalStairId&&row.direction!==stair.direction);
  if(!other||!peer||peer.type!=='elevator'||!isStaircaseValid(peer)
    ||peer.rotation!==stair.rotation||Math.abs(peer.x-stair.x)>1e-6||Math.abs(peer.z-stair.z)>1e-6)
    return failure("DisplayText4043, DisplayText4044.");
  if(!finitePoint(from))return failure("DisplayText4045.");
  if(Number.isFinite(navigation.radius)&&navigation.radius*2>ELEVATOR_DOOR_CLEAR_WIDTH+1e-6)
    return failure("DisplayText4046, DisplayText4047, DisplayText4048.");
  if(Number.isFinite(navigation.height)&&navigation.height>ELEVATOR_CABIN_CLEAR_HEIGHT+1e-6)
    return failure("DisplayText4049, DisplayText4050, DisplayText4051.");
  const angle=stair.rotation*Math.PI/180,base=stair.direction==='down'?-STOREY_HEIGHT:0;
  const at=(z,y)=>({x:stair.x+Math.sin(angle)*z,y:base+y,z:stair.z+Math.cos(angle)*z});
  const radius=Number.isFinite(navigation.radius)?navigation.radius:.29,margin=radius+.08;
  const contacts=isExteriorElevator(stair)?getElevatorStationContacts(stair):null;
  const doorway=contacts?contacts.lower.waitingPosition:at(STAIR_DEPTH/2+margin,FLOOR_Y);
  const entry={x:doorway.x,y:FLOOR_Y,z:doorway.z},exit={x:doorway.x,y:FLOOR_Y+delta*STOREY_HEIGHT,z:doorway.z};
  const approach=planAvatarWalk(home,from,entry,navigation);
  if(!approach.ok)return failure("DisplayText4052, DisplayText4053.");
  if(!isAvatarPositionWalkable(other,exit,navigation))return failure("DisplayText4054, DisplayText3951.");
  const centre={x:stair.x,y:FLOOR_Y,z:stair.z},arrivalCentre={...centre,y:FLOOR_Y+delta*STOREY_HEIGHT};
  const departureHome=withoutConnection(home,stairId),arrivalHome=withoutConnection(other,arrivalStairId);
  const clearPassage=isExteriorElevator(stair)?isAvatarElevatorPassageClear(home,stair,entry,centre,navigation)&&isAvatarElevatorPassageClear(other,peer,centre,exit,navigation):clearStraight(departureHome,entry,centre,navigation)&&clearStraight(arrivalHome,centre,{x:exit.x,z:exit.z},navigation);
  if(!clearPassage)
    return failure("DisplayText4055, DisplayText4056, DisplayText4057.");
  return {ok:true,stairId,arrivalStairId,floorDelta:delta,stair:{...stair},target,direction:stair.direction,approach:entry,
    path:[copy(entry),centre,arrivalCentre,copy(exit)],arrival:{x:exit.x,y:FLOOR_Y,z:exit.z},entrances:getStaircaseEntrances(stair)};
}

/** Runtime-only motion, not inventory or saved avatar coordinates. Angles are
 * radians, positions use the currently rendered floor's local coordinate space. */
export function createRobotElevatorMotion(journey,{point=journey.approach,rotation=0,time=0}={}){
  const up=journey.direction==='up',start=copy(point),end=copy(journey.path.at(-1));
  const yaw=journey.stair.rotation*Math.PI/180+Math.PI,exitYaw=yaw+Math.PI,delta=Math.atan2(Math.sin(yaw-rotation),Math.cos(yaw-rotation));
  const centre={x:journey.stair.x,y:FLOOR_Y,z:journey.stair.z},destination={...centre,y:end.y};
  const departure=up?'lower':'upper',arrival=up?'upper':'lower',closed={lower:0,upper:0};
  const openedAt=side=>({...closed,[side]:1}),a=openedAt(departure),b=openedAt(arrival);
  const steps=[];
  const firstLink=journey.stairId,lastLink=journey.arrivalStairId??journey.stairId;
  const step=(kind,phase,label,duration,from,to,doorsFrom,doorsTo,cabinFrom,cabinTo)=>{
    const arriving=['elevator-arrive','elevator-leave','elevator-finish'].includes(phase);
    steps.push({kind,phase,label,duration,from:copy(from),to:copy(to),doorsFrom:{...doorsFrom},doorsTo:{...doorsTo},cabinFrom,cabinTo,doorStairId:arriving?lastLink:firstLink});
  };
  step('align','elevator-align',"DisplayText4058",.26,start,start,closed,closed,FLOOR_Y,FLOOR_Y);
  steps[0].rotation=rotation;steps[0].time=time;
  step('turn','elevator-turn',"DisplayText4059",Math.max(.20,Math.abs(delta)*.22),start,start,closed,closed,FLOOR_Y,FLOOR_Y);
  steps[1].rotation=rotation;steps[1].delta=delta;
  step('wait','elevator-open',"DisplayText4060",.85,start,start,closed,a,FLOOR_Y,FLOOR_Y);
  step('walk','elevator-board',"DisplayText4061",Math.max(1.5,Math.hypot(start.x-centre.x,start.z-centre.z)/1.10),start,centre,a,a,FLOOR_Y,FLOOR_Y);
  step('wait','elevator-close',"DisplayText4062, DisplayText4063",.75,centre,centre,a,closed,FLOOR_Y,FLOOR_Y);
  step('ride','elevator-ride',up?"DisplayText4064":"DisplayText4065",elevatorRideSeconds(journey.floorDelta??1),centre,destination,closed,closed,FLOOR_Y,destination.y);
  // Keep nine checkpoint steps: turn on the stopped cabin floor before
  // opening this floor's front door, then leave facing the direction of travel.
  step('arrive','elevator-arrive',"DisplayText4926, DisplayText4927",1.80,destination,destination,closed,b,destination.y,destination.y);
  steps.at(-1).turnDuration=.95;
  step('walk','elevator-leave',"DisplayText4068",Math.max(1.5,Math.hypot(end.x-destination.x,end.z-destination.z)/1.10),destination,end,b,b,destination.y,destination.y);
  step('wait','elevator-finish',"DisplayText4069, DisplayText4070",.75,end,end,b,closed,destination.y,destination.y);
  let elapsed=0;for(const row of steps){row.startTime=elapsed;elapsed+=row.duration;}
  return {steps,journey,direction:journey.direction,yaw,exitYaw,departure,arrival,duration:elapsed};
}

/** Idle poses during the ride keep the feet on the cabin floor. Only the two
 * doorway translations blend in real walking joints; no walking uphill pose
 * or teleport is substituted for waiting, rising or leaving. */
export function sampleRobotElevatorMotion(motion,index,progress){
  const step=motion.steps[index];if(!step)throw new RangeError('Invalid elevator motion step.');
  const p=Math.max(0,Math.min(1,Number(progress)||0)),t=smooth(p),time=step.startTime+p*step.duration;
  const point={x:mix(step.from.x,step.to.x,t),y:mix(step.from.y,step.to.y,t),z:mix(step.from.z,step.to.z,t)};
  const doors={lower:mix(step.doorsFrom.lower,step.doorsTo.lower,t),upper:mix(step.doorsFrom.upper,step.doorsTo.upper,t)};
  let rotation=['elevator-leave','elevator-finish'].includes(step.phase)?motion.exitYaw:motion.yaw,visual={from:{action:'idle',time:0},to:{action:'idle',time:0},progress:1};
  if(step.kind==='align'){
    rotation=step.rotation;visual={from:{action:'walk',time:step.time},to:{action:'idle',time:0},progress:t};
  }else if(step.kind==='turn')rotation=step.rotation+step.delta*t;
  else if(step.kind==='arrive'){
    const turnEnd=step.turnDuration/step.duration,u=Math.max(0,Math.min(1,p/turnEnd)),opening=smooth((p-turnEnd)/(1-turnEnd));
    rotation=motion.yaw+(motion.exitYaw-motion.yaw)*smooth(u);
    for(const side of['lower','upper'])doors[side]=mix(step.doorsFrom[side],step.doorsTo[side],opening);
    // A small alternating step supports the pivot; the root stays on the same
    // cabin contact instead of sliding backwards through the front doorway.
    visual={from:{action:'idle',time:0},to:{action:'walk',time},progress:Math.sin(Math.PI*u)*.35};
  }else if(step.kind==='walk'){
    // Ease the first and last fifth of each doorway walk. The middle uses full
    // alternating leg/arm motion, and both endpoints meet the waiting idle.
    const gait=smooth(Math.min(1,p/.20,(1-p)/.20));
    visual={from:{action:'idle',time:0},to:{action:'walk',time},progress:gait};
  }
  return {point,rotation,phase:step.phase,phaseLabel:step.label,visual,
    cabinY:mix(step.cabinFrom,step.cabinTo,t),doors,doorOpen:Math.max(doors.lower,doors.upper),direction:motion.direction,
    stairId:motion.journey.stairId,doorStairId:step.doorStairId,floorDelta:motion.journey.floorDelta??(motion.direction==='up'?1:-1),coordinateSpace:'floor-local'};
}
