// Review-only camera fixtures and numerical summaries; no game state changes.
export const ROAM_REVIEW_CASES=Object.freeze([
  ['01-exterior-orbit','Exterior orbit'],['02-orbit-auto-interior-cutaway','Automatic interior cutaway'],
  ['03-door-hover','Door hover'],['04-door-opening','Door half open'],['05-just-entered-living-room','Actual entrance room'],
  ['06-lamp-lit-interior-through-doorway','Warm room through doorway'],['07-look-back-at-open-front-door','Look back at open entry'],
  ['08-kitchen-tap-hob-drawers-doors','Kitchen interactions'],['09-bathroom-tap-flush-drawers','Bathroom interactions'],
  ['10-bedside-drawer','Bedside drawer'],['11-floor-lamp-on','Floor lamp on'],['12-living-ceiling-lamp-switched-off','Living ceiling lamp off'],
].map(([id,label])=>Object.freeze({id,label})));

export function parseRoamReviewPose(text) {
  const value=typeof text==='string'?JSON.parse(text):text;
  if(!value||!['position','target'].every(key=>Array.isArray(value[key])&&value[key].length===3&&value[key].every(Number.isFinite)))throw new TypeError('Pose needs finite position and target arrays');
  if(value.position[1]<.25||value.position[1]>30)throw new RangeError('Camera height must stay between 0.25 and 30 m');
  return {position:[...value.position],target:[...value.target]};
}

export function sameRoamReviewCameraSnapshot(before,after) {
  return before&&after?JSON.stringify(before)===JSON.stringify(after):null;
}

export function summarizeRoamFrames(intervals,cpuTimes) {
  const clean=(values,allowZero=false)=>values.filter(value=>Number.isFinite(value)&&(allowZero?value>=0:value>0)),frames=clean(intervals),cpu=clean(cpuTimes,true),mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  const percentile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor((values.length-1)*p))]:null;
  const frameMean=mean(frames);
  return {samples:frames.length,elapsedMs:frames.reduce((a,b)=>a+b,0),averageFPS:frameMean?1000/frameMean:null,frameMs:{mean:frameMean,p95:percentile(frames,.95),max:frames.length?Math.max(...frames):null},renderCallCPUms:{samples:cpu.length,mean:mean(cpu),p95:percentile(cpu,.95)},evidence:'Foreground requestAnimationFrame intervals and real render-call CPU duration; not a GPU timer or physical classroom performance claim'};
}
