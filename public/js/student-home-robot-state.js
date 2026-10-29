import {DANCE_PERIOD} from './student-home-robot-dance.js';
/** Small semantic checkpoints shared by the server and renderer. No rendered
 * transforms, mesh arrays, paths, wallet fields or foreign student IDs belong
 * in a robot checkpoint. Furniture/pool contacts are rebuilt from ownership. */
export const ROBOT_STATE_LIMITS=Object.freeze({coordinate:10050,time:86400,itemId:128,furnitureStep:16,poolStep:8,transitStep:255});
export const ROBOT_FURNITURE_ACTIONS=Object.freeze(['sit','lie','read','cook','wash','dishwash','admire','tidy','wipe']);
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const keys=(value,required,optional=[])=>record(value)&&required.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>required.includes(key)||optional.includes(key));
const bounded=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
const step=(value,max)=>Number.isSafeInteger(value)&&bounded(value,0,max);
const storey=value=>Number.isSafeInteger(value)&&value>=0;
const id=value=>typeof value==='string'&&value.length>0&&value.length<=ROBOT_STATE_LIMITS.itemId;
const point=value=>keys(value,['x','z'])&&['x','z'].every(key=>bounded(value[key],-ROBOT_STATE_LIMITS.coordinate,ROBOT_STATE_LIMITS.coordinate));
const rotation=value=>bounded(value,-1000000,1000000);
const time=value=>bounded(value,0,ROBOT_STATE_LIMITS.time);
const optional=(value,key,validate)=>!Object.hasOwn(value,key)||validate(value[key]);
const common=value=>id(value.itemId)&&storey(value.storey);
const progress=value=>bounded(value,0,1);
const phaseTriple=(value,phases,max)=>{
  const present=['phase','step','progress'].filter(key=>Object.hasOwn(value,key));
  return present.length===0||present.length===3&&phases.includes(value.phase)&&step(value.step,max)&&progress(value.progress);
};
function exitFrom(value){
  return value?.phase==='enter'
    ?keys(value,['phase','step','progress'],['time'])&&step(value.step,ROBOT_STATE_LIMITS.poolStep)&&progress(value.progress)&&optional(value,'time',time)
    :keys(value,['phase'],['time'])&&value.phase==='loop'&&optional(value,'time',time);
}
export function isRobotActivityShape(value){
  if(!record(value))return false;
  if(value.kind==='dance')return keys(value,['kind','storey','point','rotation','time','blend'],['exitRequested'])
    &&storey(value.storey)&&point(value.point)&&rotation(value.rotation)&&bounded(value.time,0,DANCE_PERIOD)
    &&progress(value.blend)&&optional(value,'exitRequested',v=>v===true);
  if(value.kind==='sleep')return keys(value,['kind','itemId','storey'])&&common(value);
  if(value.kind==='watch')return keys(value,['kind','itemId','seatId','storey','phase','point','rotation','originRotation','time'],['step','progress','exitRequested','pressRemaining'])
    &&common(value)&&id(value.seatId)&&value.seatId!==value.itemId&&point(value.point)&&rotation(value.rotation)&&rotation(value.originRotation)&&time(value.time)
    &&['to-remote','pickup','to-seat','sit','watch','rise','to-return','return'].includes(value.phase)
    &&(value.phase==='sit'||value.phase==='rise'?step(value.step,ROBOT_STATE_LIMITS.furnitureStep)&&progress(value.progress):!Object.hasOwn(value,'step')&&!Object.hasOwn(value,'progress'))
    &&optional(value,'exitRequested',v=>v===true)&&optional(value,'pressRemaining',v=>bounded(v,0,1.2))
    &&(!Object.hasOwn(value,'pressRemaining')||value.phase==='watch');
  if(value.kind==='stand')return keys(value,['kind','environment','storey','point','rotation'],['action','time','remaining'])
    &&['interior','estate'].includes(value.environment)&&storey(value.storey)&&(value.environment!=='estate'||value.storey===0)
    &&point(value.point)&&rotation(value.rotation)&&optional(value,'action',v=>v==='wave')
    &&optional(value,'time',time)&&optional(value,'remaining',v=>bounded(v,0,1.9))
    &&(!Object.hasOwn(value,'remaining')||value.action==='wave');
  if(value.kind==='furniture')return keys(value,['kind','action','itemId','storey'],['time','remaining','phase','step','progress','rotation','entrySide','originTime','approachIndex','exitRequested','originRotation'])
    &&common(value)&&ROBOT_FURNITURE_ACTIONS.includes(value.action)&&optional(value,'time',time)
    &&optional(value,'originRotation',v=>['tidy','wipe'].includes(value.action)&&rotation(v))
    &&optional(value,'remaining',v=>bounded(v,0,5))&&optional(value,'rotation',rotation)&&optional(value,'originTime',time)
    &&phaseTriple(value,['enter','exit'],ROBOT_STATE_LIMITS.furnitureStep)
    &&(!Object.hasOwn(value,'phase')||['sit','lie'].includes(value.action))
    &&optional(value,'entrySide',v=>['left','right'].includes(v))&&optional(value,'approachIndex',v=>step(v,11))
    &&(!Object.hasOwn(value,'entrySide')||value.action==='lie')
    &&optional(value,'exitRequested',v=>v===true&&value.phase==='enter');
  if(value.kind==='football')return keys(value,['kind','itemId','storey','time','originRotation'],['exitRequested'])&&common(value)&&value.storey===0&&bounded(value.time,0,15)&&rotation(value.originRotation)&&optional(value,'exitRequested',v=>v===true);
  if(value.kind==='swim'){
    if(!keys(value,['kind','itemId','storey'],['time','phase','step','progress','rotation','exitFrom','loopTime'])||!common(value)||value.storey!==0
      ||!optional(value,'time',time)||!optional(value,'loopTime',time)||!optional(value,'rotation',rotation)||!optional(value,'exitFrom',exitFrom))return false;
    if(value.phase==='loop')return !Object.hasOwn(value,'step')&&!Object.hasOwn(value,'progress')&&!Object.hasOwn(value,'exitFrom');
    return phaseTriple(value,['enter','exit'],ROBOT_STATE_LIMITS.poolStep)&&(!Object.hasOwn(value,'exitFrom')||value.phase==='exit');
  }
  if(['stairs','elevator'].includes(value.kind))return keys(value,['kind','itemId','storey','step','progress','rotation'],['time','originTime'])
    &&common(value)&&step(value.step,ROBOT_STATE_LIMITS.transitStep)&&progress(value.progress)&&rotation(value.rotation)&&optional(value,'time',time)&&optional(value,'originTime',time);
  return false;
}
// Already canonical angles must stay bit-for-bit stable. Repeating trig on an
// acknowledged yaw can otherwise drift by an ulp and change its checkpoint key.
const yaw=value=>{const result=value>=-Math.PI&&value<=Math.PI?value:Math.atan2(Math.sin(value),Math.cos(value));return Object.is(result,-0)?0:result;};
/** Invalid untrusted values become null; command validators use the shape
 * predicate separately to distinguish invalid input from an explicit clear. */
export function normalizeRobotActivity(value){
  if(!isRobotActivityShape(value))return null;
  const result={kind:value.kind};
  for(const key of ['environment','action','itemId','seatId','storey'])if(Object.hasOwn(value,key))result[key]=value[key];
  if(value.point)result.point={x:value.point.x,z:value.point.z};
  if(Object.hasOwn(value,'rotation'))result.rotation=yaw(value.rotation);
  if(Object.hasOwn(value,'originRotation'))result.originRotation=yaw(value.originRotation);
  for(const key of ['phase','step','progress','time','remaining','entrySide','originTime','approachIndex','exitRequested','loopTime','pressRemaining','blend'])if(Object.hasOwn(value,key))result[key]=value[key];
  if(value.exitFrom){result.exitFrom={phase:value.exitFrom.phase};for(const key of ['step','progress','time'])if(Object.hasOwn(value.exitFrom,key))result.exitFrom[key]=value.exitFrom[key];}
  return result;
}
export const cloneRobotActivity=normalizeRobotActivity;
export const robotActivityKey=value=>JSON.stringify(normalizeRobotActivity(value));
export const sameRobotActivity=(a,b)=>robotActivityKey(a)===robotActivityKey(b);
