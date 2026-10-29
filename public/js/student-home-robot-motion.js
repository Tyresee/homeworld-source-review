const FLOOR_Y=.08;
const point=p=>({x:p.x,y:p.y??FLOOR_Y,z:p.z});
const frame=(p,pose={action:'idle'})=>({point:point(p),rotation:p.rotation??0,pose});
const rotate=(x,z,angle)=>{const a=angle*Math.PI/180;return{x:x*Math.cos(a)+z*Math.sin(a),z:-x*Math.sin(a)+z*Math.cos(a)};};
export function robotFootTarget(pose,foot){const offset=rotate(foot.x,foot.z,pose.rotation??0);return {x:pose.x+offset.x,y:(pose.y??FLOOR_Y)+foot.y,z:pose.z+offset.z};}
export function robotStandingAlignment(seat,poses){
  const offset=rotate(poses.sit.foot.x-poses.idle.foot.x,poses.sit.foot.z-poses.idle.foot.z,seat.rotation??0);
  return {x:seat.x+offset.x,y:FLOOR_Y,z:seat.z+offset.z,rotation:seat.rotation??0};
}
function step(phase,label,duration,from,to,extra={}){return{phase,label,duration,from,to,...extra};}
/** Contact-aware key poses. Entering and leaving use the same physical path. */
export function createRobotFurnitureEntry(descriptor,poses,{point:start,rotation=0,time=0}={}){
  const m=descriptor.motion,approach={...descriptor.approach,y:FLOOR_Y,rotation:m.alignment.rotation};
  const startFrame=frame({...start,rotation},{action:'walk',time}),aligned=frame({...approach,rotation}),turned=frame(approach),standing=frame(m.alignment),seated=frame(m.edge,{action:'sit'});
  const feetFrom=robotFootTarget(m.alignment,poses.idle.foot),feetTo=robotFootTarget(m.edge,poses.sit.foot);
  const steps=[
    step('align',"DisplayText4096, DisplayText4097",.24,startFrame,aligned),
    step('turn',"DisplayText4038, DisplayText4098",.48,aligned,turned),
    step('back-step',"DisplayText4099",Math.max(.4,Math.hypot(approach.x-m.alignment.x,approach.z-m.alignment.z)/.62),turned,standing,{gait:true}),
    step('sit-down',"DisplayText4100, DisplayText4101",.95,standing,seated,{feetFrom,feetTo}),
  ];
  if(descriptor.kind==='lie'){
    const lifted=frame(m.edge,{action:'sit',tuck:1}),centred=frame(m.centre,{action:'sit',tuck:1}),lying=frame(m.final,{action:'lie'});
    steps.push(step('bed-edge',"DisplayText4102",.35,seated,seated),
      step('leg-lift',"DisplayText4103, DisplayText4104",.85,seated,lifted,{supportTarget:m.edge.y}),
      step('bed-turn',"DisplayText4105, DisplayText4106",1.15,lifted,centred,{supportTarget:m.edge.y}),
      step('lie-down',"DisplayText4107, DisplayText4108",1.25,centred,lying,{supportTarget:m.final.y}));
  }
  return steps;
}
const exitNames={
  'lie-down':['lie-rise',"DisplayText4109, DisplayText4110"],'bed-turn':['bed-turn-out',"DisplayText4111"],'leg-lift':['legs-down',"DisplayText4112"],
  'bed-edge':['bed-edge',"DisplayText4113"],'sit-down':['stand-up',"DisplayText4114, DisplayText4115"],'back-step':['step-away',"DisplayText4116"],
};
export function reverseRobotFurnitureSteps(steps){return steps.filter(s=>exitNames[s.phase]).slice().reverse().map(s=>{
  const[phase,label]=exitNames[s.phase];return {...s,phase,label,from:s.to,to:s.from,feetFrom:s.feetTo,feetTo:s.feetFrom};
});}
export function sampleRobotMotionStep(step,progress,time=0){
  const p=Math.max(0,Math.min(1,progress)),t=step.gait?p:p*p*(3-2*p),a=step.from,b=step.to;
  let delta=((b.rotation-a.rotation+540)%360)-180;
  const result={point:{x:a.point.x+(b.point.x-a.point.x)*t,y:a.point.y+(b.point.y-a.point.y)*t,z:a.point.z+(b.point.z-a.point.z)*t},
    rotation:a.rotation+delta*t,from:a.pose,to:b.pose,progress:t,time,supportTarget:step.supportTarget};
  if(step.gait){result.from={action:'idle'};result.to={action:'walk'};result.progress=Math.sin(Math.PI*p);}
  if(step.feetFrom&&step.feetTo)result.footTarget={x:step.feetFrom.x+(step.feetTo.x-step.feetFrom.x)*t,y:step.feetFrom.y+(step.feetTo.y-step.feetFrom.y)*t,z:step.feetFrom.z+(step.feetTo.z-step.feetFrom.z)*t};
  return result;
}
