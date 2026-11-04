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
  if(descriptor.compactPath?.length){
    steps.originTime=time;steps.originRotation=rotation*Math.PI/180;
    const route=descriptor.compactPath,approachSteps=[];let previous=startFrame;
    for(let i=1;i<route.length;i++){
      const a=route[i-1],b=route[i],angle=Math.atan2(b.x-a.x,b.z-a.z)*180/Math.PI;
      const turned=frame({...a,rotation:angle},{action:'walk',compact:1,time:time+i*.3}),next=frame({...b,rotation:angle},{action:'walk',compact:1,time:time+i*.3+.3});
      approachSteps.push(step('compact-turn',"DisplayText4947, DisplayText4948",.35,previous,turned),step('compact-step',"DisplayText4949",Math.max(.3,Math.hypot(b.x-a.x,b.z-a.z)/.65),turned,next));previous=next;
    }
    steps[0].from=previous;steps[0].phase='compact-align';steps[1].phase='compact-seat-turn';steps.unshift(...approachSteps);
  }
  if(m.ladder){
    steps.splice(2);
    const foot=frame({...m.ladder.base,rotation:m.ladder.rotation});
    steps.push(step('ladder-board',"DisplayText4950, DisplayText4951",.65,turned,foot,{gait:true}));
    let prior=foot;
    for(let i=1;i<=5;i++){
      const next=frame({...m.ladder.base,y:FLOOR_Y+i*.23,rotation:m.ladder.rotation},{action:'stairs',ladder:1,time:(i+.5)*Math.PI/6.8});
      steps.push(step('ladder-step',"DisplayText4952, DisplayText4953",.48,prior,next));prior=next;
    }
    const facingOut=frame({...m.ladder.base,y:prior.point.y,rotation:m.ladder.rotation+180},{action:'stairs',ladder:1,time:5.5*Math.PI/6.8});
    steps.push(step('ladder-turn',"DisplayText4954, DisplayText4955",.65,prior,facingOut));
    const perch=frame({...m.ladder.perch,rotation:m.ladder.rotation+180},{action:'sit',tuck:1,ladder:1}),cross=frame({...m.edge,y:m.ladder.perch.y},{action:'sit',tuck:1,ladder:1});
    steps.push(step('ladder-sit',"DisplayText4956, DisplayText4103",.95,facingOut,perch),step('ladder-cross',"DisplayText4957",.8,perch,cross),step('ladder-settle',"DisplayText4958",.65,cross,seated));
  }
  if(descriptor.kind==='lie'){
    const lifted=frame(m.edge,{action:'sit',tuck:1}),centred=frame(m.centre,{action:'sit',tuck:1}),lying=frame(m.final,{action:'lie',curl:m.curl??0});
    steps.push(step('bed-edge',"DisplayText4102",.35,seated,seated),
      step('leg-lift',"DisplayText4103, DisplayText4104",.85,seated,lifted,{supportTarget:m.edge.y}),
      step('bed-turn',"DisplayText4105, DisplayText4106",1.15,lifted,centred,{supportTarget:m.edge.y}),
      step('lie-down',"DisplayText4107, DisplayText4108",1.25,centred,lying,{supportTarget:m.final.y}));
  }
  return steps;
}
const exitNames={
  'compact-align':['compact-reset',"DisplayText4959"],'compact-seat-turn':['compact-turn-out',"DisplayText4960"],
  'compact-step':['compact-retreat',"DisplayText4947, DisplayText4961"],'compact-turn':['compact-face-out',"DisplayText4962"],
  'lie-down':['lie-rise',"DisplayText4109, DisplayText4110"],'bed-turn':['bed-turn-out',"DisplayText4111"],'leg-lift':['legs-down',"DisplayText4112"],
  'ladder-turn':['ladder-turn-back',"DisplayText4963"],'ladder-cross':['ladder-cross-out',"DisplayText4964"],'ladder-settle':['ladder-lift',"DisplayText4956, DisplayText4103"],'ladder-sit':['ladder-rise',"DisplayText4965, DisplayText4966"],'ladder-step':['ladder-descend',"DisplayText4952, DisplayText4967"],'ladder-board':['ladder-away',"DisplayText4968"],
  'bed-edge':['bed-edge',"DisplayText4113"],'sit-down':['stand-up',"DisplayText4114, DisplayText4115"],'back-step':['step-away',"DisplayText4116"],
};
export function reverseRobotFurnitureSteps(steps){const result=steps.filter(s=>exitNames[s.phase]).slice().reverse().map(s=>{
  const[phase,label]=exitNames[s.phase];return {...s,phase,label,from:s.to,to:s.from,feetFrom:s.feetTo,feetTo:s.feetFrom};
});if(Number.isFinite(steps.originTime)){result.originTime=steps.originTime;result.originRotation=steps.originRotation;}return result;}
export function sampleRobotMotionStep(step,progress,time=0){
  const p=Math.max(0,Math.min(1,progress)),t=step.gait?p:p*p*(3-2*p),a=step.from,b=step.to;
  let delta=((b.rotation-a.rotation+540)%360)-180;
  const result={point:{x:a.point.x+(b.point.x-a.point.x)*t,y:a.point.y+(b.point.y-a.point.y)*t,z:a.point.z+(b.point.z-a.point.z)*t},
    rotation:a.rotation+delta*t,from:a.pose,to:b.pose,progress:t,time,supportTarget:step.supportTarget};
  if(step.gait){result.from={action:'idle'};result.to={action:'walk'};result.progress=Math.sin(Math.PI*p);}
  if(step.feetFrom&&step.feetTo)result.footTarget={x:step.feetFrom.x+(step.feetTo.x-step.feetFrom.x)*t,y:step.feetFrom.y+(step.feetTo.y-step.feetFrom.y)*t,z:step.feetFrom.z+(step.feetTo.z-step.feetFrom.z)*t};
  return result;
}
