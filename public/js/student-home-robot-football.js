/** Deterministic, ownership-derived football practice. The pitch stays a solid
 * navigation obstacle; entry and exit traverse a separately checked contact path. */
import * as THREE from 'three';
import {getOutdoorProduct} from './home-outdoor-catalog.js';
import {getOutdoorItemBounds,getOutdoorLandBounds,validateOutdoorPlacement,OUTDOOR_HOUSE_CLEARANCE} from './home-outdoor-placement.js';
import {getFloorRects} from './home-layout.js';
import {getManorEntranceStepBounds} from './home-manor-layout.js';
import {createOutdoorProductModel} from './home-outdoor-models.js';
import {isOutdoorRobotPositionWalkable,planOutdoorRobotWalk} from './student-home-robot-swimming.js';

export const FOOTBALL_PERIOD=15;
export const FOOTBALL_BALL_RADIUS=.14;
const FLOOR_Y=.08,cache=new Map(),radians=degrees=>degrees*Math.PI/180;
const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
const turn=(a,b,t)=>a+((b-a+540)%360-180)*t;
const rotate=(point,degrees)=>{const a=radians(degrees);return{x:point.x*Math.cos(a)+point.z*Math.sin(a),y:point.y,z:-point.x*Math.sin(a)+point.z*Math.cos(a)};};
const world=(field,point)=>{const p=rotate(point,field.rotation);return{x:field.x+p.x,y:p.y,z:field.z+p.z};};
const heading=(a,b)=>Math.atan2(b.x-a.x,b.z-a.z)*180/Math.PI;
const inside=(p,r,margin=0)=>p.x>r.minX-margin&&p.x<r.maxX+margin&&p.z>r.minZ-margin&&p.z<r.maxZ+margin;

function geometry(item){
  const key=JSON.stringify([item.kind,item.legacyFootprint]);if(cache.has(key))return cache.get(key);
  const model=createOutdoorProductModel(item.kind,item),pitch=new THREE.Box3(),foundation=new THREE.Box3(),blockers=[];
  model.updateMatrixWorld(true);
  model.traverse(mesh=>{
    if(!mesh.isMesh)return;const b=new THREE.Box3().setFromObject(mesh);
    if(mesh.name==='football-playing-surface')pitch.union(b);
    if(mesh.name==='football-foundation')foundation.union(b);
    if(/football-(?:goal-|backstop-|perimeter-board|light-)/.test(mesh.name))blockers.push({name:mesh.name,minX:b.min.x,maxX:b.max.x,minZ:b.min.z,maxZ:b.max.z,minY:b.min.y,maxY:b.max.y});
  });
  const result=pitch.isEmpty()?null:{pitch:{minX:pitch.min.x,maxX:pitch.max.x,minZ:pitch.min.z,maxZ:pitch.max.z},surfaceY:pitch.max.y+.022,foundationY:foundation.max.y,foundationMinZ:foundation.min.z,blockers};
  model.dispose();if(cache.size>=16)cache.delete(cache.keys().next().value);cache.set(key,result);return result;
}

function buildSteps(field){
  const a=field.entry,b=field.corner,shot={x:-1.05,y:field.surfaceY,z:0},side={x:2.45,y:field.surfaceY,z:-.85},second={x:2.45,y:field.surfaceY,z:0};
  const steps=[];let position=a,rotation=0;
  const turnTime=(from,to)=>Math.max(.30,Math.abs((to-from+540)%360-180)/240);
  function move(to,duration,phase,label){const direction=heading(position,to);if(Math.abs(((direction-rotation+540)%360)-180)>.1){steps.push({from:position,to:position,fromRotation:rotation,toRotation:direction,duration:turnTime(rotation,direction),phase:'turn',label:"DisplayText4071"});rotation=direction;}
    duration=Math.max(duration,Math.hypot(to.x-position.x,to.z-position.z)/2);
    steps.push({from:position,to,fromRotation:rotation,toRotation:rotation,duration,phase,label});position=to;
  }
  function face(to){steps.push({from:position,to:position,fromRotation:rotation,toRotation:to,duration:turnTime(rotation,to),phase:'turn',label:"DisplayText4072"});rotation=to;}
  function kick(phase){steps.push({from:position,to:position,fromRotation:rotation,toRotation:rotation,duration:1.15,phase,label:"DisplayText4073"});}
  move(b,1.5,'entry',"DisplayText4074");move(shot,1.9,'walk',"DisplayText4075");face(90);kick('kick-out');
  move(side,1.7,'chase',"DisplayText4076");move(second,.55,'walk',"DisplayText4077");face(270);kick('kick-back');
  move(b,2,'return',"DisplayText4078");move(a,1.5,'exit',"DisplayText4079");face(0);
  const scale=FOOTBALL_PERIOD/steps.reduce((sum,row)=>sum+row.duration,0);let end=0;
  for(const step of steps){step.start=end;step.duration*=scale;end+=step.duration;step.end=end;}
  return steps;
}

/** Returns null rather than offering a fake action on non-football facilities,
 * unplaced inventory, sealed entrances or overlapping old/invalid layouts. */
export function getRobotFootballDescriptor(state,targetId,{navigation={},from}={}){
  const id=String(targetId??'').replace(/^outdoor:/,''),owned=state?.owned?.find(row=>row.id===id&&row.status==='placed'),item=owned?.item,product=getOutdoorProduct(item?.kind);
  if(!item||product?.feature!=='football'||!validateOutdoorPlacement(state,item,{excludeId:id}).ok)return null;
  const shape=geometry(item);if(!shape)return null;
  const radius=Math.max(.08,Math.min(1,navigation.radius??.46)),height=navigation.height??1.7;
  if(shape.pitch.minX>-1.05-radius||shape.pitch.maxX<2.45+radius||shape.pitch.minZ>-.85-radius)return null;
  const pitchWidth=shape.pitch.maxX-shape.pitch.minX,depth=item.legacyFootprint?.depth??product.depth;
  // The top-tier boards stop before the corner. Use this measured open lane,
  // staying between board ends and the lighting columns rather than crossing it.
  const entryX=product.level===3?-pitchWidth*.45:-1.05;
  const field={x:item.x,z:item.z,rotation:item.rotation,surfaceY:shape.surfaceY,foundationY:shape.foundationY,foundationMinZ:shape.foundationMinZ,
    pitch:shape.pitch,entry:{x:entryX,y:FLOOR_Y,z:-depth/2-radius-.18},corner:{x:entryX,y:shape.surfaceY,z:shape.pitch.minZ+.55},blockers:shape.blockers};
  const approach=world(field,field.entry);
  if(!isOutdoorRobotPositionWalkable(state,approach,navigation)||from&&!planOutdoorRobotWalk(state,from,approach,navigation).ok)return null;
  field.steps=buildSteps(field);
  const descriptor={id:'football',kind:'football',targetId:`outdoor:${id}`,label:"DisplayText4080",approach,field};
  const external=[...getFloorRects(state.home).map(r=>({...r,minX:r.minX-OUTDOOR_HOUSE_CLEARANCE,maxX:r.maxX+OUTDOOR_HOUSE_CLEARANCE,minZ:r.minZ-OUTDOOR_HOUSE_CLEARANCE,maxZ:r.maxZ+OUTDOOR_HOUSE_CLEARANCE})),...getManorEntranceStepBounds(state.home),...(state.owned??[]).filter(row=>row.id!==id&&row.status==='placed').map(row=>getOutdoorItemBounds(row.item)).filter(Boolean)],land=getOutdoorLandBounds(state);
  // Check the full swept body, including entrance/exit outside the own field.
  for(let n=0;n<=600;n++){
    const sample=sampleRobotFootballMotion(descriptor,FOOTBALL_PERIOD*n/600),p=sample.point;
    if(p.x-radius<land.minX||p.x+radius>land.maxX||p.z-radius<land.minZ||p.z+radius>land.maxZ||external.some(r=>inside(p,r,radius+.025)))return null;
    const local=rotate({x:p.x-item.x,y:p.y,z:p.z-item.z},-item.rotation);
    if(shape.blockers.some(r=>r.maxY>p.y+.04&&r.minY<p.y+height&&inside(local,r,radius+.025)))return null;
  }
  return descriptor;
}

/** No mutable animation state: a timestamp is enough to restore the exact pose,
 * ball position and roll angle after reload or switching student accounts. */
export function sampleRobotFootballMotion(descriptor,time){
  const field=descriptor.field,t=((Number.isFinite(time)?time:0)%FOOTBALL_PERIOD+FOOTBALL_PERIOD)%FOOTBALL_PERIOD;
  const step=field.steps.find(row=>t<row.end)??field.steps.at(-1),u=clamp((t-step.start)/step.duration),blend=smooth(u);
  const local={x:mix(step.from.x,step.to.x,blend),y:mix(step.from.y,step.to.y,blend),z:mix(step.from.z,step.to.z,blend)};
  // Rise at the shallow edge, not while still walking across the grass. The
  // two small thresholds follow the foundation and the playing surface.
  if(step.phase==='entry'||step.phase==='exit')local.y=FLOOR_Y
    +(field.foundationY-FLOOR_Y)*smooth((local.z-field.foundationMinZ+.10)/.24)
    +(field.surfaceY-field.foundationY)*smooth((local.z-field.pitch.minZ+.24)/.30);
  const moving=Math.hypot(step.to.x-step.from.x,step.to.z-step.from.z)>.001;
  const first=field.steps.find(row=>row.phase==='kick-out'),second=field.steps.find(row=>row.phase==='kick-back');
  const travel=kick=>smooth((t-kick.start-kick.duration*.38)/(kick.duration*1.02));
  const outward=travel(first),back=travel(second),ballX=-.45+2.30*outward-2.30*back;
  const kick=step.phase.startsWith('kick-')?Math.sin(Math.PI*clamp(u/.76)):0;
  return{point:world(field,local),rotation:turn(step.fromRotation,step.toRotation,blend)+field.rotation,
    gait:moving?Math.min(1,u*6,(1-u)*6):0,kick,ball:world(field,{x:ballX,y:field.surfaceY+FOOTBALL_BALL_RADIUS,z:0}),
    ballRoll:(2.30*outward-2.30*back)/FOOTBALL_BALL_RADIUS,phase:step.phase,label:step.label};
}
