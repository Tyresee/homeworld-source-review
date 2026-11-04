const SCALARS=['left','right','top','bottom','near','far','zoom'];
const clamp=value=>Math.max(0,Math.min(1,value));
const ease=value=>{const t=clamp(value);return t*t*t*(t*(t*6-15)+10);};
const copyVector=value=>({x:value.x,y:value.y,z:value.z});
const copyPose=value=>({position:copyVector(value.position),target:copyVector(value.target),...Object.fromEntries(SCALARS.map(key=>[key,value[key]]))});
function checkedPose(value){
  if(!value?.position||!value?.target||!['position','target'].every(key=>['x','y','z'].every(axis=>Number.isFinite(value[key][axis])))
    ||!SCALARS.every(key=>Number.isFinite(value[key]))||value.zoom<=0||value.right<=value.left||value.top<=value.bottom||value.near<0||value.far<=value.near
    ||Math.hypot(value.position.x-value.target.x,value.position.y-value.target.y,value.position.z-value.target.z)<1e-8)
    throw new TypeError('Elevator camera requires a finite position, target and valid orthographic frustum.');
  return copyPose(value);
}
function shifted(pose,dy){const next=copyPose(pose);next.position.y+=dy;next.target.y+=dy;return next;}
function translated(pose,delta){const next=copyPose(pose);for(const key of['position','target'])for(const axis of['x','y','z'])next[key][axis]+=delta[axis];return next;}
function mixed(from,to,t){
  const amount=ease(t),lerp=(a,b)=>a+(b-a)*amount,next={};
  for(const key of['position','target'])next[key]=Object.fromEntries(['x','y','z'].map(axis=>[axis,lerp(from[key][axis],to[key][axis])]));
  for(const key of SCALARS)next[key]=lerp(from[key],to[key]);
  return next;
}

/** Presentation-only vertical elevator follow. The scene owns model snapshots,
 * floor changes and the render clock; this helper creates neither scenes nor
 * animation frames and never reads or writes a student's saved home.
 *
 * Poses are the actual orthographic position/target/frustum, not logical pan
 * values. Translate the camera and its target equally so cabin tracking does
 * not change the user's view angle, frustum or zoom. On arrival the scene must
 * rebase the world and call arrive in the same synchronous render transaction.
 */
export function createStudentHomeElevatorCamera({getPose,applyPose,reducedMotion=false,settleDuration=700}={}){
  if(typeof getPose!=='function'||typeof applyPose!=='function')throw new TypeError('Elevator camera requires getPose and applyPose callbacks.');
  if(!Number.isFinite(settleDuration)||settleDuration<0)throw new RangeError('Elevator camera settle duration must be non-negative.');
  let disposed=false,mode='idle',base=null,held=null,initialCabinY=0,offsetY=0,stairId=null,lastNow=null,settle=null;
  const reduced=()=>typeof reducedMotion==='function'?reducedMotion()===true:reducedMotion===true;
  const clock=value=>{const next=Number.isFinite(value)?value:lastNow??0;lastNow=lastNow===null?next:Math.max(lastNow,next);return lastNow;};
  const active=()=>mode!=='idle';
  const apply=value=>{held=copyPose(value);applyPose(copyPose(value));};
  function clear(){mode='idle';base=held=settle=null;initialCabinY=offsetY=0;stairId=null;lastNow=null;}
  function follow(frame,now){
    if(disposed||!frame)return false;
    clock(now);
    // A controller resets its model frame before the actual floor callback.
    // Keep the followed view until arrive can rebase it with that floor.
    if(frame.reset){if(mode==='follow')mode='hold';return active();}
    if(!Number.isFinite(frame.cabinY))return active();
    const id=frame.stairId??null;
    if(mode!=='follow'||id!==stairId){
      base=checkedPose(getPose());held=copyPose(base);
      initialCabinY=frame.cabinY;offsetY=0;stairId=id;settle=null;mode='follow';
    }
    offsetY=frame.cabinY-initialCabinY;apply(shifted(base,offsetY));return true;
  }
  function reframe(basePose){
    if(disposed||!active())return false;
    const next=checkedPose(basePose);
    if(mode==='settle'){
      // Resize may refit the ordinary camera in the middle of settling. Keep
      // the displayed view continuous and move the remaining settle target.
      base=next;settle={...settle,from:copyPose(held),to:next,at:lastNow??settle.at,fromOffset:offsetY};apply(held);
    }else{base=next;apply(shifted(base,offsetY));}
    return true;
  }
  function pan(delta){
    if(disposed||!active()||!held)return false;
    if(!delta||!['x','y','z'].every(axis=>Number.isFinite(delta[axis])))throw new TypeError('Elevator camera pan requires a finite world-space vector.');
    base=translated(base,delta);held=translated(held,delta);
    if(settle)settle={...settle,from:translated(settle.from,delta),to:translated(settle.to,delta)};
    apply(held);return true;
  }
  function arrive({floorDeltaY,destinationPose,now,preserveFraming=false}={}){
    if(disposed||!active()||!held)return false;
    if(!Number.isFinite(floorDeltaY))throw new TypeError('Elevator camera arrival requires a finite floor delta.');
    const from=shifted(held,-floorDeltaY);
    if(preserveFraming===true){
      // The resident multi-floor view needs only a change of local origin.
      // Do not refit its destination, interpolate its angle or alter its scale.
      apply(from);clear();return true;
    }
    const to=checkedPose(destinationPose),at=clock(now);
    offsetY-=floorDeltaY;base=copyPose(to);
    settle={from,to,at,fromOffset:offsetY,duration:reduced()?Math.min(settleDuration,120):settleDuration};mode='settle';
    // Apply this exact coordinate rebase before any ordinary destination fit.
    apply(from);return true;
  }
  function update(now){
    if(disposed)return false;
    if(mode!=='settle')return false;
    const t=settle.duration===0?1:clamp((clock(now)-settle.at)/settle.duration);
    offsetY=settle.fromOffset*(1-ease(t));apply(t===1?settle.to:mixed(settle.from,settle.to,t));
    if(t===1){clear();return false;}return true;
  }
  function cancel({restore=false}={}){
    if(disposed)return false;
    const wasActive=active();if(restore&&base)apply(base);clear();return wasActive;
  }
  const getState=()=>({active:active(),following:mode==='follow',holding:mode==='hold',settling:mode==='settle',preparing:false,offsetY});
  return{follow,reframe,pan,arrive,update,cancel,getState,dispose(){if(disposed)return;cancel();disposed=true;}};
}
