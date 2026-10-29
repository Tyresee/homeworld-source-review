import {FLOOR_Y,STOREY_HEIGHT,STAIR_DEPTH,STAIR_FLIGHT_START,STAIR_FLIGHT_END,STAIR_STEP_COUNT} from './home-staircase-shape.js';

const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
const copy=feet=>({L:{...feet.L},R:{...feet.R}});
const localToWorld=(stair,x,y,z)=>{const a=stair.rotation*Math.PI/180;return{x:stair.x+x*Math.cos(a)+z*Math.sin(a),y,z:stair.z-x*Math.sin(a)+z*Math.cos(a)};};
const facingPoint=(p,local,yaw)=>({x:p.x+local.x*Math.cos(yaw)+local.z*Math.sin(yaw),y:p.y+local.y,z:p.z-local.x*Math.sin(yaw)+local.z*Math.cos(yaw)});

/** The real 19.7 cm risers are tall relative to this robot's 46.6 cm legs.
 * A careful step-to gait puts BOTH feet on each tread before the next rise.
 * Its rubber soles are longer than a tread: the uphill edge stays clear of the
 * higher riser while the downhill part overhangs, as on narrow stairs. */
export function createRobotStairMotion(journey,rig,{point,rotation,time=0}){
  const stair=journey.stair,up=journey.direction==='up',base=up?0:-STOREY_HEIGHT,sign=up?-1:1;
  const yaw=stair.rotation*Math.PI/180+(up?Math.PI:0),delta=Math.atan2(Math.sin(yaw-rotation),Math.cos(yaw-rotation));
  const steps=[{kind:'align',phase:'stair-align',label:"DisplayText4117",duration:.22,point:{...point},rotation,time},
    {kind:'turn',phase:'stair-turn',label:up?"DisplayText4118":"DisplayText4119",duration:Math.max(.16,Math.abs(delta)*.15),point:{...point},rotation,delta}];
  const initialFeet=Object.fromEntries(['L','R'].map(side=>[side,facingPoint(point,rig.footCentre[side],yaw)]));
  let feet=copy(initialFeet),lead='L',serial=0;
  steps.push({kind:'balance',phase:'stair-ready',label:"DisplayText4120, DisplayText4121",duration:.18,feet:copy(feet),crouchFrom:0,crouchTo:.045});
  function pair(z,y,treadIndex=null){
    for(const side of[lead,lead==='L'?'R':'L']){
      const next=localToWorld(stair,sign*rig.footCentre[side].x,y,z),from=copy(feet),to=copy(feet);to[side]=next;
      if(Math.hypot(next.x-feet[side].x,next.y-feet[side].y,next.z-feet[side].z)<.0001)continue;
      const rise=Math.abs(next.y-feet[side].y)>.02;
      steps.push({kind:'footstep',duration:rise?.51:.37,index:serial++,treadIndex,swingFoot:side,supportFoot:side==='L'?'R':'L',from,to,direction:journey.direction});feet=to;
    }
    lead=lead==='L'?'R':'L';
  }
  function planarTo(z,y,treadIndex=null){
    const a=stair.rotation*Math.PI/180,centre={x:(feet.L.x+feet.R.x)/2,z:(feet.L.z+feet.R.z)/2};
    const start=(centre.x-stair.x)*Math.sin(a)+(centre.z-stair.z)*Math.cos(a),count=Math.max(1,Math.ceil(Math.abs(z-start)/.25));
    for(let i=1;i<=count;i++)pair(mix(start,z,i/count),y,i===count?treadIndex:null);
  }
  const rise=STOREY_HEIGHT/STAIR_STEP_COUNT,depth=(STAIR_FLIGHT_START-STAIR_FLIGHT_END)/STAIR_STEP_COUNT;
  // Foot centre is 2 mm inside the downhill edge. The far toe/heel then has
  // 16.75 mm clearance from the higher riser, despite the 29.5 cm sole length.
  if(up){
    planarTo(STAIR_FLIGHT_START+Math.max(rig.legs.L.soleDepth,rig.legs.R.soleDepth)/2+.018,base+FLOOR_Y);
    for(let i=0;i<STAIR_STEP_COUNT;i++)pair(STAIR_FLIGHT_START-i*depth-.002,base+FLOOR_Y+(i+1)*rise,i);
    planarTo((-STAIR_DEPTH/2+STAIR_FLIGHT_END)/2,base+FLOOR_Y+STOREY_HEIGHT);
  }else{
    planarTo((-STAIR_DEPTH/2+STAIR_FLIGHT_END)/2,base+FLOOR_Y+STOREY_HEIGHT);
    for(let i=STAIR_STEP_COUNT-1;i>=0;i--){const z=STAIR_FLIGHT_START-i*depth-.002,y=base+FLOOR_Y+(i+1)*rise;if(i===STAIR_STEP_COUNT-1)planarTo(z,y,i);else pair(z,y,i);}
    planarTo(STAIR_FLIGHT_START+Math.max(rig.legs.L.soleDepth,rig.legs.R.soleDepth)/2+.018,base+FLOOR_Y);
  }
  const end=journey.path.at(-1),a=stair.rotation*Math.PI/180,centreZ=(end.x-stair.x)*Math.sin(a)+(end.z-stair.z)*Math.cos(a)+sign*(rig.footCentre.L.z+rig.footCentre.R.z)/2;
  planarTo(centreZ,end.y);
  steps.push({kind:'balance',phase:'stair-finish',label:"DisplayText4122, DisplayText4062",duration:.22,feet:copy(feet),crouchFrom:.045,crouchTo:0});
  return{steps,rig,yaw,direction:journey.direction,duration:steps.reduce((sum,step)=>sum+step.duration,0)};
}

function rootFromFeet(feet,motion,crouch,weight=0,support=null){
  const {rig,yaw}=motion,local={x:(rig.footCentre.L.x+rig.footCentre.R.x)/2,z:(rig.footCentre.L.z+rig.footCentre.R.z)/2};
  const x=(feet.L.x+feet.R.x)/2,z=(feet.L.z+feet.R.z)/2;
  return{x:x-local.x*Math.cos(yaw)-local.z*Math.sin(yaw)+(support?(feet[support].x-x)*weight:0),
    y:Math.min(feet.L.y,feet.R.y)-crouch,
    z:z+local.x*Math.sin(yaw)-local.z*Math.cos(yaw)+(support?(feet[support].z-z)*weight:0)};
}

/** Pure deterministic sample: swing lifts vertically BEFORE it moves over a
 * riser, then descends only when its complete sole is beyond that riser. */
export function sampleRobotStairMotion(motion,index,progress){
  const step=motion.steps[index],p=Math.max(0,Math.min(1,progress));
  if(step.kind==='align')return{point:step.point,rotation:step.rotation,phase:step.phase,phaseLabel:step.label,
    visual:{from:{action:'walk',time:step.time},to:{action:'idle',time:0},progress:smooth(p)}};
  if(step.kind==='turn')return{point:step.point,rotation:step.rotation+step.delta*smooth(p),phase:step.phase,phaseLabel:step.label,visual:{from:'idle',to:'idle',progress:1,time:0}};
  let feet,planted={L:true,R:true},phase=step.phase,phaseLabel=step.label,weight=0,support=null;
  if(step.kind==='balance'){
    feet=copy(step.feet);const crouch=mix(step.crouchFrom,step.crouchTo,smooth(p));
    return{point:rootFromFeet(feet,motion,crouch),rotation:motion.yaw,feet,intensity:crouch/.045,bodyLean:.06*crouch/.045,armSwing:0,phase,phaseLabel,
      stairStep:{coordinateSpace:'floor-local',index:-1,treadIndex:null,phase,progress:p,feet,planted}};
  }
  feet=copy(step.from);const side=step.swingFoot,from=step.from[side],to=step.to[side],high=Math.max(from.y,to.y)+.05;
  const liftEnd=motion.direction==='up'?.48:.30,travelEnd=motion.direction==='up'?.66:.52;
  if(p<.08){phase='weight-shift';phaseLabel="DisplayText4123";}
  else if(p<liftEnd){phase='foot-lift';phaseLabel="DisplayText4124, DisplayText4125";feet[side].y=mix(from.y,high,smooth((p-.08)/(liftEnd-.08)));planted[side]=false;}
  else if(p<travelEnd){phase='foot-travel';phaseLabel="DisplayText4126, DisplayText4127";const t=smooth((p-liftEnd)/(travelEnd-liftEnd));feet[side]={x:mix(from.x,to.x,t),y:high,z:mix(from.z,to.z,t)};planted[side]=false;}
  else if(p<.92){phase='foot-land';phaseLabel=motion.direction==='up'?"DisplayText4128":"DisplayText4129";feet[side]={...to,y:mix(high,to.y,smooth((p-travelEnd)/(.92-travelEnd)))};planted[side]=false;}
  else{phase='settle';phaseLabel="DisplayText4130, DisplayText4131";feet[side]={...to};}
  support=step.supportFoot;weight=.32*Math.sin(Math.PI*p);
  const point=rootFromFeet(feet,motion,.045,weight,support);
  return{point,rotation:motion.yaw,feet,bodyLean:motion.direction==='up'?.06:.025,armSwing:(side==='L'?1:-1)*.10*Math.sin(Math.PI*p),phase,phaseLabel,
    stairStep:{coordinateSpace:'floor-local',index:step.index,treadIndex:step.treadIndex,swingFoot:side,supportFoot:support,phase,progress:p,feet,planted}};
}
